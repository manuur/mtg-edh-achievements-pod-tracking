ALTER TABLE app.decks ALTER COLUMN power_level DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE app.game_participants ALTER COLUMN power_level_snapshot DROP NOT NULL;
