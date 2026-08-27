CREATE TYPE app.theme_preference AS ENUM ('SYSTEM', 'LIGHT', 'DARK');
--> statement-breakpoint
ALTER TABLE app.players
  ADD COLUMN theme_preference app.theme_preference NOT NULL DEFAULT 'SYSTEM';
