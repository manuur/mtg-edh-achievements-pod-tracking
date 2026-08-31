CREATE TYPE app.game_mode AS ENUM ('FREE_FOR_ALL', 'PENTAGON', 'ASTERISK', 'ARCHENEMY', 'MONARCHY');
--> statement-breakpoint
CREATE TYPE app.game_participant_role AS ENUM ('ARCHENEMY', 'HERO', 'KING', 'KINGSGUARD', 'TRAITOR', 'BANDIT');
--> statement-breakpoint
CREATE TYPE app.monarchy_bandit_rule AS ENUM ('ALL_BANDITS', 'SURVIVING_BANDITS');
--> statement-breakpoint
ALTER TABLE app.pods
  ADD COLUMN monarchy_bandit_rule_default app.monarchy_bandit_rule NOT NULL DEFAULT 'ALL_BANDITS';
--> statement-breakpoint
ALTER TABLE app.games
  ADD COLUMN game_mode app.game_mode NOT NULL DEFAULT 'FREE_FOR_ALL',
  ADD COLUMN monarchy_bandit_rule app.monarchy_bandit_rule;
--> statement-breakpoint
ALTER TABLE app.game_participants
  ADD COLUMN seat_position integer,
  ADD COLUMN mode_role app.game_participant_role,
  ADD COLUMN is_winner boolean NOT NULL DEFAULT false;
--> statement-breakpoint
UPDATE app.game_participants participant
SET is_winner = true
FROM app.games game
WHERE game.id = participant.game_id
  AND game.result_kind = 'WIN'
  AND game.winner_player_id = participant.player_id;
--> statement-breakpoint
ALTER TABLE app.games DROP CONSTRAINT games_result_winner_consistency;
--> statement-breakpoint
ALTER TABLE app.games
  ADD CONSTRAINT games_monarchy_rule_consistency CHECK (
    (game_mode = 'MONARCHY' AND monarchy_bandit_rule IS NOT NULL)
    OR (game_mode <> 'MONARCHY' AND monarchy_bandit_rule IS NULL)
  );
--> statement-breakpoint
ALTER TABLE app.game_participants
  ADD CONSTRAINT game_participants_seat_range CHECK (seat_position BETWEEN 1 AND 8);
--> statement-breakpoint
CREATE INDEX game_participants_game_winner_idx
  ON app.game_participants (game_id, is_winner);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.validate_game_input(
  p_game_mode app.game_mode,
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
BEGIN
  IF jsonb_typeof(p_participants) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'participants must be an array' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_participant_count FROM jsonb_array_elements(p_participants);
  IF v_participant_count NOT BETWEEN 2 AND 8 THEN
    RAISE EXCEPTION 'a game requires between 2 and 8 participants' USING ERRCODE = '23514';
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
  ) THEN
    RAISE EXCEPTION 'every winner must be a participant' USING ERRCODE = '23514';
  END IF;
  IF (p_result_kind = 'DRAW' AND v_winner_count <> 0)
     OR (p_result_kind = 'WIN' AND v_winner_count = 0) THEN
    RAISE EXCEPTION 'result and winners are inconsistent' USING ERRCODE = '23514';
  END IF;
  IF p_game_mode <> 'MONARCHY' AND p_monarchy_bandit_rule IS NOT NULL THEN
    RAISE EXCEPTION 'the Bandit rule is only valid for Monarchy' USING ERRCODE = '23514';
  END IF;

  IF p_game_mode = 'FREE_FOR_ALL' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_participants) item
      WHERE item->>'seatPosition' IS NOT NULL OR item->>'modeRole' IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Free-for-all does not use seats or roles' USING ERRCODE = '23514';
    END IF;
    IF p_result_kind = 'WIN' AND v_winner_count <> 1 THEN
      RAISE EXCEPTION 'Free-for-all requires exactly one winner' USING ERRCODE = '23514';
    END IF;
  ELSIF p_game_mode = 'PENTAGON' THEN
    IF v_participant_count <> 5 THEN
      RAISE EXCEPTION 'Pentagon requires exactly five players' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_participants) item WHERE item->>'modeRole' IS NOT NULL)
       OR (SELECT count(DISTINCT (item->>'seatPosition')::integer) FROM jsonb_array_elements(p_participants) item) <> 5
       OR (SELECT min((item->>'seatPosition')::integer) FROM jsonb_array_elements(p_participants) item) <> 1
       OR (SELECT max((item->>'seatPosition')::integer) FROM jsonb_array_elements(p_participants) item) <> 5 THEN
      RAISE EXCEPTION 'Pentagon requires unique clockwise seats 1 through 5 and no roles' USING ERRCODE = '23514';
    END IF;
    IF p_result_kind = 'WIN' AND v_winner_count <> 1 THEN
      RAISE EXCEPTION 'Pentagon requires exactly one winner' USING ERRCODE = '23514';
    END IF;
  ELSIF p_game_mode = 'ASTERISK' THEN
    IF v_participant_count <> 6 THEN
      RAISE EXCEPTION 'Asterisk requires exactly six players' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_participants) item WHERE item->>'modeRole' IS NOT NULL)
       OR (SELECT count(DISTINCT (item->>'seatPosition')::integer) FROM jsonb_array_elements(p_participants) item) <> 6
       OR (SELECT min((item->>'seatPosition')::integer) FROM jsonb_array_elements(p_participants) item) <> 1
       OR (SELECT max((item->>'seatPosition')::integer) FROM jsonb_array_elements(p_participants) item) <> 6 THEN
      RAISE EXCEPTION 'Asterisk requires unique clockwise seats 1 through 6 and no roles' USING ERRCODE = '23514';
    END IF;
    IF p_result_kind = 'WIN' THEN
      SELECT abs(max((item->>'seatPosition')::integer) - min((item->>'seatPosition')::integer))
      INTO v_winner_seat_distance
      FROM jsonb_array_elements(p_participants) item
      WHERE (item->>'playerId')::uuid = ANY (p_winner_player_ids);
      IF v_winner_count <> 2 OR v_winner_seat_distance <> 3 THEN
        RAISE EXCEPTION 'Asterisk winners must be one opposite-seat pair' USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSIF p_game_mode = 'ARCHENEMY' THEN
    IF v_participant_count < 3 THEN
      RAISE EXCEPTION 'Archenemy requires at least three players' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_participants) item WHERE item->>'seatPosition' IS NOT NULL)
       OR (SELECT count(*) FROM jsonb_array_elements(p_participants) item WHERE item->>'modeRole' = 'ARCHENEMY') <> 1
       OR (SELECT count(*) FROM jsonb_array_elements(p_participants) item WHERE item->>'modeRole' = 'HERO') <> v_participant_count - 1 THEN
      RAISE EXCEPTION 'Archenemy requires one Archenemy and all other players as Heroes' USING ERRCODE = '23514';
    END IF;
    IF p_result_kind = 'WIN' AND NOT (
      (v_winner_count = 1 AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_participants) item
        WHERE (item->>'playerId')::uuid = ANY (p_winner_player_ids) AND item->>'modeRole' = 'ARCHENEMY'
      ))
      OR
      (v_winner_count = v_participant_count - 1 AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_participants) item
        WHERE (item->>'playerId')::uuid = ANY (p_winner_player_ids) AND item->>'modeRole' <> 'HERO'
      ))
    ) THEN
      RAISE EXCEPTION 'choose either the Archenemy or the complete Heroes team' USING ERRCODE = '23514';
    END IF;
  ELSIF p_game_mode = 'MONARCHY' THEN
    IF v_participant_count <> 6 THEN
      RAISE EXCEPTION 'Monarchy requires exactly six players' USING ERRCODE = '23514';
    END IF;
    IF p_monarchy_bandit_rule IS NULL THEN
      RAISE EXCEPTION 'Monarchy requires a Bandit victory rule' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_participants) item WHERE item->>'seatPosition' IS NOT NULL)
       OR (SELECT count(*) FROM jsonb_array_elements(p_participants) item WHERE item->>'modeRole' = 'KING') <> 1
       OR (SELECT count(*) FROM jsonb_array_elements(p_participants) item WHERE item->>'modeRole' = 'KINGSGUARD') <> 1
       OR (SELECT count(*) FROM jsonb_array_elements(p_participants) item WHERE item->>'modeRole' = 'TRAITOR') <> 1
       OR (SELECT count(*) FROM jsonb_array_elements(p_participants) item WHERE item->>'modeRole' = 'BANDIT') <> 3 THEN
      RAISE EXCEPTION 'assign one King, one Kingsguard, one Traitor, and three Bandits' USING ERRCODE = '23514';
    END IF;
    IF p_result_kind = 'WIN' AND NOT (
      (v_winner_count BETWEEN 1 AND 2
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_participants) item
         WHERE (item->>'playerId')::uuid = ANY (p_winner_player_ids) AND item->>'modeRole' = 'KING'
       )
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_participants) item
         WHERE (item->>'playerId')::uuid = ANY (p_winner_player_ids)
           AND item->>'modeRole' NOT IN ('KING', 'KINGSGUARD')
       ))
      OR
      (v_winner_count = 1 AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_participants) item
        WHERE (item->>'playerId')::uuid = ANY (p_winner_player_ids) AND item->>'modeRole' = 'TRAITOR'
      ))
      OR
      (NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_participants) item
         WHERE (item->>'playerId')::uuid = ANY (p_winner_player_ids) AND item->>'modeRole' <> 'BANDIT'
       )
       AND ((p_monarchy_bandit_rule = 'ALL_BANDITS' AND v_winner_count = 3)
         OR (p_monarchy_bandit_rule = 'SURVIVING_BANDITS' AND v_winner_count BETWEEN 1 AND 3)))
    ) THEN
      RAISE EXCEPTION 'the selected winners do not form a valid Monarchy faction outcome' USING ERRCODE = '23514';
    END IF;
  END IF;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.hard_delete_player(
  p_actor_auth_user_id text,
  p_player_id uuid,
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
  v_target app.players%ROWTYPE;
  v_games_deleted integer := 0;
  v_decks_deleted integer := 0;
  v_memberships_deleted integer := 0;
  v_grants_deleted integer := 0;
  v_admin_pods_taken_over integer := 0;
  v_auth_rows_deleted integer := 0;
BEGIN
  SELECT player.id INTO v_actor_player_id
  FROM app.players player
  JOIN private.app_superuser superadmin ON superadmin.auth_user_id = player.auth_user_id
  WHERE superadmin.auth_user_id = p_actor_auth_user_id
    AND player.archived_at IS NULL;

  IF v_actor_player_id IS NULL THEN
    RAISE EXCEPTION 'superadmin access is required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target
  FROM app.players
  WHERE id = p_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'player not found' USING ERRCODE = '22023';
  END IF;
  IF v_target.version <> p_expected_version THEN
    RAISE EXCEPTION 'the player changed before it could be deleted' USING ERRCODE = '40001';
  END IF;
  IF p_player_id = v_actor_player_id OR EXISTS (
    SELECT 1 FROM private.app_superuser WHERE auth_user_id = v_target.auth_user_id
  ) THEN
    RAISE EXCEPTION 'the singleton superadmin cannot be deleted through the application' USING ERRCODE = '42501';
  END IF;
  IF p_confirmation IS DISTINCT FROM 'DELETE ' || v_target.display_name THEN
    RAISE EXCEPTION 'type the exact player deletion confirmation' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM app.pod_memberships WHERE player_id = p_player_id FOR UPDATE;

  WITH final_admin_pods AS (
    SELECT membership.pod_id
    FROM app.pod_memberships membership
    WHERE membership.player_id = p_player_id
      AND membership.role = 'ADMIN'
      AND membership.status = 'ACTIVE'
      AND membership.archived_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM app.pod_memberships other_admin
        WHERE other_admin.pod_id = membership.pod_id
          AND other_admin.player_id <> p_player_id
          AND other_admin.role = 'ADMIN'
          AND other_admin.status = 'ACTIVE'
          AND other_admin.archived_at IS NULL
      )
  )
  INSERT INTO app.pod_memberships (pod_id, player_id, role, status, archived_at)
  SELECT pod_id, v_actor_player_id, 'ADMIN', 'ACTIVE', NULL
  FROM final_admin_pods
  ON CONFLICT (pod_id, player_id) DO UPDATE SET
    role = 'ADMIN',
    status = 'ACTIVE',
    archived_at = NULL,
    updated_at = now(),
    version = app.pod_memberships.version + 1;
  GET DIAGNOSTICS v_admin_pods_taken_over = ROW_COUNT;

  SELECT count(*)::integer INTO v_games_deleted
  FROM app.games game
  WHERE EXISTS (
    SELECT 1
    FROM app.game_participants participant
    LEFT JOIN app.decks participant_deck ON participant_deck.id = participant.deck_id
    WHERE participant.game_id = game.id
      AND (participant.player_id = p_player_id OR participant_deck.owner_player_id = p_player_id)
  );

  DELETE FROM app.games game
  WHERE EXISTS (
    SELECT 1
    FROM app.game_participants participant
    LEFT JOIN app.decks participant_deck ON participant_deck.id = participant.deck_id
    WHERE participant.game_id = game.id
      AND (participant.player_id = p_player_id OR participant_deck.owner_player_id = p_player_id)
  );

  DELETE FROM app.pod_player_achievements
  WHERE player_id = p_player_id;
  GET DIAGNOSTICS v_grants_deleted = ROW_COUNT;

  UPDATE app.pod_player_achievements SET granted_by_player_id = v_actor_player_id
  WHERE granted_by_player_id = p_player_id;
  UPDATE app.pod_player_achievements SET revoked_by_player_id = v_actor_player_id
  WHERE revoked_by_player_id = p_player_id;
  UPDATE app.pods SET created_by_player_id = v_actor_player_id
  WHERE created_by_player_id = p_player_id;
  UPDATE app.games SET
    created_by_player_id = CASE WHEN created_by_player_id = p_player_id THEN v_actor_player_id ELSE created_by_player_id END,
    updated_by_player_id = CASE WHEN updated_by_player_id = p_player_id THEN v_actor_player_id ELSE updated_by_player_id END
  WHERE created_by_player_id = p_player_id OR updated_by_player_id = p_player_id;
  UPDATE app.decks SET created_by_player_id = v_actor_player_id
  WHERE created_by_player_id = p_player_id AND owner_player_id <> p_player_id;
  UPDATE app.achievements SET created_by_player_id = v_actor_player_id
  WHERE created_by_player_id = p_player_id;

  PERFORM set_config('app.superadmin_hard_delete', 'on', true);
  UPDATE app.audit_events
  SET actor_player_id = NULL,
      metadata = metadata || jsonb_build_object('deletedActorPlayerId', p_player_id::text)
  WHERE actor_player_id = p_player_id;

  DELETE FROM app.pod_memberships WHERE player_id = p_player_id;
  GET DIAGNOSTICS v_memberships_deleted = ROW_COUNT;
  DELETE FROM app.decks WHERE owner_player_id = p_player_id;
  GET DIAGNOSTICS v_decks_deleted = ROW_COUNT;
  DELETE FROM app.players WHERE id = p_player_id;

  IF v_target.auth_user_id IS NOT NULL THEN
    IF to_regclass('neon_auth."user"') IS NULL THEN
      RAISE EXCEPTION 'Neon Auth user table is unavailable' USING ERRCODE = '55000';
    END IF;
    EXECUTE 'DELETE FROM neon_auth."user" WHERE id = $1' USING v_target.auth_user_id;
    GET DIAGNOSTICS v_auth_rows_deleted = ROW_COUNT;
  END IF;

  INSERT INTO app.audit_events (actor_player_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_actor_player_id, 'PLAYER_HARD_DELETED', 'player', p_player_id::text,
    jsonb_build_object(
      'displayName', v_target.display_name,
      'gamesDeleted', v_games_deleted,
      'decksDeleted', v_decks_deleted,
      'membershipsDeleted', v_memberships_deleted,
      'grantsDeleted', v_grants_deleted,
      'adminPodsTakenOver', v_admin_pods_taken_over,
      'authAccountDeleted', v_auth_rows_deleted > 0
    )
  );

  RETURN jsonb_build_object(
    'id', p_player_id,
    'displayName', v_target.display_name,
    'gamesDeleted', v_games_deleted,
    'decksDeleted', v_decks_deleted,
    'membershipsDeleted', v_memberships_deleted,
    'grantsDeleted', v_grants_deleted,
    'adminPodsTakenOver', v_admin_pods_taken_over,
    'authAccountDeleted', v_auth_rows_deleted > 0
  );
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.hard_delete_player(text, uuid, integer, text) FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.game_players_are_opponents(
  p_game_id uuid,
  p_player_a_id uuid,
  p_player_b_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT CASE
    WHEN p_player_a_id = p_player_b_id THEN false
    WHEN game.game_mode = 'FREE_FOR_ALL' THEN true
    WHEN game.game_mode = 'PENTAGON' THEN
      least(abs(a.seat_position - b.seat_position), 5 - abs(a.seat_position - b.seat_position)) = 2
    WHEN game.game_mode = 'ASTERISK' THEN abs(a.seat_position - b.seat_position) <> 3
    WHEN game.game_mode = 'ARCHENEMY' THEN a.mode_role <> b.mode_role
    WHEN game.game_mode = 'MONARCHY' THEN
      CASE a.mode_role
        WHEN 'KING' THEN 'ROYAL'
        WHEN 'KINGSGUARD' THEN 'ROYAL'
        WHEN 'BANDIT' THEN 'BANDIT'
        ELSE a.mode_role::text
      END <> CASE b.mode_role
        WHEN 'KING' THEN 'ROYAL'
        WHEN 'KINGSGUARD' THEN 'ROYAL'
        WHEN 'BANDIT' THEN 'BANDIT'
        ELSE b.mode_role::text
      END
    ELSE true
  END
  FROM app.games game
  JOIN app.game_participants a ON a.game_id = game.id AND a.player_id = p_player_a_id
  JOIN app.game_participants b ON b.game_id = game.id AND b.player_id = p_player_b_id
  WHERE game.id = p_game_id
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.validate_game_input(app.game_mode, app.game_result_kind, app.monarchy_bandit_rule, uuid[], jsonb) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.game_players_are_opponents(uuid, uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION api.create_game(
  p_pod_id uuid,
  p_actor_player_id uuid,
  p_played_at timestamptz,
  p_game_mode app.game_mode,
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
  IF private.current_auth_user_id() IS NOT NULL
     AND (v_current_player_id IS NULL OR v_current_player_id <> p_actor_player_id) THEN
    RAISE EXCEPTION 'actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM app.pod_memberships membership
    JOIN app.pods pod ON pod.id = membership.pod_id AND pod.archived_at IS NULL
    WHERE membership.pod_id = p_pod_id
      AND membership.player_id = p_actor_player_id
      AND membership.status = 'ACTIVE'
      AND membership.archived_at IS NULL
      AND membership.role IN ('ADMIN', 'EDITOR')
  ) THEN
    RAISE EXCEPTION 'editor role is required' USING ERRCODE = '42501';
  END IF;

  PERFORM private.validate_game_input(
    p_game_mode, p_result_kind, p_monarchy_bandit_rule,
    COALESCE(p_winner_player_ids, ARRAY[]::uuid[]), p_participants
  );
  SELECT count(*) INTO v_participant_count FROM jsonb_array_elements(p_participants);

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_participants) item
    LEFT JOIN app.pod_memberships membership
      ON membership.pod_id = p_pod_id
     AND membership.player_id = (item->>'playerId')::uuid
     AND membership.status = 'ACTIVE'
     AND membership.archived_at IS NULL
    LEFT JOIN app.decks deck
      ON deck.id = (item->>'deckId')::uuid
     AND deck.owner_player_id = (item->>'playerId')::uuid
     AND deck.archived_at IS NULL
    LEFT JOIN app.players player
      ON player.id = (item->>'playerId')::uuid
     AND player.archived_at IS NULL
    WHERE membership.player_id IS NULL OR deck.id IS NULL OR player.id IS NULL
  ) THEN
    RAISE EXCEPTION 'each participant must be active and use their own active deck' USING ERRCODE = '23514';
  END IF;

  INSERT INTO app.games (
    pod_id, played_at, game_mode, monarchy_bandit_rule, result_kind, winner_player_id,
    notes, idempotency_key, created_by_player_id, updated_by_player_id
  ) VALUES (
    p_pod_id, p_played_at, p_game_mode, p_monarchy_bandit_rule, p_result_kind,
    (COALESCE(p_winner_player_ids, ARRAY[]::uuid[]))[1], COALESCE(p_notes, ''),
    p_idempotency_key, p_actor_player_id, p_actor_player_id
  )
  ON CONFLICT (pod_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_game_id;

  IF v_game_id IS NULL THEN
    SELECT id INTO v_game_id
    FROM app.games
    WHERE pod_id = p_pod_id AND idempotency_key = p_idempotency_key;
    RETURN v_game_id;
  END IF;

  INSERT INTO app.game_participants (
    game_id, player_id, deck_id, deck_name_snapshot, bracket_snapshot,
    power_level_snapshot, seat_position, mode_role, is_winner
  )
  SELECT v_game_id, deck.owner_player_id, deck.id, deck.name, deck.bracket,
    deck.power_level, (item->>'seatPosition')::integer,
    (item->>'modeRole')::app.game_participant_role,
    deck.owner_player_id = ANY (COALESCE(p_winner_player_ids, ARRAY[]::uuid[]))
  FROM jsonb_array_elements(p_participants) item
  JOIN app.decks deck ON deck.id = (item->>'deckId')::uuid;

  IF p_game_mode = 'MONARCHY' THEN
    UPDATE app.pods SET monarchy_bandit_rule_default = p_monarchy_bandit_rule
    WHERE id = p_pod_id;
  END IF;

  INSERT INTO app.audit_events (pod_id, actor_player_id, action, entity_type, entity_id, metadata)
  VALUES (p_pod_id, p_actor_player_id, 'GAME_CREATED', 'game', v_game_id::text,
    jsonb_build_object(
      'participantCount', v_participant_count,
      'gameMode', p_game_mode,
      'winnerPlayerIds', COALESCE(to_jsonb(p_winner_player_ids), '[]'::jsonb)
    ));
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
  p_game_mode app.game_mode,
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
BEGIN
  v_current_player_id := private.current_player_id();
  IF private.current_auth_user_id() IS NOT NULL
     AND (v_current_player_id IS NULL OR v_current_player_id <> p_actor_player_id) THEN
    RAISE EXCEPTION 'actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM app.pod_memberships membership
    JOIN app.pods pod ON pod.id = membership.pod_id AND pod.archived_at IS NULL
    WHERE membership.pod_id = p_pod_id
      AND membership.player_id = p_actor_player_id
      AND membership.status = 'ACTIVE'
      AND membership.archived_at IS NULL
      AND membership.role IN ('ADMIN', 'EDITOR')
  ) THEN
    RAISE EXCEPTION 'editor role is required' USING ERRCODE = '42501';
  END IF;

  PERFORM private.validate_game_input(
    p_game_mode, p_result_kind, p_monarchy_bandit_rule,
    COALESCE(p_winner_player_ids, ARRAY[]::uuid[]), p_participants
  );
  SELECT count(*) INTO v_participant_count FROM jsonb_array_elements(p_participants);

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_participants) item
    LEFT JOIN app.pod_memberships membership
      ON membership.pod_id = p_pod_id
     AND membership.player_id = (item->>'playerId')::uuid
     AND membership.status = 'ACTIVE'
     AND membership.archived_at IS NULL
    LEFT JOIN app.decks deck
      ON deck.id = (item->>'deckId')::uuid
     AND deck.owner_player_id = (item->>'playerId')::uuid
     AND deck.archived_at IS NULL
    LEFT JOIN app.players player
      ON player.id = (item->>'playerId')::uuid
     AND player.archived_at IS NULL
    WHERE membership.player_id IS NULL OR deck.id IS NULL OR player.id IS NULL
  ) THEN
    RAISE EXCEPTION 'each participant must be active and use their own active deck' USING ERRCODE = '23514';
  END IF;

  UPDATE app.games SET
    played_at = p_played_at,
    game_mode = p_game_mode,
    monarchy_bandit_rule = p_monarchy_bandit_rule,
    result_kind = p_result_kind,
    winner_player_id = (COALESCE(p_winner_player_ids, ARRAY[]::uuid[]))[1],
    notes = COALESCE(p_notes, ''),
    updated_by_player_id = p_actor_player_id,
    updated_at = now(),
    version = version + 1
  WHERE id = p_game_id
    AND pod_id = p_pod_id
    AND archived_at IS NULL
    AND version = p_expected_version;
  IF NOT FOUND THEN RETURN false; END IF;

  DELETE FROM app.game_participants existing
  WHERE existing.game_id = p_game_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_participants) item
      WHERE (item->>'playerId')::uuid = existing.player_id
    );

  INSERT INTO app.game_participants (
    game_id, player_id, deck_id, deck_name_snapshot, bracket_snapshot,
    power_level_snapshot, seat_position, mode_role, is_winner
  )
  SELECT p_game_id, deck.owner_player_id, deck.id, deck.name, deck.bracket,
    deck.power_level, (item->>'seatPosition')::integer,
    (item->>'modeRole')::app.game_participant_role,
    deck.owner_player_id = ANY (COALESCE(p_winner_player_ids, ARRAY[]::uuid[]))
  FROM jsonb_array_elements(p_participants) item
  JOIN app.decks deck ON deck.id = (item->>'deckId')::uuid
  ON CONFLICT (game_id, player_id) DO UPDATE SET
    deck_id = excluded.deck_id,
    deck_name_snapshot = excluded.deck_name_snapshot,
    bracket_snapshot = excluded.bracket_snapshot,
    power_level_snapshot = excluded.power_level_snapshot,
    seat_position = excluded.seat_position,
    mode_role = excluded.mode_role,
    is_winner = excluded.is_winner;

  IF p_game_mode = 'MONARCHY' THEN
    UPDATE app.pods SET monarchy_bandit_rule_default = p_monarchy_bandit_rule
    WHERE id = p_pod_id;
  END IF;

  INSERT INTO app.audit_events (pod_id, actor_player_id, action, entity_type, entity_id, metadata)
  VALUES (p_pod_id, p_actor_player_id, 'GAME_UPDATED', 'game', p_game_id::text,
    jsonb_build_object(
      'participantCount', v_participant_count,
      'previousVersion', p_expected_version,
      'gameMode', p_game_mode,
      'winnerPlayerIds', COALESCE(to_jsonb(p_winner_player_ids), '[]'::jsonb)
    ));
  RETURN true;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION api.create_game(
  p_pod_id uuid,
  p_actor_player_id uuid,
  p_played_at timestamptz,
  p_result_kind app.game_result_kind,
  p_winner_player_id uuid,
  p_notes text,
  p_idempotency_key uuid,
  p_participants jsonb
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app, private, api
AS $$
  SELECT api.create_game(
    p_pod_id, p_actor_player_id, p_played_at, 'FREE_FOR_ALL', NULL,
    p_result_kind,
    CASE WHEN p_winner_player_id IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[p_winner_player_id] END,
    p_notes, p_idempotency_key,
    (
      SELECT jsonb_agg(item || jsonb_build_object('seatPosition', NULL, 'modeRole', NULL))
      FROM jsonb_array_elements(p_participants) item
    )
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION api.update_game(
  p_game_id uuid,
  p_pod_id uuid,
  p_actor_player_id uuid,
  p_expected_version integer,
  p_played_at timestamptz,
  p_result_kind app.game_result_kind,
  p_winner_player_id uuid,
  p_notes text,
  p_participants jsonb
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app, private, api
AS $$
  SELECT api.update_game(
    p_game_id, p_pod_id, p_actor_player_id, p_expected_version, p_played_at,
    'FREE_FOR_ALL', NULL, p_result_kind,
    CASE WHEN p_winner_player_id IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[p_winner_player_id] END,
    p_notes,
    (
      SELECT jsonb_agg(item || jsonb_build_object('seatPosition', NULL, 'modeRole', NULL))
      FROM jsonb_array_elements(p_participants) item
    )
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE VIEW api.pods WITH (security_invoker = true) AS
SELECT id, name, timezone, created_by_player_id, created_at, updated_at,
       archived_at, version, monarchy_bandit_rule_default
FROM app.pods;
--> statement-breakpoint
CREATE OR REPLACE VIEW api.games WITH (security_invoker = true) AS
SELECT id, pod_id, played_at, result_kind, winner_player_id, notes, created_at,
       updated_at, archived_at, version, game_mode, monarchy_bandit_rule
FROM app.games;
--> statement-breakpoint
CREATE OR REPLACE VIEW api.game_participants WITH (security_invoker = true) AS
SELECT game_id, player_id, deck_id, deck_name_snapshot, bracket_snapshot,
       power_level_snapshot, created_at, seat_position, mode_role, is_winner
FROM app.game_participants;
--> statement-breakpoint
REVOKE ALL ON FUNCTION api.create_game(uuid, uuid, timestamptz, app.game_mode, app.monarchy_bandit_rule, app.game_result_kind, uuid[], text, uuid, jsonb) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION api.update_game(uuid, uuid, uuid, integer, timestamptz, app.game_mode, app.monarchy_bandit_rule, app.game_result_kind, uuid[], text, jsonb) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION api.create_game(uuid, uuid, timestamptz, app.game_mode, app.monarchy_bandit_rule, app.game_result_kind, uuid[], text, uuid, jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION api.update_game(uuid, uuid, uuid, integer, timestamptz, app.game_mode, app.monarchy_bandit_rule, app.game_result_kind, uuid[], text, jsonb) TO authenticated;
  END IF;
END
$$;
