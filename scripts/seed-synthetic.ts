import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { decks, gameParticipants, games, players, podMemberships, pods } from "../src/db/schema";

loadEnvConfig(process.cwd());

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
const db = drizzle(neon(connectionString));
const playerCount = 16;
const gameCount = 500;
const podId = "40000000-0000-4000-8000-000000000001";
const playerId = (index: number) => `41000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
const deckId = (index: number) => `42000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
const gameId = (index: number) => `43000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
const idempotencyId = (index: number) => `44000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;

const playerRows = Array.from({ length: playerCount }, (_, index) => ({
  id: playerId(index),
  displayName: `Fixture Player ${index + 1}`,
  ...(index === 0 && { authUserId: "synthetic-fixture-owner" }),
}));
const deckRows = Array.from({ length: playerCount * 3 }, (_, index) => ({
  id: deckId(index),
  ownerPlayerId: playerId(Math.floor(index / 3)),
  name: `Fixture Deck ${index + 1}`,
  bracket: index % 5 + 1,
  powerLevel: Number((4.5 + index % 12 * 0.45).toFixed(2)),
  createdByPlayerId: playerId(0),
}));
const gameRows = Array.from({ length: gameCount }, (_, index) => {
  const participants = Array.from({ length: 4 }, (__, seat) => (index + seat * 3) % playerCount);
  return {
    id: gameId(index), podId,
    playedAt: new Date(Date.UTC(2025, 0, 1) + index * 86_400_000),
    resultKind: index % 11 === 0 ? "DRAW" as const : "WIN" as const,
    winnerPlayerId: index % 11 === 0 ? null : playerId(participants[index % 4]),
    notes: "Synthetic metrics fixture",
    idempotencyKey: idempotencyId(index),
    createdByPlayerId: playerId(0), updatedByPlayerId: playerId(0),
  };
});
const participantRows = gameRows.flatMap((game, gameIndex) => Array.from({ length: 4 }, (_, seat) => {
  const ownerIndex = (gameIndex + seat * 3) % playerCount;
  const selectedDeck = deckRows[ownerIndex * 3 + gameIndex % 3];
  return {
    gameId: game.id,
    playerId: playerId(ownerIndex),
    deckId: selectedDeck.id,
    deckNameSnapshot: selectedDeck.name,
    bracketSnapshot: selectedDeck.bracket,
    powerLevelSnapshot: selectedDeck.powerLevel,
  };
}));

await db.batch([
  db.insert(players).values(playerRows).onConflictDoNothing(),
  db.insert(pods).values({ id: podId, name: "Synthetic Performance POD", timezone: "UTC", createdByPlayerId: playerId(0) }).onConflictDoNothing(),
  db.insert(podMemberships).values(playerRows.map((player, index) => ({ podId, playerId: player.id, role: index === 0 ? "ADMIN" as const : "GUEST" as const }))).onConflictDoNothing(),
  db.insert(decks).values(deckRows).onConflictDoNothing(),
  db.insert(games).values(gameRows).onConflictDoNothing(),
  db.insert(gameParticipants).values(participantRows).onConflictDoNothing(),
]);

console.log(`Synthetic fixture ready: ${playerCount} players, ${deckRows.length} decks, ${gameCount} games.`);
