import { loadEnvConfig } from "./load-environment";
import { neon } from "@neondatabase/serverless";

loadEnvConfig(process.cwd());

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
const podId = process.argv[2] ?? "40000000-0000-4000-8000-000000000001";
const sql = neon(connectionString);
const rows = await sql`
  explain (analyze, buffers, format json)
  select g.id, g.played_at, count(gp.player_id)
  from app.games g
  join app.game_participants gp on gp.game_id = g.id
  where g.pod_id = ${podId}::uuid and g.archived_at is null
  group by g.id, g.played_at
  order by g.played_at desc
  limit 100
`;

console.log(JSON.stringify(rows[0]?.["QUERY PLAN"] ?? rows, null, 2));
