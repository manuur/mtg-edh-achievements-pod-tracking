import { z } from "zod";
import { THEME_PREFERENCES } from "@/lib/theme-types";
import { canonicalColorIdentity, MTG_COLORS } from "@/lib/deck-metadata";
import { GAME_PARTICIPANT_ROLES, GAME_WINNING_CRITERIA, MONARCHY_BANDIT_RULES } from "@/lib/game-modes";
import {
  ACHIEVEMENT_RULE_RECIPIENTS,
  GAME_FACT_KEYS,
  GAME_FACT_OPERATORS,
  normalizeCondition,
  validateCondition,
  type AchievementGameFactCondition,
} from "@/lib/achievement-rules";

export const podRoleSchema = z.enum(["ADMIN", "EDITOR", "GUEST"]);
export const membershipStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);
export const gameResultKindSchema = z.enum(["WIN", "DRAW"]);
export const gameModeSchema = z.string().trim().min(1).max(64).regex(/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/);
export const gameParticipantRoleSchema = z.enum(GAME_PARTICIPANT_ROLES);
export const monarchyBanditRuleSchema = z.enum(MONARCHY_BANDIT_RULES);
export const gameWinningCriteriaSchema = z.enum(GAME_WINNING_CRITERIA);
export const commanderBracketSchema = z.union([
  z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5),
]);
export const themePreferenceSchema = z.enum(THEME_PREFERENCES);
export const mtgColorSchema = z.enum(MTG_COLORS);
const colorIdentityValueSchema = z.array(mtgColorSchema).max(5).nullable()
  .superRefine((colors, context) => {
    if (colors && new Set(colors).size !== colors.length) {
      context.addIssue({ code: "custom", message: "Color identity cannot contain duplicate colors." });
    }
  })
  .transform((colors) => colors === null ? null : canonicalColorIdentity(colors));
export const colorIdentitySchema = colorIdentityValueSchema.optional().default(null);

const optionalMoxfieldUrl = z
  .union([z.literal(""), z.url({ protocol: /^https$/ })])
  .optional()
  .transform((value) => value || null)
  .refine((value) => value === null || /^https:\/\/(?:www\.)?moxfield\.com\/decks\/[A-Za-z0-9_-]+\/?(?:[?#].*)?$/.test(value), {
    message: "Use an HTTPS moxfield.com deck URL.",
  });

export const createPodSchema = z.object({
  name: z.string().trim().min(2).max(80),
  timezone: z.string().trim().min(1).max(80).default("UTC").refine((timezone) => {
    try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); return true; }
    catch { return false; }
  }, "Use a valid IANA timezone."),
});

export const updatePodSchema = createPodSchema.partial().extend({ version: z.number().int().positive() });

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  version: z.number().int().positive(),
});

export const updateThemePreferenceSchema = z.object({
  themePreference: themePreferenceSchema,
  version: z.number().int().positive(),
});

export const addMemberSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  email: z.union([z.literal(""), z.email()]).optional().transform((value) => value?.toLowerCase() || null),
  role: podRoleSchema.default("GUEST"),
});

export const updateMemberSchema = z.object({
  role: podRoleSchema.optional(),
  status: membershipStatusSchema.optional(),
  claimEmail: z.email().transform((email) => email.trim().toLowerCase()).optional(),
  version: z.number().int().positive(),
});

export const createDeckSchema = z.object({
  ownerPlayerId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  bracket: commanderBracketSchema,
  powerLevel: z.number().min(0).max(10).nullable().optional().default(null),
  commanderCmc: z.number().int().nonnegative().nullable().optional().default(null),
  colorIdentity: colorIdentitySchema,
  hasPartnerCommanders: z.boolean().optional().default(false),
  hasCompanion: z.boolean().optional().default(false),
  hasBackground: z.boolean().optional().default(false),
  moxfieldUrl: optionalMoxfieldUrl,
});

export const updateDeckSchema = createDeckSchema.omit({ ownerPlayerId: true }).partial().extend({
  powerLevel: createDeckSchema.shape.powerLevel.removeDefault().optional(),
  commanderCmc: createDeckSchema.shape.commanderCmc.removeDefault().optional(),
  colorIdentity: colorIdentityValueSchema.optional(),
  hasPartnerCommanders: createDeckSchema.shape.hasPartnerCommanders.removeDefault().optional(),
  hasCompanion: createDeckSchema.shape.hasCompanion.removeDefault().optional(),
  hasBackground: createDeckSchema.shape.hasBackground.removeDefault().optional(),
  version: z.number().int().positive(),
  archived: z.boolean().optional(),
});

export const gameParticipantSchema = z.object({
  playerId: z.uuid(),
  deckId: z.uuid(),
  seatPosition: z.number().int().min(1).max(8).nullable().optional().default(null),
  modeRole: gameParticipantRoleSchema.nullable().optional().default(null),
});

const gameInputShape = {
  playedAt: z.iso.datetime(),
  gameMode: gameModeSchema.optional().default("FREE_FOR_ALL"),
  monarchyBanditRule: monarchyBanditRuleSchema.nullable().optional().default(null),
  resultKind: gameResultKindSchema,
  winnerPlayerIds: z.array(z.uuid()).max(8).optional(),
  winnerPlayerId: z.uuid().nullable().optional(),
  notes: z.string().trim().max(1000).optional().default(""),
  participants: z.array(gameParticipantSchema).min(2).max(8),
};

type NormalizedGameInput = z.infer<z.ZodObject<typeof gameInputShape>> & { winnerPlayerIds: string[] };

function validateGame(value: NormalizedGameInput, context: z.RefinementCtx) {
  const players = new Set(value.participants.map((participant) => participant.playerId));
  if (players.size !== value.participants.length) {
    context.addIssue({ code: "custom", message: "Each player can participate only once.", path: ["participants"] });
  }
  const winners = new Set(value.winnerPlayerIds);
  if (winners.size !== value.winnerPlayerIds.length) {
    context.addIssue({ code: "custom", message: "Each winning player can be selected only once.", path: ["winnerPlayerIds"] });
  }
  if (value.winnerPlayerIds.some((playerId) => !players.has(playerId))) {
    context.addIssue({ code: "custom", message: "Every winner must be a participant.", path: ["winnerPlayerIds"] });
  }
  if (value.resultKind === "DRAW" && winners.size) context.addIssue({ code: "custom", message: "A draw cannot have winners.", path: ["winnerPlayerIds"] });
  if (value.resultKind === "WIN" && !winners.size) context.addIssue({ code: "custom", message: "A completed win requires at least one winner.", path: ["winnerPlayerIds"] });

  const participantsById = new Map(value.participants.map((participant) => [participant.playerId, participant]));
  const seats = value.participants.map((participant) => participant.seatPosition);
  const hasExactSeats = (count: number) => seats.every((seat): seat is number => seat !== null)
    && new Set(seats).size === count
    && seats.every((seat) => seat >= 1 && seat <= count);
  const roles = value.participants.map((participant) => participant.modeRole);
  const noModeMetadata = seats.every((seat) => seat === null) && roles.every((role) => role === null);
  const countRole = (role: NonNullable<typeof value.participants[number]["modeRole"]>) => roles.filter((candidate) => candidate === role).length;
  const winnerRoles = value.winnerPlayerIds.map((playerId) => participantsById.get(playerId)?.modeRole);

  if (value.gameMode !== "MONARCHY" && value.monarchyBanditRule !== null) {
    context.addIssue({ code: "custom", message: "The Bandit rule is only available for Monarchy.", path: ["monarchyBanditRule"] });
  }

  if (value.gameMode === "FREE_FOR_ALL") {
    if (!noModeMetadata) context.addIssue({ code: "custom", message: "Free-for-all does not use seats or roles.", path: ["participants"] });
    if (value.resultKind === "WIN" && winners.size !== 1) context.addIssue({ code: "custom", message: "Free-for-all requires exactly one winner.", path: ["winnerPlayerIds"] });
  }

  if (value.gameMode === "PENTAGON") {
    if (value.participants.length !== 5) context.addIssue({ code: "custom", message: "Pentagon requires exactly five players.", path: ["participants"] });
    if (!hasExactSeats(5) || roles.some((role) => role !== null)) context.addIssue({ code: "custom", message: "Pentagon requires unique clockwise seats 1–5 and no roles.", path: ["participants"] });
    if (value.resultKind === "WIN" && winners.size !== 1) context.addIssue({ code: "custom", message: "Pentagon requires exactly one winner.", path: ["winnerPlayerIds"] });
  }

  if (value.gameMode === "ASTERISK") {
    if (value.participants.length !== 6) context.addIssue({ code: "custom", message: "Asterisk requires exactly six players.", path: ["participants"] });
    if (!hasExactSeats(6) || roles.some((role) => role !== null)) context.addIssue({ code: "custom", message: "Asterisk requires unique clockwise seats 1–6 and no roles.", path: ["participants"] });
    if (value.resultKind === "WIN") {
      const winnerSeats = value.winnerPlayerIds.map((playerId) => participantsById.get(playerId)?.seatPosition);
      if (winners.size !== 2 || winnerSeats.some((seat) => seat === null) || Math.abs(Number(winnerSeats[0]) - Number(winnerSeats[1])) !== 3) {
        context.addIssue({ code: "custom", message: "Asterisk winners must be one opposite-seat pair.", path: ["winnerPlayerIds"] });
      }
    }
  }

  if (value.gameMode === "ARCHENEMY") {
    if (value.participants.length < 3) context.addIssue({ code: "custom", message: "Archenemy requires at least three players.", path: ["participants"] });
    if (seats.some((seat) => seat !== null) || countRole("ARCHENEMY") !== 1 || countRole("HERO") !== value.participants.length - 1) {
      context.addIssue({ code: "custom", message: "Archenemy requires one Archenemy and all other players as Heroes.", path: ["participants"] });
    }
    if (value.resultKind === "WIN") {
      const archenemyWon = winners.size === 1 && winnerRoles[0] === "ARCHENEMY";
      const heroesWon = winners.size === value.participants.length - 1 && winnerRoles.every((role) => role === "HERO");
      if (!archenemyWon && !heroesWon) context.addIssue({ code: "custom", message: "Choose either the Archenemy or the complete Heroes team.", path: ["winnerPlayerIds"] });
    }
  }

  if (value.gameMode === "MONARCHY") {
    if (value.participants.length !== 6) context.addIssue({ code: "custom", message: "Monarchy requires exactly six players.", path: ["participants"] });
    if (seats.some((seat) => seat !== null) || countRole("KING") !== 1 || countRole("KINGSGUARD") !== 1 || countRole("TRAITOR") !== 1 || countRole("BANDIT") !== 3) {
      context.addIssue({ code: "custom", message: "Assign one King, one Kingsguard, one Traitor, and three Bandits.", path: ["participants"] });
    }
    if (value.monarchyBanditRule === null) context.addIssue({ code: "custom", message: "Choose a Monarchy Bandit victory rule.", path: ["monarchyBanditRule"] });
    if (value.resultKind === "WIN") {
      const royalWin = (winners.size === 1 || winners.size === 2)
        && winnerRoles.includes("KING")
        && winnerRoles.every((role) => role === "KING" || role === "KINGSGUARD");
      const traitorWin = winners.size === 1 && winnerRoles[0] === "TRAITOR";
      const banditWin = winnerRoles.every((role) => role === "BANDIT")
        && (value.monarchyBanditRule === "ALL_BANDITS" ? winners.size === 3 : winners.size >= 1 && winners.size <= 3);
      if (!royalWin && !traitorWin && !banditWin) context.addIssue({ code: "custom", message: "The selected winners do not form a valid Monarchy faction outcome.", path: ["winnerPlayerIds"] });
    }
  }
}

function normalizeGame<T extends { winnerPlayerIds?: string[]; winnerPlayerId?: string | null }>(value: T) {
  return { ...value, winnerPlayerIds: value.winnerPlayerIds ?? (value.winnerPlayerId ? [value.winnerPlayerId] : []) };
}

export const createGameSchema = z.object({ ...gameInputShape, idempotencyKey: z.uuid() })
  .transform(normalizeGame)
  .superRefine(validateGame);
export const updateGameSchema = z.object({ ...gameInputShape, version: z.number().int().positive() })
  .transform(normalizeGame)
  .superRefine(validateGame);

const gameModeFieldsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).default(""),
  minPlayers: z.number().int().min(2).max(8),
  maxPlayers: z.number().int().min(2).max(8),
  winningCriteria: gameWinningCriteriaSchema,
  winAchievementRules: z.array(z.object({
    winnerRole: gameParticipantRoleSchema.nullable(),
    achievementId: z.uuid(),
  })).max(6).optional().default([]),
}).refine((value) => value.maxPlayers >= value.minPlayers, {
  message: "Maximum players cannot be lower than minimum players.",
  path: ["maxPlayers"],
});

export const createGameModeSchema = gameModeFieldsSchema.and(z.object({
  code: gameModeSchema.optional(),
}));

export const updateGameModeSchema = gameModeFieldsSchema.and(z.object({
  version: z.number().int().positive(),
  archived: z.boolean().optional(),
}));

export const achievementGameFactConditionSchema = z.object({
  fact: z.enum(GAME_FACT_KEYS),
  operator: z.enum(GAME_FACT_OPERATORS),
  value: z.union([
    z.string(), z.number(), z.boolean(), z.array(z.string()), z.tuple([z.number(), z.number()]),
  ]).optional(),
}).superRefine((condition, context) => {
  const message = validateCondition(condition as AchievementGameFactCondition);
  if (message) context.addIssue({ code: "custom", message, path: ["value"] });
}).transform((condition) => normalizeCondition(condition as AchievementGameFactCondition));

export const achievementGameFactRuleSchema = z.object({
  recipient: z.enum(ACHIEVEMENT_RULE_RECIPIENTS).default("WINNER"),
  conditions: z.array(achievementGameFactConditionSchema).min(1).max(10),
});

export const achievementFieldsSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(""),
  category: z.string().trim().min(1).max(80),
  displayOrder: z.number().int().min(0).max(100000).default(0),
});

export const achievementSchema = achievementFieldsSchema.extend({
  gameFactRules: z.array(achievementGameFactRuleSchema).max(10).optional().default([]),
});

export const achievementCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
});

const reorderItemSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
});

export const reorderAchievementCategoriesSchema = z.object({
  items: z.array(reorderItemSchema).min(1).max(200),
});

export const reorderAchievementsSchema = z.object({
  categoryId: z.uuid(),
  items: z.array(reorderItemSchema).min(1).max(1000),
});

export const updateAchievementSchema = achievementSchema.partial().extend({
  description: achievementFieldsSchema.shape.description.removeDefault().optional(),
  displayOrder: achievementFieldsSchema.shape.displayOrder.removeDefault().optional(),
  gameFactRules: achievementSchema.shape.gameFactRules.removeDefault().optional(),
  version: z.number().int().positive(),
  archived: z.boolean().optional(),
});

export const hardDeleteSchema = z.object({
  version: z.number().int().positive(),
  confirmation: z.string().min(1).max(200),
});

export const achievementGrantSchema = z.object({
  playerId: z.uuid(),
  achievementId: z.uuid(),
  gameId: z.uuid(),
  notes: z.string().trim().max(500).optional().default(""),
});

export const metricRangeSchema = z.object({
  range: z.enum(["all", "30d", "90d", "custom"]).default("all"),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
}).refine((value) => value.range !== "custom" || (value.from && value.to), {
  message: "Custom ranges require from and to dates.",
}).refine((value) => (!value.from && !value.to) || Boolean(value.from && value.to), { message: "Date filters require both from and to." })
  .refine((value) => !value.from || !value.to || Date.parse(value.from) <= Date.parse(value.to), { message: "The from date must not be after the to date." });

export type PodRole = z.infer<typeof podRoleSchema>;
export type GameResultKind = z.infer<typeof gameResultKindSchema>;
export type GameMode = z.infer<typeof gameModeSchema>;
export type GameParticipantRole = z.infer<typeof gameParticipantRoleSchema>;
export type MonarchyBanditRule = z.infer<typeof monarchyBanditRuleSchema>;
export type GameWinningCriteria = z.infer<typeof gameWinningCriteriaSchema>;
export type CommanderBracket = z.infer<typeof commanderBracketSchema>;
export type ThemePreference = z.infer<typeof themePreferenceSchema>;
export type MtgColor = z.infer<typeof mtgColorSchema>;
