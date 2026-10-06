import { describe, expect, it } from "vitest";
import { achievementGameFactConditionSchema, achievementSchema, createDeckSchema, updateAchievementSchema, updateDeckSchema } from "@/lib/validation";

describe("typed achievement rule validation", () => {
  it.each([
    { fact: "COMMANDER_CMC", operator: "EQ", value: 0 },
    { fact: "COMMANDER_CMC", operator: "GTE", value: 3 },
    { fact: "COMMANDER_CMC", operator: "IS_UNKNOWN" },
    { fact: "DECK_POWER_LEVEL", operator: "BETWEEN", value: [6.70, 6.79] },
    { fact: "DECK_POWER_LEVEL", operator: "EQ", value: 6.66 },
    { fact: "COLOR_IDENTITY", operator: "EXACTLY", value: ["G", "R"] },
    { fact: "COLOR_IDENTITY", operator: "IS_COLORLESS" },
    { fact: "COLOR_IDENTITY", operator: "IS_UNKNOWN" },
    { fact: "COLOR_COUNT", operator: "EQ", value: 5 },
    { fact: "WINNER_ROLE", operator: "EQ", value: "KING" },
    { fact: "WINNER_SEAT", operator: "IS_UNKNOWN" },
    { fact: "HAS_BACKGROUND", operator: "EQ", value: false },
    { fact: "GAME_MODE", operator: "NEQ", value: "FREE_FOR_ALL" },
    { fact: "MONARCHY_BANDIT_RULE", operator: "EQ", value: "ALL_BANDITS" },
  ])("accepts $fact/$operator with its typed value", (condition) => {
    expect(achievementGameFactConditionSchema.safeParse(condition).success).toBe(true);
  });

  it.each([
    { fact: "COMMANDER_CMC", operator: "EQ", value: 2.5 },
    { fact: "COMMANDER_CMC", operator: "EQ", value: -1 },
    { fact: "COMMANDER_CMC", operator: "EQ", value: "3" },
    { fact: "COMMANDER_CMC", operator: "EQ", value: null },
    { fact: "COMMANDER_CMC", operator: "IS_UNKNOWN", value: 3 },
    { fact: "DECK_POWER_LEVEL", operator: "EQ", value: 6.666 },
    { fact: "DECK_POWER_LEVEL", operator: "BETWEEN", value: [6.8, 6.7] },
    { fact: "COLOR_IDENTITY", operator: "EXACTLY", value: [] },
    { fact: "COLOR_IDENTITY", operator: "CONTAINS_ALL", value: ["R", "R"] },
    { fact: "COLOR_IDENTITY", operator: "EQ", value: ["R"] },
    { fact: "HAS_COMPANION", operator: "EQ", value: "true" },
    { fact: "WINNER_ROLE", operator: "EQ", value: "WINNER" },
    { fact: "GAME_MODE", operator: "LT", value: "FREE_FOR_ALL" },
    { fact: "MONARCHY_BANDIT_RULE", operator: "IS_UNKNOWN" },
  ])("rejects incompatible $fact/$operator/value combinations", (condition) => {
    expect(achievementGameFactConditionSchema.safeParse(condition).success).toBe(false);
  });

  it("canonicalizes colors and enforces 1–10 conditions and up to ten OR groups", () => {
    expect(achievementGameFactConditionSchema.parse({ fact: "COLOR_IDENTITY", operator: "EXACTLY", value: ["G", "R"] }).value).toEqual(["R", "G"]);
    const base = { code: "automatic", name: "Automatic", category: "General" };
    const rule = { recipient: "WINNER", conditions: [{ fact: "COMMANDER_CMC", operator: "EQ", value: 3 }] };
    expect(achievementSchema.parse(base).gameFactRules).toEqual([]);
    expect(achievementSchema.safeParse({ ...base, gameFactRules: [rule] }).success).toBe(true);
    expect(achievementSchema.safeParse({ ...base, gameFactRules: [{ recipient: "WINNER", conditions: [] }] }).success).toBe(false);
    expect(achievementSchema.safeParse({ ...base, gameFactRules: Array(11).fill(rule) }).success).toBe(false);
    expect(achievementSchema.safeParse({ ...base, gameFactRules: [{ ...rule, conditions: Array(11).fill(rule.conditions[0]) }] }).success).toBe(false);
    expect(achievementSchema.safeParse({ ...base, gameFactRules: [{ ...rule, recipient: "PARTICIPANT" }] }).success).toBe(false);
  });

  it("preserves omitted metadata and rules on partial and archive updates", () => {
    expect(updateDeckSchema.parse({ version: 2, archived: true })).toEqual({ version: 2, archived: true });
    expect(updateAchievementSchema.parse({ version: 2, archived: true })).toEqual({ version: 2, archived: true });
    expect(updateAchievementSchema.parse({ version: 2, gameFactRules: [] }).gameFactRules).toEqual([]);
    const deck = createDeckSchema.parse({ ownerPlayerId: "10000000-0000-4000-8000-000000000001", name: "Deck", bracket: 3 });
    expect(deck).toMatchObject({ hasPartnerCommanders: false, hasCompanion: false, hasBackground: false });
  });
});
