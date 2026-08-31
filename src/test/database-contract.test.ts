import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "drizzle/0001_authorization_and_game_transactions.sql"), "utf8");
const validationFix = readFileSync(resolve(process.cwd(), "drizzle/0002_fix_identity_validation.sql"), "utf8");
const superadminHardDelete = readFileSync(resolve(process.cwd(), "drizzle/0003_superadmin_hard_delete.sql"), "utf8");
const achievementGameEvidence = readFileSync(resolve(process.cwd(), "drizzle/0004_achievement_game_evidence.sql"), "utf8");
const optionalDeckPowerLevel = readFileSync(resolve(process.cwd(), "drizzle/0005_optional_deck_power_level.sql"), "utf8");
const persistedThemePreference = readFileSync(resolve(process.cwd(), "drizzle/0006_persisted_theme_preference.sql"), "utf8");
const placeholderPowerCleanup = readFileSync(resolve(process.cwd(), "drizzle/0007_clear_placeholder_power_levels.sql"), "utf8");
const orderedAchievementCategories = readFileSync(resolve(process.cwd(), "drizzle/0008_ordered_achievement_categories.sql"), "utf8");
const multiModeGames = readFileSync(resolve(process.cwd(), "drizzle/0009_multi_mode_games.sql"), "utf8");
const gameModeCatalog = readFileSync(resolve(process.cwd(), "drizzle/0010_admin_game_mode_catalog.sql"), "utf8");
const automaticWinAchievements = readFileSync(resolve(process.cwd(), "drizzle/0011_automatic_win_achievements_and_deck_metadata.sql"), "utf8");

describe("database authorization contract", () => {
  it("enables RLS on every exposed domain table", () => {
    for (const table of ["players", "pods", "pod_memberships", "decks", "games", "game_participants", "achievements", "pod_player_achievements", "audit_events"]) {
      expect(migration).toContain(`ALTER TABLE app.${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  it("protects final administrators and immutable audits", () => {
    expect(migration).toContain("pod_final_administrator_guard");
    expect(migration).toContain("WHERE id = OLD.pod_id FOR UPDATE");
    expect(migration).toContain("audit_events_immutable");
  });

  it("implements atomic idempotent and optimistic game functions", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION api.create_game");
    expect(migration).toContain("ON CONFLICT (pod_id, idempotency_key) DO NOTHING");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION api.update_game");
    expect(migration).toContain("AND version = p_expected_version");
    expect(migration).toContain("v_current_player_id IS NULL OR v_current_player_id <> p_actor_player_id");
  });

  it("keeps private claim-email writes inside actor-bound database functions", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION api.add_pod_member");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION api.set_member_claim_email");
    expect(migration).toContain("actor does not match authenticated user");
  });

  it("does not grant private-schema access to application roles", () => {
    expect(migration).toContain("REVOKE ALL ON SCHEMA private FROM PUBLIC");
    expect(migration).not.toMatch(/GRANT .+ ON SCHEMA private TO authenticated/);
  });

  it("authorizes normal writes through authenticated RLS policies", () => {
    for (const policy of [
      "pods_insert_owner",
      "memberships_insert_admin",
      "memberships_update_admin",
      "decks_insert_allowed",
      "games_update_admin",
      "achievements_superuser_write",
      "grants_staff_write",
      "audit_insert_actor",
    ]) expect(migration).toContain(`CREATE POLICY ${policy}`);
  });

  it("accepts normalized dotted emails and HTTPS Moxfield deck URLs", () => {
    expect(validationFix).toContain("email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'");
    expect(validationFix).toContain("'^https://(www[.])?moxfield[.]com/decks/");
    expect(validationFix).not.toContain("\\\\.");
  });

  it("keeps permanent deletion operator-bound, atomic, and self-protected", () => {
    expect(superadminHardDelete).toContain("CREATE OR REPLACE FUNCTION private.hard_delete_player");
    expect(superadminHardDelete).toContain("CREATE OR REPLACE FUNCTION private.hard_delete_achievement");
    expect(superadminHardDelete).toContain("the singleton superadmin cannot be deleted through the application");
    expect(superadminHardDelete).toContain("DELETE FROM neon_auth.\"user\"");
    expect(superadminHardDelete).toContain("REVOKE ALL ON FUNCTION private.hard_delete_player");
    expect(superadminHardDelete).not.toMatch(/GRANT .+hard_delete_(player|achievement).+authenticated/);
  });

  it("requires achievement grants to reference an eligible game", () => {
    expect(achievementGameEvidence).toContain("ADD COLUMN game_id uuid NOT NULL");
    expect(achievementGameEvidence).toContain("pod_player_achievements_game_pod_fk");
    expect(achievementGameEvidence).toContain("pod_player_achievements_game_player_fk");
    expect(achievementGameEvidence).toContain("achievement_grant_game_guard");
    expect(achievementGameEvidence).toContain("game.archived_at IS NULL");
  });

  it("preserves grants while editing participants who remain in a game", () => {
    expect(achievementGameEvidence).toContain("DELETE FROM app.game_participants existing");
    expect(achievementGameEvidence).toContain("ON CONFLICT (game_id, player_id) DO UPDATE SET");
    expect(achievementGameEvidence).not.toContain("DELETE FROM app.game_participants WHERE game_id = p_game_id");
  });

  it("allows current and historical deck power levels to be unknown", () => {
    expect(optionalDeckPowerLevel).toContain("ALTER TABLE app.decks ALTER COLUMN power_level DROP NOT NULL");
    expect(optionalDeckPowerLevel).toContain("ALTER TABLE app.game_participants ALTER COLUMN power_level_snapshot DROP NOT NULL");
  });

  it("persists a system, light, or dark preference on each player profile", () => {
    expect(persistedThemePreference).toContain("CREATE TYPE app.theme_preference AS ENUM ('SYSTEM', 'LIGHT', 'DARK')");
    expect(persistedThemePreference).toContain("theme_preference app.theme_preference NOT NULL DEFAULT 'SYSTEM'");
  });

  it("clears placeholder 5.0 power levels from current decks and historical snapshots", () => {
    expect(placeholderPowerCleanup).toContain("UPDATE app.decks");
    expect(placeholderPowerCleanup).toContain("WHERE power_level = 5.00");
    expect(placeholderPowerCleanup).toContain("UPDATE app.game_participants");
    expect(placeholderPowerCleanup).toContain("WHERE power_level_snapshot = 5.00");
  });

  it("normalizes achievement categories and protects their independent order", () => {
    expect(orderedAchievementCategories).toContain("CREATE TABLE app.achievement_categories");
    expect(orderedAchievementCategories).toContain("achievements_category_achievement_categories_name_fk");
    expect(orderedAchievementCategories).toContain("ALTER TABLE app.achievement_categories ENABLE ROW LEVEL SECURITY");
    expect(orderedAchievementCategories).toContain("CREATE POLICY achievement_categories_superuser_write");
    expect(orderedAchievementCategories).toContain("CREATE VIEW api.achievement_categories");
  });

  it("expands games to modes, participant winners, seats, roles, and rule-aware opponents", () => {
    expect(multiModeGames).toContain("CREATE TYPE app.game_mode");
    expect(multiModeGames).toContain("ADD COLUMN is_winner boolean NOT NULL DEFAULT false");
    expect(multiModeGames).toContain("UPDATE app.game_participants participant");
    expect(multiModeGames).toContain("CREATE OR REPLACE FUNCTION private.validate_game_input");
    expect(multiModeGames).toContain("Asterisk winners must be one opposite-seat pair");
    expect(multiModeGames).toContain("CREATE OR REPLACE FUNCTION private.game_players_are_opponents");
    expect(multiModeGames).toContain("CREATE OR REPLACE VIEW api.game_participants");
  });

  it("keeps legacy game RPCs while exposing mode-aware transactional overloads", () => {
    expect(multiModeGames).toContain("p_game_mode app.game_mode");
    expect(multiModeGames).toContain("p_winner_player_ids uuid[]");
    expect(multiModeGames).toContain("COALESCE(p_winner_player_ids, ARRAY[]::uuid[])");
    expect(multiModeGames).toContain("ON CONFLICT (pod_id, idempotency_key) DO NOTHING");
    expect(multiModeGames).toContain("ON CONFLICT (game_id, player_id) DO UPDATE SET");
  });

  it("removes the legacy winner dependency from Superadmin player deletion", () => {
    const replacement = multiModeGames.slice(multiModeGames.indexOf("CREATE OR REPLACE FUNCTION private.hard_delete_player"), multiModeGames.indexOf("CREATE OR REPLACE FUNCTION private.game_players_are_opponents"));
    expect(replacement).toContain("FROM app.game_participants participant");
    expect(replacement).not.toContain("winner_player_id = p_player_id");
  });

  it("replaces the fixed game-mode enum with a Superadmin-managed catalog", () => {
    expect(gameModeCatalog).toContain("CREATE TABLE app.game_modes");
    expect(gameModeCatalog).toContain("ALTER TABLE app.games ALTER COLUMN game_mode TYPE text");
    expect(gameModeCatalog).toContain("games_game_mode_fk");
    expect(gameModeCatalog).toContain("CREATE POLICY game_modes_superuser_write");
    expect(gameModeCatalog).toContain("CREATE VIEW api.game_modes");
    expect(gameModeCatalog).toContain("built-in player limits and winning rules are protected");
  });

  it("validates custom winners and permits draws for every catalog mode", () => {
    expect(gameModeCatalog).toContain("v_mode.winning_criteria = 'ONE_WINNER'");
    expect(gameModeCatalog).toContain("v_mode.winning_criteria = 'MULTIPLE_WINNERS'");
    expect(gameModeCatalog).toContain("v_mode.winning_criteria = 'ONE_OR_MORE_WINNERS'");
    expect(gameModeCatalog).toContain("p_result_kind = 'DRAW' AND v_winner_count <> 0");
    expect(gameModeCatalog).toContain("p_game_mode text");
  });

  it("adds optional Commander metadata and immutable participant snapshots", () => {
    expect(automaticWinAchievements).toContain("ADD COLUMN commander_cmc integer");
    expect(automaticWinAchievements).toContain("ADD COLUMN color_identity text[]");
    expect(automaticWinAchievements).toContain("commander_cmc_snapshot");
    expect(automaticWinAchievements).toContain("color_identity_snapshot");
    expect(automaticWinAchievements).toContain("deck.commander_cmc, deck.color_identity");
    expect(automaticWinAchievements).toContain("existing_participant.commander_cmc_snapshot");
    expect(automaticWinAchievements).toContain("existing_participant.color_identity_snapshot");
  });

  it("snapshots typed mode rules and reconciles only automatic grants", () => {
    expect(automaticWinAchievements).toContain("CREATE TYPE app.achievement_automation_rule_type AS ENUM ('GAME_MODE_WIN')");
    expect(automaticWinAchievements).toContain("CREATE TABLE app.game_mode_win_achievement_rules");
    expect(automaticWinAchievements).toContain("CREATE TABLE app.game_achievement_rule_snapshots");
    expect(automaticWinAchievements).toContain("game_mode_code text NOT NULL");
    expect(automaticWinAchievements).toContain("CREATE OR REPLACE FUNCTION private.reconcile_automatic_achievement_grants");
    expect(automaticWinAchievements).toContain("grant_row.grant_source = 'AUTOMATIC'");
    expect(automaticWinAchievements).toContain("snapshot.winner_role IS NULL OR snapshot.winner_role = participant.mode_role");
    expect(automaticWinAchievements).toContain("snapshot.game_mode_code = game.game_mode");
    expect(automaticWinAchievements).toContain("PERFORM private.assert_game_mode_automation_ready(p_game_mode)");
  });

  it("keeps explicit revocations suppressed and protects mapped achievements", () => {
    expect(automaticWinAchievements).toContain("CREATE TABLE app.automatic_achievement_suppressions");
    expect(automaticWinAchievements).toContain("revocation_source = 'MANUAL'");
    expect(automaticWinAchievements).toContain("CONSTRAINT = 'achievement_in_use'");
    expect(automaticWinAchievements).toContain("REVOKE INSERT, UPDATE, DELETE ON app.pod_player_achievements FROM authenticated");
  });
});
