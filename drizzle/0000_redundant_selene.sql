CREATE SCHEMA "app";
--> statement-breakpoint
CREATE SCHEMA "private";
--> statement-breakpoint
CREATE TYPE "app"."game_result_kind" AS ENUM('WIN', 'DRAW');--> statement-breakpoint
CREATE TYPE "app"."membership_status" AS ENUM('ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "app"."pod_role" AS ENUM('ADMIN', 'EDITOR', 'GUEST');--> statement-breakpoint
CREATE TABLE "app"."achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_by_player_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "achievements_code_unique" UNIQUE("code"),
	CONSTRAINT "achievements_code_format" CHECK ("app"."achievements"."code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "private"."app_superuser" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"auth_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_superuser_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "app_superuser_singleton" CHECK ("private"."app_superuser"."singleton" = true)
);
--> statement-breakpoint
CREATE TABLE "app"."audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pod_id" uuid,
	"actor_player_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_player_id" uuid NOT NULL,
	"name" text NOT NULL,
	"bracket" integer NOT NULL,
	"power_level" numeric(4, 2) NOT NULL,
	"moxfield_url" text,
	"created_by_player_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "decks_name_length" CHECK (char_length("app"."decks"."name") between 1 and 80),
	CONSTRAINT "decks_bracket_range" CHECK ("app"."decks"."bracket" between 1 and 5),
	CONSTRAINT "decks_power_range" CHECK ("app"."decks"."power_level" between 0 and 10)
);
--> statement-breakpoint
CREATE TABLE "app"."game_participants" (
	"game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"deck_id" uuid NOT NULL,
	"deck_name_snapshot" text NOT NULL,
	"bracket_snapshot" integer NOT NULL,
	"power_level_snapshot" numeric(4, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_participants_game_id_player_id_pk" PRIMARY KEY("game_id","player_id"),
	CONSTRAINT "game_participants_bracket_range" CHECK ("app"."game_participants"."bracket_snapshot" between 1 and 5),
	CONSTRAINT "game_participants_power_range" CHECK ("app"."game_participants"."power_level_snapshot" between 0 and 10)
);
--> statement-breakpoint
CREATE TABLE "app"."games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pod_id" uuid NOT NULL,
	"played_at" timestamp with time zone NOT NULL,
	"result_kind" "app"."game_result_kind" NOT NULL,
	"winner_player_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"created_by_player_id" uuid NOT NULL,
	"updated_by_player_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "games_notes_length" CHECK (char_length("app"."games"."notes") <= 1000),
	CONSTRAINT "games_result_winner_consistency" CHECK (
    ("app"."games"."result_kind" = 'DRAW' and "app"."games"."winner_player_id" is null)
    or ("app"."games"."result_kind" = 'WIN' and "app"."games"."winner_player_id" is not null)
  )
);
--> statement-breakpoint
CREATE TABLE "private"."player_claim_emails" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"email_normalized" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	CONSTRAINT "player_claim_emails_email_normalized_unique" UNIQUE("email_normalized")
);
--> statement-breakpoint
CREATE TABLE "app"."players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" text,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "players_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "players_display_name_length" CHECK (char_length("app"."players"."display_name") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "app"."pod_memberships" (
	"pod_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"role" "app"."pod_role" DEFAULT 'GUEST' NOT NULL,
	"status" "app"."membership_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "pod_memberships_pod_id_player_id_pk" PRIMARY KEY("pod_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "app"."pod_player_achievements" (
	"pod_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"achievement_id" uuid NOT NULL,
	"granted_by_player_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"revoked_by_player_id" uuid,
	"revoked_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "pod_player_achievements_pod_id_player_id_achievement_id_pk" PRIMARY KEY("pod_id","player_id","achievement_id")
);
--> statement-breakpoint
CREATE TABLE "app"."pods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_by_player_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "pods_name_length" CHECK (char_length("app"."pods"."name") between 2 and 80)
);
--> statement-breakpoint
ALTER TABLE "app"."achievements" ADD CONSTRAINT "achievements_created_by_player_id_players_id_fk" FOREIGN KEY ("created_by_player_id") REFERENCES "app"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."audit_events" ADD CONSTRAINT "audit_events_pod_id_pods_id_fk" FOREIGN KEY ("pod_id") REFERENCES "app"."pods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."audit_events" ADD CONSTRAINT "audit_events_actor_player_id_players_id_fk" FOREIGN KEY ("actor_player_id") REFERENCES "app"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."decks" ADD CONSTRAINT "decks_owner_player_id_players_id_fk" FOREIGN KEY ("owner_player_id") REFERENCES "app"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."decks" ADD CONSTRAINT "decks_created_by_player_id_players_id_fk" FOREIGN KEY ("created_by_player_id") REFERENCES "app"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."game_participants" ADD CONSTRAINT "game_participants_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "app"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."game_participants" ADD CONSTRAINT "game_participants_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "app"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."game_participants" ADD CONSTRAINT "game_participants_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "app"."decks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."games" ADD CONSTRAINT "games_pod_id_pods_id_fk" FOREIGN KEY ("pod_id") REFERENCES "app"."pods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."games" ADD CONSTRAINT "games_winner_player_id_players_id_fk" FOREIGN KEY ("winner_player_id") REFERENCES "app"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."games" ADD CONSTRAINT "games_created_by_player_id_players_id_fk" FOREIGN KEY ("created_by_player_id") REFERENCES "app"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."games" ADD CONSTRAINT "games_updated_by_player_id_players_id_fk" FOREIGN KEY ("updated_by_player_id") REFERENCES "app"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."player_claim_emails" ADD CONSTRAINT "player_claim_emails_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "app"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pod_memberships" ADD CONSTRAINT "pod_memberships_pod_id_pods_id_fk" FOREIGN KEY ("pod_id") REFERENCES "app"."pods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pod_memberships" ADD CONSTRAINT "pod_memberships_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "app"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pod_player_achievements" ADD CONSTRAINT "pod_player_achievements_pod_id_pods_id_fk" FOREIGN KEY ("pod_id") REFERENCES "app"."pods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pod_player_achievements" ADD CONSTRAINT "pod_player_achievements_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "app"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pod_player_achievements" ADD CONSTRAINT "pod_player_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "app"."achievements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pod_player_achievements" ADD CONSTRAINT "pod_player_achievements_granted_by_player_id_players_id_fk" FOREIGN KEY ("granted_by_player_id") REFERENCES "app"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pod_player_achievements" ADD CONSTRAINT "pod_player_achievements_revoked_by_player_id_players_id_fk" FOREIGN KEY ("revoked_by_player_id") REFERENCES "app"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pods" ADD CONSTRAINT "pods_created_by_player_id_players_id_fk" FOREIGN KEY ("created_by_player_id") REFERENCES "app"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achievements_display_idx" ON "app"."achievements" USING btree ("archived_at","category","display_order");--> statement-breakpoint
CREATE INDEX "audit_events_pod_created_idx" ON "app"."audit_events" USING btree ("pod_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "app"."audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "decks_active_owner_name_unique" ON "app"."decks" USING btree ("owner_player_id",lower("name")) WHERE "app"."decks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "decks_owner_idx" ON "app"."decks" USING btree ("owner_player_id","archived_at");--> statement-breakpoint
CREATE INDEX "game_participants_player_idx" ON "app"."game_participants" USING btree ("player_id","game_id");--> statement-breakpoint
CREATE INDEX "game_participants_deck_idx" ON "app"."game_participants" USING btree ("deck_id","game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "games_pod_idempotency_unique" ON "app"."games" USING btree ("pod_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "games_pod_played_idx" ON "app"."games" USING btree ("pod_id","archived_at","played_at");--> statement-breakpoint
CREATE INDEX "players_auth_user_idx" ON "app"."players" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "pod_memberships_player_idx" ON "app"."pod_memberships" USING btree ("player_id","status");--> statement-breakpoint
CREATE INDEX "pod_memberships_pod_role_idx" ON "app"."pod_memberships" USING btree ("pod_id","status","role");--> statement-breakpoint
CREATE INDEX "pod_player_achievements_pod_idx" ON "app"."pod_player_achievements" USING btree ("pod_id","revoked_at");--> statement-breakpoint
CREATE INDEX "pods_created_by_idx" ON "app"."pods" USING btree ("created_by_player_id");