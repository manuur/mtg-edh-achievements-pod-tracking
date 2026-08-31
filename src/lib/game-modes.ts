export const BUILT_IN_GAME_MODES = ["FREE_FOR_ALL", "PENTAGON", "ASTERISK", "ARCHENEMY", "MONARCHY"] as const;
/** @deprecated Iterate the database catalog at runtime. */
export const GAME_MODES = BUILT_IN_GAME_MODES;
export type BuiltInGameMode = typeof BUILT_IN_GAME_MODES[number];
export type GameMode = string;

export const GAME_PARTICIPANT_ROLES = ["ARCHENEMY", "HERO", "KING", "KINGSGUARD", "TRAITOR", "BANDIT"] as const;
export type GameParticipantRole = typeof GAME_PARTICIPANT_ROLES[number];

export const ACHIEVEMENT_GRANT_SOURCES = ["MANUAL", "AUTOMATIC"] as const;
export type AchievementGrantSource = typeof ACHIEVEMENT_GRANT_SOURCES[number];

export type GameModeWinAchievementRule = {
  winnerRole: GameParticipantRole | null;
  achievementId: string;
};

export const MONARCHY_BANDIT_RULES = ["ALL_BANDITS", "SURVIVING_BANDITS"] as const;
export type MonarchyBanditRule = typeof MONARCHY_BANDIT_RULES[number];

export const GAME_WINNING_CRITERIA = ["ONE_WINNER", "MULTIPLE_WINNERS", "ONE_OR_MORE_WINNERS"] as const;
export type GameWinningCriteria = typeof GAME_WINNING_CRITERIA[number];

export type GameModeCatalogItem = {
  code: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  winningCriteria: GameWinningCriteria;
  systemKey: BuiltInGameMode | null;
  displayOrder: number;
  archivedAt: Date | string | null;
  version: number;
  winAchievementRules: GameModeWinAchievementRule[];
  automationReady: boolean;
};

export const GAME_MODE_DETAILS: Record<BuiltInGameMode, { label: string; shortLabel: string; description: string; playerRule: string; minPlayers: number; maxPlayers: number; winningCriteria: GameWinningCriteria }> = {
  FREE_FOR_ALL: {
    label: "Free-for-all",
    shortLabel: "Free-for-all",
    description: "Every player fights independently. Choose one winner, or record a draw.",
    playerRule: "2–8 players",
    minPlayers: 2,
    maxPlayers: 8,
    winningCriteria: "ONE_WINNER",
  },
  PENTAGON: {
    label: "Pentagon",
    shortLabel: "Pentagon",
    description: "Five players sit in a circle. Adjacent players are allies and the two non-adjacent players are opponents. A player wins when both of their opponents have been defeated.",
    playerRule: "Exactly 5 players",
    minPlayers: 5,
    maxPlayers: 5,
    winningCriteria: "ONE_WINNER",
  },
  ASTERISK: {
    label: "Asterisk",
    shortLabel: "Asterisk",
    description: "Six players form three teams of two. Teammates sit directly opposite each other, cannot attack one another, and do not count as opponents. The winning pair shares the victory.",
    playerRule: "Exactly 6 players",
    minPlayers: 6,
    maxPlayers: 6,
    winningCriteria: "MULTIPLE_WINNERS",
  },
  ARCHENEMY: {
    label: "Archenemy",
    shortLabel: "Archenemy",
    description: "One player is the Archenemy and everyone else forms the Heroes team. The Archenemy wins alone, or all Heroes share the victory.",
    playerRule: "3–8 players",
    minPlayers: 3,
    maxPlayers: 8,
    winningCriteria: "ONE_OR_MORE_WINNERS",
  },
  MONARCHY: {
    label: "Monarchy",
    shortLabel: "Monarchy",
    description: "Six players have hidden roles: King, Kingsguard, Traitor, and three Bandits. Each role has its own victory condition, and Bandit victories follow the selected rule.",
    playerRule: "Exactly 6 players",
    minPlayers: 6,
    maxPlayers: 6,
    winningCriteria: "ONE_OR_MORE_WINNERS",
  },
};

export const DEFAULT_GAME_MODE_CATALOG: GameModeCatalogItem[] = BUILT_IN_GAME_MODES.map((code, index) => ({
  code,
  name: GAME_MODE_DETAILS[code].label,
  description: GAME_MODE_DETAILS[code].description,
  minPlayers: GAME_MODE_DETAILS[code].minPlayers,
  maxPlayers: GAME_MODE_DETAILS[code].maxPlayers,
  winningCriteria: GAME_MODE_DETAILS[code].winningCriteria,
  systemKey: code,
  displayOrder: (index + 1) * 10,
  archivedAt: null,
  version: 1,
  winAchievementRules: [],
  automationReady: code !== "ARCHENEMY" && code !== "MONARCHY",
}));

export const GAME_WINNING_CRITERIA_LABELS: Record<GameWinningCriteria, string> = {
  ONE_WINNER: "Exactly one winner",
  MULTIPLE_WINNERS: "Two or more winners",
  ONE_OR_MORE_WINNERS: "One or more winners",
};

export const GAME_ROLE_LABELS: Record<GameParticipantRole, string> = {
  ARCHENEMY: "Archenemy",
  HERO: "Hero",
  KING: "King",
  KINGSGUARD: "Kingsguard",
  TRAITOR: "Traitor",
  BANDIT: "Bandit",
};

export function playerRule(mode: Pick<GameModeCatalogItem, "minPlayers" | "maxPlayers">) {
  return mode.minPlayers === mode.maxPlayers ? `Exactly ${mode.minPlayers} players` : `${mode.minPlayers}–${mode.maxPlayers} players`;
}

export function requiredPlayerCount(mode: Pick<GameModeCatalogItem, "minPlayers" | "maxPlayers">) {
  return mode.minPlayers === mode.maxPlayers ? mode.minPlayers : null;
}

export function modeUsesSeats(systemKey: BuiltInGameMode | null) {
  return systemKey === "PENTAGON" || systemKey === "ASTERISK";
}

export function requiredAchievementRoles(systemKey: BuiltInGameMode | null): GameParticipantRole[] {
  if (systemKey === "ARCHENEMY") return ["ARCHENEMY", "HERO"];
  if (systemKey === "MONARCHY") return ["KING", "KINGSGUARD", "TRAITOR", "BANDIT"];
  return [];
}

export function isBuiltInGameMode(value: string): value is BuiltInGameMode {
  return (BUILT_IN_GAME_MODES as readonly string[]).includes(value);
}
