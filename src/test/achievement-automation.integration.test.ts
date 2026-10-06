// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AchievementGameFactCondition, AchievementGameFactRule } from "@/lib/achievement-rules";

let db: PGlite;
const actor = "10000000-0000-4000-8000-000000000001";
const player = "10000000-0000-4000-8000-000000000002";
const pod = "20000000-0000-4000-8000-000000000001";
const deck = "30000000-0000-4000-8000-000000000001";
const otherDeck = "30000000-0000-4000-8000-000000000002";
const participants = [{ playerId: actor, deckId: deck }, { playerId: player, deckId: otherDeck }];

beforeAll(async () => {
  db = new PGlite();
  await db.exec("CREATE ROLE authenticated; CREATE SCHEMA neon_auth; CREATE TABLE neon_auth.\"user\" (id text PRIMARY KEY);");
  const journal = JSON.parse(readFileSync(resolve("drizzle/meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  for (const migration of journal.entries) {
    const source = readFileSync(resolve(`drizzle/${migration.tag}.sql`), "utf8");
    try {
      await db.transaction(async (tx) => {
        for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) await tx.exec(statement);
      });
    } catch (cause) {
      throw new Error(`Migration ${migration.tag} failed`, { cause });
    }
  }
  await db.exec(`
    INSERT INTO app.players (id, display_name, auth_user_id) VALUES
      ('${actor}', 'Admin', 'admin-sub'), ('${player}', 'Player', 'player-sub');
    INSERT INTO private.app_superuser (auth_user_id) VALUES ('admin-sub');
    INSERT INTO app.pods (id, name, timezone, created_by_player_id) VALUES ('${pod}', 'Test POD', 'UTC', '${actor}');
    INSERT INTO app.pod_memberships (pod_id, player_id, role) VALUES ('${pod}', '${actor}', 'ADMIN'), ('${pod}', '${player}', 'GUEST');
    INSERT INTO app.decks (id, owner_player_id, name, bracket, power_level, commander_cmc, color_identity, created_by_player_id)
    VALUES ('${deck}', '${actor}', 'Winner deck', 3, 6.70, 3, ARRAY['R','G'], '${actor}'),
      ('${otherDeck}', '${player}', 'Other deck', 3, NULL, NULL, NULL, '${actor}');
  `);
}, 30000);

afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("BEGIN"); });
afterEach(async () => { await db.exec("ROLLBACK"); });

async function achievement(code: string, rules: AchievementGameFactRule[]) {
  const result = await db.query<{ id: string }>(
    "SELECT id FROM private.create_achievement_with_rules($1::uuid, $2, $2, '', 'General', 0, $3::jsonb)",
    [actor, code, JSON.stringify(rules)],
  );
  return result.rows[0].id;
}

function rule(...conditions: AchievementGameFactCondition[]): AchievementGameFactRule { return { recipient: "WINNER", conditions }; }

async function game(playedAt: string, winner = actor) {
  const result = await db.query<{ id: string }>(
    "SELECT api.create_game($1::uuid,$2::uuid,$3::timestamptz,'FREE_FOR_ALL',NULL,'WIN',ARRAY[$4::uuid],'',gen_random_uuid(),$5::jsonb) AS id",
    [pod, actor, playedAt, winner, JSON.stringify(participants)],
  );
  return result.rows[0].id;
}

async function grants(achievementId: string) {
  return (await db.query<{ player_id: string; game_id: string; grant_source: string; revoked_at: string | null; revocation_source: string | null }>(
    "SELECT player_id,game_id,grant_source,revoked_at,revocation_source FROM app.pod_player_achievements WHERE achievement_id=$1::uuid", [achievementId],
  )).rows;
}

describe.sequential("configurable automation database transactions", () => {
  it("applies the entire migration chain and exposes rules read-only", async () => {
    const result = await db.query<{ allowed: boolean }>(`SELECT
      has_table_privilege('authenticated','api.achievement_game_fact_rules','SELECT')
      AND NOT has_table_privilege('authenticated','app.game_fact_rule_snapshots','INSERT')
      AND NOT has_table_privilege('authenticated','app.achievement_game_fact_conditions','UPDATE')
      AND NOT has_function_privilege('authenticated','private.set_achievement_game_fact_rules(uuid,uuid,jsonb)','EXECUTE')
      AND NOT has_function_privilege('authenticated','private.update_achievement_with_rules(uuid,uuid,text,text,text,text,integer,timestamptz,integer,jsonb)','EXECUTE') AS allowed`);
    expect(result.rows[0].allowed).toBe(true);
  });

  it("validates typed numeric, color, boolean, and null combinations in PostgreSQL", async () => {
    const valid = [
      { fact: "COMMANDER_CMC", operator: "EQ", value: 0 },
      { fact: "COMMANDER_CMC", operator: "GTE", value: 3 },
      { fact: "DECK_POWER_LEVEL", operator: "BETWEEN", value: [6.70, 6.79] },
      { fact: "COLOR_IDENTITY", operator: "EXACTLY", value: ["R", "G"] },
      { fact: "COLOR_IDENTITY", operator: "IS_COLORLESS" },
      { fact: "COMMANDER_CMC", operator: "IS_UNKNOWN" },
      { fact: "HAS_COMPANION", operator: "EQ", value: true },
    ];
    for (const condition of valid) await db.query("SELECT private.validate_game_fact_conditions($1::jsonb)", [JSON.stringify([condition])]);
    const invalid = [
      { fact: "COMMANDER_CMC", operator: "EQ", value: 3.5 },
      { fact: "COMMANDER_CMC", operator: "EQ", value: -1 },
      { fact: "COMMANDER_CMC", operator: "EQ", value: "3" },
      { fact: "GAME_MODE", operator: "LT", value: "FREE_FOR_ALL" },
      { fact: "COLOR_IDENTITY", operator: "EXACTLY", value: ["G", "R"] },
      { fact: "COLOR_IDENTITY", operator: "CONTAINS_ALL", value: ["R", "R"] },
      { fact: "COMMANDER_CMC", operator: "IS_UNKNOWN", value: 3 },
      { fact: "HAS_COMPANION", operator: "EQ", value: "true" },
    ];
    for (const condition of invalid) {
      await db.exec("SAVEPOINT invalid_condition");
      await expect(db.query("SELECT private.validate_game_fact_conditions($1::jsonb)", [JSON.stringify([condition])])).rejects.toThrow();
      await db.exec("ROLLBACK TO invalid_condition");
    }
  });

  it("awards once across overlapping OR rules, checks every AND condition, and preserves earliest evidence", async () => {
    const id = await achievement("cmc-three", [
      rule({ fact: "COMMANDER_CMC", operator: "EQ", value: 3 }, { fact: "PLAYER_COUNT", operator: "EQ", value: 2 }),
      rule({ fact: "COLOR_IDENTITY", operator: "EXACTLY", value: ["R", "G"] }),
    ]);
    const first = await game("2026-08-20T20:00:00Z");
    await game("2026-08-22T20:00:00Z");
    expect(await grants(id)).toMatchObject([{ player_id: actor, game_id: first, grant_source: "AUTOMATIC", revoked_at: null }]);
    const earlier = await game("2026-08-18T20:00:00Z");
    expect(await grants(id)).toMatchObject([{ game_id: earlier }]);
    await db.query("SELECT api.set_game_archived($1::uuid,$2::uuid,$3::uuid,1,true)", [earlier, pod, actor]);
    expect(await grants(id)).toMatchObject([{ game_id: first }]);
    await db.query("SELECT api.set_game_archived($1::uuid,$2::uuid,$3::uuid,2,false)", [earlier, pod, actor]);
    expect(await grants(id)).toMatchObject([{ game_id: earlier }]);
  });

  it("snapshots unmatched rules and re-evaluates corrected winners without using later rule edits", async () => {
    const id = await achievement("cmc-correction", [rule({ fact: "COMMANDER_CMC", operator: "EQ", value: 3 })]);
    const gameId = await game("2026-08-24T20:00:00Z", player);
    expect(await grants(id)).toEqual([]);
    await db.query("SELECT private.set_achievement_game_fact_rules($1::uuid,$2::uuid,$3::jsonb)", [actor, id, JSON.stringify([rule({ fact: "COMMANDER_CMC", operator: "EQ", value: 9 })])]);
    await db.query("SELECT api.update_game($1::uuid,$2::uuid,$3::uuid,1,'2026-08-24T20:00:00Z','FREE_FOR_ALL',NULL,'WIN',ARRAY[$3::uuid],'',$4::jsonb)", [gameId, pod, actor, JSON.stringify(participants)]);
    expect(await grants(id)).toMatchObject([{ player_id: actor, game_id: gameId, revoked_at: null }]);
    await db.query("SELECT api.set_game_archived($1::uuid,$2::uuid,$3::uuid,2,true)", [gameId, pod, actor]);
    expect(await grants(id)).toMatchObject([{ revocation_source: "AUTOMATIC" }]);
    await db.query("SELECT api.set_game_archived($1::uuid,$2::uuid,$3::uuid,3,false)", [gameId, pod, actor]);
    expect(await grants(id)).toMatchObject([{ revoked_at: null }]);
    const later = await game("2026-08-25T20:00:00Z");
    expect(await grants(id)).toMatchObject([{ game_id: gameId }]);
    const match = await db.query<{ matches: boolean }>("SELECT private.automatic_achievement_snapshot_matches(id,$2::uuid) AS matches FROM app.game_achievement_rule_snapshots WHERE game_id=$1::uuid AND achievement_id=$3::uuid", [later, actor, id]);
    expect(match.rows[0].matches).toBe(false);
  });

  it("rejects non-superadmin rule mutations and rolls back invalid achievement creation", async () => {
    // Each rejected statement runs outside the surrounding test transaction,
    // so PostgreSQL can roll back its changes without aborting later assertions.
    await db.exec("ROLLBACK");
    await expect(db.query("SELECT private.create_achievement_with_rules($1::uuid,'forged','Forged','','General',0,'[]')", [player])).rejects.toThrow("superadmin");
    await expect(achievement("invalid-rules", [rule({ fact: "COMMANDER_CMC", operator: "EQ", value: -1 })])).rejects.toThrow();
    const result = await db.query("SELECT id FROM app.achievements WHERE code IN ('forged','invalid-rules')");
    expect(result.rows).toEqual([]);
  });

  it("honors exact decimals and inclusive power boundaries", async () => {
    const rangeId = await achievement("power-range", [rule({ fact: "DECK_POWER_LEVEL", operator: "BETWEEN", value: [6.70, 6.79] })]);
    const exactId = await achievement("power-exact", [rule({ fact: "DECK_POWER_LEVEL", operator: "EQ", value: 6.66 })]);
    for (const [power, range, exact] of [[6.69, false, false], [6.70, true, false], [6.79, true, false], [6.80, false, false], [6.66, false, true], [null, false, false]] as const) {
      await db.query("UPDATE app.decks SET power_level=$1 WHERE id=$2::uuid", [power, deck]);
      const gameId = await game("2026-09-01T20:00:00Z");
      const result = await db.query<{ achievement_id: string; matches: boolean }>(
        "SELECT achievement_id,private.automatic_achievement_snapshot_matches(id,$2::uuid) AS matches FROM app.game_achievement_rule_snapshots WHERE game_id=$1::uuid", [gameId, actor],
      );
      expect(result.rows.find((row) => row.achievement_id === rangeId)?.matches).toBe(range);
      expect(result.rows.find((row) => row.achievement_id === exactId)?.matches).toBe(exact);
    }
  });

  it("distinguishes exact, contained, colorless, and unknown identities", async () => {
    const cases = [
      ["gruul", { fact: "COLOR_IDENTITY", operator: "EXACTLY", value: ["R", "G"] }],
      ["red-green", { fact: "COLOR_IDENTITY", operator: "CONTAINS_ALL", value: ["R", "G"] }],
      ["blue-or-black", { fact: "COLOR_IDENTITY", operator: "CONTAINS_ANY", value: ["U", "B"] }],
      ["no-white", { fact: "COLOR_IDENTITY", operator: "EXCLUDES_ALL", value: ["W"] }],
      ["colorless", { fact: "COLOR_IDENTITY", operator: "IS_COLORLESS" }],
      ["unknown-color", { fact: "COLOR_IDENTITY", operator: "IS_UNKNOWN" }],
      ["two-colors", { fact: "COLOR_COUNT", operator: "EQ", value: 2 }],
    ] as const;
    const ids = await Promise.all(cases.map(([code, condition]) => achievement(code, [rule(condition as AchievementGameFactCondition)])));
    for (const [identity, expected] of [
      [["R", "G"], [true, true, false, true, false, false, true]],
      [["U", "R", "G"], [false, true, true, true, false, false, false]],
      [["W", "U", "B", "R", "G"], [false, true, true, false, false, false, false]],
      [["R"], [false, false, false, true, false, false, false]],
      [[], [false, false, false, true, true, false, false]],
      [null, [false, false, false, false, false, true, false]],
    ] as [string[] | null, boolean[]][]) {
      await db.query("UPDATE app.decks SET color_identity=$1::text[] WHERE id=$2::uuid", [identity, deck]);
      const gameId = await game("2026-09-02T20:00:00Z");
      const result = await db.query<{ achievement_id: string; matches: boolean }>(
        "SELECT achievement_id,private.automatic_achievement_snapshot_matches(id,$2::uuid) AS matches FROM app.game_achievement_rule_snapshots WHERE game_id=$1::uuid", [gameId, actor],
      );
      ids.forEach((id, index) => expect(result.rows.find((row) => row.achievement_id === id)?.matches).toBe(expected[index]));
    }
  });

  it("requires all AND conditions, awards any OR group, and never awards draws or non-winners", async () => {
    const id = await achievement("and-or", [
      rule({ fact: "GAME_MODE", operator: "EQ", value: "PENTAGON" }, { fact: "PLAYER_COUNT", operator: "EQ", value: 2 }),
      rule({ fact: "COMMANDER_CMC", operator: "IS_UNKNOWN" }),
    ]);
    await game("2026-09-03T20:00:00Z");
    expect(await grants(id)).toEqual([]);
    await db.query("SELECT api.create_game($1::uuid,$2::uuid,'2026-09-03T20:00:00Z','FREE_FOR_ALL',NULL,'DRAW',ARRAY[]::uuid[],'',gen_random_uuid(),$3::jsonb)", [pod, actor, JSON.stringify(participants)]);
    expect(await grants(id)).toEqual([]);
    const qualifying = await game("2026-09-04T20:00:00Z", player);
    expect(await grants(id)).toMatchObject([{ player_id: player, game_id: qualifying }]);
  });

  it("keeps flags from game time and captures current metadata only for a replacement deck", async () => {
    const id = await achievement("deck-traits", [rule(
      { fact: "HAS_PARTNER_COMMANDERS", operator: "EQ", value: true },
      { fact: "HAS_COMPANION", operator: "EQ", value: true },
      { fact: "HAS_BACKGROUND", operator: "EQ", value: true },
    )]);
    const gameId = await game("2026-09-05T20:00:00Z");
    await db.exec(`UPDATE app.decks SET has_partner_commanders=true,has_companion=true,has_background=true WHERE id='${deck}'`);
    await db.query("SELECT api.update_game($1::uuid,$2::uuid,$3::uuid,1,'2026-09-05T20:00:00Z','FREE_FOR_ALL',NULL,'WIN',ARRAY[$3::uuid],'',$4::jsonb)", [gameId, pod, actor, JSON.stringify(participants)]);
    expect(await grants(id)).toEqual([]);
    const replacement = "30000000-0000-4000-8000-000000000003";
    await db.exec(`INSERT INTO app.decks (id,owner_player_id,name,bracket,created_by_player_id,has_partner_commanders,has_companion,has_background) VALUES ('${replacement}','${actor}','Replacement',3,'${actor}',true,true,true)`);
    await db.query("SELECT api.update_game($1::uuid,$2::uuid,$3::uuid,2,'2026-09-05T20:00:00Z','FREE_FOR_ALL',NULL,'WIN',ARRAY[$3::uuid],'',$4::jsonb)", [gameId, pod, actor, JSON.stringify([{ playerId: actor, deckId: replacement }, participants[1]])]);
    expect(await grants(id)).toMatchObject([{ player_id: actor, game_id: gameId }]);
  });

  it("never retroactively snapshots rules and preserves manual grants and staff revocations", async () => {
    const oldGame = await game("2026-09-06T20:00:00Z");
    const id = await achievement("future-only", [rule({ fact: "COMMANDER_CMC", operator: "EQ", value: 3 })]);
    await db.query("SELECT api.update_game($1::uuid,$2::uuid,$3::uuid,1,'2026-09-06T20:00:00Z','FREE_FOR_ALL',NULL,'WIN',ARRAY[$3::uuid],'',$4::jsonb)", [oldGame, pod, actor, JSON.stringify(participants)]);
    expect(await grants(id)).toEqual([]);
    await db.exec(`INSERT INTO app.pod_player_achievements (pod_id,player_id,achievement_id,game_id,granted_by_player_id) VALUES ('${pod}','${actor}','${id}','${oldGame}','${actor}')`);
    await game("2026-09-07T20:00:00Z");
    expect(await grants(id)).toMatchObject([{ grant_source: "MANUAL", game_id: oldGame }]);
    const suppressedId = await achievement("suppressed", [rule({ fact: "COMMANDER_CMC", operator: "EQ", value: 3 })]);
    await game("2026-09-08T20:00:00Z");
    await db.exec(`
      UPDATE app.pod_player_achievements SET revoked_at=now(),revoked_by_player_id='${actor}',revocation_source='MANUAL' WHERE achievement_id='${suppressedId}';
      INSERT INTO app.automatic_achievement_suppressions (pod_id,player_id,achievement_id,suppressed_by_player_id) VALUES ('${pod}','${actor}','${suppressedId}','${actor}');
    `);
    await game("2026-09-09T20:00:00Z");
    expect(await grants(suppressedId)).toMatchObject([{ revocation_source: "MANUAL" }]);
  });

  it("evaluates Asterisk, Heroes, and every Monarchy winning role independently", async () => {
    const ids = Array.from({ length: 6 }, (_, index) => `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
    const deckIds = [deck, otherDeck, ...ids.slice(2).map((_, index) => `30000000-0000-4000-8000-${String(index + 3).padStart(12, "0")}`)];
    for (let index = 2; index < ids.length; index++) {
      await db.query("INSERT INTO app.players (id,display_name,auth_user_id) VALUES ($1::uuid,$2,$3)", [ids[index], `Player ${index}`, `sub-${index}`]);
      await db.query("INSERT INTO app.pod_memberships (pod_id,player_id,role) VALUES ($1::uuid,$2::uuid,'GUEST')", [pod, ids[index]]);
      await db.query("INSERT INTO app.decks (id,owner_player_id,name,bracket,commander_cmc,created_by_player_id) VALUES ($1::uuid,$2::uuid,$3,3,3,$4::uuid)", [deckIds[index], ids[index], `Deck ${index}`, actor]);
    }
    const genericId = await achievement("all-cowinners", [rule({ fact: "COMMANDER_CMC", operator: "EQ", value: 3 })]);
    for (const [mode, roles] of [["ARCHENEMY", ["ARCHENEMY", "HERO"]], ["MONARCHY", ["KING", "KINGSGUARD", "TRAITOR", "BANDIT"]]] as const) {
      const mappings = [];
      for (const role of roles) mappings.push({ winnerRole: role, achievementId: await achievement(`${mode.toLowerCase()}-${role.toLowerCase()}`, []) });
      await db.query("SELECT private.set_game_mode_win_achievement_rules($1::uuid,$2,$3::jsonb)", [actor, mode, JSON.stringify(mappings)]);
    }
    const monarchyRoles = ["KING", "KINGSGUARD", "TRAITOR", "BANDIT", "BANDIT", "BANDIT"];
    for (const [mode, winners, banditRule] of [
      ["ASTERISK", [ids[0], ids[3]], null],
      ["ARCHENEMY", ids.slice(1), null],
      ["MONARCHY", ids.slice(0, 2), "ALL_BANDITS"],
      ["MONARCHY", [ids[2]], "ALL_BANDITS"],
      ["MONARCHY", ids.slice(3), "ALL_BANDITS"],
      ["MONARCHY", [ids[4]], "SURVIVING_BANDITS"],
    ] as [string, string[], string | null][]) {
      const table = ids.map((playerId, index) => ({ playerId, deckId: deckIds[index], seatPosition: mode === "ASTERISK" ? index + 1 : null, modeRole: mode === "ARCHENEMY" ? index === 0 ? "ARCHENEMY" : "HERO" : mode === "MONARCHY" ? monarchyRoles[index] : null }));
      const result = await db.query<{ id: string }>("SELECT api.create_game($1::uuid,$2::uuid,'2026-09-10T20:00:00Z',$3,$4::app.monarchy_bandit_rule,'WIN',$5::uuid[],'',gen_random_uuid(),$6::jsonb) AS id", [pod, actor, mode, banditRule, winners, JSON.stringify(table)]);
      const evidence = await db.query<{ player_id: string; matches: boolean }>("SELECT participant.player_id,private.automatic_achievement_snapshot_matches(snapshot.id,participant.player_id) AS matches FROM app.game_achievement_rule_snapshots snapshot JOIN app.game_participants participant ON participant.game_id=snapshot.game_id WHERE snapshot.game_id=$1::uuid AND snapshot.achievement_id=$2::uuid", [result.rows[0].id, genericId]);
      for (const row of evidence.rows) expect(row.matches).toBe(winners.includes(row.player_id) && row.player_id !== player);
    }
  });

  it("enforces POD visibility and prevents forged direct snapshots, grants, and rule writes", async () => {
    const id = await achievement("secure-rule", [rule({ fact: "COMMANDER_CMC", operator: "EQ", value: 3 })]);
    const gameId = await game("2026-09-11T20:00:00Z");
    await db.exec("SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','player-sub',true)");
    expect((await db.query("SELECT * FROM api.achievement_game_fact_rules")).rows).toHaveLength(1);
    expect((await db.query("SELECT * FROM app.game_fact_rule_snapshots")).rows).toHaveLength(1);
    for (const query of [
      `INSERT INTO app.game_achievement_rule_snapshots (game_id,game_mode_code,achievement_id,rule_type) VALUES ('${gameId}','FREE_FOR_ALL','${id}','GAME_FACT')`,
      `INSERT INTO app.pod_player_achievements (pod_id,player_id,achievement_id,game_id,granted_by_player_id) VALUES ('${pod}','${player}','${id}','${gameId}','${player}')`,
      "UPDATE app.achievement_game_fact_conditions SET condition_value='7'",
      `SELECT api.set_game_archived('${gameId}','${pod}','${player}',1,true)`,
    ]) {
      await db.exec("SAVEPOINT forged_write");
      await expect(db.exec(query)).rejects.toThrow();
      await db.exec("ROLLBACK TO forged_write");
    }
    await db.exec(`RESET ROLE; UPDATE app.pod_memberships SET status='ARCHIVED',archived_at=now() WHERE pod_id='${pod}' AND player_id='${player}'; SET LOCAL ROLE authenticated`);
    expect((await db.query("SELECT * FROM app.game_fact_rule_snapshots")).rows).toEqual([]);
    expect((await db.query("SELECT * FROM api.games")).rows).toEqual([]);
  });
});
