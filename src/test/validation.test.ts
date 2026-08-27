import { describe, expect, it } from "vitest";
import { achievementGrantSchema, createDeckSchema, createGameSchema, createPodSchema, hardDeleteSchema, updateThemePreferenceSchema } from "@/lib/validation";

const playerA = "10000000-0000-4000-8000-000000000001";
const playerB = "10000000-0000-4000-8000-000000000002";
const deckA = "20000000-0000-4000-8000-000000000001";
const deckB = "20000000-0000-4000-8000-000000000002";

function game(overrides: Record<string, unknown> = {}) {
  return {
    playedAt: "2026-08-22T20:00:00.000Z",
    resultKind: "WIN",
    winnerPlayerId: playerA,
    notes: "",
    idempotencyKey: "30000000-0000-4000-8000-000000000001",
    participants: [{ playerId: playerA, deckId: deckA }, { playerId: playerB, deckId: deckB }],
    ...overrides,
  };
}

describe("game validation", () => {
  it("accepts a normal multiplayer result", () => expect(createGameSchema.safeParse(game()).success).toBe(true));

  it("rejects duplicate players", () => {
    const result = createGameSchema.safeParse(game({ participants: [{ playerId: playerA, deckId: deckA }, { playerId: playerA, deckId: deckB }] }));
    expect(result.success).toBe(false);
  });

  it("rejects a winner outside the participants", () => {
    const result = createGameSchema.safeParse(game({ winnerPlayerId: "10000000-0000-4000-8000-000000000003" }));
    expect(result.success).toBe(false);
  });

  it("requires a null winner for draws", () => {
    expect(createGameSchema.safeParse(game({ resultKind: "DRAW" })).success).toBe(false);
    expect(createGameSchema.safeParse(game({ resultKind: "DRAW", winnerPlayerId: null })).success).toBe(true);
  });
});

describe("deck validation", () => {
  const base = { ownerPlayerId: playerA, name: "Teysa", bracket: 3, powerLevel: 7.25 };
  it("accepts an omitted or explicitly empty power level", () => {
    const withoutPower = { ownerPlayerId: playerA, name: "Teysa", bracket: 3 };
    expect(createDeckSchema.parse(withoutPower).powerLevel).toBeNull();
    expect(createDeckSchema.parse({ ...base, powerLevel: null }).powerLevel).toBeNull();
  });
  it("accepts HTTPS Moxfield links", () => expect(createDeckSchema.safeParse({ ...base, moxfieldUrl: "https://moxfield.com/decks/example_1" }).success).toBe(true));
  it("rejects non-Moxfield and HTTP links", () => {
    expect(createDeckSchema.safeParse({ ...base, moxfieldUrl: "https://example.com/decks/1" }).success).toBe(false);
    expect(createDeckSchema.safeParse({ ...base, moxfieldUrl: "http://moxfield.com/decks/1" }).success).toBe(false);
    expect(createDeckSchema.safeParse({ ...base, moxfieldUrl: "https://moxfield.com/users/example" }).success).toBe(false);
  });
  it("enforces bracket and power bounds", () => {
    expect(createDeckSchema.safeParse({ ...base, bracket: 6 }).success).toBe(false);
    expect(createDeckSchema.safeParse({ ...base, powerLevel: 10.01 }).success).toBe(false);
  });
});

describe("POD validation", () => {
  it("accepts IANA timezones and rejects invented zones", () => {
    expect(createPodSchema.safeParse({ name: "Friday", timezone: "America/Argentina/Buenos_Aires" }).success).toBe(true);
    expect(createPodSchema.safeParse({ name: "Friday", timezone: "Buenos Aires time" }).success).toBe(false);
  });
});

describe("theme preference validation", () => {
  it("accepts only system, light, or dark preferences", () => {
    expect(updateThemePreferenceSchema.safeParse({ themePreference: "SYSTEM", version: 1 }).success).toBe(true);
    expect(updateThemePreferenceSchema.safeParse({ themePreference: "LIGHT", version: 1 }).success).toBe(true);
    expect(updateThemePreferenceSchema.safeParse({ themePreference: "DARK", version: 1 }).success).toBe(true);
    expect(updateThemePreferenceSchema.safeParse({ themePreference: "AUTO", version: 1 }).success).toBe(false);
  });
});

describe("hard-delete validation", () => {
  it("requires an optimistic version and a non-empty typed confirmation", () => {
    expect(hardDeleteSchema.safeParse({ version: 1, confirmation: "DELETE Mara" }).success).toBe(true);
    expect(hardDeleteSchema.safeParse({ version: 0, confirmation: "DELETE Mara" }).success).toBe(false);
    expect(hardDeleteSchema.safeParse({ version: 1, confirmation: "" }).success).toBe(false);
  });
});

describe("achievement grant validation", () => {
  it("requires the game where the achievement was earned", () => {
    const grant = { playerId: playerA, achievementId: "40000000-0000-4000-8000-000000000001", gameId: "50000000-0000-4000-8000-000000000001" };
    expect(achievementGrantSchema.safeParse(grant).success).toBe(true);
    expect(achievementGrantSchema.safeParse({ ...grant, gameId: undefined }).success).toBe(false);
  });
});
