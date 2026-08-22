import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "drizzle/0001_authorization_and_game_transactions.sql"), "utf8");

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
});
