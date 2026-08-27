import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { alias } from "drizzle-orm/pg-core";
import { achievements, auditEvents, gameParticipants, games, players, podMemberships, podPlayerAchievements, pods } from "@/db/schema";
import type { UserContext } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { requirePodRole, requireSuperuser, writeAudit } from "@/lib/authorization";
import { achievementSchema } from "@/lib/validation";
import { slugify } from "@/lib/utils";
import type { z } from "zod";
import type { achievementGrantSchema, updateAchievementSchema } from "@/lib/validation";

export async function listCatalog(context: UserContext, includeArchived = false) {
  if (!context.isSuperuser) {
    const [membership] = await getDb(context).select({ podId: podMemberships.podId }).from(podMemberships)
      .innerJoin(pods, and(eq(pods.id, podMemberships.podId), isNull(pods.archivedAt)))
      .where(and(eq(podMemberships.playerId, context.player.id), eq(podMemberships.status, "ACTIVE"), isNull(podMemberships.archivedAt)))
      .limit(1);
    if (!membership) throw new AppError(403, "FORBIDDEN", "POD membership is required.");
  }
  return getDb(context).select().from(achievements)
    .where(includeArchived ? undefined : isNull(achievements.archivedAt))
    .orderBy(asc(achievements.category), asc(achievements.displayOrder), asc(achievements.name));
}

export async function createAchievement(context: UserContext, input: z.infer<typeof achievementSchema>) {
  requireSuperuser(context);
  const [created] = await getDb(context).insert(achievements).values({ ...input, createdByPlayerId: context.player.id }).returning();
  await writeAudit({ context, action: "ACHIEVEMENT_CREATED", entityType: "achievement", entityId: created.id });
  return created;
}

export async function updateAchievement(context: UserContext, achievementId: string, input: z.infer<typeof updateAchievementSchema>) {
  requireSuperuser(context);
  const [updated] = await getDb(context).update(achievements).set({
    ...(input.code !== undefined && { code: input.code }), ...(input.name !== undefined && { name: input.name }),
    ...(input.description !== undefined && { description: input.description }), ...(input.category !== undefined && { category: input.category }),
    ...(input.displayOrder !== undefined && { displayOrder: input.displayOrder }),
    ...(input.archived !== undefined && { archivedAt: input.archived ? new Date() : null }),
    updatedAt: new Date(), version: input.version + 1,
  }).where(and(eq(achievements.id, achievementId), eq(achievements.version, input.version))).returning();
  if (!updated) throw new AppError(409, "CONFLICT", "The achievement was changed by someone else.");
  await writeAudit({ context, action: input.archived === true ? "ACHIEVEMENT_ARCHIVED" : input.archived === false ? "ACHIEVEMENT_RESTORED" : "ACHIEVEMENT_UPDATED", entityType: "achievement", entityId: achievementId });
  return updated;
}

export interface HardDeleteAchievementResult {
  id: string;
  code: string;
  name: string;
  grantsDeleted: number;
}

export async function hardDeleteAchievement(
  context: UserContext,
  achievementId: string,
  input: { version: number; confirmation: string },
) {
  requireSuperuser(context);
  const current = await getDb().query.achievements.findFirst({ where: eq(achievements.id, achievementId) });
  if (!current) throw new AppError(404, "NOT_FOUND", "Achievement not found.");
  const result = await getDb().execute<{ result: HardDeleteAchievementResult }>(sql`
    select private.hard_delete_achievement(
      ${context.user.id},
      ${achievementId}::uuid,
      ${input.version},
      ${input.confirmation}
    ) as result
  `);
  const deleted = result.rows[0]?.result;
  if (!deleted) throw new AppError(500, "INTERNAL_ERROR", "The achievement could not be permanently deleted.");
  return deleted;
}

export interface AchievementCsvRow { code?: string; name: string; description?: string; category?: string; display_order?: string | number }

export function parseAchievementCsv(text: string) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new AppError(422, "VALIDATION_ERROR", "The CSV must contain a header and at least one row.");
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const nameIndex = headers.indexOf("name");
  if (nameIndex === -1) throw new AppError(422, "VALIDATION_ERROR", "The CSV requires a name column.");
  const records = rows.slice(1).filter((row) => row.some(Boolean)).map((row, index) => {
    const get = (name: string) => row[headers.indexOf(name)]?.trim() ?? "";
    return achievementSchema.parse({
      code: get("code") || slugify(get("name")), name: get("name"), description: get("description"),
      category: get("category") || "General", displayOrder: Number(get("display_order") || index * 10),
    });
  });
  if (!records.length) throw new AppError(422, "VALIDATION_ERROR", "The CSV does not contain any achievement rows.");
  const codes = new Set<string>();
  for (const record of records) {
    if (codes.has(record.code)) throw new AppError(422, "VALIDATION_ERROR", `Duplicate achievement code: ${record.code}`);
    codes.add(record.code);
  }
  return records;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') { field += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (quoted) throw new AppError(422, "VALIDATION_ERROR", "The CSV contains an unclosed quoted field.");
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export async function importAchievements(context: UserContext, text: string) {
  requireSuperuser(context);
  const records = parseAchievementCsv(text);
  const db = getDb(context);
  await db.batch([
    db.insert(achievements).values(records.map((record) => ({ ...record, createdByPlayerId: context.player.id }))),
    db.insert(auditEvents).values({ actorPlayerId: context.player.id, action: "ACHIEVEMENTS_IMPORTED", entityType: "achievement", entityId: "bulk", metadata: { count: records.length } }),
  ]);
  return { count: records.length, records };
}

export async function listPodAchievements(context: UserContext, podId: string) {
  await requirePodRole(context, podId, "GUEST");
  const catalog = await getDb(context).select().from(achievements).orderBy(asc(achievements.category), asc(achievements.displayOrder));
  const members = await getDb(context).select({ id: players.id, displayName: players.displayName }).from(podMemberships).innerJoin(players, eq(players.id, podMemberships.playerId))
    .where(and(eq(podMemberships.podId, podId), eq(podMemberships.status, "ACTIVE"), isNull(podMemberships.archivedAt))).orderBy(asc(players.displayName));
  const grantor = alias(players, "achievement_grantor");
  const revoker = alias(players, "achievement_revoker");
  const grants = await getDb(context).select({
    podId: podPlayerAchievements.podId,
    playerId: podPlayerAchievements.playerId,
    achievementId: podPlayerAchievements.achievementId,
    gameId: podPlayerAchievements.gameId,
    earnedAt: games.playedAt,
    gameArchivedAt: games.archivedAt,
    grantedByPlayerId: podPlayerAchievements.grantedByPlayerId,
    grantedByName: grantor.displayName,
    grantedAt: podPlayerAchievements.grantedAt,
    notes: podPlayerAchievements.notes,
    revokedByPlayerId: podPlayerAchievements.revokedByPlayerId,
    revokedByName: revoker.displayName,
    revokedAt: podPlayerAchievements.revokedAt,
    version: podPlayerAchievements.version,
  }).from(podPlayerAchievements)
    .innerJoin(games, eq(games.id, podPlayerAchievements.gameId))
    .innerJoin(grantor, eq(grantor.id, podPlayerAchievements.grantedByPlayerId))
    .leftJoin(revoker, eq(revoker.id, podPlayerAchievements.revokedByPlayerId))
    .where(eq(podPlayerAchievements.podId, podId));
  return { catalog, members, grants };
}

export interface AchievementGameSummary {
  id: string;
  playedAt: Date;
  resultKind: "WIN" | "DRAW";
  winnerName: string | null;
  winnerDeckName: string | null;
  participantCount: number;
  notes: string;
}

export async function listAchievementGames(
  context: UserContext,
  podId: string,
  playerId: string,
  options: { limit?: number; cursor?: string } = {},
) {
  await requirePodRole(context, podId, "EDITOR");
  const db = getDb(context);
  const membership = await db.query.podMemberships.findFirst({
    where: and(
      eq(podMemberships.podId, podId),
      eq(podMemberships.playerId, playerId),
      eq(podMemberships.status, "ACTIVE"),
      isNull(podMemberships.archivedAt),
    ),
  });
  if (!membership) throw new AppError(422, "VALIDATION_ERROR", "Achievements can only be granted to active POD players.");

  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  let cursor: { playedAt: Date; id: string } | null = null;
  if (options.cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(options.cursor, "base64url").toString("utf8")) as { playedAt: string; id: string };
      cursor = { playedAt: new Date(decoded.playedAt), id: decoded.id };
      if (Number.isNaN(cursor.playedAt.getTime()) || !cursor.id) throw new Error("invalid cursor");
    } catch {
      throw new AppError(422, "VALIDATION_ERROR", "The achievement game cursor is invalid.");
    }
  }

  const rows = await db.select({
    id: games.id,
    playedAt: games.playedAt,
    resultKind: games.resultKind,
    winnerName: sql<string | null>`(
      select winner.display_name from app.players winner where winner.id = ${games.winnerPlayerId}
    )`,
    winnerDeckName: sql<string | null>`(
      select winner_participant.deck_name_snapshot
      from app.game_participants winner_participant
      where winner_participant.game_id = ${games.id}
        and winner_participant.player_id = ${games.winnerPlayerId}
    )`,
    participantCount: sql<number>`(
      select count(*)::integer from app.game_participants participant_count where participant_count.game_id = ${games.id}
    )`,
    notes: games.notes,
  }).from(games)
    .innerJoin(gameParticipants, and(eq(gameParticipants.gameId, games.id), eq(gameParticipants.playerId, playerId)))
    .where(and(
      eq(games.podId, podId),
      isNull(games.archivedAt),
      cursor ? or(lt(games.playedAt, cursor.playedAt), and(eq(games.playedAt, cursor.playedAt), lt(games.id, cursor.id))) : undefined,
    ))
    .orderBy(desc(games.playedAt), desc(games.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const nextCursor = hasMore
    ? Buffer.from(JSON.stringify({ playedAt: items[items.length - 1].playedAt.toISOString(), id: items[items.length - 1].id })).toString("base64url")
    : null;
  return { items, nextCursor };
}

export async function grantAchievement(context: UserContext, podId: string, input: z.infer<typeof achievementGrantSchema>) {
  await requirePodRole(context, podId, "EDITOR");
  const result = await getDb(context).execute<{
    podId: string;
    playerId: string;
    achievementId: string;
    gameId: string;
    earnedAt: Date;
    grantedAt: Date;
    notes: string;
    version: number;
  }>(sql`
    with eligible_game as (
      select game.id
      from app.games game
      join app.game_participants participant
        on participant.game_id = game.id and participant.player_id = ${input.playerId}::uuid
      join app.pod_memberships membership
        on membership.pod_id = game.pod_id
       and membership.player_id = participant.player_id
       and membership.status = 'ACTIVE'
       and membership.archived_at is null
      join app.achievements achievement
        on achievement.id = ${input.achievementId}::uuid and achievement.archived_at is null
      where game.id = ${input.gameId}::uuid
        and game.pod_id = ${podId}::uuid
        and game.archived_at is null
    ), upserted as (
      insert into app.pod_player_achievements as grant_row (
        pod_id, player_id, achievement_id, game_id, granted_by_player_id, granted_at, notes,
        revoked_by_player_id, revoked_at
      )
      select ${podId}::uuid, ${input.playerId}::uuid, ${input.achievementId}::uuid,
        eligible_game.id, ${context.player.id}::uuid, now(), ${input.notes}, null, null
      from eligible_game
      on conflict (pod_id, player_id, achievement_id) do update set
        game_id = excluded.game_id,
        granted_by_player_id = excluded.granted_by_player_id,
        granted_at = excluded.granted_at,
        notes = excluded.notes,
        revoked_by_player_id = null,
        revoked_at = null,
        version = grant_row.version + 1
      returning *
    ), logged as (
      insert into app.audit_events (pod_id, actor_player_id, action, entity_type, entity_id, metadata)
      select ${podId}::uuid, ${context.player.id}::uuid, 'ACHIEVEMENT_GRANTED', 'achievement_grant',
        ${`${input.playerId}:${input.achievementId}`}, jsonb_build_object('gameId', upserted.game_id)
      from upserted
    )
    select upserted.pod_id as "podId", upserted.player_id as "playerId",
      upserted.achievement_id as "achievementId", upserted.game_id as "gameId",
      game.played_at as "earnedAt", upserted.granted_at as "grantedAt",
      upserted.notes, upserted.version
    from upserted join app.games game on game.id = upserted.game_id
  `);
  const grant = result.rows[0];
  if (!grant) {
    throw new AppError(422, "VALIDATION_ERROR", "Choose an active game from this POD in which the player participated.");
  }
  return grant;
}

export async function revokeAchievement(context: UserContext, podId: string, playerId: string, achievementId: string, version: number) {
  await requirePodRole(context, podId, "EDITOR");
  const result = await getDb(context).execute<{
    podId: string;
    playerId: string;
    achievementId: string;
    gameId: string;
    revokedAt: Date;
    version: number;
  }>(sql`
    with updated as (
      update app.pod_player_achievements set
        revoked_by_player_id = ${context.player.id}::uuid,
        revoked_at = now(),
        version = version + 1
      where pod_id = ${podId}::uuid
        and player_id = ${playerId}::uuid
        and achievement_id = ${achievementId}::uuid
        and version = ${version}
        and revoked_at is null
      returning *
    ), logged as (
      insert into app.audit_events (pod_id, actor_player_id, action, entity_type, entity_id, metadata)
      select ${podId}::uuid, ${context.player.id}::uuid, 'ACHIEVEMENT_REVOKED', 'achievement_grant',
        ${`${playerId}:${achievementId}`}, jsonb_build_object('gameId', updated.game_id)
      from updated
    )
    select pod_id as "podId", player_id as "playerId", achievement_id as "achievementId",
      game_id as "gameId", revoked_at as "revokedAt", version
    from updated
  `);
  const grant = result.rows[0];
  if (!grant) throw new AppError(409, "CONFLICT", "The achievement grant changed before it could be revoked.");
  return grant;
}
