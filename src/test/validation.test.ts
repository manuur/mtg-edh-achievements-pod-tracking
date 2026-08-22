import { describe, expect, it } from "vitest";
import { createDeckSchema, createGameSchema, createPodSchema } from "@/lib/validation";

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
