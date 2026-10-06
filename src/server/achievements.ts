import { and, asc, desc, eq, getTableColumns, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { alias } from "drizzle-orm/pg-core";
import { achievementAutomationRules, achievementCategories, achievementGameFactConditions, achievementGameFactRules, achievements, auditEvents, gameAchievementRuleSnapshots, gameModes, gameModeWinAchievementRules, gameParticipants, games, players, podMemberships, podPlayerAchievements, pods } from "@/db/schema";
import type { UserContext } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { requirePodRole, requireSuperuser, writeAudit } from "@/lib/authorization";
import type { AchievementConditionValue, AchievementGameFactRule } from "@/lib/achievement-rules";
import { achievementCategorySchema, achievementFieldsSchema, achievementSchema } from "@/lib/validation";
import { slugify } from "@/lib/utils";
import type { z } from "zod";
import type { achievementGrantSchema, reorderAchievementCategoriesSchema, reorderAchievementsSchema, updateAchievementSchema } from "@/lib/validation";

export async function listCatalog(context: UserContext, includeArchived = false) {
  if (!context.isSuperuser) {
    const [membership] = await getDb(context).select({ podId: podMemberships.podId }).from(podMemberships)
      .innerJoin(pods, and(eq(pods.id, podMemberships.podId), isNull(pods.archivedAt)))
      .where(and(eq(podMemberships.playerId, context.player.id), eq(podMemberships.status, "ACTIVE"), isNull(podMemberships.archivedAt)))
      .limit(1);
    if (!membership) throw new AppError(403, "FORBIDDEN", "POD membership is required.");
  }
  return getDb(context).select(getTableColumns(achievements)).from(achievements)
    .innerJoin(achievementCategories, eq(achievementCategories.name, achievements.category))
    .where(includeArchived ? undefined : isNull(achievements.archivedAt))
    .orderBy(asc(achievementCategories.displayOrder), asc(achievements.displayOrder), asc(achievements.name));
}

export type AdminAchievement = Awaited<ReturnType<typeof listAdminAchievementCatalog>>[number];

export async function listAdminAchievementCatalog(context: UserContext, includeArchived = true, achievementId?: string) {
  requireSuperuser(context);
  const db = getDb(context);
  const [catalog, ruleRows] = await Promise.all([
    db.select(getTableColumns(achievements)).from(achievements)
      .innerJoin(achievementCategories, eq(achievementCategories.name, achievements.category))
      .where(and(includeArchived ? undefined : isNull(achievements.archivedAt), achievementId ? eq(achievements.id, achievementId) : undefined))
      .orderBy(asc(achievementCategories.displayOrder), asc(achievements.displayOrder), asc(achievements.name)),
    db.select({
      achievementId: achievementAutomationRules.achievementId,
      ruleId: achievementAutomationRules.id,
      recipient: achievementGameFactRules.recipient,
      ruleOrder: achievementGameFactRules.displayOrder,
      conditionOrder: achievementGameFactConditions.displayOrder,
      fact: achievementGameFactConditions.factKey,
      operator: achievementGameFactConditions.operator,
      value: achievementGameFactConditions.conditionValue,
    }).from(achievementAutomationRules)
      .innerJoin(achievementGameFactRules, eq(achievementGameFactRules.ruleId, achievementAutomationRules.id))
      .innerJoin(achievementGameFactConditions, eq(achievementGameFactConditions.ruleId, achievementGameFactRules.ruleId))
      .where(and(eq(achievementAutomationRules.ruleType, "GAME_FACT"), isNull(achievementAutomationRules.archivedAt), achievementId ? eq(achievementAutomationRules.achievementId, achievementId) : undefined))
      .orderBy(asc(achievementAutomationRules.achievementId), asc(achievementGameFactRules.displayOrder), asc(achievementGameFactConditions.displayOrder)),
  ]);

  const byAchievement = new Map<string, Map<string, AchievementGameFactRule>>();
  for (const row of ruleRows) {
    const rules = byAchievement.get(row.achievementId) ?? new Map<string, AchievementGameFactRule>();
    const rule = rules.get(row.ruleId) ?? { recipient: row.recipient, conditions: [] };
    rule.conditions.push({
      fact: row.fact,
      operator: row.operator,
      ...(row.value !== null && { value: row.value as AchievementConditionValue }),
    });
    rules.set(row.ruleId, rule);
    byAchievement.set(row.achievementId, rules);
  }
  return catalog.map((achievement) => ({
    ...achievement,
    gameFactRules: [...(byAchievement.get(achievement.id)?.values() ?? [])],
  }));
}

export async function listAchievementCategories(context: UserContext) {
  requireSuperuser(context);
  return getDb(context).select().from(achievementCategories)
    .orderBy(asc(achievementCategories.displayOrder), asc(achievementCategories.name));
}

export async function createAchievementCategory(context: UserContext, input: z.infer<typeof achievementCategorySchema>) {
  requireSuperuser(context);
  const db = getDb(context);
  const [created] = await db.insert(achievementCategories).values({
    name: input.name,
    displayOrder: sql<number>`coalesce((select max(${achievementCategories.displayOrder}) + 10 from ${achievementCategories}), 10)`,
  }).onConflictDoNothing().returning();
  const category = created ?? (await db.select().from(achievementCategories)
    .where(sql`lower(${achievementCategories.name}) = lower(${input.name})`).limit(1))[0];
  if (!category) throw new AppError(409, "CONFLICT", "That achievement category already exists.");
  if (created) await writeAudit({ context, action: "ACHIEVEMENT_CATEGORY_CREATED", entityType: "achievement_category", entityId: category.id, metadata: { name: category.name } });
  return category;
}

export async function createAchievement(context: UserContext, input: z.infer<typeof achievementSchema>) {
  requireSuperuser(context);
  const result = await getDb(context).execute<typeof achievements.$inferSelect>(sql`
    select id, code, name, description, category, display_order as "displayOrder",
      created_by_player_id as "createdByPlayerId", created_at as "createdAt",
      updated_at as "updatedAt", archived_at as "archivedAt", version
    from private.create_achievement_with_rules(
      ${context.player.id}::uuid, ${input.code}, ${input.name}, ${input.description},
      ${input.category}, ${input.displayOrder}, ${JSON.stringify(input.gameFactRules)}::jsonb
    )
  `);
  const created = result.rows[0];
  if (!created?.id) throw new AppError(500, "INTERNAL_ERROR", "The achievement could not be created.");
  return { ...created, gameFactRules: input.gameFactRules };
}

export async function updateAchievement(context: UserContext, achievementId: string, input: z.infer<typeof updateAchievementSchema>) {
  requireSuperuser(context);
  const db = getDb(context);
  if (input.archived === true) await assertAchievementNotUsedByActiveMode(achievementId);
  const current = (await listAdminAchievementCatalog(context, true, achievementId))[0];
  if (!current) throw new AppError(404, "NOT_FOUND", "Achievement not found.");
  const rules = input.gameFactRules ?? current.gameFactRules;
  const result = await db.execute<typeof achievements.$inferSelect>(sql`
    select id, code, name, description, category, display_order as "displayOrder",
      created_by_player_id as "createdByPlayerId", created_at as "createdAt",
      updated_at as "updatedAt", archived_at as "archivedAt", version
    from private.update_achievement_with_rules(
      ${context.player.id}::uuid, ${achievementId}::uuid,
      ${input.code ?? current.code}, ${input.name ?? current.name},
      ${input.description ?? current.description}, ${input.category ?? current.category},
      ${input.displayOrder ?? current.displayOrder},
      ${input.archived === undefined ? current.archivedAt : input.archived ? new Date() : null}::timestamptz,
      ${input.version}, ${JSON.stringify(rules)}::jsonb
    )
  `);
  const updated = result.rows[0];
  if (!updated?.id) throw new AppError(409, "CONFLICT", "The achievement was changed by someone else.");
  return { ...updated, gameFactRules: rules };
}

export async function reorderAchievementCategories(context: UserContext, input: z.infer<typeof reorderAchievementCategoriesSchema>) {
  requireSuperuser(context);
  const itemCount = input.items.length;
  const result = await getDb(context).execute<typeof achievementCategories.$inferSelect>(sql`
    with input as (
      select (item.value ->> 'id')::uuid as id,
        (item.value ->> 'version')::integer as version,
        item.position
      from jsonb_array_elements(${JSON.stringify(input.items)}::jsonb) with ordinality
        as item(value, position)
    ), valid as (
      select
        (select count(*) from input) = ${itemCount}
        and (select count(distinct id) from input) = ${itemCount}
        and (select count(*) from app.achievement_categories) = ${itemCount}
        and (
          select count(*) from app.achievement_categories category
          join input on input.id = category.id and input.version = category.version
        ) = ${itemCount} as ok
    ), updated as (
      update app.achievement_categories category set
        display_order = (input.position * 10)::integer,
        updated_at = now(),
        version = category.version + 1
      from input, valid
      where valid.ok and category.id = input.id
      returning category.*
    ), logged as (
      insert into app.audit_events (actor_player_id, action, entity_type, entity_id, metadata)
      select ${context.player.id}::uuid, 'ACHIEVEMENT_CATEGORIES_REORDERED', 'achievement_category', 'catalog',
        jsonb_build_object('count', ${itemCount}::integer)
      where (select count(*) from updated) = ${itemCount}
    )
    select id, name, display_order as "displayOrder", created_at as "createdAt",
      updated_at as "updatedAt", version
    from updated order by display_order, name
  `);
  if (result.rows.length !== itemCount) throw new AppError(409, "CONFLICT", "The category list changed before it could be reordered. Refresh and try again.");
  return result.rows;
}

export async function reorderAchievements(context: UserContext, input: z.infer<typeof reorderAchievementsSchema>) {
  requireSuperuser(context);
  const itemCount = input.items.length;
  const result = await getDb(context).execute<typeof achievements.$inferSelect>(sql`
    with input as (
      select (item.value ->> 'id')::uuid as id,
        (item.value ->> 'version')::integer as version,
        item.position
      from jsonb_array_elements(${JSON.stringify(input.items)}::jsonb) with ordinality
        as item(value, position)
    ), selected_category as (
      select id, name from app.achievement_categories where id = ${input.categoryId}::uuid
    ), valid as (
      select
        (select count(*) from input) = ${itemCount}
        and (select count(distinct id) from input) = ${itemCount}
        and (
          select count(*) from app.achievements achievement
          join selected_category category on category.name = achievement.category
        ) = ${itemCount}
        and (
          select count(*) from app.achievements achievement
          join input on input.id = achievement.id and input.version = achievement.version
          join selected_category category on category.name = achievement.category
        ) = ${itemCount} as ok
    ), updated as (
      update app.achievements achievement set
        display_order = (input.position * 10)::integer,
        updated_at = now(),
        version = achievement.version + 1
      from input, valid
      where valid.ok and achievement.id = input.id
      returning achievement.*
    ), logged as (
      insert into app.audit_events (actor_player_id, action, entity_type, entity_id, metadata)
      select ${context.player.id}::uuid, 'ACHIEVEMENTS_REORDERED', 'achievement_category', ${input.categoryId},
        jsonb_build_object('count', ${itemCount}::integer)
      where (select count(*) from updated) = ${itemCount}
    )
    select id, code, name, description, category, display_order as "displayOrder",
      created_by_player_id as "createdByPlayerId", created_at as "createdAt",
      updated_at as "updatedAt", archived_at as "archivedAt", version
    from updated order by display_order, name
  `);
  if (result.rows.length !== itemCount) throw new AppError(409, "CONFLICT", "The achievement list changed before it could be reordered. Refresh and try again.");
  return result.rows;
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
  await assertAchievementNotUsedByActiveMode(achievementId);
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
    return achievementFieldsSchema.parse({
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
  const parsed = parseAchievementCsv(text);
  const db = getDb(context);
  const existingCategories = await db.select().from(achievementCategories);
  const categoryByKey = new Map(existingCategories.map((category) => [category.name.toLocaleLowerCase(), category.name]));
  const newCategories: string[] = [];
  const records = parsed.map((record) => {
    const key = record.category.toLocaleLowerCase();
    let category = categoryByKey.get(key);
    if (!category) {
      category = record.category;
      categoryByKey.set(key, category);
      newCategories.push(category);
    }
    return { ...record, category };
  });
  const lastOrder = existingCategories.reduce((maximum, category) => Math.max(maximum, category.displayOrder), 0);
  const achievementInsert = db.insert(achievements).values(records.map((record) => ({ ...record, createdByPlayerId: context.player.id })));
  const auditInsert = db.insert(auditEvents).values({ actorPlayerId: context.player.id, action: "ACHIEVEMENTS_IMPORTED", entityType: "achievement", entityId: "bulk", metadata: { count: records.length } });
  if (newCategories.length) {
    await db.batch([
      db.insert(achievementCategories).values(newCategories.map((name, index) => ({
        name,
        displayOrder: lastOrder + ((index + 1) * 10),
      }))),
      achievementInsert,
      auditInsert,
    ]);
  } else {
    await db.batch([achievementInsert, auditInsert]);
  }
  return { count: records.length, records };
}

export async function listPodAchievements(context: UserContext, podId: string) {
  await requirePodRole(context, podId, "GUEST");
  const catalog = await getDb(context).select(getTableColumns(achievements)).from(achievements)
    .innerJoin(achievementCategories, eq(achievementCategories.name, achievements.category))
    .orderBy(asc(achievementCategories.displayOrder), asc(achievements.displayOrder), asc(achievements.name));
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
    grantSource: podPlayerAchievements.grantSource,
    automaticWinnerRole: gameAchievementRuleSnapshots.winnerRole,
    grantedAt: podPlayerAchievements.grantedAt,
    notes: podPlayerAchievements.notes,
    revokedByPlayerId: podPlayerAchievements.revokedByPlayerId,
    revokedByName: revoker.displayName,
    revokedAt: podPlayerAchievements.revokedAt,
    version: podPlayerAchievements.version,
  }).from(podPlayerAchievements)
    .innerJoin(games, eq(games.id, podPlayerAchievements.gameId))
    .leftJoin(grantor, eq(grantor.id, podPlayerAchievements.grantedByPlayerId))
    .leftJoin(revoker, eq(revoker.id, podPlayerAchievements.revokedByPlayerId))
    .leftJoin(gameAchievementRuleSnapshots, eq(gameAchievementRuleSnapshots.id, podPlayerAchievements.automaticSnapshotId))
    .where(eq(podPlayerAchievements.podId, podId));
  return { catalog, members, grants };
}

export interface AchievementGameSummary {
  id: string;
  playedAt: Date;
  gameMode: string;
  gameModeName: string;
  resultKind: "WIN" | "DRAW";
  winners: { playerId: string; playerName: string; deckName: string }[];
  playerDeckName: string;
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
    gameMode: games.gameMode,
    gameModeName: gameModes.name,
    resultKind: games.resultKind,
    winners: sql<{ playerId: string; playerName: string; deckName: string }[]>`coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerId', winner_participant.player_id,
        'playerName', winner.display_name,
        'deckName', winner_participant.deck_name_snapshot
      ) order by winner_participant.seat_position nulls last, winner.display_name)
      from app.game_participants winner_participant
      join app.players winner on winner.id = winner_participant.player_id
      where winner_participant.game_id = ${games.id}
        and winner_participant.is_winner
    ), '[]'::jsonb)`,
    playerDeckName: gameParticipants.deckNameSnapshot,
    participantCount: sql<number>`(
      select count(*)::integer from app.game_participants participant_count where participant_count.game_id = ${games.id}
    )`,
    notes: games.notes,
  }).from(games)
    .innerJoin(gameModes, eq(gameModes.code, games.gameMode))
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
    ), cleared_suppression as (
      delete from app.automatic_achievement_suppressions
      where pod_id = ${podId}::uuid
        and player_id = ${input.playerId}::uuid
        and achievement_id = ${input.achievementId}::uuid
    ), upserted as (
      insert into app.pod_player_achievements as grant_row (
        pod_id, player_id, achievement_id, game_id, granted_by_player_id, grant_source,
        automatic_snapshot_id, granted_at, notes, revoked_by_player_id, revoked_at, revocation_source
      )
      select ${podId}::uuid, ${input.playerId}::uuid, ${input.achievementId}::uuid,
        eligible_game.id, ${context.player.id}::uuid, 'MANUAL', null, now(), ${input.notes}, null, null, null
      from eligible_game
      on conflict (pod_id, player_id, achievement_id) do update set
        game_id = excluded.game_id,
        granted_by_player_id = excluded.granted_by_player_id,
        grant_source = 'MANUAL',
        automatic_snapshot_id = null,
        granted_at = excluded.granted_at,
        notes = excluded.notes,
        revoked_by_player_id = null,
        revoked_at = null,
        revocation_source = null,
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
        revocation_source = 'MANUAL',
        version = version + 1
      where pod_id = ${podId}::uuid
        and player_id = ${playerId}::uuid
        and achievement_id = ${achievementId}::uuid
        and version = ${version}
        and revoked_at is null
      returning *
    ), suppressed as (
      insert into app.automatic_achievement_suppressions (
        pod_id, player_id, achievement_id, suppressed_by_player_id
      )
      select updated.pod_id, updated.player_id, updated.achievement_id, ${context.player.id}::uuid
      from updated
      on conflict (pod_id, player_id, achievement_id) do update set
        suppressed_by_player_id = excluded.suppressed_by_player_id,
        created_at = now()
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

async function assertAchievementNotUsedByActiveMode(achievementId: string) {
  const [mapping] = await getDb().select({ modeName: gameModes.name }).from(achievementAutomationRules)
    .innerJoin(gameModeWinAchievementRules, eq(gameModeWinAchievementRules.ruleId, achievementAutomationRules.id))
    .innerJoin(gameModes, and(eq(gameModes.code, gameModeWinAchievementRules.gameModeCode), isNull(gameModes.archivedAt)))
    .where(and(eq(achievementAutomationRules.achievementId, achievementId), isNull(achievementAutomationRules.archivedAt)))
    .limit(1);
  if (mapping) throw new AppError(409, "ACHIEVEMENT_IN_USE", `Reassign this achievement from ${mapping.modeName} before archiving or deleting it.`);
}
