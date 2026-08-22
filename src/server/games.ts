import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assertDataApiResult, getAuthenticatedDataApi } from "@/db/data-api";
import { gameParticipants, games, players } from "@/db/schema";
import type { UserContext } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { requirePodRole } from "@/lib/authorization";
import type { z } from "zod";
import type { createGameSchema, updateGameSchema } from "@/lib/validation";

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
    id: games.id, playedAt: games.playedAt, resultKind: games.resultKind, winnerPlayerId: games.winnerPlayerId,
    notes: games.notes, version: games.version, archivedAt: games.archivedAt,
  }).from(games).where(and(eq(games.podId, podId), options.includeArchived ? undefined : isNull(games.archivedAt), cursor ? or(lt(games.playedAt, cursor.playedAt), and(eq(games.playedAt, cursor.playedAt), lt(games.id, cursor.id))) : undefined))
    .orderBy(desc(games.playedAt), desc(games.id)).limit(limit + 1);
  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);
  const nextCursor = hasMore ? Buffer.from(JSON.stringify({ playedAt: data[data.length - 1].playedAt.toISOString(), id: data[data.length - 1].id })).toString("base64url") : null;
  return { items: data, nextCursor };
}

export async function getGame(context: UserContext, podId: string, gameId: string) {
  await requirePodRole(context, podId, "GUEST");
  const game = await getDb(context).query.games.findFirst({ where: and(eq(games.id, gameId), eq(games.podId, podId)) });
  if (!game) throw new AppError(404, "NOT_FOUND", "Game not found.");
  const participants = await getDb(context).select({
    playerId: gameParticipants.playerId,
    playerName: players.displayName,
    deckId: gameParticipants.deckId,
    deckName: gameParticipants.deckNameSnapshot,
    bracket: gameParticipants.bracketSnapshot,
    powerLevel: gameParticipants.powerLevelSnapshot,
  }).from(gameParticipants).innerJoin(players, eq(players.id, gameParticipants.playerId))
    .where(eq(gameParticipants.gameId, gameId)).orderBy(asc(players.displayName));
  return { ...game, participants };
}

export async function createGame(context: UserContext, podId: string, input: z.infer<typeof createGameSchema>) {
  await requirePodRole(context, podId, "EDITOR");
  const dataApi = getAuthenticatedDataApi(context);
  if (dataApi) {
    const gameId = assertDataApiResult(await dataApi.rpc("create_game", {
      p_pod_id: podId,
      p_actor_player_id: context.player.id,
      p_played_at: input.playedAt,
      p_result_kind: input.resultKind,
      p_winner_player_id: input.winnerPlayerId,
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
      ${input.resultKind}::app.game_result_kind,
      ${input.winnerPlayerId}::uuid,
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
      p_result_kind: input.resultKind,
      p_winner_player_id: input.winnerPlayerId,
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
      ${input.resultKind}::app.game_result_kind,
      ${input.winnerPlayerId}::uuid,
      ${input.notes},
      ${JSON.stringify(input.participants)}::jsonb
    ) as updated
  `);
  if (!result.rows[0]?.updated) throw new AppError(409, "CONFLICT", "The game was changed by another editor.");
  return getGame(context, podId, gameId);
}

export async function setGameArchived(context: UserContext, podId: string, gameId: string, archived: boolean, version: number) {
  await requirePodRole(context, podId, "ADMIN");
  const result = await getDb(context).execute<{ id: string }>(sql`
    with updated as (
      update app.games set
        archived_at = ${archived ? new Date() : null}, updated_at = now(),
        updated_by_player_id = ${context.player.id}::uuid, version = version + 1
      where id = ${gameId}::uuid and pod_id = ${podId}::uuid and version = ${version}
      returning *
    ), logged as (
      insert into app.audit_events (pod_id, actor_player_id, action, entity_type, entity_id)
      select ${podId}::uuid, ${context.player.id}::uuid, ${archived ? "GAME_ARCHIVED" : "GAME_RESTORED"}, 'game', id::text from updated
    )
    select id from updated
  `);
  const updated = result.rows[0];
  if (!updated) throw new AppError(409, "CONFLICT", "The game was changed by another administrator.");
  return getGame(context, podId, gameId);
}
