export interface DisplayWinner {
  playerId: string;
  playerName: string;
  deckName: string;
}

export function gameResultTitle(resultKind: "WIN" | "DRAW", winners: DisplayWinner[]) {
  if (resultKind === "DRAW") return "Table draw";
  if (winners.length === 1) return `${winners[0].playerName} won with ${winners[0].deckName}`;
  if (winners.length > 1) return `${winners.map((winner) => `${winner.playerName} (${winner.deckName})`).join(" & ")} won`;
  return "Winner unavailable";
}

export function gameDetailTitle(resultKind: "WIN" | "DRAW", winners: DisplayWinner[]) {
  if (resultKind === "DRAW") return "The table drew.";
  if (winners.length === 1) return `${winners[0].playerName} won.`;
  if (winners.length > 1) return `${winners.map((winner) => winner.playerName).join(" & ")} won.`;
  return "The result was recorded.";
}
