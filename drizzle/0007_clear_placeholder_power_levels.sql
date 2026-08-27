UPDATE app.decks
SET power_level = NULL,
  updated_at = now(),
  version = version + 1
WHERE power_level = 5.00;
--> statement-breakpoint
UPDATE app.game_participants
SET power_level_snapshot = NULL
WHERE power_level_snapshot = 5.00;
