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
    to_regprocedure('private.hard_delete_player(text,uuid,integer,text)') is not null as player_purge_ready,
    to_regprocedure('private.hard_delete_achievement(text,uuid,integer,text)') is not null as achievement_purge_ready,
    to_regprocedure('private.validate_achievement_game()') is not null as achievement_game_guard_ready,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'app' and table_name = 'pod_player_achievements'
        and column_name = 'game_id' and is_nullable = 'NO'
    ) as achievement_game_required,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'app' and table_name = 'decks'
        and column_name = 'power_level' and is_nullable = 'YES'
    ) as deck_power_optional,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'app' and table_name = 'game_participants'
        and column_name = 'power_level_snapshot' and is_nullable = 'YES'
    ) as snapshot_power_optional,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'app' and table_name = 'players'
        and column_name = 'theme_preference' and is_nullable = 'NO'
        and udt_schema = 'app' and udt_name = 'theme_preference'
    ) as persisted_theme_preference,
    exists (select 1 from pg_constraint where conname = 'pod_player_achievements_game_pod_fk') as achievement_game_pod_fk_ready,
    exists (select 1 from pg_constraint where conname = 'pod_player_achievements_game_player_fk') as achievement_game_player_fk_ready,
    has_table_privilege(current_user, 'neon_auth."user"', 'DELETE') as auth_user_delete_ready,
    not has_function_privilege('authenticated', 'private.hard_delete_player(text,uuid,integer,text)', 'EXECUTE') as player_purge_private,
    not has_function_privilege('authenticated', 'private.hard_delete_achievement(text,uuid,integer,text)', 'EXECUTE') as achievement_purge_private,
    (select count(*) from pg_tables where schemaname = 'app' and rowsecurity) as rls_table_count,
    (select pg_get_constraintdef(oid) from pg_constraint where conname = 'player_claim_email_normalized') as claim_email_constraint,
    (select pg_get_constraintdef(oid) from pg_constraint where conname = 'decks_moxfield_https_url') as moxfield_constraint
`;

const claimEmailConstraint = String(state?.claim_email_constraint ?? "");
const moxfieldConstraint = String(state?.moxfield_constraint ?? "");
if (
  !state?.schema_ready
  || !state?.game_api_ready
  || !state?.membership_api_ready
  || !state?.player_purge_ready
  || !state?.achievement_purge_ready
  || !state?.achievement_game_guard_ready
  || !state?.achievement_game_required
  || !state?.deck_power_optional
  || !state?.snapshot_power_optional
  || !state?.persisted_theme_preference
  || !state?.achievement_game_pod_fk_ready
  || !state?.achievement_game_player_fk_ready
  || !state?.auth_user_delete_ready
  || !state?.player_purge_private
  || !state?.achievement_purge_private
  || Number(state?.rls_table_count) < 9
  || !claimEmailConstraint.includes("[.]")
  || !moxfieldConstraint.includes("moxfield[.]com")
) {
  throw new Error(`Database verification failed: ${JSON.stringify(state)}`);
}
console.log("Database schema, persisted theme preferences, optional deck power levels, validation constraints, game-backed achievement grants, transactional APIs, Superadmin purge functions, and RLS are installed.");
