import { and, asc, eq, getTableColumns, inArray, isNull, ne, sql } from "drizzle-orm";
import type { z } from "zod";
import { getDb } from "@/db/client";
import { achievementAutomationRules, achievements, gameModes, gameModeWinAchievementRules } from "@/db/schema";
import { requireSuperuser } from "@/lib/authorization";
import type { UserContext } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { DEFAULT_GAME_MODE_CATALOG, requiredAchievementRoles, type GameModeCatalogItem, type GameModeWinAchievementRule } from "@/lib/game-modes";
import type { createGameModeSchema, updateGameModeSchema } from "@/lib/validation";

export async function listGameModes(_context: UserContext, includeArchived = false) {
  const [modes, rules] = await Promise.all([
    getDb().select(getTableColumns(gameModes)).from(gameModes)
    .where(includeArchived ? undefined : isNull(gameModes.archivedAt))
    .orderBy(asc(gameModes.displayOrder), asc(gameModes.name)),
    getDb().select({
      gameModeCode: gameModeWinAchievementRules.gameModeCode,
      winnerRole: gameModeWinAchievementRules.winnerRole,
      achievementId: achievementAutomationRules.achievementId,
      achievementArchivedAt: achievements.archivedAt,
    }).from(gameModeWinAchievementRules)
      .innerJoin(achievementAutomationRules, eq(achievementAutomationRules.id, gameModeWinAchievementRules.ruleId))
      .innerJoin(achievements, eq(achievements.id, achievementAutomationRules.achievementId))
      .where(isNull(achievementAutomationRules.archivedAt)),
  ]);
  return modes.map((mode): GameModeCatalogItem => {
    const modeRules = rules.filter((rule) => rule.gameModeCode === mode.code);
    const requiredRoles = requiredAchievementRoles(mode.systemKey);
    return {
      ...mode,
      winAchievementRules: modeRules.map(({ winnerRole, achievementId }) => ({ winnerRole, achievementId })),
      automationReady: requiredRoles.length === 0 || requiredRoles.every((role) => modeRules.some((rule) => rule.winnerRole === role && !rule.achievementArchivedAt)),
    };
  });
}

export async function listAdminGameModes(context: UserContext) {
  requireSuperuser(context);
  return listGameModes(context, true);
}

export async function createGameMode(context: UserContext, input: z.infer<typeof createGameModeSchema>) {
  requireSuperuser(context);
  const code = input.code ?? toGameModeCode(input.name);
  if (!code) throw new AppError(422, "VALIDATION_ERROR", "The game mode name must contain letters or numbers.");
  await assertUnique(code, input.name);
  await validateWinAchievementRules(null, input.winAchievementRules, false);

  const result = await getDb().execute<typeof gameModes.$inferSelect>(sql`
    select mode.code, mode.name, mode.description, mode.min_players as "minPlayers", mode.max_players as "maxPlayers",
      mode.winning_criteria as "winningCriteria", mode.system_key as "systemKey", mode.display_order as "displayOrder",
      mode.created_by_player_id as "createdByPlayerId", mode.created_at as "createdAt", mode.updated_at as "updatedAt",
      mode.archived_at as "archivedAt", mode.version
    from private.create_game_mode_with_achievements(
      ${context.player.id}::uuid, ${code}, ${input.name}, ${input.description}, ${input.minPlayers}, ${input.maxPlayers},
      ${input.winningCriteria}::app.game_winning_criteria, ${JSON.stringify(input.winAchievementRules)}::jsonb
    ) mode
  `);
  const created = result.rows[0];
  if (!created) throw new AppError(500, "INTERNAL_ERROR", "The game mode could not be created.");
  return { ...created, winAchievementRules: input.winAchievementRules, automationReady: true };
}

export async function updateGameMode(context: UserContext, code: string, input: z.infer<typeof updateGameModeSchema>) {
  requireSuperuser(context);
  const current = await getDb().query.gameModes.findFirst({ where: eq(gameModes.code, code) });
  if (!current) throw new AppError(404, "NOT_FOUND", "Game mode not found.");

  if (current.systemKey) {
    const protectedProfile = DEFAULT_GAME_MODE_CATALOG.find((mode) => mode.systemKey === current.systemKey);
    if (!protectedProfile || input.minPlayers !== protectedProfile.minPlayers || input.maxPlayers !== protectedProfile.maxPlayers || input.winningCriteria !== protectedProfile.winningCriteria) {
      throw new AppError(422, "VALIDATION_ERROR", "Built-in player limits and winning rules are protected because their seating, team, and role validation depends on them.");
    }
  }

  await assertUnique(code, input.name, code);
  if (input.archived === true && current.archivedAt === null) {
    const [otherActive] = await getDb().select({ code: gameModes.code }).from(gameModes)
      .where(and(isNull(gameModes.archivedAt), ne(gameModes.code, code))).limit(1);
    if (!otherActive) throw new AppError(422, "VALIDATION_ERROR", "At least one active game mode is required.");
  }

  const nextArchivedAt = input.archived === true ? new Date() : input.archived === false ? null : current.archivedAt;
  await validateWinAchievementRules(current.systemKey, input.winAchievementRules, nextArchivedAt !== null);
  const result = await getDb().execute<typeof gameModes.$inferSelect>(sql`
    select mode.code, mode.name, mode.description, mode.min_players as "minPlayers", mode.max_players as "maxPlayers",
      mode.winning_criteria as "winningCriteria", mode.system_key as "systemKey", mode.display_order as "displayOrder",
      mode.created_by_player_id as "createdByPlayerId", mode.created_at as "createdAt", mode.updated_at as "updatedAt",
      mode.archived_at as "archivedAt", mode.version
    from private.update_game_mode_with_achievements(
      ${context.player.id}::uuid, ${code}, ${input.name}, ${input.description}, ${input.minPlayers}, ${input.maxPlayers},
      ${input.winningCriteria}::app.game_winning_criteria, ${nextArchivedAt}, ${input.version},
      ${JSON.stringify(input.winAchievementRules)}::jsonb
    ) mode
  `);
  const updated = result.rows[0];
  if (!updated) throw new AppError(409, "CONFLICT", "The game mode changed before it could be saved.");
  const requiredRoles = requiredAchievementRoles(current.systemKey);
  return {
    ...updated,
    winAchievementRules: input.winAchievementRules,
    automationReady: requiredRoles.length === 0 || requiredRoles.every((role) => input.winAchievementRules.some((rule) => rule.winnerRole === role)),
  };
}

export async function setGameModeArchived(context: UserContext, code: string, version: number, archived: boolean) {
  requireSuperuser(context);
  const current = await getDb().query.gameModes.findFirst({ where: eq(gameModes.code, code) });
  if (!current) throw new AppError(404, "NOT_FOUND", "Game mode not found.");
  const currentRules = await rulesForMode(code);
  return updateGameMode(context, code, {
    name: current.name,
    description: current.description,
    minPlayers: current.minPlayers,
    maxPlayers: current.maxPlayers,
    winningCriteria: current.winningCriteria,
    winAchievementRules: currentRules,
    version,
    archived,
  });
}

async function rulesForMode(code: string): Promise<GameModeWinAchievementRule[]> {
  return getDb().select({
    winnerRole: gameModeWinAchievementRules.winnerRole,
    achievementId: achievementAutomationRules.achievementId,
  }).from(gameModeWinAchievementRules)
    .innerJoin(achievementAutomationRules, eq(achievementAutomationRules.id, gameModeWinAchievementRules.ruleId))
    .where(and(eq(gameModeWinAchievementRules.gameModeCode, code), isNull(achievementAutomationRules.archivedAt)));
}

async function validateWinAchievementRules(
  systemKey: GameModeCatalogItem["systemKey"],
  rules: GameModeWinAchievementRule[],
  archived: boolean,
) {
  const slots = rules.map((rule) => rule.winnerRole ?? "GENERAL");
  if (new Set(slots).size !== slots.length) throw new AppError(422, "VALIDATION_ERROR", "Each winning role can have only one achievement.");
  if (new Set(rules.map((rule) => rule.achievementId)).size !== rules.length) {
    throw new AppError(422, "VALIDATION_ERROR", "Choose a different achievement for each winning role.");
  }
  const requiredRoles = requiredAchievementRoles(systemKey);
  if (requiredRoles.length) {
    if (rules.some((rule) => !rule.winnerRole || !requiredRoles.includes(rule.winnerRole))) {
      throw new AppError(422, "VALIDATION_ERROR", "Role-based modes require role-specific win achievements.");
    }
    if (!archived && (rules.length !== requiredRoles.length || requiredRoles.some((role) => !rules.some((rule) => rule.winnerRole === role)))) {
      throw new AppError(422, "VALIDATION_ERROR", "Choose an achievement for every winning role before using this mode.");
    }
  } else if (rules.length > 1 || rules.some((rule) => rule.winnerRole !== null)) {
    throw new AppError(422, "VALIDATION_ERROR", "This game mode accepts one optional general win achievement.");
  }
  if (!rules.length) return;
  const active = await getDb().select({ id: achievements.id }).from(achievements)
    .where(and(inArray(achievements.id, rules.map((rule) => rule.achievementId)), isNull(achievements.archivedAt)));
  if (active.length !== rules.length) throw new AppError(422, "VALIDATION_ERROR", "Choose only active achievements.");
}

async function assertUnique(code: string, name: string, currentCode?: string) {
  const [duplicate] = await getDb().select({ code: gameModes.code }).from(gameModes).where(sql`
    (${gameModes.code} = ${code} or lower(${gameModes.name}) = lower(${name}))
    ${currentCode ? sql`and ${gameModes.code} <> ${currentCode}` : sql``}
  `).limit(1);
  if (duplicate) throw new AppError(409, "CONFLICT", "A game mode with that name or code already exists.");
}

function toGameModeCode(name: string) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}
