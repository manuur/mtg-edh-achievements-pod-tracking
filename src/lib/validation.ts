import { z } from "zod";

export const podRoleSchema = z.enum(["ADMIN", "EDITOR", "GUEST"]);
export const membershipStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);
export const gameResultKindSchema = z.enum(["WIN", "DRAW"]);
export const commanderBracketSchema = z.union([
  z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5),
]);

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
  powerLevel: z.number().min(0).max(10),
  moxfieldUrl: optionalMoxfieldUrl,
});

export const updateDeckSchema = createDeckSchema.omit({ ownerPlayerId: true }).partial().extend({
  version: z.number().int().positive(),
  archived: z.boolean().optional(),
});

export const gameParticipantSchema = z.object({ playerId: z.uuid(), deckId: z.uuid() });

const gameInputSchema = z.object({
    playedAt: z.iso.datetime(),
    resultKind: gameResultKindSchema,
    winnerPlayerId: z.uuid().nullable(),
    notes: z.string().trim().max(1000).optional().default(""),
    participants: z.array(gameParticipantSchema).min(2).max(8),
  });

function validateGame(value: z.infer<typeof gameInputSchema>, context: z.RefinementCtx) {
  const players = new Set(value.participants.map((participant) => participant.playerId));
  if (players.size !== value.participants.length) {
    context.addIssue({ code: "custom", message: "Each player can participate only once.", path: ["participants"] });
  }
  if (value.resultKind === "WIN" && (!value.winnerPlayerId || !players.has(value.winnerPlayerId))) {
    context.addIssue({ code: "custom", message: "The winner must be one of the participants.", path: ["winnerPlayerId"] });
  }
  if (value.resultKind === "DRAW" && value.winnerPlayerId !== null) {
    context.addIssue({ code: "custom", message: "A draw cannot have a winner.", path: ["winnerPlayerId"] });
  }
}

export const createGameSchema = gameInputSchema.extend({ idempotencyKey: z.uuid() }).superRefine(validateGame);
export const updateGameSchema = gameInputSchema.extend({ version: z.number().int().positive() }).superRefine(validateGame);

export const achievementSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(""),
  category: z.string().trim().min(1).max(80),
  displayOrder: z.number().int().min(0).max(100000).default(0),
});

export const updateAchievementSchema = achievementSchema.partial().extend({
  version: z.number().int().positive(),
  archived: z.boolean().optional(),
});

export const achievementGrantSchema = z.object({
  playerId: z.uuid(),
  achievementId: z.uuid(),
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
export type CommanderBracket = z.infer<typeof commanderBracketSchema>;
