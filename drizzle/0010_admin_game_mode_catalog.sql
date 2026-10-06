CREATE TYPE app.game_winning_criteria AS ENUM ('ONE_WINNER', 'MULTIPLE_WINNERS', 'ONE_OR_MORE_WINNERS');
--> statement-breakpoint
CREATE TABLE app.game_modes (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  min_players integer NOT NULL,
  max_players integer NOT NULL,
  winning_criteria app.game_winning_criteria NOT NULL,
  system_key text UNIQUE,
  display_order integer NOT NULL DEFAULT 0,
  created_by_player_id uuid REFERENCES app.players(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT game_modes_code_format CHECK (code ~ '^[A-Z0-9]+(_[A-Z0-9]+)*$'),
  CONSTRAINT game_modes_name_length CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT game_modes_description_length CHECK (char_length(description) <= 1000),
  CONSTRAINT game_modes_player_range CHECK (min_players BETWEEN 2 AND 8 AND max_players BETWEEN min_players AND 8),
  CONSTRAINT game_modes_display_order_nonnegative CHECK (display_order >= 0),
  CONSTRAINT game_modes_system_key CHECK (system_key IS NULL OR system_key IN ('FREE_FOR_ALL', 'PENTAGON', 'ASTERISK', 'ARCHENEMY', 'MONARCHY'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX game_modes_name_ci_unique ON app.game_modes (lower(name));
--> statement-breakpoint
CREATE INDEX game_modes_active_order_idx ON app.game_modes (archived_at, display_order, name);
--> statement-breakpoint
INSERT INTO app.game_modes (code, name, description, min_players, max_players, winning_criteria, system_key, display_order)
VALUES
  ('FREE_FOR_ALL', 'Free-for-all', 'Every player fights independently. Choose one winner, or record a draw.', 2, 8, 'ONE_WINNER', 'FREE_FOR_ALL', 10),
  ('PENTAGON', 'Pentagon', 'Five players sit in a circle. Adjacent players are allies and the two non-adjacent players are opponents. A player wins when both of their opponents have been defeated.', 5, 5, 'ONE_WINNER', 'PENTAGON', 20),
  ('ASTERISK', 'Asterisk', 'Six players form three teams of two. Teammates sit directly opposite each other, cannot attack one another, and do not count as opponents. The winning pair shares the victory.', 6, 6, 'MULTIPLE_WINNERS', 'ASTERISK', 30),
  ('ARCHENEMY', 'Archenemy', 'One player is the Archenemy and everyone else forms the Heroes team. The Archenemy wins alone, or all Heroes share the victory.', 3, 8, 'ONE_OR_MORE_WINNERS', 'ARCHENEMY', 40),
  ('MONARCHY', 'Monarchy', 'Six players have hidden roles: King, Kingsguard, Traitor, and three Bandits. Each role has its own victory condition, and Bandit victories follow the selected rule.', 6, 6, 'ONE_OR_MORE_WINNERS', 'MONARCHY', 50);
--> statement-breakpoint
ALTER TABLE app.game_modes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY game_modes_read_authenticated ON app.game_modes FOR SELECT
USING (private.current_auth_user_id() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY game_modes_superuser_write ON app.game_modes FOR ALL
USING (private.is_superuser()) WITH CHECK (private.is_superuser());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.protect_game_mode_catalog()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.system_key IS NOT NULL THEN
    RAISE EXCEPTION 'system game modes can only be installed by a migration' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.code IS DISTINCT FROM OLD.code OR NEW.system_key IS DISTINCT FROM OLD.system_key THEN
      RAISE EXCEPTION 'game mode codes and system keys are immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD.system_key IS NOT NULL AND (
      NEW.min_players IS DISTINCT FROM OLD.min_players
      OR NEW.max_players IS DISTINCT FROM OLD.max_players
      OR NEW.winning_criteria IS DISTINCT FROM OLD.winning_criteria
    ) THEN
      RAISE EXCEPTION 'built-in player limits and winning rules are protected' USING ERRCODE = '23514';
    END IF;
    IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM app.game_modes mode
      WHERE mode.code <> OLD.code AND mode.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'at least one active game mode is required' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER game_modes_catalog_guard
BEFORE INSERT OR UPDATE ON app.game_modes
FOR EACH ROW EXECUTE FUNCTION private.protect_game_mode_catalog();
--> statement-breakpoint
DROP VIEW api.games;
--> statement-breakpoint
DROP FUNCTION api.create_game(uuid, uuid, timestamptz, app.game_result_kind, uuid, text, uuid, jsonb);
--> statement-breakpoint
DROP FUNCTION api.update_game(uuid, uuid, uuid, integer, timestamptz, app.game_result_kind, uuid, text, jsonb);
--> statement-breakpoint
DROP FUNCTION api.create_game(uuid, uuid, timestamptz, app.game_mode, app.monarchy_bandit_rule, app.game_result_kind, uuid[], text, uuid, jsonb);
--> statement-breakpoint
DROP FUNCTION api.update_game(uuid, uuid, uuid, integer, timestamptz, app.game_mode, app.monarchy_bandit_rule, app.game_result_kind, uuid[], text, jsonb);
--> statement-breakpoint
DROP FUNCTION private.validate_game_input(app.game_mode, app.game_result_kind, app.monarchy_bandit_rule, uuid[], jsonb);
--> statement-breakpoint
ALTER TABLE app.games DROP CONSTRAINT games_monarchy_rule_consistency;
--> statement-breakpoint
ALTER TABLE app.games ALTER COLUMN game_mode DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE app.games ALTER COLUMN game_mode TYPE text USING game_mode::text;
--> statement-breakpoint
ALTER TABLE app.games ALTER COLUMN game_mode SET DEFAULT 'FREE_FOR_ALL';
--> statement-breakpoint
ALTER TABLE app.games ADD CONSTRAINT games_game_mode_fk FOREIGN KEY (game_mode) REFERENCES app.game_modes(code);
--> statement-breakpoint
ALTER TABLE app.games ADD CONSTRAINT games_monarchy_rule_consistency CHECK (
  (game_mode = 'MONARCHY' AND monarchy_bandit_rule IS NOT NULL)
  OR (game_mode <> 'MONARCHY' AND monarchy_bandit_rule IS NULL)
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_cast
    WHERE castsource = 'app.game_mode'::regtype AND casttarget = 'text'::regtype
  ) THEN
    EXECUTE 'CREATE CAST (app.game_mode AS text) WITH INOUT AS IMPLICIT';
  END IF;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.validate_game_input(
  p_game_mode text,
  p_result_kind app.game_result_kind,
  p_monarchy_bandit_rule app.monarchy_bandit_rule,
  p_winner_player_ids uuid[],
  p_participants jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $$
DECLARE
  v_participant_count integer;
  v_winner_count integer := cardinality(COALESCE(p_winner_player_ids, ARRAY[]::uuid[]));
  v_winner_seat_distance integer;
  v_mode app.game_modes%ROWTYPE;
BEGIN
  SELECT * INTO v_mode FROM app.game_modes WHERE code = p_game_mode;
  IF NOT FOUND THEN RAISE EXCEPTION 'game mode does not exist' USING ERRCODE = '23514'; END IF;
  IF jsonb_typeof(p_participants) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'participants must be an array' USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO v_participant_count FROM jsonb_array_elements(p_participants);
  IF v_participant_count NOT BETWEEN v_mode.min_players AND v_mode.max_players THEN
    RAISE EXCEPTION '% requires between % and % participants', v_mode.name, v_mode.min_players, v_mode.max_players USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(DISTINCT item->>'playerId') FROM jsonb_array_elements(p_participants) item) <> v_participant_count THEN
    RAISE EXCEPTION 'participants must be unique' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(DISTINCT winner_id) FROM unnest(COALESCE(p_winner_player_ids, ARRAY[]::uuid[])) winner_id) <> v_winner_count THEN
    RAISE EXCEPTION 'winners must be unique' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_winner_player_ids, ARRAY[]::uuid[])) winner_id
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_participants) item
      WHERE (item->>'playerId')::uuid = winner_id
    )
  ) THEN RAISE EXCEPTION 'every winner must be a participant' USING ERRCODE = '23514'; END IF;
  IF p_result_kind = 'DRAW' AND v_winner_count <> 0 THEN
    RAISE EXCEPTION 'a draw cannot have winners' USING ERRCODE = '23514';
  ELSIF p_result_kind = 'WIN' AND v_winner_count = 0 THEN
    RAISE EXCEPTION 'a completed win requires at least one winner' USING ERRCODE = '23514';
  END IF;
  IF v_mode.system_key IS DISTINCT FROM 'MONARCHY' AND p_monarchy_bandit_rule IS NOT NULL THEN
    RAISE EXCEPTION 'the Bandit rule is only valid for Monarchy' USING ERRCODE = '23514';
  END IF;

  IF v_mode.system_key IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_participants) item
      WHERE item->>'seatPosition' IS NOT NULL OR item->>'modeRole' IS NOT NULL
    ) THEN RAISE EXCEPTION 'custom game modes do not use seats or roles' USING ERRCODE = '23514'; END IF;
    IF p_result_kind = 'WIN' AND (
      (v_mode.winning_criteria = 'ONE_WINNER' AND v_winner_count <> 1)
      OR (v_mode.winning_criteria = 'MULTIPLE_WINNERS' AND v_winner_count < 2)
      OR (v_mode.winning_criteria = 'ONE_OR_MORE_WINNERS' AND v_winner_count < 1)
    ) THEN RAISE EXCEPTION 'winners do not match the game mode winning criteria' USING ERRCODE = '23514'; END IF;
  ELSIF v_mode.system_key = 'FREE_FOR_ALL' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_participants) item
      WHERE item->>'seatPosition' IS NOT NULL OR item->>'modeRole' IS NOT NULL
    ) THEN RAISE EXCEPTION 'Free-for-all does not use seats or roles' USING ERRCODE = '23514'; END IF;
    IF p_result_kind = 'WIN' AND v_winner_count <> 1 THEN RAISE EXCEPTION 'Free-for-all requires exactly one winner' USING ERRCODE = '23514'; END IF;
  ELSIF v_mode.system_key = 'PENTAGON' THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_participants) item WHERE item->>'modeRole' IS NOT NULL)
       OR (SELECT count(DISTINCT (item->>'seatPosition')::integer) FROM jsonb_array_elements(p_participants) item) <> 5
       OR (SELECT min((item->>'seatPosition')::integer) FROM jsonb_array_elements(p_participants) item) <> 1
       OR (SELECT max((item->>'seatPosition')::integer) FROM jsonb_array_elements(p_participants) item) <> 5 THEN
      RAISE EXCEPTION 'Pentagon requires unique clockwise seats 1 through 5 and no roles' USING ERRCODE = '23514';
    END IF;
    IF p_result_kind = 'WIN' AND v_winner_count <> 1 THEN RAISE EXCEPTION 'Pentagon requires exactly one winner' USING ERRCODE = '23514'; END IF;
  ELSIF v_mode.system_key = 'ASTERISK' THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_participants) item WHERE item->>'modeRole' IS NOT NULL)
       OR (SELECT count(DISTINCT (item->>'seatPosition')::integer) FROM jsonb_array_elements(p_participants) item) <> 6
       OR (SELECT min((item->>'seatPosition')::integer) FROM jsonb_array_elements(p_participants) item) <> 1
       OR (SELECT max((item->>'seatPosition')::integer) FROM jsonb_array_elements(p_participants) item) <> 6 THEN
      RAISE EXCEPTION 'Asterisk requires unique clockwise seats 1 through 6 and no roles' USING ERRCODE = '23514';
    END IF;
    IF p_result_kind = 'WIN' THEN
      SELECT abs(max((item->>'seatPosition')::integer) - min((item->>'seatPosition')::integer))
      INTO v_winner_seat_distance FROM jsonb_array_elements(p_participants) item
      WHERE (item->>'playerId')::uuid = ANY (p_winner_player_ids);
      IF v_winner_count <> 2 OR v_winner_seat_distance <> 3 THEN
        RAISE EXCEPTION 'Asterisk winners must be one opposite-seat pair' USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSIF v_mode.system_key = 'ARCHENEMY' THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_participants) item WHERE item->>'seatPosition' IS NOT NULL)
       OR (SELECT count(*) FROM jsonb_array_elements(p_participants) item WHERE item->>'modeRole' = 'ARCHENEMY') <> 1
       OR (SELECT count(*) FROM jsonb_array_elements(p_participants) item WHERE item->>'modeRole' = 'HERO') <> v_participant_count - 1 THEN
      RAISE EXCEPTION 'Archenemy requires one Archenemy and all other players as Heroes' USING ERRCODE = '23514';
    END IF;
    IF p_result_kind = 'WIN' AND NOT (
      (v_winner_count = 1 AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_participants) item
        WHERE (item->>'playerId')::uuid = ANY (p_winner_player_ids) AND item->>'modeRole' = 'ARCHENEMY'
      )) OR (v_winner_count = v_participant_count - 1 AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_participants) item
        WHERE (item->>'playerId')::uuid = ANY (p_winner_player_ids) AND item->>'modeRole' <> 'HERO'
      ))
    ) THEN RAISE EXCEPTION 'choose either the Archenemy or the complete Heroes team' USING ERRCODE = '23514'; END IF;
  ELSIF v_mode.system_key = 'MONARCHY' THEN
    IF p_monarchy_bandit_rule IS NULL THEN RAISE EXCEPTION 'Monarchy requires a Bandit victory rule' USING ERRCODE = '23514'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_participants) item WHERE item->>'seatPosition' IS NOT NULL)
       OR (SELECT count(*) FROM jsonb_array_elements(p_participants) item WHERE item->>'modeRole' = 'KING') <> 1
       OR (SELECT count(*) FROM jsonb_array_elements(p_participants) item WHERE item->>'modeRole' = 'KINGSGUARD') <> 1
       OR (SELECT count(*) FROM jsonb_array_elements(p_participants) item WHERE item->>'modeRole' = 'TRAITOR') <> 1
       OR (SELECT count(*) FROM jsonb_array_elements(p_participants) item WHERE item->>'modeRole' = 'BANDIT') <> 3 THEN
      RAISE EXCEPTION 'assign one King, one Kingsguard, one Traitor, and three Bandits' USING ERRCODE = '23514';
    END IF;
    IF p_result_kind = 'WIN' AND NOT (
      (v_winner_count IN (1, 2)
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_participants) item WHERE (item->>'playerId')::uuid = ANY (p_winner_player_ids) AND item->>'modeRole' = 'KING')
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_participants) item WHERE (item->>'playerId')::uuid = ANY (p_winner_player_ids) AND item->>'modeRole' NOT IN ('KING', 'KINGSGUARD')))
      OR (v_winner_count = 1 AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_participants) item WHERE (item->>'playerId')::uuid = ANY (p_winner_player_ids) AND item->>'modeRole' = 'TRAITOR'))
      OR (NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_participants) item WHERE (item->>'playerId')::uuid = ANY (p_winner_player_ids) AND item->>'modeRole' <> 'BANDIT')
        AND ((p_monarchy_bandit_rule = 'ALL_BANDITS' AND v_winner_count = 3) OR (p_monarchy_bandit_rule = 'SURVIVING_BANDITS' AND v_winner_count BETWEEN 1 AND 3)))
    ) THEN RAISE EXCEPTION 'the selected winners do not form a valid Monarchy outcome' USING ERRCODE = '23514'; END IF;
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.validate_game_input(text, app.game_result_kind, app.monarchy_bandit_rule, uuid[], jsonb) FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.game_players_are_opponents(p_game_id uuid, p_player_a_id uuid, p_player_b_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT CASE
    WHEN p_player_a_id = p_player_b_id THEN false
    WHEN mode.system_key IS NULL OR mode.system_key = 'FREE_FOR_ALL' THEN true
    WHEN mode.system_key = 'PENTAGON' THEN least(abs(a.seat_position - b.seat_position), 5 - abs(a.seat_position - b.seat_position)) = 2
    WHEN mode.system_key = 'ASTERISK' THEN abs(a.seat_position - b.seat_position) <> 3
    WHEN mode.system_key = 'ARCHENEMY' THEN a.mode_role <> b.mode_role
    WHEN mode.system_key = 'MONARCHY' THEN
      CASE a.mode_role WHEN 'KING' THEN 'ROYAL' WHEN 'KINGSGUARD' THEN 'ROYAL' WHEN 'BANDIT' THEN 'BANDIT' ELSE a.mode_role::text END
      <> CASE b.mode_role WHEN 'KING' THEN 'ROYAL' WHEN 'KINGSGUARD' THEN 'ROYAL' WHEN 'BANDIT' THEN 'BANDIT' ELSE b.mode_role::text END
    ELSE true
  END
  FROM app.games game
  JOIN app.game_modes mode ON mode.code = game.game_mode
  JOIN app.game_participants a ON a.game_id = game.id AND a.player_id = p_player_a_id
  JOIN app.game_participants b ON b.game_id = game.id AND b.player_id = p_player_b_id
  WHERE game.id = p_game_id
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
  INSERT INTO app.game_participants (game_id, player_id, deck_id, deck_name_snapshot, bracket_snapshot, power_level_snapshot, seat_position, mode_role, is_winner)
  SELECT v_game_id, deck.owner_player_id, deck.id, deck.name, deck.bracket, deck.power_level,
    (item->>'seatPosition')::integer, (item->>'modeRole')::app.game_participant_role,
    deck.owner_player_id = ANY (COALESCE(p_winner_player_ids, ARRAY[]::uuid[]))
  FROM jsonb_array_elements(p_participants) item JOIN app.decks deck ON deck.id = (item->>'deckId')::uuid;
  IF p_game_mode = 'MONARCHY' THEN UPDATE app.pods SET monarchy_bandit_rule_default = p_monarchy_bandit_rule WHERE id = p_pod_id; END IF;
  INSERT INTO app.audit_events (pod_id, actor_player_id, action, entity_type, entity_id, metadata)
  VALUES (p_pod_id, p_actor_player_id, 'GAME_CREATED', 'game', v_game_id::text,
    jsonb_build_object('participantCount', v_participant_count, 'gameMode', p_game_mode, 'winnerPlayerIds', COALESCE(to_jsonb(p_winner_player_ids), '[]'::jsonb)));
  RETURN v_game_id;
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
  INSERT INTO app.game_participants (game_id, player_id, deck_id, deck_name_snapshot, bracket_snapshot, power_level_snapshot, seat_position, mode_role, is_winner)
  SELECT p_game_id, deck.owner_player_id, deck.id, deck.name, deck.bracket, deck.power_level,
    (item->>'seatPosition')::integer, (item->>'modeRole')::app.game_participant_role,
    deck.owner_player_id = ANY (COALESCE(p_winner_player_ids, ARRAY[]::uuid[]))
  FROM jsonb_array_elements(p_participants) item JOIN app.decks deck ON deck.id = (item->>'deckId')::uuid
  ON CONFLICT (game_id, player_id) DO UPDATE SET deck_id = excluded.deck_id, deck_name_snapshot = excluded.deck_name_snapshot,
    bracket_snapshot = excluded.bracket_snapshot, power_level_snapshot = excluded.power_level_snapshot,
    seat_position = excluded.seat_position, mode_role = excluded.mode_role, is_winner = excluded.is_winner;
  IF p_game_mode = 'MONARCHY' THEN UPDATE app.pods SET monarchy_bandit_rule_default = p_monarchy_bandit_rule WHERE id = p_pod_id; END IF;
  INSERT INTO app.audit_events (pod_id, actor_player_id, action, entity_type, entity_id, metadata)
  VALUES (p_pod_id, p_actor_player_id, 'GAME_UPDATED', 'game', p_game_id::text,
    jsonb_build_object('participantCount', v_participant_count, 'previousVersion', p_expected_version, 'gameMode', p_game_mode, 'winnerPlayerIds', COALESCE(to_jsonb(p_winner_player_ids), '[]'::jsonb)));
  RETURN true;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION api.create_game(p_pod_id uuid, p_actor_player_id uuid, p_played_at timestamptz, p_result_kind app.game_result_kind, p_winner_player_id uuid, p_notes text, p_idempotency_key uuid, p_participants jsonb)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, app, private, api AS $$
  SELECT api.create_game(p_pod_id, p_actor_player_id, p_played_at, 'FREE_FOR_ALL'::text, NULL, p_result_kind,
    CASE WHEN p_winner_player_id IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[p_winner_player_id] END,
    p_notes, p_idempotency_key,
    (SELECT jsonb_agg(item || jsonb_build_object('seatPosition', NULL, 'modeRole', NULL)) FROM jsonb_array_elements(p_participants) item))
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION api.update_game(p_game_id uuid, p_pod_id uuid, p_actor_player_id uuid, p_expected_version integer, p_played_at timestamptz, p_result_kind app.game_result_kind, p_winner_player_id uuid, p_notes text, p_participants jsonb)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, app, private, api AS $$
  SELECT api.update_game(p_game_id, p_pod_id, p_actor_player_id, p_expected_version, p_played_at, 'FREE_FOR_ALL'::text, NULL, p_result_kind,
    CASE WHEN p_winner_player_id IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[p_winner_player_id] END,
    p_notes, (SELECT jsonb_agg(item || jsonb_build_object('seatPosition', NULL, 'modeRole', NULL)) FROM jsonb_array_elements(p_participants) item))
$$;
--> statement-breakpoint
CREATE VIEW api.games WITH (security_invoker = true) AS
SELECT id, pod_id, played_at, result_kind, winner_player_id, notes, created_at,
       updated_at, archived_at, version, game_mode, monarchy_bandit_rule
FROM app.games;
--> statement-breakpoint
CREATE VIEW api.game_modes WITH (security_invoker = true) AS
SELECT code, name, description, min_players, max_players, winning_criteria,
       system_key, display_order, archived_at, version
FROM app.game_modes;
--> statement-breakpoint
REVOKE ALL ON FUNCTION api.create_game(uuid, uuid, timestamptz, text, app.monarchy_bandit_rule, app.game_result_kind, uuid[], text, uuid, jsonb) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION api.update_game(uuid, uuid, uuid, integer, timestamptz, text, app.monarchy_bandit_rule, app.game_result_kind, uuid[], text, jsonb) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE ON app.game_modes TO authenticated;
    GRANT SELECT ON api.games, api.game_modes TO authenticated;
    GRANT EXECUTE ON FUNCTION api.create_game(uuid, uuid, timestamptz, text, app.monarchy_bandit_rule, app.game_result_kind, uuid[], text, uuid, jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION api.update_game(uuid, uuid, uuid, integer, timestamptz, text, app.monarchy_bandit_rule, app.game_result_kind, uuid[], text, jsonb) TO authenticated;
  END IF;
END
$$;
