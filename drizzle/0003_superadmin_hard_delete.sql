CREATE OR REPLACE FUNCTION private.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF current_setting('app.superadmin_hard_delete', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit events are immutable' USING ERRCODE = '42501';
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
  WHERE superadmin.auth_user_id = p_actor_auth_user_id
    AND player.archived_at IS NULL;

  IF v_actor_player_id IS NULL THEN
    RAISE EXCEPTION 'superadmin access is required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_achievement
  FROM app.achievements
  WHERE id = p_achievement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'achievement not found' USING ERRCODE = '22023';
  END IF;
  IF v_achievement.version <> p_expected_version THEN
    RAISE EXCEPTION 'the achievement changed before it could be deleted' USING ERRCODE = '40001';
  END IF;
  IF p_confirmation IS DISTINCT FROM 'DELETE ' || v_achievement.code THEN
    RAISE EXCEPTION 'type the exact achievement deletion confirmation' USING ERRCODE = '22023';
  END IF;

  DELETE FROM app.pod_player_achievements
  WHERE achievement_id = p_achievement_id;
  GET DIAGNOSTICS v_grants_deleted = ROW_COUNT;

  DELETE FROM app.achievements
  WHERE id = p_achievement_id;

  INSERT INTO app.audit_events (actor_player_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_actor_player_id,
    'ACHIEVEMENT_HARD_DELETED',
    'achievement',
    p_achievement_id::text,
    jsonb_build_object(
      'code', v_achievement.code,
      'name', v_achievement.name,
      'grantsDeleted', v_grants_deleted
    )
  );

  RETURN jsonb_build_object(
    'id', p_achievement_id,
    'code', v_achievement.code,
    'name', v_achievement.name,
    'grantsDeleted', v_grants_deleted
  );
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
  WHERE game.winner_player_id = p_player_id
     OR EXISTS (
       SELECT 1
       FROM app.game_participants participant
       LEFT JOIN app.decks participant_deck ON participant_deck.id = participant.deck_id
       WHERE participant.game_id = game.id
         AND (participant.player_id = p_player_id OR participant_deck.owner_player_id = p_player_id)
     );

  DELETE FROM app.games game
  WHERE game.winner_player_id = p_player_id
     OR EXISTS (
       SELECT 1
       FROM app.game_participants participant
       LEFT JOIN app.decks participant_deck ON participant_deck.id = participant.deck_id
       WHERE participant.game_id = game.id
         AND (participant.player_id = p_player_id OR participant_deck.owner_player_id = p_player_id)
     );

  DELETE FROM app.pod_player_achievements
  WHERE player_id = p_player_id;
  GET DIAGNOSTICS v_grants_deleted = ROW_COUNT;

  UPDATE app.pod_player_achievements
  SET granted_by_player_id = v_actor_player_id
  WHERE granted_by_player_id = p_player_id;

  UPDATE app.pod_player_achievements
  SET revoked_by_player_id = v_actor_player_id
  WHERE revoked_by_player_id = p_player_id;

  UPDATE app.pods
  SET created_by_player_id = v_actor_player_id
  WHERE created_by_player_id = p_player_id;

  UPDATE app.games
  SET
    created_by_player_id = CASE WHEN created_by_player_id = p_player_id THEN v_actor_player_id ELSE created_by_player_id END,
    updated_by_player_id = CASE WHEN updated_by_player_id = p_player_id THEN v_actor_player_id ELSE updated_by_player_id END
  WHERE created_by_player_id = p_player_id OR updated_by_player_id = p_player_id;

  UPDATE app.decks
  SET created_by_player_id = v_actor_player_id
  WHERE created_by_player_id = p_player_id AND owner_player_id <> p_player_id;

  UPDATE app.achievements
  SET created_by_player_id = v_actor_player_id
  WHERE created_by_player_id = p_player_id;

  PERFORM set_config('app.superadmin_hard_delete', 'on', true);
  UPDATE app.audit_events
  SET actor_player_id = NULL,
      metadata = metadata || jsonb_build_object('deletedActorPlayerId', p_player_id::text)
  WHERE actor_player_id = p_player_id;

  DELETE FROM app.pod_memberships
  WHERE player_id = p_player_id;
  GET DIAGNOSTICS v_memberships_deleted = ROW_COUNT;

  DELETE FROM app.decks
  WHERE owner_player_id = p_player_id;
  GET DIAGNOSTICS v_decks_deleted = ROW_COUNT;

  DELETE FROM app.players
  WHERE id = p_player_id;

  IF v_target.auth_user_id IS NOT NULL THEN
    IF to_regclass('neon_auth."user"') IS NULL THEN
      RAISE EXCEPTION 'Neon Auth user table is unavailable' USING ERRCODE = '55000';
    END IF;
    EXECUTE 'DELETE FROM neon_auth."user" WHERE id = $1'
      USING v_target.auth_user_id;
    GET DIAGNOSTICS v_auth_rows_deleted = ROW_COUNT;
  END IF;

  INSERT INTO app.audit_events (actor_player_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_actor_player_id,
    'PLAYER_HARD_DELETED',
    'player',
    p_player_id::text,
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
REVOKE ALL ON FUNCTION private.hard_delete_achievement(text, uuid, integer, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.hard_delete_player(text, uuid, integer, text) FROM PUBLIC;
