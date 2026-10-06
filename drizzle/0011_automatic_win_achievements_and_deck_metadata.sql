CREATE TYPE app.achievement_automation_rule_type AS ENUM ('GAME_MODE_WIN');
--> statement-breakpoint
CREATE TYPE app.achievement_grant_source AS ENUM ('MANUAL', 'AUTOMATIC');
--> statement-breakpoint
CREATE TYPE app.achievement_revocation_source AS ENUM ('MANUAL', 'AUTOMATIC');
--> statement-breakpoint
ALTER TABLE app.decks
  ADD COLUMN commander_cmc integer,
  ADD COLUMN color_identity text[];
--> statement-breakpoint
ALTER TABLE app.decks
  ADD CONSTRAINT decks_commander_cmc_nonnegative CHECK (commander_cmc >= 0),
  ADD CONSTRAINT decks_color_identity_valid CHECK (
    color_identity IS NULL OR (
      array_position(color_identity, NULL) IS NULL
      AND array_to_string(color_identity, '') ~ '^W?U?B?R?G?$'
    )
  );
--> statement-breakpoint
ALTER TABLE app.game_participants
  ADD COLUMN commander_cmc_snapshot integer,
  ADD COLUMN color_identity_snapshot text[];
--> statement-breakpoint
ALTER TABLE app.game_participants
  ADD CONSTRAINT game_participants_commander_cmc_nonnegative CHECK (commander_cmc_snapshot >= 0),
  ADD CONSTRAINT game_participants_color_identity_valid CHECK (
    color_identity_snapshot IS NULL OR (
      array_position(color_identity_snapshot, NULL) IS NULL
      AND array_to_string(color_identity_snapshot, '') ~ '^W?U?B?R?G?$'
    )
  );
--> statement-breakpoint
CREATE TABLE app.achievement_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_id uuid NOT NULL REFERENCES app.achievements(id) ON DELETE CASCADE,
  rule_type app.achievement_automation_rule_type NOT NULL,
  created_by_player_id uuid REFERENCES app.players(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  version integer NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE INDEX achievement_automation_rules_achievement_idx
  ON app.achievement_automation_rules (achievement_id, archived_at);
--> statement-breakpoint
CREATE TABLE app.game_mode_win_achievement_rules (
  rule_id uuid PRIMARY KEY REFERENCES app.achievement_automation_rules(id) ON DELETE CASCADE,
  game_mode_code text NOT NULL REFERENCES app.game_modes(code) ON DELETE CASCADE,
  winner_role app.game_participant_role
);
--> statement-breakpoint
CREATE UNIQUE INDEX game_mode_win_achievement_rules_role_slot_unique
  ON app.game_mode_win_achievement_rules (game_mode_code, winner_role)
  WHERE winner_role IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX game_mode_win_achievement_rules_general_slot_unique
  ON app.game_mode_win_achievement_rules (game_mode_code)
  WHERE winner_role IS NULL;
--> statement-breakpoint
CREATE INDEX game_mode_win_achievement_rules_mode_idx
  ON app.game_mode_win_achievement_rules (game_mode_code);
--> statement-breakpoint
CREATE TABLE app.game_achievement_rule_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES app.games(id) ON DELETE CASCADE,
  game_mode_code text NOT NULL,
  achievement_id uuid NOT NULL REFERENCES app.achievements(id) ON DELETE CASCADE,
  rule_type app.achievement_automation_rule_type NOT NULL,
  winner_role app.game_participant_role,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_achievement_rule_snapshots_identity_unique UNIQUE (id, game_id, achievement_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX game_achievement_rule_snapshots_role_slot_unique
  ON app.game_achievement_rule_snapshots (game_id, winner_role)
  WHERE winner_role IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX game_achievement_rule_snapshots_general_slot_unique
  ON app.game_achievement_rule_snapshots (game_id)
  WHERE winner_role IS NULL;
--> statement-breakpoint
CREATE INDEX game_achievement_rule_snapshots_candidate_idx
  ON app.game_achievement_rule_snapshots (achievement_id, game_id);
--> statement-breakpoint
ALTER TABLE app.pod_player_achievements
  ALTER COLUMN granted_by_player_id DROP NOT NULL,
  ADD COLUMN grant_source app.achievement_grant_source NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN automatic_snapshot_id uuid,
  ADD COLUMN revocation_source app.achievement_revocation_source;
--> statement-breakpoint
UPDATE app.pod_player_achievements
SET revocation_source = 'MANUAL'
WHERE revoked_at IS NOT NULL;
--> statement-breakpoint
ALTER TABLE app.pod_player_achievements
  ADD CONSTRAINT pod_player_achievements_automatic_snapshot_fk
  FOREIGN KEY (automatic_snapshot_id, game_id, achievement_id)
  REFERENCES app.game_achievement_rule_snapshots (id, game_id, achievement_id)
  ON DELETE CASCADE,
  ADD CONSTRAINT pod_player_achievements_grant_attribution CHECK (
    (grant_source = 'MANUAL' AND granted_by_player_id IS NOT NULL AND automatic_snapshot_id IS NULL)
    OR (grant_source = 'AUTOMATIC' AND granted_by_player_id IS NULL AND automatic_snapshot_id IS NOT NULL)
  ),
  ADD CONSTRAINT pod_player_achievements_revocation_attribution CHECK (
    (revoked_at IS NULL AND revocation_source IS NULL AND revoked_by_player_id IS NULL)
    OR (revoked_at IS NOT NULL AND (
      (revocation_source = 'MANUAL' AND revoked_by_player_id IS NOT NULL)
      OR (revocation_source = 'AUTOMATIC' AND revoked_by_player_id IS NULL)
    ))
  );
--> statement-breakpoint
CREATE TABLE app.automatic_achievement_suppressions (
  pod_id uuid NOT NULL REFERENCES app.pods(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES app.players(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES app.achievements(id) ON DELETE CASCADE,
  suppressed_by_player_id uuid REFERENCES app.players(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pod_id, player_id, achievement_id)
);
--> statement-breakpoint
INSERT INTO app.automatic_achievement_suppressions (pod_id, player_id, achievement_id, suppressed_by_player_id, created_at)
SELECT pod_id, player_id, achievement_id, revoked_by_player_id, revoked_at
FROM app.pod_player_achievements
WHERE revoked_at IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE app.achievement_automation_rules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.game_mode_win_achievement_rules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.game_achievement_rule_snapshots ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.automatic_achievement_suppressions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY achievement_automation_rules_read_authenticated ON app.achievement_automation_rules FOR SELECT
USING (private.current_player_id() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY achievement_automation_rules_superuser_write ON app.achievement_automation_rules FOR ALL
USING (private.is_superuser()) WITH CHECK (private.is_superuser());
--> statement-breakpoint
CREATE POLICY game_mode_win_rules_read_authenticated ON app.game_mode_win_achievement_rules FOR SELECT
USING (private.current_player_id() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY game_mode_win_rules_superuser_write ON app.game_mode_win_achievement_rules FOR ALL
USING (private.is_superuser()) WITH CHECK (private.is_superuser());
--> statement-breakpoint
CREATE POLICY game_achievement_rule_snapshots_read_member ON app.game_achievement_rule_snapshots FOR SELECT
USING (EXISTS (
  SELECT 1 FROM app.games game
  WHERE game.id = game_id AND private.has_pod_role(game.pod_id, 'GUEST')
));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.required_game_mode_achievement_roles(p_system_key text)
RETURNS app.game_participant_role[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE p_system_key
    WHEN 'ARCHENEMY' THEN ARRAY['ARCHENEMY', 'HERO']::app.game_participant_role[]
    WHEN 'MONARCHY' THEN ARRAY['KING', 'KINGSGUARD', 'TRAITOR', 'BANDIT']::app.game_participant_role[]
    ELSE ARRAY[]::app.game_participant_role[]
  END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.assert_game_mode_automation_ready(p_game_mode_code text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $$
DECLARE
  v_mode app.game_modes%ROWTYPE;
  v_required_roles app.game_participant_role[];
BEGIN
  SELECT * INTO v_mode FROM app.game_modes WHERE code = p_game_mode_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'game mode does not exist' USING ERRCODE = '23514';
  END IF;
  v_required_roles := private.required_game_mode_achievement_roles(v_mode.system_key);
  IF cardinality(v_required_roles) > 0 AND EXISTS (
    SELECT 1 FROM unnest(v_required_roles) role_name
    WHERE NOT EXISTS (
      SELECT 1
      FROM app.game_mode_win_achievement_rules mode_rule
      JOIN app.achievement_automation_rules rule ON rule.id = mode_rule.rule_id
      JOIN app.achievements achievement ON achievement.id = rule.achievement_id
      WHERE mode_rule.game_mode_code = p_game_mode_code
        AND mode_rule.winner_role = role_name
        AND rule.rule_type = 'GAME_MODE_WIN'
        AND rule.archived_at IS NULL
        AND achievement.archived_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION '% requires an active win achievement for every role', v_mode.name
      USING ERRCODE = '23514', CONSTRAINT = 'game_mode_automation_configuration_required';
  END IF;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.set_game_mode_win_achievement_rules(
  p_actor_player_id uuid,
  p_game_mode_code text,
  p_rules jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $$
DECLARE
  v_mode app.game_modes%ROWTYPE;
  v_rule jsonb;
  v_rule_id uuid;
  v_role app.game_participant_role;
  v_achievement_id uuid;
  v_required_roles app.game_participant_role[];
  v_rule_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app.players player
    JOIN private.app_superuser superadmin ON superadmin.auth_user_id = player.auth_user_id
    WHERE player.id = p_actor_player_id AND player.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'superadmin access is required' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_mode FROM app.game_modes WHERE code = p_game_mode_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'game mode not found' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(COALESCE(p_rules, '[]'::jsonb)) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'win achievement rules must be an array' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_rule_count FROM jsonb_array_elements(COALESCE(p_rules, '[]'::jsonb));
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_rules, '[]'::jsonb)) item
    GROUP BY COALESCE(item->>'winnerRole', 'GENERAL') HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'each winning role can have only one achievement' USING ERRCODE = '23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_rules, '[]'::jsonb)) item
    GROUP BY item->>'achievementId' HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'one game mode cannot reuse the same achievement for multiple roles' USING ERRCODE = '23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_rules, '[]'::jsonb)) item
    LEFT JOIN app.achievements achievement ON achievement.id = (item->>'achievementId')::uuid AND achievement.archived_at IS NULL
    WHERE achievement.id IS NULL
  ) THEN RAISE EXCEPTION 'choose only active achievements' USING ERRCODE = '23514'; END IF;

  v_required_roles := private.required_game_mode_achievement_roles(v_mode.system_key);
  IF cardinality(v_required_roles) = 0 THEN
    IF v_rule_count > 1 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(p_rules, '[]'::jsonb)) item
      WHERE item->>'winnerRole' IS NOT NULL
    ) THEN RAISE EXCEPTION 'this game mode accepts only one general win achievement' USING ERRCODE = '23514'; END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(p_rules, '[]'::jsonb)) item
      WHERE item->>'winnerRole' IS NULL
        OR NOT ((item->>'winnerRole')::app.game_participant_role = ANY (v_required_roles))
    ) THEN RAISE EXCEPTION 'role-based game modes require role-specific achievements' USING ERRCODE = '23514'; END IF;
    IF v_mode.archived_at IS NULL AND (
      v_rule_count <> cardinality(v_required_roles)
      OR EXISTS (
        SELECT 1 FROM unnest(v_required_roles) role_name
        WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(p_rules, '[]'::jsonb)) item
          WHERE (item->>'winnerRole')::app.game_participant_role = role_name
        )
      )
    ) THEN RAISE EXCEPTION 'active role-based modes require a win achievement for every role' USING ERRCODE = '23514'; END IF;
  END IF;

  DELETE FROM app.achievement_automation_rules rule
  WHERE rule.id IN (
    SELECT mode_rule.rule_id FROM app.game_mode_win_achievement_rules mode_rule
    WHERE mode_rule.game_mode_code = p_game_mode_code
  );

  FOR v_rule IN SELECT value FROM jsonb_array_elements(COALESCE(p_rules, '[]'::jsonb)) LOOP
    v_role := (v_rule->>'winnerRole')::app.game_participant_role;
    v_achievement_id := (v_rule->>'achievementId')::uuid;
    INSERT INTO app.achievement_automation_rules (achievement_id, rule_type, created_by_player_id)
    VALUES (v_achievement_id, 'GAME_MODE_WIN', p_actor_player_id)
    RETURNING id INTO v_rule_id;
    INSERT INTO app.game_mode_win_achievement_rules (rule_id, game_mode_code, winner_role)
    VALUES (v_rule_id, p_game_mode_code, v_role);
  END LOOP;

  INSERT INTO app.audit_events (actor_player_id, action, entity_type, entity_id, metadata)
  VALUES (p_actor_player_id, 'GAME_MODE_WIN_ACHIEVEMENTS_UPDATED', 'game_mode', p_game_mode_code,
    jsonb_build_object('rules', COALESCE(p_rules, '[]'::jsonb)));
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.protect_mapped_achievement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM app.achievement_automation_rules rule
    JOIN app.game_mode_win_achievement_rules mode_rule ON mode_rule.rule_id = rule.id
    JOIN app.game_modes mode ON mode.code = mode_rule.game_mode_code
    WHERE rule.achievement_id = OLD.id AND mode.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'achievement is assigned to an active game mode'
      USING ERRCODE = '23503', CONSTRAINT = 'achievement_in_use';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.create_game_mode_with_achievements(
  p_actor_player_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_min_players integer,
  p_max_players integer,
  p_winning_criteria app.game_winning_criteria,
  p_rules jsonb
)
RETURNS app.game_modes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $$
DECLARE
  v_mode app.game_modes%ROWTYPE;
BEGIN
  INSERT INTO app.game_modes (
    code, name, description, min_players, max_players, winning_criteria,
    display_order, created_by_player_id
  ) VALUES (
    p_code, p_name, p_description, p_min_players, p_max_players, p_winning_criteria,
    COALESCE((SELECT max(display_order) + 10 FROM app.game_modes), 10), p_actor_player_id
  ) RETURNING * INTO v_mode;
  PERFORM private.set_game_mode_win_achievement_rules(p_actor_player_id, p_code, p_rules);
  INSERT INTO app.audit_events (actor_player_id, action, entity_type, entity_id, metadata)
  VALUES (p_actor_player_id, 'GAME_MODE_CREATED', 'game_mode', p_code,
    jsonb_build_object('name', p_name, 'minPlayers', p_min_players, 'maxPlayers', p_max_players, 'winningCriteria', p_winning_criteria));
  RETURN v_mode;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.update_game_mode_with_achievements(
  p_actor_player_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_min_players integer,
  p_max_players integer,
  p_winning_criteria app.game_winning_criteria,
  p_archived_at timestamptz,
  p_expected_version integer,
  p_rules jsonb
)
RETURNS app.game_modes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $$
DECLARE
  v_mode app.game_modes%ROWTYPE;
  v_previous_archived_at timestamptz;
BEGIN
  SELECT archived_at INTO v_previous_archived_at FROM app.game_modes WHERE code = p_code;
  UPDATE app.game_modes SET
    name = p_name,
    description = p_description,
    min_players = p_min_players,
    max_players = p_max_players,
    winning_criteria = p_winning_criteria,
    archived_at = p_archived_at,
    updated_at = now(),
    version = version + 1
  WHERE code = p_code AND version = p_expected_version
  RETURNING * INTO v_mode;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM private.set_game_mode_win_achievement_rules(p_actor_player_id, p_code, p_rules);
  INSERT INTO app.audit_events (actor_player_id, action, entity_type, entity_id, metadata)
  VALUES (p_actor_player_id,
    CASE
      WHEN v_previous_archived_at IS NULL AND p_archived_at IS NOT NULL THEN 'GAME_MODE_ARCHIVED'
      WHEN v_previous_archived_at IS NOT NULL AND p_archived_at IS NULL THEN 'GAME_MODE_RESTORED'
      ELSE 'GAME_MODE_UPDATED'
    END,
    'game_mode', p_code,
    jsonb_build_object('name', p_name, 'minPlayers', p_min_players, 'maxPlayers', p_max_players, 'winningCriteria', p_winning_criteria));
  RETURN v_mode;
END
$$;
--> statement-breakpoint
CREATE TRIGGER achievements_active_mode_guard
BEFORE UPDATE OF archived_at OR DELETE ON app.achievements
FOR EACH ROW EXECUTE FUNCTION private.protect_mapped_achievement();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.validate_achievement_game()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app.games game
    JOIN app.game_participants participant ON participant.game_id = game.id AND participant.player_id = NEW.player_id
    WHERE game.id = NEW.game_id AND game.pod_id = NEW.pod_id AND game.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'achievement grants require an active game in this POD in which the player participated'
      USING ERRCODE = '23514', CONSTRAINT = 'achievement_grant_requires_active_participating_game';
  END IF;
  IF NEW.grant_source = 'AUTOMATIC' AND NOT EXISTS (
    SELECT 1 FROM app.game_achievement_rule_snapshots snapshot
    JOIN app.game_participants participant
      ON participant.game_id = snapshot.game_id AND participant.player_id = NEW.player_id
    JOIN app.games game ON game.id = snapshot.game_id
    WHERE snapshot.id = NEW.automatic_snapshot_id
      AND snapshot.game_id = NEW.game_id
      AND snapshot.game_mode_code = game.game_mode
      AND snapshot.achievement_id = NEW.achievement_id
      AND game.result_kind = 'WIN'
      AND game.archived_at IS NULL
      AND participant.is_winner
      AND (snapshot.winner_role IS NULL OR snapshot.winner_role = participant.mode_role)
  ) THEN
    RAISE EXCEPTION 'automatic achievement grants require a matching winning rule snapshot'
      USING ERRCODE = '23514', CONSTRAINT = 'automatic_achievement_requires_matching_snapshot';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
DROP TRIGGER achievement_grant_game_guard ON app.pod_player_achievements;
--> statement-breakpoint
CREATE TRIGGER achievement_grant_game_guard
BEFORE INSERT OR UPDATE OF game_id, pod_id, player_id, achievement_id, grant_source, automatic_snapshot_id
ON app.pod_player_achievements
FOR EACH ROW EXECUTE FUNCTION private.validate_achievement_game();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.reconcile_automatic_achievement_grants(
  p_pod_id uuid,
  p_actor_player_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $$
DECLARE
  v_grant record;
  v_candidate record;
BEGIN
  FOR v_grant IN
    SELECT * FROM app.pod_player_achievements grant_row
    WHERE grant_row.pod_id = p_pod_id
      AND grant_row.grant_source = 'AUTOMATIC'
      AND grant_row.revocation_source IS DISTINCT FROM 'MANUAL'
      AND NOT EXISTS (
        SELECT 1 FROM app.automatic_achievement_suppressions suppression
        WHERE suppression.pod_id = grant_row.pod_id
          AND suppression.player_id = grant_row.player_id
          AND suppression.achievement_id = grant_row.achievement_id
      )
    FOR UPDATE
  LOOP
    SELECT snapshot.id AS snapshot_id, game.id AS game_id
    INTO v_candidate
    FROM app.game_achievement_rule_snapshots snapshot
    JOIN app.games game ON game.id = snapshot.game_id
    JOIN app.game_participants participant
      ON participant.game_id = game.id AND participant.player_id = v_grant.player_id
    WHERE game.pod_id = p_pod_id
      AND snapshot.achievement_id = v_grant.achievement_id
      AND snapshot.game_mode_code = game.game_mode
      AND game.archived_at IS NULL
      AND game.result_kind = 'WIN'
      AND participant.is_winner
      AND (snapshot.winner_role IS NULL OR snapshot.winner_role = participant.mode_role)
    ORDER BY game.played_at, game.id
    LIMIT 1;

    IF FOUND THEN
      IF v_grant.revoked_at IS NOT NULL OR v_grant.game_id <> v_candidate.game_id OR v_grant.automatic_snapshot_id <> v_candidate.snapshot_id THEN
        UPDATE app.pod_player_achievements SET
          game_id = v_candidate.game_id,
          automatic_snapshot_id = v_candidate.snapshot_id,
          granted_at = CASE WHEN v_grant.revoked_at IS NOT NULL THEN now() ELSE granted_at END,
          revoked_by_player_id = NULL,
          revoked_at = NULL,
          revocation_source = NULL,
          version = version + 1
        WHERE pod_id = v_grant.pod_id AND player_id = v_grant.player_id AND achievement_id = v_grant.achievement_id;
        INSERT INTO app.audit_events (pod_id, actor_player_id, action, entity_type, entity_id, metadata)
        VALUES (p_pod_id, p_actor_player_id,
          CASE WHEN v_grant.revoked_at IS NOT NULL THEN 'ACHIEVEMENT_AUTO_GRANTED' ELSE 'ACHIEVEMENT_AUTO_EVIDENCE_MOVED' END,
          'achievement_grant', v_grant.player_id::text || ':' || v_grant.achievement_id::text,
          jsonb_build_object('gameId', v_candidate.game_id, 'source', 'AUTOMATIC'));
      END IF;
    ELSIF v_grant.revoked_at IS NULL THEN
      UPDATE app.pod_player_achievements SET
        revoked_by_player_id = NULL,
        revoked_at = now(),
        revocation_source = 'AUTOMATIC',
        version = version + 1
      WHERE pod_id = v_grant.pod_id AND player_id = v_grant.player_id AND achievement_id = v_grant.achievement_id;
      INSERT INTO app.audit_events (pod_id, actor_player_id, action, entity_type, entity_id, metadata)
      VALUES (p_pod_id, p_actor_player_id, 'ACHIEVEMENT_AUTO_REVOKED', 'achievement_grant',
        v_grant.player_id::text || ':' || v_grant.achievement_id::text,
        jsonb_build_object('gameId', v_grant.game_id, 'source', 'AUTOMATIC'));
    END IF;
  END LOOP;

  FOR v_candidate IN
    SELECT DISTINCT ON (participant.player_id, snapshot.achievement_id)
      participant.player_id, snapshot.achievement_id, snapshot.id AS snapshot_id, game.id AS game_id
    FROM app.game_achievement_rule_snapshots snapshot
    JOIN app.achievements achievement ON achievement.id = snapshot.achievement_id AND achievement.archived_at IS NULL
    JOIN app.games game ON game.id = snapshot.game_id
    JOIN app.game_participants participant ON participant.game_id = game.id
    WHERE game.pod_id = p_pod_id
      AND game.archived_at IS NULL
      AND game.result_kind = 'WIN'
      AND snapshot.game_mode_code = game.game_mode
      AND participant.is_winner
      AND (snapshot.winner_role IS NULL OR snapshot.winner_role = participant.mode_role)
      AND NOT EXISTS (
        SELECT 1 FROM app.pod_player_achievements grant_row
        WHERE grant_row.pod_id = p_pod_id
          AND grant_row.player_id = participant.player_id
          AND grant_row.achievement_id = snapshot.achievement_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM app.automatic_achievement_suppressions suppression
        WHERE suppression.pod_id = p_pod_id
          AND suppression.player_id = participant.player_id
          AND suppression.achievement_id = snapshot.achievement_id
      )
    ORDER BY participant.player_id, snapshot.achievement_id, game.played_at, game.id
  LOOP
    INSERT INTO app.pod_player_achievements (
      pod_id, player_id, achievement_id, game_id, granted_by_player_id, grant_source,
      automatic_snapshot_id, granted_at, notes, revoked_by_player_id, revoked_at, revocation_source
    ) VALUES (
      p_pod_id, v_candidate.player_id, v_candidate.achievement_id, v_candidate.game_id,
      NULL, 'AUTOMATIC', v_candidate.snapshot_id, now(), '', NULL, NULL, NULL
    ) ON CONFLICT DO NOTHING;
    IF FOUND THEN
      INSERT INTO app.audit_events (pod_id, actor_player_id, action, entity_type, entity_id, metadata)
      VALUES (p_pod_id, p_actor_player_id, 'ACHIEVEMENT_AUTO_GRANTED', 'achievement_grant',
        v_candidate.player_id::text || ':' || v_candidate.achievement_id::text,
        jsonb_build_object('gameId', v_candidate.game_id, 'source', 'AUTOMATIC'));
    END IF;
  END LOOP;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION api.create_game(
  p_pod_id uuid,
  p_actor_player_id uuid,
  p_played_at timestamptz,
  p_game_mode text,
  p_monarchy_bandit_rule app.monarchy_bandit_rule,
  p_result_kind app.game_result_kind,
  p_winner_player_ids uuid[],
  p_notes text,
  p_idempotency_key uuid,
  p_participants jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, private, api
AS $$
DECLARE
  v_game_id uuid;
  v_participant_count integer;
  v_current_player_id uuid;
BEGIN
  v_current_player_id := private.current_player_id();
  IF private.current_auth_user_id() IS NOT NULL AND (v_current_player_id IS NULL OR v_current_player_id <> p_actor_player_id) THEN
    RAISE EXCEPTION 'actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM app.pod_memberships membership
    JOIN app.pods pod ON pod.id = membership.pod_id AND pod.archived_at IS NULL
    WHERE membership.pod_id = p_pod_id AND membership.player_id = p_actor_player_id
      AND membership.status = 'ACTIVE' AND membership.archived_at IS NULL
      AND membership.role IN ('ADMIN', 'EDITOR')
  ) THEN RAISE EXCEPTION 'editor role is required' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM app.game_modes WHERE code = p_game_mode AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'choose an active game mode' USING ERRCODE = '23514';
  END IF;
  PERFORM private.assert_game_mode_automation_ready(p_game_mode);
  PERFORM private.validate_game_input(p_game_mode, p_result_kind, p_monarchy_bandit_rule, COALESCE(p_winner_player_ids, ARRAY[]::uuid[]), p_participants);
  SELECT count(*) INTO v_participant_count FROM jsonb_array_elements(p_participants);
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_participants) item
    LEFT JOIN app.pod_memberships membership ON membership.pod_id = p_pod_id AND membership.player_id = (item->>'playerId')::uuid AND membership.status = 'ACTIVE' AND membership.archived_at IS NULL
    LEFT JOIN app.decks deck ON deck.id = (item->>'deckId')::uuid AND deck.owner_player_id = (item->>'playerId')::uuid AND deck.archived_at IS NULL
    LEFT JOIN app.players player ON player.id = (item->>'playerId')::uuid AND player.archived_at IS NULL
    WHERE membership.player_id IS NULL OR deck.id IS NULL OR player.id IS NULL
  ) THEN RAISE EXCEPTION 'each participant must be active and use their own active deck' USING ERRCODE = '23514'; END IF;

  INSERT INTO app.games (pod_id, played_at, game_mode, monarchy_bandit_rule, result_kind, winner_player_id, notes, idempotency_key, created_by_player_id, updated_by_player_id)
  VALUES (p_pod_id, p_played_at, p_game_mode, p_monarchy_bandit_rule, p_result_kind, (COALESCE(p_winner_player_ids, ARRAY[]::uuid[]))[1], COALESCE(p_notes, ''), p_idempotency_key, p_actor_player_id, p_actor_player_id)
  ON CONFLICT (pod_id, idempotency_key) DO NOTHING RETURNING id INTO v_game_id;
  IF v_game_id IS NULL THEN
    SELECT id INTO v_game_id FROM app.games WHERE pod_id = p_pod_id AND idempotency_key = p_idempotency_key;
    RETURN v_game_id;
  END IF;
  INSERT INTO app.game_participants (
    game_id, player_id, deck_id, deck_name_snapshot, bracket_snapshot, power_level_snapshot,
    commander_cmc_snapshot, color_identity_snapshot, seat_position, mode_role, is_winner
  )
  SELECT v_game_id, deck.owner_player_id, deck.id, deck.name, deck.bracket, deck.power_level,
    deck.commander_cmc, deck.color_identity, (item->>'seatPosition')::integer,
    (item->>'modeRole')::app.game_participant_role,
    deck.owner_player_id = ANY (COALESCE(p_winner_player_ids, ARRAY[]::uuid[]))
  FROM jsonb_array_elements(p_participants) item JOIN app.decks deck ON deck.id = (item->>'deckId')::uuid;
  INSERT INTO app.game_achievement_rule_snapshots (game_id, game_mode_code, achievement_id, rule_type, winner_role)
  SELECT v_game_id, p_game_mode, rule.achievement_id, rule.rule_type, mode_rule.winner_role
  FROM app.game_mode_win_achievement_rules mode_rule
  JOIN app.achievement_automation_rules rule ON rule.id = mode_rule.rule_id AND rule.archived_at IS NULL
  JOIN app.achievements achievement ON achievement.id = rule.achievement_id AND achievement.archived_at IS NULL
  WHERE mode_rule.game_mode_code = p_game_mode;
  IF p_game_mode = 'MONARCHY' THEN UPDATE app.pods SET monarchy_bandit_rule_default = p_monarchy_bandit_rule WHERE id = p_pod_id; END IF;
  INSERT INTO app.audit_events (pod_id, actor_player_id, action, entity_type, entity_id, metadata)
  VALUES (p_pod_id, p_actor_player_id, 'GAME_CREATED', 'game', v_game_id::text,
    jsonb_build_object('participantCount', v_participant_count, 'gameMode', p_game_mode, 'winnerPlayerIds', COALESCE(to_jsonb(p_winner_player_ids), '[]'::jsonb)));
  PERFORM private.reconcile_automatic_achievement_grants(p_pod_id, p_actor_player_id);
  RETURN v_game_id;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION api.set_game_archived(
  p_game_id uuid,
  p_pod_id uuid,
  p_actor_player_id uuid,
  p_expected_version integer,
  p_archived boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, private, api
AS $$
DECLARE
  v_current_player_id uuid;
BEGIN
  v_current_player_id := private.current_player_id();
  IF private.current_auth_user_id() IS NOT NULL AND (v_current_player_id IS NULL OR v_current_player_id <> p_actor_player_id) THEN
    RAISE EXCEPTION 'actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM app.pod_memberships membership
    JOIN app.pods pod ON pod.id = membership.pod_id AND pod.archived_at IS NULL
    WHERE membership.pod_id = p_pod_id AND membership.player_id = p_actor_player_id
      AND membership.status = 'ACTIVE' AND membership.archived_at IS NULL
      AND membership.role = 'ADMIN'
  ) THEN RAISE EXCEPTION 'administrator role is required' USING ERRCODE = '42501'; END IF;

  UPDATE app.games SET
    archived_at = CASE WHEN p_archived THEN now() ELSE NULL END,
    updated_at = now(),
    updated_by_player_id = p_actor_player_id,
    version = version + 1
  WHERE id = p_game_id AND pod_id = p_pod_id AND version = p_expected_version;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO app.audit_events (pod_id, actor_player_id, action, entity_type, entity_id)
  VALUES (p_pod_id, p_actor_player_id, CASE WHEN p_archived THEN 'GAME_ARCHIVED' ELSE 'GAME_RESTORED' END, 'game', p_game_id::text);
  PERFORM private.reconcile_automatic_achievement_grants(p_pod_id, p_actor_player_id);
  RETURN true;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION api.update_game(
  p_game_id uuid,
  p_pod_id uuid,
  p_actor_player_id uuid,
  p_expected_version integer,
  p_played_at timestamptz,
  p_game_mode text,
  p_monarchy_bandit_rule app.monarchy_bandit_rule,
  p_result_kind app.game_result_kind,
  p_winner_player_ids uuid[],
  p_notes text,
  p_participants jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, private, api
AS $$
DECLARE
  v_participant_count integer;
  v_current_player_id uuid;
  v_previous_mode text;
BEGIN
  v_current_player_id := private.current_player_id();
  IF private.current_auth_user_id() IS NOT NULL AND (v_current_player_id IS NULL OR v_current_player_id <> p_actor_player_id) THEN
    RAISE EXCEPTION 'actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM app.pod_memberships membership
    JOIN app.pods pod ON pod.id = membership.pod_id AND pod.archived_at IS NULL
    WHERE membership.pod_id = p_pod_id AND membership.player_id = p_actor_player_id
      AND membership.status = 'ACTIVE' AND membership.archived_at IS NULL
      AND membership.role IN ('ADMIN', 'EDITOR')
  ) THEN RAISE EXCEPTION 'editor role is required' USING ERRCODE = '42501'; END IF;
  SELECT game_mode INTO v_previous_mode FROM app.games WHERE id = p_game_id AND pod_id = p_pod_id;
  IF NOT EXISTS (
    SELECT 1 FROM app.game_modes WHERE code = p_game_mode AND (archived_at IS NULL OR code = v_previous_mode)
  ) THEN RAISE EXCEPTION 'choose an active game mode' USING ERRCODE = '23514'; END IF;
  IF p_game_mode IS DISTINCT FROM v_previous_mode THEN
    PERFORM private.assert_game_mode_automation_ready(p_game_mode);
  END IF;
  PERFORM private.validate_game_input(p_game_mode, p_result_kind, p_monarchy_bandit_rule, COALESCE(p_winner_player_ids, ARRAY[]::uuid[]), p_participants);
  SELECT count(*) INTO v_participant_count FROM jsonb_array_elements(p_participants);
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_participants) item
    LEFT JOIN app.pod_memberships membership ON membership.pod_id = p_pod_id AND membership.player_id = (item->>'playerId')::uuid AND membership.status = 'ACTIVE' AND membership.archived_at IS NULL
    LEFT JOIN app.decks deck ON deck.id = (item->>'deckId')::uuid AND deck.owner_player_id = (item->>'playerId')::uuid AND deck.archived_at IS NULL
    LEFT JOIN app.players player ON player.id = (item->>'playerId')::uuid AND player.archived_at IS NULL
    WHERE membership.player_id IS NULL OR deck.id IS NULL OR player.id IS NULL
  ) THEN RAISE EXCEPTION 'each participant must be active and use their own active deck' USING ERRCODE = '23514'; END IF;
  UPDATE app.games SET played_at = p_played_at, game_mode = p_game_mode, monarchy_bandit_rule = p_monarchy_bandit_rule,
    result_kind = p_result_kind, winner_player_id = (COALESCE(p_winner_player_ids, ARRAY[]::uuid[]))[1], notes = COALESCE(p_notes, ''),
    updated_by_player_id = p_actor_player_id, updated_at = now(), version = version + 1
  WHERE id = p_game_id AND pod_id = p_pod_id AND archived_at IS NULL AND version = p_expected_version;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM app.game_participants existing WHERE existing.game_id = p_game_id AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_participants) item WHERE (item->>'playerId')::uuid = existing.player_id
  );
  INSERT INTO app.game_participants AS existing_participant (
    game_id, player_id, deck_id, deck_name_snapshot, bracket_snapshot, power_level_snapshot,
    commander_cmc_snapshot, color_identity_snapshot, seat_position, mode_role, is_winner
  )
  SELECT p_game_id, deck.owner_player_id, deck.id, deck.name, deck.bracket, deck.power_level,
    deck.commander_cmc, deck.color_identity, (item->>'seatPosition')::integer,
    (item->>'modeRole')::app.game_participant_role,
    deck.owner_player_id = ANY (COALESCE(p_winner_player_ids, ARRAY[]::uuid[]))
  FROM jsonb_array_elements(p_participants) item JOIN app.decks deck ON deck.id = (item->>'deckId')::uuid
  ON CONFLICT (game_id, player_id) DO UPDATE SET deck_id = excluded.deck_id,
    deck_name_snapshot = CASE WHEN existing_participant.deck_id = excluded.deck_id THEN existing_participant.deck_name_snapshot ELSE excluded.deck_name_snapshot END,
    bracket_snapshot = CASE WHEN existing_participant.deck_id = excluded.deck_id THEN existing_participant.bracket_snapshot ELSE excluded.bracket_snapshot END,
    power_level_snapshot = CASE WHEN existing_participant.deck_id = excluded.deck_id THEN existing_participant.power_level_snapshot ELSE excluded.power_level_snapshot END,
    commander_cmc_snapshot = CASE WHEN existing_participant.deck_id = excluded.deck_id THEN existing_participant.commander_cmc_snapshot ELSE excluded.commander_cmc_snapshot END,
    color_identity_snapshot = CASE WHEN existing_participant.deck_id = excluded.deck_id THEN existing_participant.color_identity_snapshot ELSE excluded.color_identity_snapshot END,
    seat_position = excluded.seat_position, mode_role = excluded.mode_role, is_winner = excluded.is_winner;
  IF p_game_mode = 'MONARCHY' THEN UPDATE app.pods SET monarchy_bandit_rule_default = p_monarchy_bandit_rule WHERE id = p_pod_id; END IF;
  INSERT INTO app.audit_events (pod_id, actor_player_id, action, entity_type, entity_id, metadata)
  VALUES (p_pod_id, p_actor_player_id, 'GAME_UPDATED', 'game', p_game_id::text,
    jsonb_build_object('participantCount', v_participant_count, 'previousVersion', p_expected_version, 'gameMode', p_game_mode, 'winnerPlayerIds', COALESCE(to_jsonb(p_winner_player_ids), '[]'::jsonb)));
  PERFORM private.reconcile_automatic_achievement_grants(p_pod_id, p_actor_player_id);
  RETURN true;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.hard_delete_achievement(
  p_actor_auth_user_id text,
  p_achievement_id uuid,
  p_expected_version integer,
  p_confirmation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $$
DECLARE
  v_actor_player_id uuid;
  v_achievement app.achievements%ROWTYPE;
  v_grants_deleted integer := 0;
BEGIN
  SELECT player.id INTO v_actor_player_id
  FROM app.players player
  JOIN private.app_superuser superadmin ON superadmin.auth_user_id = player.auth_user_id
  WHERE superadmin.auth_user_id = p_actor_auth_user_id AND player.archived_at IS NULL;
  IF v_actor_player_id IS NULL THEN RAISE EXCEPTION 'superadmin access is required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_achievement FROM app.achievements WHERE id = p_achievement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'achievement not found' USING ERRCODE = '22023'; END IF;
  IF v_achievement.version <> p_expected_version THEN RAISE EXCEPTION 'the achievement changed before it could be deleted' USING ERRCODE = '40001'; END IF;
  IF p_confirmation IS DISTINCT FROM 'DELETE ' || v_achievement.code THEN RAISE EXCEPTION 'type the exact achievement deletion confirmation' USING ERRCODE = '22023'; END IF;
  IF EXISTS (
    SELECT 1 FROM app.achievement_automation_rules rule
    JOIN app.game_mode_win_achievement_rules mode_rule ON mode_rule.rule_id = rule.id
    JOIN app.game_modes mode ON mode.code = mode_rule.game_mode_code
    WHERE rule.achievement_id = p_achievement_id AND mode.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'achievement is assigned to an active game mode' USING ERRCODE = '23503', CONSTRAINT = 'achievement_in_use'; END IF;
  DELETE FROM app.pod_player_achievements WHERE achievement_id = p_achievement_id;
  GET DIAGNOSTICS v_grants_deleted = ROW_COUNT;
  DELETE FROM app.achievements WHERE id = p_achievement_id;
  INSERT INTO app.audit_events (actor_player_id, action, entity_type, entity_id, metadata)
  VALUES (v_actor_player_id, 'ACHIEVEMENT_HARD_DELETED', 'achievement', p_achievement_id::text,
    jsonb_build_object('code', v_achievement.code, 'name', v_achievement.name, 'grantsDeleted', v_grants_deleted));
  RETURN jsonb_build_object('id', p_achievement_id, 'code', v_achievement.code, 'name', v_achievement.name, 'grantsDeleted', v_grants_deleted);
END
$$;
--> statement-breakpoint
CREATE OR REPLACE VIEW api.decks WITH (security_invoker = true) AS
SELECT id, owner_player_id, name, bracket, power_level, moxfield_url, created_at,
       updated_at, archived_at, version, commander_cmc, color_identity
FROM app.decks;
--> statement-breakpoint
CREATE OR REPLACE VIEW api.game_participants WITH (security_invoker = true) AS
SELECT game_id, player_id, deck_id, deck_name_snapshot, bracket_snapshot, power_level_snapshot,
       created_at, seat_position, mode_role, is_winner, commander_cmc_snapshot, color_identity_snapshot
FROM app.game_participants;
--> statement-breakpoint
CREATE OR REPLACE VIEW api.pod_player_achievements WITH (security_invoker = true) AS
SELECT pod_id, player_id, achievement_id, granted_by_player_id, granted_at, notes,
       revoked_by_player_id, revoked_at, version, game_id, grant_source,
       automatic_snapshot_id, revocation_source
FROM app.pod_player_achievements;
--> statement-breakpoint
CREATE VIEW api.game_mode_win_achievement_rules WITH (security_invoker = true) AS
SELECT mode_rule.game_mode_code, mode_rule.winner_role, rule.achievement_id,
       rule.created_at, rule.updated_at, rule.archived_at, rule.version
FROM app.game_mode_win_achievement_rules mode_rule
JOIN app.achievement_automation_rules rule ON rule.id = mode_rule.rule_id;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.required_game_mode_achievement_roles(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.assert_game_mode_automation_ready(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.set_game_mode_win_achievement_rules(uuid, text, jsonb) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.protect_mapped_achievement() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.create_game_mode_with_achievements(uuid, text, text, text, integer, integer, app.game_winning_criteria, jsonb) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.update_game_mode_with_achievements(uuid, text, text, text, integer, integer, app.game_winning_criteria, timestamptz, integer, jsonb) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.reconcile_automatic_achievement_grants(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION api.set_game_archived(uuid, uuid, uuid, integer, boolean) FROM PUBLIC;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON app.pod_player_achievements FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON app.achievement_automation_rules, app.game_mode_win_achievement_rules,
      app.game_achievement_rule_snapshots TO authenticated;
    GRANT SELECT ON api.game_mode_win_achievement_rules TO authenticated;
    GRANT EXECUTE ON FUNCTION api.set_game_archived(uuid, uuid, uuid, integer, boolean) TO authenticated;
    REVOKE INSERT, UPDATE, DELETE ON app.pod_player_achievements FROM authenticated;
  END IF;
END
$$;
