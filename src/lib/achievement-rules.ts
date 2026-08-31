import { canonicalColorIdentity, MTG_COLORS, type MtgColor } from "@/lib/deck-metadata";
import { GAME_PARTICIPANT_ROLES, MONARCHY_BANDIT_RULES } from "@/lib/game-modes";

export const ACHIEVEMENT_RULE_RECIPIENTS = ["WINNER"] as const;
export type AchievementRuleRecipient = (typeof ACHIEVEMENT_RULE_RECIPIENTS)[number];

export const GAME_FACT_KEYS = [
  "GAME_MODE",
  "PLAYER_COUNT",
  "MONARCHY_BANDIT_RULE",
  "WINNER_SEAT",
  "WINNER_ROLE",
  "DECK_BRACKET",
  "DECK_POWER_LEVEL",
  "COMMANDER_CMC",
  "COLOR_IDENTITY",
  "COLOR_COUNT",
  "HAS_PARTNER_COMMANDERS",
  "HAS_COMPANION",
  "HAS_BACKGROUND",
] as const;
export type GameFactKey = (typeof GAME_FACT_KEYS)[number];

export const GAME_FACT_OPERATORS = [
  "EQ",
  "NEQ",
  "LT",
  "LTE",
  "GT",
  "GTE",
  "BETWEEN",
  "IS_KNOWN",
  "IS_UNKNOWN",
  "EXACTLY",
  "CONTAINS_ALL",
  "CONTAINS_ANY",
  "EXCLUDES_ALL",
  "IS_COLORLESS",
] as const;
export type GameFactOperator = (typeof GAME_FACT_OPERATORS)[number];

export type AchievementConditionValue = string | number | boolean | MtgColor[] | [number, number];

export type AchievementGameFactCondition = {
  fact: GameFactKey;
  operator: GameFactOperator;
  value?: AchievementConditionValue;
};

export type AchievementGameFactRule = {
  recipient: AchievementRuleRecipient;
  conditions: AchievementGameFactCondition[];
};

type FactKind = "NUMBER" | "GAME_MODE" | "MONARCHY_RULE" | "ROLE" | "COLORS" | "BOOLEAN";

export type GameFactDefinition = {
  label: string;
  shortLabel: string;
  kind: FactKind;
  nullable: boolean;
  integer?: boolean;
  min?: number;
  max?: number;
};

export const GAME_FACT_DEFINITIONS: Record<GameFactKey, GameFactDefinition> = {
  GAME_MODE: { label: "Game → Mode", shortLabel: "Game mode", kind: "GAME_MODE", nullable: false },
  PLAYER_COUNT: { label: "Game → Player quantity", shortLabel: "Player quantity", kind: "NUMBER", nullable: false, integer: true, min: 2, max: 8 },
  MONARCHY_BANDIT_RULE: { label: "Game → Monarchy Bandit rule", shortLabel: "Monarchy Bandit rule", kind: "MONARCHY_RULE", nullable: true },
  WINNER_SEAT: { label: "Winner → Seat", shortLabel: "Winner seat", kind: "NUMBER", nullable: true, integer: true, min: 1, max: 8 },
  WINNER_ROLE: { label: "Winner → Role", shortLabel: "Winner role", kind: "ROLE", nullable: true },
  DECK_BRACKET: { label: "Winner deck → Bracket", shortLabel: "Deck bracket", kind: "NUMBER", nullable: false, integer: true, min: 1, max: 5 },
  DECK_POWER_LEVEL: { label: "Winner deck → EDHPowerLevel", shortLabel: "Deck power level", kind: "NUMBER", nullable: true, min: 0, max: 10 },
  COMMANDER_CMC: { label: "Winner deck → Commander CMC", shortLabel: "Commander CMC", kind: "NUMBER", nullable: true, integer: true, min: 0 },
  COLOR_IDENTITY: { label: "Winner deck → Color identity", shortLabel: "Color identity", kind: "COLORS", nullable: true },
  COLOR_COUNT: { label: "Winner deck → Color count", shortLabel: "Color count", kind: "NUMBER", nullable: true, integer: true, min: 0, max: 5 },
  HAS_PARTNER_COMMANDERS: { label: "Winner deck → Partner commanders", shortLabel: "Partner commanders", kind: "BOOLEAN", nullable: false },
  HAS_COMPANION: { label: "Winner deck → Companion", shortLabel: "Companion", kind: "BOOLEAN", nullable: false },
  HAS_BACKGROUND: { label: "Winner deck → Background", shortLabel: "Background", kind: "BOOLEAN", nullable: false },
};

export const OPERATOR_LABELS: Record<GameFactOperator, string> = {
  EQ: "equals",
  NEQ: "does not equal",
  LT: "is less than",
  LTE: "is at most",
  GT: "is greater than",
  GTE: "is at least",
  BETWEEN: "is between (inclusive)",
  IS_KNOWN: "is known",
  IS_UNKNOWN: "is unknown",
  EXACTLY: "is exactly",
  CONTAINS_ALL: "contains all",
  CONTAINS_ANY: "contains any",
  EXCLUDES_ALL: "contains none of",
  IS_COLORLESS: "is colorless",
};

const numericOperators: GameFactOperator[] = ["EQ", "NEQ", "LT", "LTE", "GT", "GTE", "BETWEEN"];
const nullableOperators: GameFactOperator[] = ["IS_KNOWN", "IS_UNKNOWN"];

export function operatorsForFact(fact: GameFactKey): GameFactOperator[] {
  const definition = GAME_FACT_DEFINITIONS[fact];
  if (definition.kind === "NUMBER") return [...numericOperators, ...(definition.nullable ? nullableOperators : [])];
  if (definition.kind === "COLORS") return ["EXACTLY", "CONTAINS_ALL", "CONTAINS_ANY", "EXCLUDES_ALL", "IS_COLORLESS", ...nullableOperators];
  if (definition.kind === "BOOLEAN") return ["EQ", "NEQ"];
  return ["EQ", "NEQ", ...(definition.nullable ? nullableOperators : [])];
}

export function conditionNeedsValue(operator: GameFactOperator) {
  return !["IS_KNOWN", "IS_UNKNOWN", "IS_COLORLESS"].includes(operator);
}

export function normalizeCondition(condition: AchievementGameFactCondition): AchievementGameFactCondition {
  if (GAME_FACT_DEFINITIONS[condition.fact].kind !== "COLORS" || !Array.isArray(condition.value)) return condition;
  return { ...condition, value: canonicalColorIdentity(condition.value as MtgColor[]) ?? [] };
}

export function validateCondition(condition: AchievementGameFactCondition): string | null {
  const definition = GAME_FACT_DEFINITIONS[condition.fact];
  if (!operatorsForFact(condition.fact).includes(condition.operator)) return `${definition.shortLabel} does not support that operator.`;
  if (!conditionNeedsValue(condition.operator)) return condition.value === undefined ? null : "This operator does not accept a value.";
  if (condition.value === undefined) return "Choose a comparison value.";

  if (definition.kind === "NUMBER") {
    const values = condition.operator === "BETWEEN" ? condition.value : [condition.value];
    if (!Array.isArray(values) || values.length !== (condition.operator === "BETWEEN" ? 2 : 1) || values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      return condition.operator === "BETWEEN" ? "Enter two numeric bounds." : "Enter a numeric value.";
    }
    const numericValues = values as number[];
    if (definition.integer && numericValues.some((value) => !Number.isInteger(value))) return `${definition.shortLabel} requires whole numbers.`;
    if (!definition.integer && numericValues.some((value) => Math.abs(value * 100 - Math.round(value * 100)) > Number.EPSILON)) return `${definition.shortLabel} supports at most two decimal places.`;
    if (definition.min !== undefined && numericValues.some((value) => value < definition.min!)) return `${definition.shortLabel} cannot be below ${definition.min}.`;
    if (definition.max !== undefined && numericValues.some((value) => value > definition.max!)) return `${definition.shortLabel} cannot be above ${definition.max}.`;
    if (condition.operator === "BETWEEN" && numericValues[0] > numericValues[1]) return "The lower bound cannot exceed the upper bound.";
    return null;
  }
  if (definition.kind === "COLORS") {
    if (!Array.isArray(condition.value) || condition.value.some((color) => !MTG_COLORS.includes(color as MtgColor))) return "Choose valid WUBRG colors.";
    const colors = condition.value as MtgColor[];
    if (new Set(colors).size !== colors.length) return "Color values cannot repeat.";
    if (condition.value.length === 0) return "Choose at least one color, or use the colorless operator.";
    return null;
  }
  if (definition.kind === "BOOLEAN") return typeof condition.value === "boolean" ? null : "Choose Yes or No.";
  if (typeof condition.value !== "string") return "Choose a valid value.";
  if (definition.kind === "GAME_MODE") return /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(condition.value) ? null : "Choose a valid game mode.";
  if (definition.kind === "MONARCHY_RULE") return MONARCHY_BANDIT_RULES.includes(condition.value as (typeof MONARCHY_BANDIT_RULES)[number]) ? null : "Choose a valid Bandit rule.";
  return GAME_PARTICIPANT_ROLES.includes(condition.value as (typeof GAME_PARTICIPANT_ROLES)[number]) ? null : "Choose a valid winner role.";
}

export function describeCondition(condition: AchievementGameFactCondition, gameModeNames: Record<string, string> = {}) {
  const definition = GAME_FACT_DEFINITIONS[condition.fact];
  const value = condition.value;
  let formatted = "";
  if (conditionNeedsValue(condition.operator)) {
    if (condition.fact === "GAME_MODE" && typeof value === "string") formatted = gameModeNames[value] ?? value;
    else if (Array.isArray(value)) formatted = condition.operator === "BETWEEN" ? `${value[0]} and ${value[1]}` : value.length ? `{${value.join(",")}}` : "colorless";
    else if (typeof value === "boolean") formatted = value ? "Yes" : "No";
    else formatted = String(value ?? "");
  }
  return `${definition.shortLabel} ${OPERATOR_LABELS[condition.operator]}${formatted ? ` ${formatted}` : ""}`;
}
