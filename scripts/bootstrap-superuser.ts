import { loadEnvConfig } from "@next/env";
import { eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { appSuperuser, playerClaimEmails, players } from "../src/db/schema";

loadEnvConfig(process.cwd());

const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw new Error("Usage: pnpm db:bootstrap-superuser -- owner@example.com");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const db = drizzle({ client: neon(connectionString), schema: { appSuperuser, playerClaimEmails, players } });
const [candidate] = await db.select({ authUserId: players.authUserId })
  .from(playerClaimEmails)
  .innerJoin(players, eq(players.id, playerClaimEmails.playerId))
  .where(eq(playerClaimEmails.emailNormalized, email))
  .limit(1);

if (!candidate?.authUserId) {
  throw new Error("That email has not completed Google sign-in and cannot be bootstrapped.");
}

await db.insert(appSuperuser).values({ authUserId: candidate.authUserId });
console.log(`Superuser bootstrapped for ${email}. Future changes require an operator migration.`);
