import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { THEME_PREFERENCES } from "@/lib/theme-types";
import { GAME_PARTICIPANT_ROLES, GAME_WINNING_CRITERIA, MONARCHY_BANDIT_RULES } from "@/lib/game-modes";
import type { BuiltInGameMode } from "@/lib/game-modes";

export const appSchema = pgSchema("app");
export const privateSchema = pgSchema("private");

export const podRole = appSchema.enum("pod_role", ["ADMIN", "EDITOR", "GUEST"]);
export const membershipStatus = appSchema.enum("membership_status", ["ACTIVE", "ARCHIVED"]);
export const gameResultKind = appSchema.enum("game_result_kind", ["WIN", "DRAW"]);
export const gameParticipantRole = appSchema.enum("game_participant_role", GAME_PARTICIPANT_ROLES);
export const monarchyBanditRule = appSchema.enum("monarchy_bandit_rule", MONARCHY_BANDIT_RULES);
export const gameWinningCriteria = appSchema.enum("game_winning_criteria", GAME_WINNING_CRITERIA);
export const themePreference = appSchema.enum("theme_preference", THEME_PREFERENCES);
export const achievementAutomationRuleType = appSchema.enum("achievement_automation_rule_type", ["GAME_MODE_WIN", "GAME_FACT"]);
export const achievementGrantSource = appSchema.enum("achievement_grant_source", ["MANUAL", "AUTOMATIC"]);
export const achievementRevocationSource = appSchema.enum("achievement_revocation_source", ["MANUAL", "AUTOMATIC"]);
export const achievementRuleRecipient = appSchema.enum("achievement_rule_recipient", ["WINNER"]);
export const achievementGameFactKey = appSchema.enum("achievement_game_fact_key", [
  "GAME_MODE", "PLAYER_COUNT", "MONARCHY_BANDIT_RULE", "WINNER_SEAT", "WINNER_ROLE",
  "DECK_BRACKET", "DECK_POWER_LEVEL", "COMMANDER_CMC", "COLOR_IDENTITY", "COLOR_COUNT",
  "HAS_PARTNER_COMMANDERS", "HAS_COMPANION", "HAS_BACKGROUND",
]);
export const achievementGameFactOperator = appSchema.enum("achievement_game_fact_operator", [
  "EQ", "NEQ", "LT", "LTE", "GT", "GTE", "BETWEEN", "IS_KNOWN", "IS_UNKNOWN",
  "EXACTLY", "CONTAINS_ALL", "CONTAINS_ANY", "EXCLUDES_ALL", "IS_COLORLESS",
]);

const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
};

export const players = appSchema.table("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  authUserId: text("auth_user_id").unique(),
  displayName: text("display_name").notNull(),
  themePreference: themePreference("theme_preference").notNull().default("SYSTEM"),
  ...auditColumns,
}, (table) => [
  check("players_display_name_length", sql`char_length(${table.displayName}) between 1 and 80`),
  index("players_auth_user_idx").on(table.authUserId),
]);

export const playerClaimEmails = privateSchema.table("player_claim_emails", {
  playerId: uuid("player_id").primaryKey().references(() => players.id, { onDelete: "cascade" }),
  emailNormalized: text("email_normalized").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
});

export const appSuperuser = privateSchema.table("app_superuser", {
  singleton: boolean("singleton").primaryKey().default(true),
  authUserId: text("auth_user_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check("app_superuser_singleton", sql`${table.singleton} = true`)]);

export const gameModes = appSchema.table("game_modes", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  minPlayers: integer("min_players").notNull(),
  maxPlayers: integer("max_players").notNull(),
  winningCriteria: gameWinningCriteria("winning_criteria").notNull(),
  systemKey: text("system_key").$type<BuiltInGameMode>().unique(),
  displayOrder: integer("display_order").notNull().default(0),
  createdByPlayerId: uuid("created_by_player_id").references(() => players.id, { onDelete: "set null" }),
  ...auditColumns,
}, (table) => [
  check("game_modes_code_format", sql`${table.code} ~ '^[A-Z0-9]+(_[A-Z0-9]+)*$'`),
  check("game_modes_name_length", sql`char_length(${table.name}) between 1 and 80`),
  check("game_modes_description_length", sql`char_length(${table.description}) <= 1000`),
  check("game_modes_player_range", sql`${table.minPlayers} between 2 and 8 and ${table.maxPlayers} between ${table.minPlayers} and 8`),
  check("game_modes_display_order_nonnegative", sql`${table.displayOrder} >= 0`),
  uniqueIndex("game_modes_name_ci_unique").on(sql`lower(${table.name})`),
  index("game_modes_active_order_idx").on(table.archivedAt, table.displayOrder, table.name),
]);

export const pods = appSchema.table("pods", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  monarchyBanditRuleDefault: monarchyBanditRule("monarchy_bandit_rule_default").notNull().default("ALL_BANDITS"),
  createdByPlayerId: uuid("created_by_player_id").notNull().references(() => players.id),
  ...auditColumns,
}, (table) => [
  check("pods_name_length", sql`char_length(${table.name}) between 2 and 80`),
  index("pods_created_by_idx").on(table.createdByPlayerId),
]);

export const podMemberships = appSchema.table("pod_memberships", {
  podId: uuid("pod_id").notNull().references(() => pods.id),
  playerId: uuid("player_id").notNull().references(() => players.id),
  role: podRole("role").notNull().default("GUEST"),
  status: membershipStatus("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
}, (table) => [
  primaryKey({ columns: [table.podId, table.playerId] }),
  index("pod_memberships_player_idx").on(table.playerId, table.status),
  index("pod_memberships_pod_role_idx").on(table.podId, table.status, table.role),
]);

export const decks = appSchema.table("decks", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerPlayerId: uuid("owner_player_id").notNull().references(() => players.id),
  name: text("name").notNull(),
  bracket: integer("bracket").notNull(),
  powerLevel: numeric("power_level", { precision: 4, scale: 2, mode: "number" }),
  commanderCmc: integer("commander_cmc"),
  colorIdentity: text("color_identity").array().$type<("W" | "U" | "B" | "R" | "G")[] | null>(),
  hasPartnerCommanders: boolean("has_partner_commanders").notNull().default(false),
  hasCompanion: boolean("has_companion").notNull().default(false),
  hasBackground: boolean("has_background").notNull().default(false),
  moxfieldUrl: text("moxfield_url"),
  createdByPlayerId: uuid("created_by_player_id").notNull().references(() => players.id),
  ...auditColumns,
}, (table) => [
  check("decks_name_length", sql`char_length(${table.name}) between 1 and 80`),
  check("decks_bracket_range", sql`${table.bracket} between 1 and 5`),
  check("decks_power_range", sql`${table.powerLevel} between 0 and 10`),
  check("decks_commander_cmc_nonnegative", sql`${table.commanderCmc} >= 0`),
  check("decks_color_identity_valid", sql`${table.colorIdentity} is null or (array_position(${table.colorIdentity}, null) is null and array_to_string(${table.colorIdentity}, '') ~ '^W?U?B?R?G?$')`),
  uniqueIndex("decks_active_owner_name_unique")
    .on(table.ownerPlayerId, sql`lower(${table.name})`)
    .where(sql`${table.archivedAt} is null`),
  index("decks_owner_idx").on(table.ownerPlayerId, table.archivedAt),
]);

export const games = appSchema.table("games", {
  id: uuid("id").primaryKey().defaultRandom(),
  podId: uuid("pod_id").notNull().references(() => pods.id),
  playedAt: timestamp("played_at", { withTimezone: true }).notNull(),
  gameMode: text("game_mode").notNull().default("FREE_FOR_ALL").references(() => gameModes.code),
  monarchyBanditRule: monarchyBanditRule("monarchy_bandit_rule"),
  resultKind: gameResultKind("result_kind").notNull(),
  /** @deprecated Temporary expand/contract compatibility field. Use gameParticipants.isWinner. */
  winnerPlayerId: uuid("winner_player_id").references(() => players.id),
  notes: text("notes").notNull().default(""),
  idempotencyKey: uuid("idempotency_key").notNull(),
  createdByPlayerId: uuid("created_by_player_id").notNull().references(() => players.id),
  updatedByPlayerId: uuid("updated_by_player_id").notNull().references(() => players.id),
  ...auditColumns,
}, (table) => [
  uniqueIndex("games_pod_idempotency_unique").on(table.podId, table.idempotencyKey),
  unique("games_id_pod_unique").on(table.id, table.podId),
  index("games_pod_played_idx").on(table.podId, table.archivedAt, table.playedAt),
  check("games_notes_length", sql`char_length(${table.notes}) <= 1000`),
  check("games_monarchy_rule_consistency", sql`
    (${table.gameMode} = 'MONARCHY' and ${table.monarchyBanditRule} is not null)
    or (${table.gameMode} <> 'MONARCHY' and ${table.monarchyBanditRule} is null)
  `),
]);

export const gameParticipants = appSchema.table("game_participants", {
  gameId: uuid("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
  playerId: uuid("player_id").notNull().references(() => players.id),
  deckId: uuid("deck_id").notNull().references(() => decks.id),
  deckNameSnapshot: text("deck_name_snapshot").notNull(),
  bracketSnapshot: integer("bracket_snapshot").notNull(),
  powerLevelSnapshot: numeric("power_level_snapshot", { precision: 4, scale: 2, mode: "number" }),
  commanderCmcSnapshot: integer("commander_cmc_snapshot"),
  colorIdentitySnapshot: text("color_identity_snapshot").array().$type<("W" | "U" | "B" | "R" | "G")[] | null>(),
  hasPartnerCommandersSnapshot: boolean("has_partner_commanders_snapshot").notNull().default(false),
  hasCompanionSnapshot: boolean("has_companion_snapshot").notNull().default(false),
  hasBackgroundSnapshot: boolean("has_background_snapshot").notNull().default(false),
  seatPosition: integer("seat_position"),
  modeRole: gameParticipantRole("mode_role"),
  isWinner: boolean("is_winner").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.gameId, table.playerId] }),
  index("game_participants_player_idx").on(table.playerId, table.gameId),
  index("game_participants_deck_idx").on(table.deckId, table.gameId),
  index("game_participants_game_winner_idx").on(table.gameId, table.isWinner),
  check("game_participants_bracket_range", sql`${table.bracketSnapshot} between 1 and 5`),
  check("game_participants_power_range", sql`${table.powerLevelSnapshot} between 0 and 10`),
  check("game_participants_commander_cmc_nonnegative", sql`${table.commanderCmcSnapshot} >= 0`),
  check("game_participants_color_identity_valid", sql`${table.colorIdentitySnapshot} is null or (array_position(${table.colorIdentitySnapshot}, null) is null and array_to_string(${table.colorIdentitySnapshot}, '') ~ '^W?U?B?R?G?$')`),
  check("game_participants_seat_range", sql`${table.seatPosition} between 1 and 8`),
]);

export const achievementCategories = appSchema.table("achievement_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
}, (table) => [
  unique("achievement_categories_name_unique").on(table.name),
  uniqueIndex("achievement_categories_name_ci_unique").on(sql`lower(${table.name})`),
  check("achievement_categories_name_length", sql`char_length(${table.name}) between 1 and 80`),
  check("achievement_categories_order_nonnegative", sql`${table.displayOrder} >= 0`),
  index("achievement_categories_display_idx").on(table.displayOrder, table.name),
]);

export const achievements = appSchema.table("achievements", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().references(() => achievementCategories.name, { onUpdate: "cascade", onDelete: "restrict" }),
  displayOrder: integer("display_order").notNull().default(0),
  createdByPlayerId: uuid("created_by_player_id").notNull().references(() => players.id),
  ...auditColumns,
}, (table) => [
  check("achievements_code_format", sql`${table.code} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  index("achievements_display_idx").on(table.archivedAt, table.category, table.displayOrder),
]);

export const achievementAutomationRules = appSchema.table("achievement_automation_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  achievementId: uuid("achievement_id").notNull().references(() => achievements.id, { onDelete: "cascade" }),
  ruleType: achievementAutomationRuleType("rule_type").notNull(),
  createdByPlayerId: uuid("created_by_player_id").references(() => players.id, { onDelete: "set null" }),
  ...auditColumns,
}, (table) => [
  index("achievement_automation_rules_achievement_idx").on(table.achievementId, table.archivedAt),
]);

export const gameModeWinAchievementRules = appSchema.table("game_mode_win_achievement_rules", {
  ruleId: uuid("rule_id").primaryKey().references(() => achievementAutomationRules.id, { onDelete: "cascade" }),
  gameModeCode: text("game_mode_code").notNull().references(() => gameModes.code, { onDelete: "cascade" }),
  winnerRole: gameParticipantRole("winner_role"),
}, (table) => [
  uniqueIndex("game_mode_win_achievement_rules_role_slot_unique").on(table.gameModeCode, table.winnerRole).where(sql`${table.winnerRole} is not null`),
  uniqueIndex("game_mode_win_achievement_rules_general_slot_unique").on(table.gameModeCode).where(sql`${table.winnerRole} is null`),
  index("game_mode_win_achievement_rules_mode_idx").on(table.gameModeCode),
]);

export const achievementGameFactRules = appSchema.table("achievement_game_fact_rules", {
  ruleId: uuid("rule_id").primaryKey().references(() => achievementAutomationRules.id, { onDelete: "cascade" }),
  recipient: achievementRuleRecipient("recipient").notNull().default("WINNER"),
  displayOrder: integer("display_order").notNull(),
}, (table) => [
  check("achievement_game_fact_rules_order_range", sql`${table.displayOrder} between 0 and 9`),
]);

export const achievementGameFactConditions = appSchema.table("achievement_game_fact_conditions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruleId: uuid("rule_id").notNull().references(() => achievementGameFactRules.ruleId, { onDelete: "cascade" }),
  displayOrder: integer("display_order").notNull(),
  factKey: achievementGameFactKey("fact_key").notNull(),
  operator: achievementGameFactOperator("operator").notNull(),
  conditionValue: jsonb("condition_value").$type<string | number | boolean | string[] | [number, number]>(),
}, (table) => [
  unique("achievement_game_fact_conditions_rule_order_unique").on(table.ruleId, table.displayOrder),
  check("achievement_game_fact_conditions_order_range", sql`${table.displayOrder} between 0 and 9`),
  index("achievement_game_fact_conditions_rule_idx").on(table.ruleId, table.displayOrder),
]);

export const gameAchievementRuleSnapshots = appSchema.table("game_achievement_rule_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  gameId: uuid("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
  gameModeCode: text("game_mode_code").notNull(),
  sourceRuleId: uuid("source_rule_id"),
  achievementId: uuid("achievement_id").notNull().references(() => achievements.id, { onDelete: "cascade" }),
  ruleType: achievementAutomationRuleType("rule_type").notNull(),
  winnerRole: gameParticipantRole("winner_role"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("game_achievement_rule_snapshots_identity_unique").on(table.id, table.gameId, table.achievementId),
  uniqueIndex("game_achievement_rule_snapshots_source_unique").on(table.gameId, table.sourceRuleId).where(sql`${table.sourceRuleId} is not null`),
  uniqueIndex("game_achievement_rule_snapshots_role_slot_unique").on(table.gameId, table.winnerRole).where(sql`${table.ruleType} = 'GAME_MODE_WIN' and ${table.winnerRole} is not null`),
  uniqueIndex("game_achievement_rule_snapshots_general_slot_unique").on(table.gameId).where(sql`${table.ruleType} = 'GAME_MODE_WIN' and ${table.winnerRole} is null`),
  index("game_achievement_rule_snapshots_candidate_idx").on(table.achievementId, table.gameId),
]);

export const gameFactRuleSnapshots = appSchema.table("game_fact_rule_snapshots", {
  snapshotId: uuid("snapshot_id").primaryKey().references(() => gameAchievementRuleSnapshots.id, { onDelete: "cascade" }),
  recipient: achievementRuleRecipient("recipient").notNull(),
  conditions: jsonb("conditions").$type<import("@/lib/achievement-rules").AchievementGameFactCondition[]>().notNull(),
});

export const podPlayerAchievements = appSchema.table("pod_player_achievements", {
  podId: uuid("pod_id").notNull().references(() => pods.id),
  playerId: uuid("player_id").notNull().references(() => players.id),
  achievementId: uuid("achievement_id").notNull().references(() => achievements.id),
  gameId: uuid("game_id").notNull(),
  grantedByPlayerId: uuid("granted_by_player_id").references(() => players.id),
  grantSource: achievementGrantSource("grant_source").notNull().default("MANUAL"),
  automaticSnapshotId: uuid("automatic_snapshot_id"),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes").notNull().default(""),
  revokedByPlayerId: uuid("revoked_by_player_id").references(() => players.id),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revocationSource: achievementRevocationSource("revocation_source"),
  version: integer("version").notNull().default(1),
}, (table) => [
  primaryKey({ columns: [table.podId, table.playerId, table.achievementId] }),
  foreignKey({
    columns: [table.gameId, table.podId],
    foreignColumns: [games.id, games.podId],
    name: "pod_player_achievements_game_pod_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.automaticSnapshotId, table.gameId, table.achievementId],
    foreignColumns: [gameAchievementRuleSnapshots.id, gameAchievementRuleSnapshots.gameId, gameAchievementRuleSnapshots.achievementId],
    name: "pod_player_achievements_automatic_snapshot_fk",
  }).onDelete("cascade"),
  check("pod_player_achievements_grant_attribution", sql`(${table.grantSource} = 'MANUAL' and ${table.grantedByPlayerId} is not null and ${table.automaticSnapshotId} is null) or (${table.grantSource} = 'AUTOMATIC' and ${table.grantedByPlayerId} is null and ${table.automaticSnapshotId} is not null)`),
  check("pod_player_achievements_revocation_attribution", sql`(${table.revokedAt} is null and ${table.revocationSource} is null and ${table.revokedByPlayerId} is null) or (${table.revokedAt} is not null and ((${table.revocationSource} = 'MANUAL' and ${table.revokedByPlayerId} is not null) or (${table.revocationSource} = 'AUTOMATIC' and ${table.revokedByPlayerId} is null)))`),
  foreignKey({
    columns: [table.gameId, table.playerId],
    foreignColumns: [gameParticipants.gameId, gameParticipants.playerId],
    name: "pod_player_achievements_game_player_fk",
  }).onDelete("cascade"),
  index("pod_player_achievements_game_idx").on(table.gameId),
  index("pod_player_achievements_pod_idx").on(table.podId, table.revokedAt),
]);

export const automaticAchievementSuppressions = appSchema.table("automatic_achievement_suppressions", {
  podId: uuid("pod_id").notNull().references(() => pods.id, { onDelete: "cascade" }),
  playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  achievementId: uuid("achievement_id").notNull().references(() => achievements.id, { onDelete: "cascade" }),
  suppressedByPlayerId: uuid("suppressed_by_player_id").references(() => players.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.podId, table.playerId, table.achievementId] })]);

export const auditEvents = appSchema.table("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  podId: uuid("pod_id").references(() => pods.id),
  actorPlayerId: uuid("actor_player_id").references(() => players.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("audit_events_pod_created_idx").on(table.podId, table.createdAt),
  index("audit_events_entity_idx").on(table.entityType, table.entityId),
]);

export type Player = typeof players.$inferSelect;
export type Pod = typeof pods.$inferSelect;
export type PodMembership = typeof podMemberships.$inferSelect;
export type Deck = typeof decks.$inferSelect;
export type GameModeRecord = typeof gameModes.$inferSelect;
export type Game = typeof games.$inferSelect;
export type AchievementCategory = typeof achievementCategories.$inferSelect;
export type Achievement = typeof achievements.$inferSelect;
