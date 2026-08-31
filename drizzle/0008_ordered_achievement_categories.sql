CREATE TABLE app.achievement_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT achievement_categories_name_unique UNIQUE (name),
  CONSTRAINT achievement_categories_name_length CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT achievement_categories_order_nonnegative CHECK (display_order >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX achievement_categories_name_ci_unique
  ON app.achievement_categories (lower(name));
--> statement-breakpoint
CREATE INDEX achievement_categories_display_idx
  ON app.achievement_categories (display_order, name);
--> statement-breakpoint
WITH canonical AS (
  SELECT lower(category) AS category_key, min(category) AS name, min(display_order) AS first_order
  FROM app.achievements
  GROUP BY lower(category)
), ordered AS (
  SELECT name, row_number() OVER (ORDER BY first_order, name) * 10 AS display_order
  FROM canonical
)
INSERT INTO app.achievement_categories (name, display_order)
SELECT name, display_order::integer FROM ordered;
--> statement-breakpoint
INSERT INTO app.achievement_categories (name, display_order)
SELECT 'General', COALESCE((SELECT max(display_order) + 10 FROM app.achievement_categories), 10)
WHERE NOT EXISTS (SELECT 1 FROM app.achievement_categories);
--> statement-breakpoint
WITH canonical AS (
  SELECT lower(category) AS category_key, min(category) AS name
  FROM app.achievements
  GROUP BY lower(category)
)
UPDATE app.achievements achievement
SET category = canonical.name
FROM canonical
WHERE lower(achievement.category) = canonical.category_key
  AND achievement.category IS DISTINCT FROM canonical.name;
--> statement-breakpoint
ALTER TABLE app.achievements
  ADD CONSTRAINT achievements_category_achievement_categories_name_fk
  FOREIGN KEY (category) REFERENCES app.achievement_categories(name)
  ON UPDATE CASCADE ON DELETE RESTRICT;
--> statement-breakpoint
CREATE VIEW api.achievement_categories WITH (security_invoker = true) AS
SELECT id, name, display_order, created_at, updated_at, version
FROM app.achievement_categories;
--> statement-breakpoint
ALTER TABLE app.achievement_categories ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY achievement_categories_read_authenticated ON app.achievement_categories FOR SELECT
USING (private.current_player_id() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY achievement_categories_superuser_write ON app.achievement_categories FOR ALL
USING (private.is_superuser()) WITH CHECK (private.is_superuser());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE ON app.achievement_categories TO authenticated;
    GRANT SELECT ON api.achievement_categories TO authenticated;
  END IF;
END
$$;
