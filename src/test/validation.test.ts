import { describe, expect, it } from "vitest";
import { achievementGrantSchema, createDeckSchema, createGameModeSchema, createGameSchema, createPodSchema, hardDeleteSchema, reorderAchievementCategoriesSchema, reorderAchievementsSchema, updateGameModeSchema, updateThemePreferenceSchema } from "@/lib/validation";

const playerA = "10000000-0000-4000-8000-000000000001";
const playerB = "10000000-0000-4000-8000-000000000002";
const deckA = "20000000-0000-4000-8000-000000000001";
const deckB = "20000000-0000-4000-8000-000000000002";
const playerIds = Array.from({ length: 8 }, (_, index) => `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const deckIds = Array.from({ length: 8 }, (_, index) => `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);

function game(overrides: Record<string, unknown> = {}) {
  return {
    playedAt: "2026-08-22T20:00:00.000Z",
    gameMode: "FREE_FOR_ALL",
    monarchyBanditRule: null,
    resultKind: "WIN",
    winnerPlayerIds: [playerA],
    notes: "",
    idempotencyKey: "30000000-0000-4000-8000-000000000001",
    participants: [{ playerId: playerA, deckId: deckA, seatPosition: null, modeRole: null }, { playerId: playerB, deckId: deckB, seatPosition: null, modeRole: null }],
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
    const result = createGameSchema.safeParse(game({ winnerPlayerIds: ["10000000-0000-4000-8000-000000000003"] }));
    expect(result.success).toBe(false);
  });

  it("requires a null winner for draws", () => {
    expect(createGameSchema.safeParse(game({ resultKind: "DRAW" })).success).toBe(false);
    expect(createGameSchema.safeParse(game({ resultKind: "DRAW", winnerPlayerIds: [] })).success).toBe(true);
  });

  it("accepts legacy single-winner Free-for-all payloads during the compatibility release", () => {
    const legacy = game({ winnerPlayerIds: undefined, winnerPlayerId: playerA, gameMode: undefined });
    const parsed = createGameSchema.parse(legacy);
    expect(parsed.gameMode).toBe("FREE_FOR_ALL");
    expect(parsed.winnerPlayerIds).toEqual([playerA]);
  });

  it("enforces Pentagon seating and its single winner", () => {
    const participants = playerIds.slice(0, 5).map((playerId, index) => ({ playerId, deckId: deckIds[index], seatPosition: index + 1, modeRole: null }));
    expect(createGameSchema.safeParse(game({ gameMode: "PENTAGON", participants, winnerPlayerIds: [playerIds[0]] })).success).toBe(true);
    expect(createGameSchema.safeParse(game({ gameMode: "PENTAGON", participants: participants.map((participant) => ({ ...participant, seatPosition: 1 })), winnerPlayerIds: [playerIds[0]] })).success).toBe(false);
  });

  it("requires Asterisk winners to be an opposite-seat pair", () => {
    const participants = playerIds.slice(0, 6).map((playerId, index) => ({ playerId, deckId: deckIds[index], seatPosition: index + 1, modeRole: null }));
    expect(createGameSchema.safeParse(game({ gameMode: "ASTERISK", participants, winnerPlayerIds: [playerIds[0], playerIds[3]] })).success).toBe(true);
    expect(createGameSchema.safeParse(game({ gameMode: "ASTERISK", participants, winnerPlayerIds: [playerIds[0], playerIds[1]] })).success).toBe(false);
  });

  it("accepts only the Archenemy or the complete Heroes team", () => {
    const participants = playerIds.slice(0, 4).map((playerId, index) => ({ playerId, deckId: deckIds[index], seatPosition: null, modeRole: index === 0 ? "ARCHENEMY" : "HERO" }));
    expect(createGameSchema.safeParse(game({ gameMode: "ARCHENEMY", participants, winnerPlayerIds: [playerIds[0]] })).success).toBe(true);
    expect(createGameSchema.safeParse(game({ gameMode: "ARCHENEMY", participants, winnerPlayerIds: playerIds.slice(1, 4) })).success).toBe(true);
    expect(createGameSchema.safeParse(game({ gameMode: "ARCHENEMY", participants, winnerPlayerIds: [playerIds[1]] })).success).toBe(false);
  });

  it("validates Royal, Traitor, and Bandit Monarchy outcomes", () => {
    const roleList = ["KING", "KINGSGUARD", "TRAITOR", "BANDIT", "BANDIT", "BANDIT"] as const;
    const participants = playerIds.slice(0, 6).map((playerId, index) => ({ playerId, deckId: deckIds[index], seatPosition: null, modeRole: roleList[index] }));
    const monarchy = { gameMode: "MONARCHY", monarchyBanditRule: "ALL_BANDITS", participants };
    expect(createGameSchema.safeParse(game({ ...monarchy, winnerPlayerIds: [playerIds[0], playerIds[1]] })).success).toBe(true);
    expect(createGameSchema.safeParse(game({ ...monarchy, winnerPlayerIds: [playerIds[2]] })).success).toBe(true);
    expect(createGameSchema.safeParse(game({ ...monarchy, winnerPlayerIds: playerIds.slice(3, 6) })).success).toBe(true);
    expect(createGameSchema.safeParse(game({ ...monarchy, monarchyBanditRule: "SURVIVING_BANDITS", winnerPlayerIds: [playerIds[4]] })).success).toBe(true);
    expect(createGameSchema.safeParse(game({ ...monarchy, winnerPlayerIds: [playerIds[3]] })).success).toBe(false);
  });
});

describe("game-mode catalog validation", () => {
  const mode = { name: "Two-Headed Giant", description: "Two teams.", minPlayers: 4, maxPlayers: 6, winningCriteria: "MULTIPLE_WINNERS" };

  it("accepts configurable player ranges and winning criteria", () => {
    expect(createGameModeSchema.safeParse(mode).success).toBe(true);
    expect(updateGameModeSchema.safeParse({ ...mode, version: 1 }).success).toBe(true);
  });

  it("rejects inverted or out-of-bounds player ranges", () => {
    expect(createGameModeSchema.safeParse({ ...mode, minPlayers: 7, maxPlayers: 4 }).success).toBe(false);
    expect(createGameModeSchema.safeParse({ ...mode, maxPlayers: 9 }).success).toBe(false);
  });
});

describe("deck validation", () => {
  const base = { ownerPlayerId: playerA, name: "Teysa", bracket: 3, powerLevel: 7.25 };
  it("accepts an omitted or explicitly empty power level", () => {
    const withoutPower = { ownerPlayerId: playerA, name: "Teysa", bracket: 3 };
    expect(createDeckSchema.parse(withoutPower).powerLevel).toBeNull();
    expect(createDeckSchema.parse({ ...base, powerLevel: null }).powerLevel).toBeNull();
  });
  it("accepts an optional integer Commander CMC and canonicalizes color identity", () => {
    const parsed = createDeckSchema.parse({ ...base, commanderCmc: 7, colorIdentity: ["G", "W", "U"] });
    expect(parsed.commanderCmc).toBe(7);
    expect(parsed.colorIdentity).toEqual(["W", "U", "G"]);
    expect(createDeckSchema.parse(base).commanderCmc).toBeNull();
    expect(createDeckSchema.parse(base).colorIdentity).toBeNull();
    expect(createDeckSchema.parse({ ...base, colorIdentity: [] }).colorIdentity).toEqual([]);
    expect(createDeckSchema.parse({ ...base, colorIdentity: ["R"] }).colorIdentity).toEqual(["R"]);
  });
  it("rejects decimal or negative CMC and duplicate colors", () => {
    expect(createDeckSchema.safeParse({ ...base, commanderCmc: 2.5 }).success).toBe(false);
    expect(createDeckSchema.safeParse({ ...base, commanderCmc: -1 }).success).toBe(false);
    expect(createDeckSchema.safeParse({ ...base, commanderCmc: Number.NaN }).success).toBe(false);
    expect(createDeckSchema.safeParse({ ...base, colorIdentity: ["U", "U"] }).success).toBe(false);
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

describe("achievement ordering validation", () => {
  const item = { id: "40000000-0000-4000-8000-000000000001", version: 1 };

  it("accepts versioned category and achievement order payloads", () => {
    expect(reorderAchievementCategoriesSchema.safeParse({ items: [item] }).success).toBe(true);
    expect(reorderAchievementsSchema.safeParse({ categoryId: playerA, items: [item] }).success).toBe(true);
  });

  it("rejects empty order payloads", () => {
    expect(reorderAchievementCategoriesSchema.safeParse({ items: [] }).success).toBe(false);
    expect(reorderAchievementsSchema.safeParse({ categoryId: playerA, items: [] }).success).toBe(false);
  });
});
