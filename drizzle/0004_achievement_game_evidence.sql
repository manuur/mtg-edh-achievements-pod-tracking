DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.pod_player_achievements) THEN
    RAISE EXCEPTION 'existing achievement grants must be assigned to games before applying this migration';
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE app.pod_player_achievements
  ADD COLUMN game_id uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE app.games
  ADD CONSTRAINT games_id_pod_unique UNIQUE (id, pod_id);
--> statement-breakpoint
ALTER TABLE app.pod_player_achievements
  ADD CONSTRAINT pod_player_achievements_game_pod_fk
  FOREIGN KEY (game_id, pod_id)
  REFERENCES app.games (id, pod_id)
  ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE app.pod_player_achievements
  ADD CONSTRAINT pod_player_achievements_game_player_fk
  FOREIGN KEY (game_id, player_id)
  REFERENCES app.game_participants (game_id, player_id)
  ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX pod_player_achievements_game_idx
  ON app.pod_player_achievements (game_id);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.validate_achievement_game()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM app.games game
    JOIN app.game_participants participant
      ON participant.game_id = game.id
     AND participant.player_id = NEW.player_id
    WHERE game.id = NEW.game_id
      AND game.pod_id = NEW.pod_id
      AND game.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'achievement grants require an active game in this POD in which the player participated'
      USING ERRCODE = '23514', CONSTRAINT = 'achievement_grant_requires_active_participating_game';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER achievement_grant_game_guard
BEFORE INSERT OR UPDATE OF game_id, pod_id, player_id
ON app.pod_player_achievements
FOR EACH ROW EXECUTE FUNCTION private.validate_achievement_game();
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

  SELECT count(*) INTO v_participant_count FROM jsonb_array_elements(p_participants);
  IF jsonb_typeof(p_participants) <> 'array' OR v_participant_count NOT BETWEEN 2 AND 8 THEN
    RAISE EXCEPTION 'a game requires between 2 and 8 participants' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(DISTINCT item->>'playerId') FROM jsonb_array_elements(p_participants) item) <> v_participant_count THEN
    RAISE EXCEPTION 'participants must be unique' USING ERRCODE = '23514';
  END IF;
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
  IF p_result_kind = 'WIN' AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_participants) item
    WHERE (item->>'playerId')::uuid = p_winner_player_id
  ) THEN
    RAISE EXCEPTION 'winner must be a participant' USING ERRCODE = '23514';
  END IF;
  IF (p_result_kind = 'DRAW' AND p_winner_player_id IS NOT NULL)
     OR (p_result_kind = 'WIN' AND p_winner_player_id IS NULL) THEN
    RAISE EXCEPTION 'result and winner are inconsistent' USING ERRCODE = '23514';
  END IF;

  UPDATE app.games SET
    played_at = p_played_at,
    result_kind = p_result_kind,
    winner_player_id = p_winner_player_id,
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
    game_id, player_id, deck_id, deck_name_snapshot, bracket_snapshot, power_level_snapshot
  )
  SELECT p_game_id, deck.owner_player_id, deck.id, deck.name, deck.bracket, deck.power_level
  FROM jsonb_array_elements(p_participants) item
  JOIN app.decks deck ON deck.id = (item->>'deckId')::uuid
  ON CONFLICT (game_id, player_id) DO UPDATE SET
    deck_id = excluded.deck_id,
    deck_name_snapshot = excluded.deck_name_snapshot,
    bracket_snapshot = excluded.bracket_snapshot,
    power_level_snapshot = excluded.power_level_snapshot;

  INSERT INTO app.audit_events (pod_id, actor_player_id, action, entity_type, entity_id, metadata)
  VALUES (p_pod_id, p_actor_player_id, 'GAME_UPDATED', 'game', p_game_id::text,
    jsonb_build_object('participantCount', v_participant_count, 'previousVersion', p_expected_version));
  RETURN true;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE VIEW api.pod_player_achievements WITH (security_invoker = true) AS
SELECT pod_id, player_id, achievement_id, granted_by_player_id, granted_at, notes,
       revoked_by_player_id, revoked_at, version, game_id
FROM app.pod_player_achievements;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.validate_achievement_game() FROM PUBLIC;
