import { loadEnvConfig } from "./load-environment";
import { neon } from "@neondatabase/serverless";

loadEnvConfig(process.cwd());

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
const sql = neon(connectionString);

const [state] = await sql`
  select
    to_regclass('app.players') is not null as schema_ready,
    to_regprocedure('api.create_game(uuid,uuid,timestamp with time zone,app.game_result_kind,uuid,text,uuid,jsonb)') is not null as game_api_ready,
    to_regprocedure('api.add_pod_member(uuid,uuid,text,text,app.pod_role)') is not null as membership_api_ready,
    (select count(*) from pg_tables where schemaname = 'app' and rowsecurity) as rls_table_count
`;

if (!state?.schema_ready || !state?.game_api_ready || !state?.membership_api_ready || Number(state?.rls_table_count) < 9) {
  throw new Error(`Database verification failed: ${JSON.stringify(state)}`);
}
console.log("Database schema, transactional membership/game APIs, and RLS are installed.");
