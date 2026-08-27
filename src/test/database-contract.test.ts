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
});
