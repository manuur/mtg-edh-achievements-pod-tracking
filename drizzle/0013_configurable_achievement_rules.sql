CREATE TYPE app.achievement_rule_recipient AS ENUM ('WINNER');
--> statement-breakpoint
CREATE TYPE app.achievement_game_fact_key AS ENUM (
  'GAME_MODE', 'PLAYER_COUNT', 'MONARCHY_BANDIT_RULE', 'WINNER_SEAT', 'WINNER_ROLE',
  'DECK_BRACKET', 'DECK_POWER_LEVEL', 'COMMANDER_CMC', 'COLOR_IDENTITY', 'COLOR_COUNT',
  'HAS_PARTNER_COMMANDERS', 'HAS_COMPANION', 'HAS_BACKGROUND'
);
--> statement-breakpoint
CREATE TYPE app.achievement_game_fact_operator AS ENUM (
  'EQ', 'NEQ', 'LT', 'LTE', 'GT', 'GTE', 'BETWEEN', 'IS_KNOWN', 'IS_UNKNOWN',
  'EXACTLY', 'CONTAINS_ALL', 'CONTAINS_ANY', 'EXCLUDES_ALL', 'IS_COLORLESS'
);
--> statement-breakpoint
ALTER TABLE app.decks
  ADD COLUMN has_partner_commanders boolean NOT NULL DEFAULT false,
  ADD COLUMN has_companion boolean NOT NULL DEFAULT false,
  ADD COLUMN has_background boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE app.game_participants
  ADD COLUMN has_partner_commanders_snapshot boolean NOT NULL DEFAULT false,
  ADD COLUMN has_companion_snapshot boolean NOT NULL DEFAULT false,
  ADD COLUMN has_background_snapshot boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE app.achievement_game_fact_rules (
  rule_id uuid PRIMARY KEY REFERENCES app.achievement_automation_rules(id) ON DELETE CASCADE,
  recipient app.achievement_rule_recipient NOT NULL DEFAULT 'WINNER',
  display_order integer NOT NULL,
  CONSTRAINT achievement_game_fact_rules_order_range CHECK (display_order BETWEEN 0 AND 9)
);
--> statement-breakpoint
CREATE TABLE app.achievement_game_fact_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES app.achievement_game_fact_rules(rule_id) ON DELETE CASCADE,
  display_order integer NOT NULL,
  fact_key app.achievement_game_fact_key NOT NULL,
  operator app.achievement_game_fact_operator NOT NULL,
  condition_value jsonb,
  CONSTRAINT achievement_game_fact_conditions_rule_order_unique UNIQUE (rule_id, display_order),
  CONSTRAINT achievement_game_fact_conditions_order_range CHECK (display_order BETWEEN 0 AND 9)
);
--> statement-breakpoint
CREATE INDEX achievement_game_fact_conditions_rule_idx
  ON app.achievement_game_fact_conditions (rule_id, display_order);
--> statement-breakpoint
ALTER TABLE app.game_achievement_rule_snapshots ADD COLUMN source_rule_id uuid;
--> statement-breakpoint
DROP INDEX app.game_achievement_rule_snapshots_role_slot_unique;
--> statement-breakpoint
DROP INDEX app.game_achievement_rule_snapshots_general_slot_unique;
--> statement-breakpoint
CREATE UNIQUE INDEX game_achievement_rule_snapshots_source_unique
  ON app.game_achievement_rule_snapshots (game_id, source_rule_id)
  WHERE source_rule_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX game_achievement_rule_snapshots_role_slot_unique
  ON app.game_achievement_rule_snapshots (game_id, winner_role)
  WHERE rule_type = 'GAME_MODE_WIN' AND winner_role IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX game_achievement_rule_snapshots_general_slot_unique
  ON app.game_achievement_rule_snapshots (game_id)
  WHERE rule_type = 'GAME_MODE_WIN' AND winner_role IS NULL;
--> statement-breakpoint
CREATE TABLE app.game_fact_rule_snapshots (
  snapshot_id uuid PRIMARY KEY REFERENCES app.game_achievement_rule_snapshots(id) ON DELETE CASCADE,
  recipient app.achievement_rule_recipient NOT NULL,
  conditions jsonb NOT NULL,
  CONSTRAINT game_fact_rule_snapshots_conditions_array CHECK (jsonb_typeof(conditions) = 'array')
);
--> statement-breakpoint
ALTER TABLE app.achievement_game_fact_rules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.achievement_game_fact_conditions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.game_fact_rule_snapshots ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY achievement_game_fact_rules_read_authenticated ON app.achievement_game_fact_rules FOR SELECT
USING (private.current_player_id() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY achievement_game_fact_rules_superuser_write ON app.achievement_game_fact_rules FOR ALL
USING (private.is_superuser()) WITH CHECK (private.is_superuser());
--> statement-breakpoint
CREATE POLICY achievement_game_fact_conditions_read_authenticated ON app.achievement_game_fact_conditions FOR SELECT
USING (private.current_player_id() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY achievement_game_fact_conditions_superuser_write ON app.achievement_game_fact_conditions FOR ALL
USING (private.is_superuser()) WITH CHECK (private.is_superuser());
--> statement-breakpoint
CREATE POLICY game_fact_rule_snapshots_read_member ON app.game_fact_rule_snapshots FOR SELECT
USING (EXISTS (
  SELECT 1
  FROM app.game_achievement_rule_snapshots snapshot
  JOIN app.games game ON game.id = snapshot.game_id
  WHERE snapshot.id = snapshot_id AND private.has_pod_role(game.pod_id, 'GUEST')
));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.validate_game_fact_conditions(p_conditions jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_condition jsonb;
  v_fact text;
  v_operator text;
  v_value jsonb;
  v_number numeric;
  v_lower numeric;
  v_upper numeric;
  v_color_string text;
  v_color_count integer;
BEGIN
  IF jsonb_typeof(p_conditions) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_conditions) NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'each automatic rule requires between one and ten conditions'
      USING ERRCODE = '23514', CONSTRAINT = 'achievement_game_fact_conditions_count';
  END IF;

  FOR v_condition IN SELECT value FROM jsonb_array_elements(p_conditions) LOOP
    IF jsonb_typeof(v_condition) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'automatic rule conditions must be objects' USING ERRCODE = '23514';
    END IF;
    v_fact := v_condition->>'fact';
    v_operator := v_condition->>'operator';
    v_value := v_condition->'value';

    IF v_fact IS NULL OR NOT v_fact = ANY (ARRAY[
      'GAME_MODE', 'PLAYER_COUNT', 'MONARCHY_BANDIT_RULE', 'WINNER_SEAT', 'WINNER_ROLE',
      'DECK_BRACKET', 'DECK_POWER_LEVEL', 'COMMANDER_CMC', 'COLOR_IDENTITY', 'COLOR_COUNT',
      'HAS_PARTNER_COMMANDERS', 'HAS_COMPANION', 'HAS_BACKGROUND'
    ]) THEN RAISE EXCEPTION 'unknown automatic achievement fact' USING ERRCODE = '23514'; END IF;

    IF v_operator IS NULL OR NOT v_operator = ANY (ARRAY[
      'EQ', 'NEQ', 'LT', 'LTE', 'GT', 'GTE', 'BETWEEN', 'IS_KNOWN', 'IS_UNKNOWN',
      'EXACTLY', 'CONTAINS_ALL', 'CONTAINS_ANY', 'EXCLUDES_ALL', 'IS_COLORLESS'
    ]) THEN RAISE EXCEPTION 'unknown automatic achievement operator' USING ERRCODE = '23514'; END IF;

    IF v_operator = ANY (ARRAY['IS_KNOWN', 'IS_UNKNOWN', 'IS_COLORLESS']) THEN
      IF v_condition ? 'value' THEN RAISE EXCEPTION 'this operator does not accept a value' USING ERRCODE = '23514'; END IF;
    ELSIF NOT (v_condition ? 'value') OR v_value = 'null'::jsonb THEN
      RAISE EXCEPTION 'this condition requires a value' USING ERRCODE = '23514';
    END IF;

    IF v_fact = ANY (ARRAY['PLAYER_COUNT', 'WINNER_SEAT', 'DECK_BRACKET', 'DECK_POWER_LEVEL', 'COMMANDER_CMC', 'COLOR_COUNT']) THEN
      IF NOT v_operator = ANY (ARRAY['EQ', 'NEQ', 'LT', 'LTE', 'GT', 'GTE', 'BETWEEN', 'IS_KNOWN', 'IS_UNKNOWN'])
         OR (v_fact = ANY (ARRAY['PLAYER_COUNT', 'DECK_BRACKET']) AND v_operator = ANY (ARRAY['IS_KNOWN', 'IS_UNKNOWN'])) THEN
        RAISE EXCEPTION 'numeric fact and operator are incompatible' USING ERRCODE = '23514';
      END IF;
      IF v_operator = 'BETWEEN' THEN
        IF jsonb_typeof(v_value) IS DISTINCT FROM 'array' OR jsonb_array_length(v_value) <> 2
           OR jsonb_typeof(v_value->0) IS DISTINCT FROM 'number' OR jsonb_typeof(v_value->1) IS DISTINCT FROM 'number' THEN
          RAISE EXCEPTION 'between requires two numeric bounds' USING ERRCODE = '23514';
        END IF;
        v_lower := (v_value->>0)::numeric;
        v_upper := (v_value->>1)::numeric;
        IF v_lower > v_upper THEN RAISE EXCEPTION 'between lower bound cannot exceed upper bound' USING ERRCODE = '23514'; END IF;
      ELSIF v_operator NOT IN ('IS_KNOWN', 'IS_UNKNOWN') THEN
        IF jsonb_typeof(v_value) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'numeric facts require numeric values' USING ERRCODE = '23514'; END IF;
        v_number := (v_value#>>'{}')::numeric;
        v_lower := v_number;
        v_upper := v_number;
      ELSE
        CONTINUE;
      END IF;
      IF v_fact IN ('PLAYER_COUNT', 'WINNER_SEAT', 'DECK_BRACKET', 'COMMANDER_CMC', 'COLOR_COUNT')
         AND (v_lower <> trunc(v_lower) OR v_upper <> trunc(v_upper)) THEN
        RAISE EXCEPTION 'this fact requires whole numbers' USING ERRCODE = '23514';
      END IF;
      IF v_fact = 'PLAYER_COUNT' AND (v_lower < 2 OR v_upper > 8) THEN RAISE EXCEPTION 'player quantity must be between two and eight' USING ERRCODE = '23514'; END IF;
      IF v_fact = 'WINNER_SEAT' AND (v_lower < 1 OR v_upper > 8) THEN RAISE EXCEPTION 'winner seat must be between one and eight' USING ERRCODE = '23514'; END IF;
      IF v_fact = 'DECK_BRACKET' AND (v_lower < 1 OR v_upper > 5) THEN RAISE EXCEPTION 'deck bracket must be between one and five' USING ERRCODE = '23514'; END IF;
      IF v_fact = 'DECK_POWER_LEVEL' AND (v_lower < 0 OR v_upper > 10 OR v_lower * 100 <> trunc(v_lower * 100) OR v_upper * 100 <> trunc(v_upper * 100)) THEN
        RAISE EXCEPTION 'power level must be between zero and ten with at most two decimals' USING ERRCODE = '23514';
      END IF;
      IF v_fact = 'COMMANDER_CMC' AND v_lower < 0 THEN RAISE EXCEPTION 'Commander CMC cannot be negative' USING ERRCODE = '23514'; END IF;
      IF v_fact = 'COLOR_COUNT' AND (v_lower < 0 OR v_upper > 5) THEN RAISE EXCEPTION 'color count must be between zero and five' USING ERRCODE = '23514'; END IF;
    ELSIF v_fact = 'COLOR_IDENTITY' THEN
      IF NOT v_operator = ANY (ARRAY['EXACTLY', 'CONTAINS_ALL', 'CONTAINS_ANY', 'EXCLUDES_ALL', 'IS_COLORLESS', 'IS_KNOWN', 'IS_UNKNOWN']) THEN
        RAISE EXCEPTION 'color identity and operator are incompatible' USING ERRCODE = '23514';
      END IF;
      IF v_operator IN ('EXACTLY', 'CONTAINS_ALL', 'CONTAINS_ANY', 'EXCLUDES_ALL') THEN
        IF jsonb_typeof(v_value) IS DISTINCT FROM 'array' OR jsonb_array_length(v_value) NOT BETWEEN 1 AND 5 THEN
          RAISE EXCEPTION 'color comparisons require one to five colors' USING ERRCODE = '23514';
        END IF;
        SELECT string_agg(color.value#>>'{}', '' ORDER BY color.position), count(DISTINCT color.value#>>'{}')
        INTO v_color_string, v_color_count
        FROM jsonb_array_elements(v_value) WITH ORDINALITY color(value, position);
        IF v_color_count <> jsonb_array_length(v_value) OR v_color_string !~ '^W?U?B?R?G?$' THEN
          RAISE EXCEPTION 'colors must be unique and in canonical WUBRG order' USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSIF v_fact = 'GAME_MODE' THEN
      IF v_operator NOT IN ('EQ', 'NEQ') OR jsonb_typeof(v_value) IS DISTINCT FROM 'string'
         OR (v_value#>>'{}') !~ '^[A-Z0-9]+(_[A-Z0-9]+)*$' THEN
        RAISE EXCEPTION 'game mode requires equals or does not equal and a valid mode code' USING ERRCODE = '23514';
      END IF;
    ELSIF v_fact = 'MONARCHY_BANDIT_RULE' THEN
      IF v_operator NOT IN ('EQ', 'NEQ', 'IS_KNOWN', 'IS_UNKNOWN')
         OR (v_operator IN ('EQ', 'NEQ') AND (jsonb_typeof(v_value) IS DISTINCT FROM 'string' OR NOT (v_value#>>'{}') = ANY (ARRAY['ALL_BANDITS', 'SURVIVING_BANDITS']))) THEN
        RAISE EXCEPTION 'invalid Monarchy Bandit rule condition' USING ERRCODE = '23514';
      END IF;
    ELSIF v_fact = 'WINNER_ROLE' THEN
      IF v_operator NOT IN ('EQ', 'NEQ', 'IS_KNOWN', 'IS_UNKNOWN')
         OR (v_operator IN ('EQ', 'NEQ') AND (jsonb_typeof(v_value) IS DISTINCT FROM 'string' OR NOT (v_value#>>'{}') = ANY (ARRAY['ARCHENEMY', 'HERO', 'KING', 'KINGSGUARD', 'TRAITOR', 'BANDIT']))) THEN
        RAISE EXCEPTION 'invalid winner role condition' USING ERRCODE = '23514';
      END IF;
    ELSE
      IF v_operator NOT IN ('EQ', 'NEQ') OR jsonb_typeof(v_value) IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'deck flags require a Yes or No comparison' USING ERRCODE = '23514';
      END IF;
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
    commander_cmc_snapshot, color_identity_snapshot, has_partner_commanders_snapshot,
    has_companion_snapshot, has_background_snapshot, seat_position, mode_role, is_winner
  )
  SELECT v_game_id, deck.owner_player_id, deck.id, deck.name, deck.bracket, deck.power_level,
    deck.commander_cmc, deck.color_identity, deck.has_partner_commanders, deck.has_companion,
    deck.has_background, (item->>'seatPosition')::integer,
    (item->>'modeRole')::app.game_participant_role,
    deck.owner_player_id = ANY (COALESCE(p_winner_player_ids, ARRAY[]::uuid[]))
  FROM jsonb_array_elements(p_participants) item JOIN app.decks deck ON deck.id = (item->>'deckId')::uuid;

  INSERT INTO app.game_achievement_rule_snapshots (
    game_id, game_mode_code, source_rule_id, achievement_id, rule_type, winner_role
  )
  SELECT v_game_id, p_game_mode, rule.id, rule.achievement_id, rule.rule_type, mode_rule.winner_role
  FROM app.game_mode_win_achievement_rules mode_rule
  JOIN app.achievement_automation_rules rule ON rule.id = mode_rule.rule_id AND rule.archived_at IS NULL
  JOIN app.achievements achievement ON achievement.id = rule.achievement_id AND achievement.archived_at IS NULL
  WHERE mode_rule.game_mode_code = p_game_mode;

  WITH rule_definitions AS (
    SELECT rule.id AS rule_id, rule.achievement_id, fact_rule.recipient,
      jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'fact', condition.fact_key,
        'operator', condition.operator,
        'value', condition.condition_value
      )) ORDER BY condition.display_order) AS conditions
    FROM app.achievement_automation_rules rule
    JOIN app.achievement_game_fact_rules fact_rule ON fact_rule.rule_id = rule.id
    JOIN app.achievement_game_fact_conditions condition ON condition.rule_id = fact_rule.rule_id
    JOIN app.achievements achievement ON achievement.id = rule.achievement_id AND achievement.archived_at IS NULL
    WHERE rule.rule_type = 'GAME_FACT' AND rule.archived_at IS NULL
    GROUP BY rule.id, rule.achievement_id, fact_rule.recipient, fact_rule.display_order
  ), inserted_snapshots AS (
    INSERT INTO app.game_achievement_rule_snapshots (
      game_id, game_mode_code, source_rule_id, achievement_id, rule_type, winner_role
    )
    SELECT v_game_id, p_game_mode, definition.rule_id, definition.achievement_id, 'GAME_FACT', NULL
    FROM rule_definitions definition
    RETURNING id, source_rule_id
  )
  INSERT INTO app.game_fact_rule_snapshots (snapshot_id, recipient, conditions)
  SELECT snapshot.id, definition.recipient, definition.conditions
  FROM inserted_snapshots snapshot
  JOIN rule_definitions definition ON definition.rule_id = snapshot.source_rule_id;

  IF p_game_mode = 'MONARCHY' THEN UPDATE app.pods SET monarchy_bandit_rule_default = p_monarchy_bandit_rule WHERE id = p_pod_id; END IF;
  INSERT INTO app.audit_events (pod_id, actor_player_id, action, entity_type, entity_id, metadata)
  VALUES (p_pod_id, p_actor_player_id, 'GAME_CREATED', 'game', v_game_id::text,
    jsonb_build_object('participantCount', v_participant_count, 'gameMode', p_game_mode, 'winnerPlayerIds', COALESCE(to_jsonb(p_winner_player_ids), '[]'::jsonb)));
  PERFORM private.reconcile_automatic_achievement_grants(p_pod_id, p_actor_player_id);
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
  IF p_game_mode IS DISTINCT FROM v_previous_mode THEN PERFORM private.assert_game_mode_automation_ready(p_game_mode); END IF;
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
    commander_cmc_snapshot, color_identity_snapshot, has_partner_commanders_snapshot,
    has_companion_snapshot, has_background_snapshot, seat_position, mode_role, is_winner
  )
  SELECT p_game_id, deck.owner_player_id, deck.id, deck.name, deck.bracket, deck.power_level,
    deck.commander_cmc, deck.color_identity, deck.has_partner_commanders, deck.has_companion,
    deck.has_background, (item->>'seatPosition')::integer,
    (item->>'modeRole')::app.game_participant_role,
    deck.owner_player_id = ANY (COALESCE(p_winner_player_ids, ARRAY[]::uuid[]))
  FROM jsonb_array_elements(p_participants) item JOIN app.decks deck ON deck.id = (item->>'deckId')::uuid
  ON CONFLICT (game_id, player_id) DO UPDATE SET deck_id = excluded.deck_id,
    deck_name_snapshot = CASE WHEN existing_participant.deck_id = excluded.deck_id THEN existing_participant.deck_name_snapshot ELSE excluded.deck_name_snapshot END,
    bracket_snapshot = CASE WHEN existing_participant.deck_id = excluded.deck_id THEN existing_participant.bracket_snapshot ELSE excluded.bracket_snapshot END,
    power_level_snapshot = CASE WHEN existing_participant.deck_id = excluded.deck_id THEN existing_participant.power_level_snapshot ELSE excluded.power_level_snapshot END,
    commander_cmc_snapshot = CASE WHEN existing_participant.deck_id = excluded.deck_id THEN existing_participant.commander_cmc_snapshot ELSE excluded.commander_cmc_snapshot END,
    color_identity_snapshot = CASE WHEN existing_participant.deck_id = excluded.deck_id THEN existing_participant.color_identity_snapshot ELSE excluded.color_identity_snapshot END,
    has_partner_commanders_snapshot = CASE WHEN existing_participant.deck_id = excluded.deck_id THEN existing_participant.has_partner_commanders_snapshot ELSE excluded.has_partner_commanders_snapshot END,
    has_companion_snapshot = CASE WHEN existing_participant.deck_id = excluded.deck_id THEN existing_participant.has_companion_snapshot ELSE excluded.has_companion_snapshot END,
    has_background_snapshot = CASE WHEN existing_participant.deck_id = excluded.deck_id THEN existing_participant.has_background_snapshot ELSE excluded.has_background_snapshot END,
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
CREATE OR REPLACE VIEW api.decks WITH (security_invoker = true) AS
SELECT id, owner_player_id, name, bracket, power_level, commander_cmc, color_identity,
  has_partner_commanders, has_companion, has_background, moxfield_url,
  created_at, updated_at, archived_at, version
FROM app.decks;
--> statement-breakpoint
CREATE OR REPLACE VIEW api.game_participants WITH (security_invoker = true) AS
SELECT game_id, player_id, deck_id, deck_name_snapshot, bracket_snapshot, power_level_snapshot,
  commander_cmc_snapshot, color_identity_snapshot, has_partner_commanders_snapshot,
  has_companion_snapshot, has_background_snapshot, seat_position, mode_role, is_winner
FROM app.game_participants;
--> statement-breakpoint
CREATE VIEW api.achievement_game_fact_rules WITH (security_invoker = true) AS
SELECT parent_rule.id AS rule_id, parent_rule.achievement_id, fact_rule.recipient,
  fact_rule.display_order, condition.id AS condition_id, condition.display_order AS condition_order,
  condition.fact_key, condition.operator, condition.condition_value
FROM app.achievement_automation_rules parent_rule
JOIN app.achievement_game_fact_rules fact_rule ON fact_rule.rule_id = parent_rule.id
JOIN app.achievement_game_fact_conditions condition ON condition.rule_id = fact_rule.rule_id
WHERE parent_rule.rule_type = 'GAME_FACT' AND parent_rule.archived_at IS NULL;
--> statement-breakpoint
REVOKE ALL ON app.achievement_game_fact_rules, app.achievement_game_fact_conditions, app.game_fact_rule_snapshots FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT ON api.achievement_game_fact_rules TO authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.create_achievement_with_rules(uuid, text, text, text, text, integer, jsonb) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.update_achievement_with_rules(uuid, uuid, text, text, text, text, integer, timestamptz, integer, jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.create_achievement_with_rules(uuid, text, text, text, text, integer, jsonb) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.update_achievement_with_rules(uuid, uuid, text, text, text, text, integer, timestamptz, integer, jsonb) TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.automatic_achievement_snapshot_matches(
  p_snapshot_id uuid,
  p_player_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $$
DECLARE
  v_snapshot app.game_achievement_rule_snapshots%ROWTYPE;
  v_game app.games%ROWTYPE;
  v_participant app.game_participants%ROWTYPE;
  v_conditions jsonb;
  v_condition jsonb;
  v_fact text;
  v_operator text;
  v_expected jsonb;
  v_actual jsonb;
  v_actual_number numeric;
  v_expected_number numeric;
  v_lower numeric;
  v_upper numeric;
  v_matches boolean;
  v_player_count integer;
BEGIN
  SELECT * INTO v_snapshot FROM app.game_achievement_rule_snapshots WHERE id = p_snapshot_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_game FROM app.games WHERE id = v_snapshot.game_id;
  IF NOT FOUND OR v_game.archived_at IS NOT NULL OR v_game.result_kind <> 'WIN' THEN RETURN false; END IF;
  SELECT * INTO v_participant FROM app.game_participants
  WHERE game_id = v_game.id AND player_id = p_player_id;
  IF NOT FOUND OR NOT v_participant.is_winner THEN RETURN false; END IF;

  IF v_snapshot.rule_type = 'GAME_MODE_WIN' THEN
    RETURN v_snapshot.game_mode_code = v_game.game_mode
      AND (v_snapshot.winner_role IS NULL OR v_snapshot.winner_role = v_participant.mode_role);
  END IF;
  IF v_snapshot.rule_type <> 'GAME_FACT' THEN RETURN false; END IF;

  SELECT conditions INTO v_conditions FROM app.game_fact_rule_snapshots
  WHERE snapshot_id = p_snapshot_id AND recipient = 'WINNER';
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT count(*) INTO v_player_count FROM app.game_participants WHERE game_id = v_game.id;

  FOR v_condition IN SELECT value FROM jsonb_array_elements(v_conditions) LOOP
    v_fact := v_condition->>'fact';
    v_operator := v_condition->>'operator';
    v_expected := v_condition->'value';
    v_actual := CASE v_fact
      WHEN 'GAME_MODE' THEN to_jsonb(v_game.game_mode)
      WHEN 'PLAYER_COUNT' THEN to_jsonb(v_player_count)
      WHEN 'MONARCHY_BANDIT_RULE' THEN to_jsonb(v_game.monarchy_bandit_rule::text)
      WHEN 'WINNER_SEAT' THEN to_jsonb(v_participant.seat_position)
      WHEN 'WINNER_ROLE' THEN to_jsonb(v_participant.mode_role::text)
      WHEN 'DECK_BRACKET' THEN to_jsonb(v_participant.bracket_snapshot)
      WHEN 'DECK_POWER_LEVEL' THEN to_jsonb(v_participant.power_level_snapshot)
      WHEN 'COMMANDER_CMC' THEN to_jsonb(v_participant.commander_cmc_snapshot)
      WHEN 'COLOR_IDENTITY' THEN to_jsonb(v_participant.color_identity_snapshot)
      WHEN 'COLOR_COUNT' THEN to_jsonb(cardinality(v_participant.color_identity_snapshot))
      WHEN 'HAS_PARTNER_COMMANDERS' THEN to_jsonb(v_participant.has_partner_commanders_snapshot)
      WHEN 'HAS_COMPANION' THEN to_jsonb(v_participant.has_companion_snapshot)
      WHEN 'HAS_BACKGROUND' THEN to_jsonb(v_participant.has_background_snapshot)
      ELSE NULL
    END;

    IF v_operator = 'IS_UNKNOWN' THEN
      v_matches := v_actual IS NULL OR v_actual = 'null'::jsonb;
    ELSIF v_operator = 'IS_KNOWN' THEN
      v_matches := v_actual IS NOT NULL AND v_actual <> 'null'::jsonb;
    ELSIF v_actual IS NULL OR v_actual = 'null'::jsonb THEN
      v_matches := false;
    ELSIF v_operator = 'IS_COLORLESS' THEN
      v_matches := jsonb_typeof(v_actual) = 'array' AND jsonb_array_length(v_actual) = 0;
    ELSIF v_operator = 'EXACTLY' THEN
      v_matches := v_actual = v_expected;
    ELSIF v_operator = 'CONTAINS_ALL' THEN
      v_matches := v_actual @> v_expected;
    ELSIF v_operator = 'CONTAINS_ANY' THEN
      v_matches := EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(v_actual) actual_color
        WHERE actual_color = ANY (ARRAY(SELECT jsonb_array_elements_text(v_expected)))
      );
    ELSIF v_operator = 'EXCLUDES_ALL' THEN
      v_matches := NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(v_actual) actual_color
        WHERE actual_color = ANY (ARRAY(SELECT jsonb_array_elements_text(v_expected)))
      );
    ELSIF v_fact = ANY (ARRAY['PLAYER_COUNT', 'WINNER_SEAT', 'DECK_BRACKET', 'DECK_POWER_LEVEL', 'COMMANDER_CMC', 'COLOR_COUNT']) THEN
      v_actual_number := (v_actual#>>'{}')::numeric;
      IF v_operator = 'BETWEEN' THEN
        v_lower := (v_expected->>0)::numeric;
        v_upper := (v_expected->>1)::numeric;
        v_matches := v_actual_number BETWEEN v_lower AND v_upper;
      ELSE
        v_expected_number := (v_expected#>>'{}')::numeric;
        v_matches := CASE v_operator
          WHEN 'EQ' THEN v_actual_number = v_expected_number
          WHEN 'NEQ' THEN v_actual_number <> v_expected_number
          WHEN 'LT' THEN v_actual_number < v_expected_number
          WHEN 'LTE' THEN v_actual_number <= v_expected_number
          WHEN 'GT' THEN v_actual_number > v_expected_number
          WHEN 'GTE' THEN v_actual_number >= v_expected_number
          ELSE false
        END;
      END IF;
    ELSE
      v_matches := CASE v_operator
        WHEN 'EQ' THEN v_actual = v_expected
        WHEN 'NEQ' THEN v_actual <> v_expected
        ELSE false
      END;
    END IF;
    IF NOT COALESCE(v_matches, false) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.validate_achievement_game()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, private
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
  IF NEW.grant_source = 'AUTOMATIC'
     AND NOT private.automatic_achievement_snapshot_matches(NEW.automatic_snapshot_id, NEW.player_id) THEN
    RAISE EXCEPTION 'automatic achievement grants require a matching winning rule snapshot'
      USING ERRCODE = '23514', CONSTRAINT = 'automatic_achievement_requires_matching_snapshot';
  END IF;
  RETURN NEW;
END
$$;
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
    WHERE game.pod_id = p_pod_id
      AND snapshot.achievement_id = v_grant.achievement_id
      AND private.automatic_achievement_snapshot_matches(snapshot.id, v_grant.player_id)
    ORDER BY game.played_at, game.id, snapshot.id
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
    JOIN app.game_participants participant ON participant.game_id = game.id AND participant.is_winner
    WHERE game.pod_id = p_pod_id
      AND private.automatic_achievement_snapshot_matches(snapshot.id, participant.player_id)
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
    ORDER BY participant.player_id, snapshot.achievement_id, game.played_at, game.id, snapshot.id
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
CREATE OR REPLACE FUNCTION private.set_achievement_game_fact_rules(
  p_actor_player_id uuid,
  p_achievement_id uuid,
  p_rules jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $$
DECLARE
  v_rule jsonb;
  v_condition jsonb;
  v_rule_id uuid;
  v_rule_position integer := 0;
  v_condition_position integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app.players player
    JOIN private.app_superuser superadmin ON superadmin.auth_user_id = player.auth_user_id
    WHERE player.id = p_actor_player_id AND player.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'superadmin access is required' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM app.achievements WHERE id = p_achievement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'achievement not found' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(COALESCE(p_rules, '[]'::jsonb)) IS DISTINCT FROM 'array'
     OR jsonb_array_length(COALESCE(p_rules, '[]'::jsonb)) > 10 THEN
    RAISE EXCEPTION 'an achievement accepts at most ten automatic rule groups' USING ERRCODE = '23514';
  END IF;
  FOR v_rule IN SELECT value FROM jsonb_array_elements(COALESCE(p_rules, '[]'::jsonb)) LOOP
    IF jsonb_typeof(v_rule) IS DISTINCT FROM 'object' OR v_rule->>'recipient' IS DISTINCT FROM 'WINNER' THEN
      RAISE EXCEPTION 'configurable automatic rules can only award winners' USING ERRCODE = '23514';
    END IF;
    PERFORM private.validate_game_fact_conditions(v_rule->'conditions');
  END LOOP;

  DELETE FROM app.achievement_automation_rules parent_rule
  WHERE parent_rule.achievement_id = p_achievement_id
    AND parent_rule.rule_type = 'GAME_FACT';

  FOR v_rule IN SELECT value FROM jsonb_array_elements(COALESCE(p_rules, '[]'::jsonb)) LOOP
    INSERT INTO app.achievement_automation_rules (achievement_id, rule_type, created_by_player_id)
    VALUES (p_achievement_id, 'GAME_FACT', p_actor_player_id)
    RETURNING id INTO v_rule_id;
    INSERT INTO app.achievement_game_fact_rules (rule_id, recipient, display_order)
    VALUES (v_rule_id, 'WINNER', v_rule_position);
    v_condition_position := 0;
    FOR v_condition IN SELECT value FROM jsonb_array_elements(v_rule->'conditions') LOOP
      INSERT INTO app.achievement_game_fact_conditions (
        rule_id, display_order, fact_key, operator, condition_value
      ) VALUES (
        v_rule_id, v_condition_position,
        (v_condition->>'fact')::app.achievement_game_fact_key,
        (v_condition->>'operator')::app.achievement_game_fact_operator,
        v_condition->'value'
      );
      v_condition_position := v_condition_position + 1;
    END LOOP;
    v_rule_position := v_rule_position + 1;
  END LOOP;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.create_achievement_with_rules(
  p_actor_player_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_category text,
  p_display_order integer,
  p_rules jsonb
)
RETURNS app.achievements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $$
DECLARE
  v_achievement app.achievements%ROWTYPE;
  v_category text;
BEGIN
  SELECT name INTO v_category FROM app.achievement_categories WHERE lower(name) = lower(p_category);
  IF v_category IS NULL THEN RAISE EXCEPTION 'choose an existing achievement category' USING ERRCODE = '23514'; END IF;
  INSERT INTO app.achievements (code, name, description, category, display_order, created_by_player_id)
  VALUES (p_code, p_name, p_description, v_category, p_display_order, p_actor_player_id)
  RETURNING * INTO v_achievement;
  PERFORM private.set_achievement_game_fact_rules(p_actor_player_id, v_achievement.id, p_rules);
  INSERT INTO app.audit_events (actor_player_id, action, entity_type, entity_id, metadata)
  VALUES (p_actor_player_id, 'ACHIEVEMENT_CREATED', 'achievement', v_achievement.id::text,
    jsonb_build_object('gameFactRuleCount', jsonb_array_length(COALESCE(p_rules, '[]'::jsonb))));
  RETURN v_achievement;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.update_achievement_with_rules(
  p_actor_player_id uuid,
  p_achievement_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_category text,
  p_display_order integer,
  p_archived_at timestamptz,
  p_expected_version integer,
  p_rules jsonb
)
RETURNS app.achievements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $$
DECLARE
  v_achievement app.achievements%ROWTYPE;
  v_category text;
  v_previous_archived_at timestamptz;
BEGIN
  SELECT name INTO v_category FROM app.achievement_categories WHERE lower(name) = lower(p_category);
  IF v_category IS NULL THEN RAISE EXCEPTION 'choose an existing achievement category' USING ERRCODE = '23514'; END IF;
  SELECT archived_at INTO v_previous_archived_at FROM app.achievements WHERE id = p_achievement_id;
  UPDATE app.achievements SET
    code = p_code, name = p_name, description = p_description, category = v_category,
    display_order = p_display_order, archived_at = p_archived_at,
    updated_at = now(), version = version + 1
  WHERE id = p_achievement_id AND version = p_expected_version
  RETURNING * INTO v_achievement;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM private.set_achievement_game_fact_rules(p_actor_player_id, p_achievement_id, p_rules);
  INSERT INTO app.audit_events (actor_player_id, action, entity_type, entity_id, metadata)
  VALUES (p_actor_player_id,
    CASE
      WHEN v_previous_archived_at IS NULL AND p_archived_at IS NOT NULL THEN 'ACHIEVEMENT_ARCHIVED'
      WHEN v_previous_archived_at IS NOT NULL AND p_archived_at IS NULL THEN 'ACHIEVEMENT_RESTORED'
      ELSE 'ACHIEVEMENT_UPDATED'
    END,
    'achievement', p_achievement_id::text,
    jsonb_build_object('gameFactRuleCount', jsonb_array_length(COALESCE(p_rules, '[]'::jsonb))));
  RETURN v_achievement;
END
$$;
