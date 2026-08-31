import { loadEnvConfig } from "./load-environment";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { achievementCategories, achievements, decks, players, podMemberships, pods } from "../src/db/schema";

loadEnvConfig(process.cwd());

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const db = drizzle(neon(connectionString));
const ownerId = "10000000-0000-4000-8000-000000000001";
const guestId = "10000000-0000-4000-8000-000000000002";
const podId = "20000000-0000-4000-8000-000000000001";

await db.batch([
  db.insert(players).values([
    { id: ownerId, displayName: "Local Owner", authUserId: process.env.DEV_USER_ID ?? "00000000-0000-4000-8000-000000000001" },
    { id: guestId, displayName: "Sample Guest" },
  ]).onConflictDoNothing(),
  db.insert(pods).values({ id: podId, name: "Friday Night Pod", timezone: "America/Argentina/Buenos_Aires", createdByPlayerId: ownerId }).onConflictDoNothing(),
  db.insert(podMemberships).values([
    { podId, playerId: ownerId, role: "ADMIN" },
    { podId, playerId: guestId, role: "GUEST" },
  ]).onConflictDoNothing(),
  db.insert(decks).values([
    { ownerPlayerId: ownerId, name: "Atraxa Counters", bracket: 3, powerLevel: 7.25, createdByPlayerId: ownerId },
    { ownerPlayerId: guestId, name: "Krenko Goblins", bracket: 3, powerLevel: 7, createdByPlayerId: ownerId },
  ]).onConflictDoNothing(),
  db.insert(achievementCategories).values([
    { name: "Table moments", displayOrder: 10 },
    { name: "Comebacks", displayOrder: 20 },
    { name: "Oddities", displayOrder: 30 },
  ]).onConflictDoNothing(),
  db.insert(achievements).values([
    { code: "first-blood", name: "First Blood", description: "Be the first player eliminated from a game.", category: "Table moments", displayOrder: 10, createdByPlayerId: ownerId },
    { code: "against-the-odds", name: "Against the Odds", description: "Win after being clearly behind.", category: "Comebacks", displayOrder: 20, createdByPlayerId: ownerId },
    { code: "everybody-draws", name: "Everybody Draws", description: "Take part in a drawn game.", category: "Oddities", displayOrder: 30, createdByPlayerId: ownerId },
  ]).onConflictDoNothing(),
]);

console.log("Representative development fixtures are ready.");
