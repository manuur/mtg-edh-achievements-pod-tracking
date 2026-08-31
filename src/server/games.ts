import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assertDataApiResult, getAuthenticatedDataApi } from "@/db/data-api";
import { achievements, gameAchievementRuleSnapshots, gameModes, gameParticipants, games, players, podPlayerAchievements } from "@/db/schema";
import type { UserContext } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { requirePodRole } from "@/lib/authorization";
import type { z } from "zod";
import type { createGameSchema, updateGameSchema } from "@/lib/validation";

export interface GameAchievementBadge {
  achievementId: string;
  achievementName: string;
  achievementDescription: string;
  category: string;
  playerId: string;
  playerName: string;
  archivedAt: Date | null;
  grantSource: "MANUAL" | "AUTOMATIC";
  winnerRole: "ARCHENEMY" | "HERO" | "KING" | "KINGSGUARD" | "TRAITOR" | "BANDIT" | null;
}

export interface GameWinnerSummary {
  playerId: string;
  playerName: string;
  deckName: string;
}

async function listGameAchievementBadges(context: UserContext, podId: string, gameIds: string[]) {
  const byGameId = new Map<string, GameAchievementBadge[]>();
  if (!gameIds.length) return byGameId;

  const rows = await getDb(context).select({
    gameId: podPlayerAchievements.gameId,
    achievementId: achievements.id,
    achievementName: achievements.name,
    achievementDescription: achievements.description,
    category: achievements.category,
    playerId: players.id,
    playerName: players.displayName,
    archivedAt: achievements.archivedAt,
    grantSource: podPlayerAchievements.grantSource,
    winnerRole: gameAchievementRuleSnapshots.winnerRole,
  }).from(podPlayerAchievements)
    .innerJoin(achievements, eq(achievements.id, podPlayerAchievements.achievementId))
    .innerJoin(players, eq(players.id, podPlayerAchievements.playerId))
    .leftJoin(gameAchievementRuleSnapshots, eq(gameAchievementRuleSnapshots.id, podPlayerAchievements.automaticSnapshotId))
    .where(and(
      eq(podPlayerAchievements.podId, podId),
      inArray(podPlayerAchievements.gameId, gameIds),
      isNull(podPlayerAchievements.revokedAt),
    ))
    .orderBy(asc(players.displayName), asc(achievements.category), asc(achievements.displayOrder), asc(achievements.name));

  for (const row of rows) {
    const badges = byGameId.get(row.gameId) ?? [];
    badges.push({
      achievementId: row.achievementId,
      achievementName: row.achievementName,
      achievementDescription: row.achievementDescription,
      category: row.category,
      playerId: row.playerId,
      playerName: row.playerName,
      archivedAt: row.archivedAt,
      grantSource: row.grantSource,
      winnerRole: row.winnerRole,
    });
    byGameId.set(row.gameId, badges);
  }
  return byGameId;
}

export async function listGames(context: UserContext, podId: string, options: { limit?: number; cursor?: string; includeArchived?: boolean } = {}) {
  await requirePodRole(context, podId, options.includeArchived ? "ADMIN" : "GUEST");
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  let cursor: { playedAt: Date; id: string } | null = null;
  if (options.cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(options.cursor, "base64url").toString("utf8")) as { playedAt: string; id: string };
      cursor = { playedAt: new Date(decoded.playedAt), id: decoded.id };
      if (Number.isNaN(cursor.playedAt.getTime()) || !cursor.id) throw new Error("invalid cursor");
    } catch { throw new AppError(422, "VALIDATION_ERROR", "The game cursor is invalid."); }
  }
  const rows = await getDb(context).select({
    id: games.id, playedAt: games.playedAt, gameMode: games.gameMode, gameModeName: gameModes.name,
    monarchyBanditRule: games.monarchyBanditRule, resultKind: games.resultKind,
    winners: sql<GameWinnerSummary[]>`coalesce((
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
    participantCount: sql<number>`(
      select count(*)::integer
      from app.game_participants participant_count
      where participant_count.game_id = ${games.id}
    )`,
    notes: games.notes, version: games.version, archivedAt: games.archivedAt,
  }).from(games).innerJoin(gameModes, eq(gameModes.code, games.gameMode)).where(and(eq(games.podId, podId), options.includeArchived ? undefined : isNull(games.archivedAt), cursor ? or(lt(games.playedAt, cursor.playedAt), and(eq(games.playedAt, cursor.playedAt), lt(games.id, cursor.id))) : undefined))
    .orderBy(desc(games.playedAt), desc(games.id)).limit(limit + 1);
  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);
  const achievementsByGameId = await listGameAchievementBadges(context, podId, data.map((game) => game.id));
  const nextCursor = hasMore ? Buffer.from(JSON.stringify({ playedAt: data[data.length - 1].playedAt.toISOString(), id: data[data.length - 1].id })).toString("base64url") : null;
  return {
    items: data.map((game) => ({ ...game, achievements: achievementsByGameId.get(game.id) ?? [] })),
    nextCursor,
  };
}

export async function getGame(context: UserContext, podId: string, gameId: string) {
  await requirePodRole(context, podId, "GUEST");
  const game = await getDb(context).query.games.findFirst({ where: and(eq(games.id, gameId), eq(games.podId, podId)) });
  if (!game) throw new AppError(404, "NOT_FOUND", "Game not found.");
  const mode = await getDb(context).query.gameModes.findFirst({ where: eq(gameModes.code, game.gameMode) });
  const participants = await getDb(context).select({
    playerId: gameParticipants.playerId,
    playerName: players.displayName,
    deckId: gameParticipants.deckId,
    deckName: gameParticipants.deckNameSnapshot,
    bracket: gameParticipants.bracketSnapshot,
    powerLevel: gameParticipants.powerLevelSnapshot,
    commanderCmc: gameParticipants.commanderCmcSnapshot,
    colorIdentity: gameParticipants.colorIdentitySnapshot,
    hasPartnerCommanders: gameParticipants.hasPartnerCommandersSnapshot,
    hasCompanion: gameParticipants.hasCompanionSnapshot,
    hasBackground: gameParticipants.hasBackgroundSnapshot,
    seatPosition: gameParticipants.seatPosition,
    modeRole: gameParticipants.modeRole,
    isWinner: gameParticipants.isWinner,
  }).from(gameParticipants).innerJoin(players, eq(players.id, gameParticipants.playerId))
    .where(eq(gameParticipants.gameId, gameId))
    .orderBy(asc(gameParticipants.seatPosition), asc(players.displayName));
  const achievementsByGameId = await listGameAchievementBadges(context, podId, [gameId]);
  return {
    ...game,
    gameModeName: mode?.name ?? game.gameMode,
    gameModeDescription: mode?.description ?? "",
    participants,
    winners: participants.filter((participant) => participant.isWinner).map((participant) => ({
      playerId: participant.playerId,
      playerName: participant.playerName,
      deckName: participant.deckName,
    })),
    achievements: achievementsByGameId.get(gameId) ?? [],
  };
}

export async function createGame(context: UserContext, podId: string, input: z.infer<typeof createGameSchema>) {
  await requirePodRole(context, podId, "EDITOR");
  const dataApi = getAuthenticatedDataApi(context);
  if (dataApi) {
    const gameId = assertDataApiResult(await dataApi.rpc("create_game", {
      p_pod_id: podId,
      p_actor_player_id: context.player.id,
      p_played_at: input.playedAt,
      p_game_mode: input.gameMode,
      p_monarchy_bandit_rule: input.monarchyBanditRule,
      p_result_kind: input.resultKind,
      p_winner_player_ids: input.winnerPlayerIds,
      p_notes: input.notes,
      p_idempotency_key: input.idempotencyKey,
      p_participants: input.participants,
    })) as string | null;
    if (!gameId) throw new AppError(500, "INTERNAL_ERROR", "The game could not be created.");
    return getGame(context, podId, gameId);
  }
  const result = await getDb(context).execute<{ game_id: string }>(sql`
    select api.create_game(
      ${podId}::uuid,
      ${context.player.id}::uuid,
      ${input.playedAt}::timestamptz,
      ${input.gameMode}::text,
      ${input.monarchyBanditRule}::app.monarchy_bandit_rule,
      ${input.resultKind}::app.game_result_kind,
      ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(input.winnerPlayerIds)}::jsonb)::uuid),
      ${input.notes},
      ${input.idempotencyKey}::uuid,
      ${JSON.stringify(input.participants)}::jsonb
    ) as game_id
  `);
  const gameId = result.rows[0]?.game_id;
  if (!gameId) throw new AppError(500, "INTERNAL_ERROR", "The game could not be created.");
  return getGame(context, podId, gameId);
}

export async function updateGame(context: UserContext, podId: string, gameId: string, input: z.infer<typeof updateGameSchema>) {
  await requirePodRole(context, podId, "EDITOR");
  const dataApi = getAuthenticatedDataApi(context);
  if (dataApi) {
    const updated = assertDataApiResult(await dataApi.rpc("update_game", {
      p_game_id: gameId,
      p_pod_id: podId,
      p_actor_player_id: context.player.id,
      p_expected_version: input.version,
      p_played_at: input.playedAt,
      p_game_mode: input.gameMode,
      p_monarchy_bandit_rule: input.monarchyBanditRule,
      p_result_kind: input.resultKind,
      p_winner_player_ids: input.winnerPlayerIds,
      p_notes: input.notes,
      p_participants: input.participants,
    })) as boolean | null;
    if (!updated) throw new AppError(409, "CONFLICT", "The game was changed by another editor.");
    return getGame(context, podId, gameId);
  }
  const result = await getDb(context).execute<{ updated: boolean }>(sql`
    select api.update_game(
      ${gameId}::uuid,
      ${podId}::uuid,
      ${context.player.id}::uuid,
      ${input.version},
      ${input.playedAt}::timestamptz,
      ${input.gameMode}::text,
      ${input.monarchyBanditRule}::app.monarchy_bandit_rule,
      ${input.resultKind}::app.game_result_kind,
      ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(input.winnerPlayerIds)}::jsonb)::uuid),
      ${input.notes},
      ${JSON.stringify(input.participants)}::jsonb
    ) as updated
  `);
  if (!result.rows[0]?.updated) throw new AppError(409, "CONFLICT", "The game was changed by another editor.");
  return getGame(context, podId, gameId);
}

export async function setGameArchived(context: UserContext, podId: string, gameId: string, archived: boolean, version: number) {
  await requirePodRole(context, podId, "ADMIN");
  const dataApi = getAuthenticatedDataApi(context);
  let updated: boolean;
  if (dataApi) {
    updated = Boolean(assertDataApiResult(await dataApi.rpc("set_game_archived", {
      p_game_id: gameId,
      p_pod_id: podId,
      p_actor_player_id: context.player.id,
      p_expected_version: version,
      p_archived: archived,
    })));
  } else {
    const result = await getDb(context).execute<{ updated: boolean }>(sql`
      select api.set_game_archived(
        ${gameId}::uuid, ${podId}::uuid, ${context.player.id}::uuid, ${version}, ${archived}
      ) as updated
    `);
    updated = Boolean(result.rows[0]?.updated);
  }
  if (!updated) throw new AppError(409, "CONFLICT", "The game was changed by another administrator.");
  return getGame(context, podId, gameId);
}
