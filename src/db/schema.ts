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

export const appSchema = pgSchema("app");
export const privateSchema = pgSchema("private");

export const podRole = appSchema.enum("pod_role", ["ADMIN", "EDITOR", "GUEST"]);
export const membershipStatus = appSchema.enum("membership_status", ["ACTIVE", "ARCHIVED"]);
export const gameResultKind = appSchema.enum("game_result_kind", ["WIN", "DRAW"]);
export const themePreference = appSchema.enum("theme_preference", THEME_PREFERENCES);

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

export const pods = appSchema.table("pods", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
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
  moxfieldUrl: text("moxfield_url"),
  createdByPlayerId: uuid("created_by_player_id").notNull().references(() => players.id),
  ...auditColumns,
}, (table) => [
  check("decks_name_length", sql`char_length(${table.name}) between 1 and 80`),
  check("decks_bracket_range", sql`${table.bracket} between 1 and 5`),
  check("decks_power_range", sql`${table.powerLevel} between 0 and 10`),
  uniqueIndex("decks_active_owner_name_unique")
    .on(table.ownerPlayerId, sql`lower(${table.name})`)
    .where(sql`${table.archivedAt} is null`),
  index("decks_owner_idx").on(table.ownerPlayerId, table.archivedAt),
]);

export const games = appSchema.table("games", {
  id: uuid("id").primaryKey().defaultRandom(),
  podId: uuid("pod_id").notNull().references(() => pods.id),
  playedAt: timestamp("played_at", { withTimezone: true }).notNull(),
  resultKind: gameResultKind("result_kind").notNull(),
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
  check("games_result_winner_consistency", sql`
    (${table.resultKind} = 'DRAW' and ${table.winnerPlayerId} is null)
    or (${table.resultKind} = 'WIN' and ${table.winnerPlayerId} is not null)
  `),
]);

export const gameParticipants = appSchema.table("game_participants", {
  gameId: uuid("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
  playerId: uuid("player_id").notNull().references(() => players.id),
  deckId: uuid("deck_id").notNull().references(() => decks.id),
  deckNameSnapshot: text("deck_name_snapshot").notNull(),
  bracketSnapshot: integer("bracket_snapshot").notNull(),
  powerLevelSnapshot: numeric("power_level_snapshot", { precision: 4, scale: 2, mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.gameId, table.playerId] }),
  index("game_participants_player_idx").on(table.playerId, table.gameId),
  index("game_participants_deck_idx").on(table.deckId, table.gameId),
  check("game_participants_bracket_range", sql`${table.bracketSnapshot} between 1 and 5`),
  check("game_participants_power_range", sql`${table.powerLevelSnapshot} between 0 and 10`),
]);

export const achievements = appSchema.table("achievements", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  createdByPlayerId: uuid("created_by_player_id").notNull().references(() => players.id),
  ...auditColumns,
}, (table) => [
  check("achievements_code_format", sql`${table.code} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  index("achievements_display_idx").on(table.archivedAt, table.category, table.displayOrder),
]);

export const podPlayerAchievements = appSchema.table("pod_player_achievements", {
  podId: uuid("pod_id").notNull().references(() => pods.id),
  playerId: uuid("player_id").notNull().references(() => players.id),
  achievementId: uuid("achievement_id").notNull().references(() => achievements.id),
  gameId: uuid("game_id").notNull(),
  grantedByPlayerId: uuid("granted_by_player_id").notNull().references(() => players.id),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes").notNull().default(""),
  revokedByPlayerId: uuid("revoked_by_player_id").references(() => players.id),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
}, (table) => [
  primaryKey({ columns: [table.podId, table.playerId, table.achievementId] }),
  foreignKey({
    columns: [table.gameId, table.podId],
    foreignColumns: [games.id, games.podId],
    name: "pod_player_achievements_game_pod_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.gameId, table.playerId],
    foreignColumns: [gameParticipants.gameId, gameParticipants.playerId],
    name: "pod_player_achievements_game_player_fk",
  }).onDelete("cascade"),
  index("pod_player_achievements_game_idx").on(table.gameId),
  index("pod_player_achievements_pod_idx").on(table.podId, table.revokedAt),
]);

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
export type Game = typeof games.$inferSelect;
export type Achievement = typeof achievements.$inferSelect;
