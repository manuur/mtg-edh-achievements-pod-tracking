CREATE SCHEMA IF NOT EXISTS "api";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.current_auth_user_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    CASE
      WHEN NULLIF(current_setting('request.jwt.claims', true), '') IS NULL THEN NULL
      ELSE (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    END
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.current_player_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $$
  SELECT id
  FROM app.players
  WHERE auth_user_id = private.current_auth_user_id()
    AND archived_at IS NULL
  LIMIT 1
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.role_rank(p_role app.pod_role)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE p_role WHEN 'ADMIN' THEN 3 WHEN 'EDITOR' THEN 2 ELSE 1 END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.has_pod_role(p_pod_id uuid, p_min_role app.pod_role DEFAULT 'GUEST')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.pod_memberships membership
    JOIN app.pods pod ON pod.id = membership.pod_id
    WHERE membership.pod_id = p_pod_id
      AND membership.player_id = private.current_player_id()
      AND membership.status = 'ACTIVE'
      AND membership.archived_at IS NULL
      AND pod.archived_at IS NULL
      AND private.role_rank(membership.role) >= private.role_rank(p_min_role)
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.has_pod_role_including_archived(p_pod_id uuid, p_min_role app.pod_role DEFAULT 'GUEST')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.pod_memberships membership
    WHERE membership.pod_id = p_pod_id
      AND membership.player_id = private.current_player_id()
      AND membership.status = 'ACTIVE'
      AND membership.archived_at IS NULL
      AND private.role_rank(membership.role) >= private.role_rank(p_min_role)
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.can_create_initial_admin(p_pod_id uuid, p_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $$
  SELECT p_player_id = private.current_player_id()
    AND EXISTS (
      SELECT 1 FROM app.pods pod
      WHERE pod.id = p_pod_id
        AND pod.created_by_player_id = p_player_id
        AND pod.archived_at IS NULL
    )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.pod_has_other_administrator(p_pod_id uuid, p_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.pod_memberships membership
    WHERE membership.pod_id = p_pod_id
      AND membership.player_id <> p_player_id
      AND membership.role = 'ADMIN'
      AND membership.status = 'ACTIVE'
      AND membership.archived_at IS NULL
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.is_superuser()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private
AS $$
  SELECT EXISTS (
    SELECT 1 FROM private.app_superuser
    WHERE auth_user_id = private.current_auth_user_id()
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.can_view_player(p_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $$
  SELECT p_player_id = private.current_player_id()
    OR EXISTS (
      SELECT 1
      FROM app.pod_memberships mine
      JOIN app.pod_memberships theirs ON theirs.pod_id = mine.pod_id
      JOIN app.pods shared_pod ON shared_pod.id = mine.pod_id AND shared_pod.archived_at IS NULL
      WHERE mine.player_id = private.current_player_id()
        AND mine.status = 'ACTIVE'
        AND mine.archived_at IS NULL
        AND theirs.player_id = p_player_id
        AND theirs.status = 'ACTIVE'
        AND theirs.archived_at IS NULL
    )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.can_view_deck(p_owner_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $$
  SELECT private.can_view_player(p_owner_player_id)
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.can_manage_deck(p_owner_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $$
  SELECT p_owner_player_id = private.current_player_id()
    OR EXISTS (
      SELECT 1
      FROM app.pod_memberships staff
      JOIN app.pod_memberships owner_membership ON owner_membership.pod_id = staff.pod_id
      JOIN app.pods shared_pod ON shared_pod.id = staff.pod_id AND shared_pod.archived_at IS NULL
      WHERE staff.player_id = private.current_player_id()
        AND staff.status = 'ACTIVE'
        AND staff.archived_at IS NULL
        AND staff.role IN ('ADMIN', 'EDITOR')
        AND owner_membership.player_id = p_owner_player_id
        AND owner_membership.status = 'ACTIVE'
        AND owner_membership.archived_at IS NULL
    )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'audit events are immutable' USING ERRCODE = '42501';
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_events_immutable
BEFORE UPDATE OR DELETE ON app.audit_events
FOR EACH ROW EXECUTE FUNCTION private.reject_audit_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.protect_final_administrator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
BEGIN
  -- Serialize administrator changes for the same POD. Without this lock, two
  -- concurrent demotions could each observe the other administrator and leave
  -- the POD without an active administrator.
  PERFORM 1 FROM app.pods WHERE id = OLD.pod_id FOR UPDATE;

  IF OLD.status = 'ACTIVE'
     AND OLD.archived_at IS NULL
     AND OLD.role = 'ADMIN'
     AND (
       TG_OP = 'DELETE'
       OR NEW.status <> 'ACTIVE'
       OR NEW.archived_at IS NOT NULL
       OR NEW.role <> 'ADMIN'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM app.pod_memberships other_admin
       WHERE other_admin.pod_id = OLD.pod_id
         AND other_admin.player_id <> OLD.player_id
         AND other_admin.status = 'ACTIVE'
         AND other_admin.archived_at IS NULL
         AND other_admin.role = 'ADMIN'
     ) THEN
    RAISE EXCEPTION 'the final active administrator cannot be removed or demoted'
      USING ERRCODE = '23514', CONSTRAINT = 'pod_must_have_active_administrator';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER pod_final_administrator_guard
BEFORE UPDATE OR DELETE ON app.pod_memberships
FOR EACH ROW EXECUTE FUNCTION private.protect_final_administrator();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.validate_membership_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF NEW.role IN ('ADMIN', 'EDITOR') AND NOT EXISTS (
    SELECT 1 FROM app.players player
    WHERE player.id = NEW.player_id AND player.auth_user_id IS NOT NULL AND player.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'editor and administrator roles require a claimed active player'
      USING ERRCODE = '23514', CONSTRAINT = 'elevated_membership_requires_claimed_player';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER membership_claimed_identity_guard
BEFORE INSERT OR UPDATE OF role, player_id ON app.pod_memberships
FOR EACH ROW EXECUTE FUNCTION private.validate_membership_identity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.validate_pod_timezone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
    RAISE EXCEPTION 'invalid IANA timezone' USING ERRCODE = '23514', CONSTRAINT = 'pods_timezone_iana';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER pods_timezone_guard
BEFORE INSERT OR UPDATE OF timezone ON app.pods
FOR EACH ROW EXECUTE FUNCTION private.validate_pod_timezone();
--> statement-breakpoint
ALTER TABLE app.decks
  ADD CONSTRAINT decks_moxfield_https_url CHECK (
    moxfield_url IS NULL
    OR moxfield_url ~* '^https://(www\\.)?moxfield\\.com/decks/[A-Za-z0-9_-]+/?([?#].*)?$'
  );
--> statement-breakpoint
ALTER TABLE private.player_claim_emails
  ADD CONSTRAINT player_claim_email_normalized CHECK (
    email_normalized = lower(btrim(email_normalized))
    AND email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
  );
--> statement-breakpoint
CREATE OR REPLACE FUNCTION api.add_pod_member(
  p_pod_id uuid,
  p_actor_player_id uuid,
  p_display_name text,
  p_claim_email text,
  p_role app.pod_role
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, private, api
AS $$
DECLARE
  v_player_id uuid;
  v_email text;
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
      AND membership.role = 'ADMIN'
      AND membership.status = 'ACTIVE'
      AND membership.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'administrator role is required' USING ERRCODE = '42501';
  END IF;

  v_email := NULLIF(lower(btrim(p_claim_email)), '');
  IF v_email IS NOT NULL THEN
    SELECT claim.player_id INTO v_player_id
    FROM private.player_claim_emails claim
    WHERE claim.email_normalized = v_email;
  END IF;
  IF p_role IN ('ADMIN', 'EDITOR') AND v_player_id IS NULL THEN
    RAISE EXCEPTION 'the player must sign in before receiving an elevated role' USING ERRCODE = '23514';
  END IF;

  IF v_player_id IS NULL THEN
    INSERT INTO app.players (display_name) VALUES (p_display_name) RETURNING id INTO v_player_id;
    IF v_email IS NOT NULL THEN
      INSERT INTO private.player_claim_emails (player_id, email_normalized) VALUES (v_player_id, v_email);
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM app.players player WHERE player.id = v_player_id AND player.archived_at IS NULL) THEN
    RAISE EXCEPTION 'the player profile is archived' USING ERRCODE = '23514';
  END IF;

  IF p_role IN ('ADMIN', 'EDITOR') AND NOT EXISTS (
    SELECT 1 FROM app.players player WHERE player.id = v_player_id AND player.auth_user_id IS NOT NULL AND player.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'the player must sign in before receiving an elevated role' USING ERRCODE = '23514';
  END IF;

  INSERT INTO app.pod_memberships AS membership (pod_id, player_id, role, status, archived_at)
  VALUES (p_pod_id, v_player_id, p_role, 'ACTIVE', NULL)
  ON CONFLICT (pod_id, player_id) DO UPDATE SET
    role = excluded.role,
    status = 'ACTIVE',
    archived_at = NULL,
    updated_at = now(),
    version = membership.version + 1;

  INSERT INTO app.audit_events (pod_id, actor_player_id, action, entity_type, entity_id, metadata)
  VALUES (p_pod_id, p_actor_player_id, 'MEMBER_ADDED', 'player', v_player_id::text, jsonb_build_object('role', p_role));
  RETURN v_player_id;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION api.set_member_claim_email(
  p_pod_id uuid,
  p_actor_player_id uuid,
  p_player_id uuid,
  p_claim_email text
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
  IF private.current_auth_user_id() IS NOT NULL
     AND (v_current_player_id IS NULL OR v_current_player_id <> p_actor_player_id) THEN
    RAISE EXCEPTION 'actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM app.pod_memberships actor_membership
    JOIN app.pods pod ON pod.id = actor_membership.pod_id AND pod.archived_at IS NULL
    WHERE actor_membership.pod_id = p_pod_id
      AND actor_membership.player_id = p_actor_player_id
      AND actor_membership.role = 'ADMIN'
      AND actor_membership.status = 'ACTIVE'
      AND actor_membership.archived_at IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM app.pod_memberships target_membership
    WHERE target_membership.pod_id = p_pod_id AND target_membership.player_id = p_player_id
  ) THEN
    RAISE EXCEPTION 'administrator role and target membership are required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM app.players player WHERE player.id = p_player_id AND player.auth_user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'a claimed account identity cannot be changed' USING ERRCODE = '23514';
  END IF;

  INSERT INTO private.player_claim_emails (player_id, email_normalized)
  VALUES (p_player_id, lower(btrim(p_claim_email)))
  ON CONFLICT (player_id) DO UPDATE SET email_normalized = excluded.email_normalized;

  INSERT INTO app.audit_events (pod_id, actor_player_id, action, entity_type, entity_id)
  VALUES (p_pod_id, p_actor_player_id, 'MEMBER_CLAIM_EMAIL_SET', 'player', p_player_id::text);
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

  INSERT INTO app.games (
    pod_id, played_at, result_kind, winner_player_id, notes, idempotency_key,
    created_by_player_id, updated_by_player_id
  ) VALUES (
    p_pod_id, p_played_at, p_result_kind, p_winner_player_id, COALESCE(p_notes, ''),
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
    game_id, player_id, deck_id, deck_name_snapshot, bracket_snapshot, power_level_snapshot
  )
  SELECT v_game_id, deck.owner_player_id, deck.id, deck.name, deck.bracket, deck.power_level
  FROM jsonb_array_elements(p_participants) item
  JOIN app.decks deck ON deck.id = (item->>'deckId')::uuid;

  INSERT INTO app.audit_events (pod_id, actor_player_id, action, entity_type, entity_id, metadata)
  VALUES (p_pod_id, p_actor_player_id, 'GAME_CREATED', 'game', v_game_id::text,
    jsonb_build_object('participantCount', v_participant_count));

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

  DELETE FROM app.game_participants WHERE game_id = p_game_id;
  INSERT INTO app.game_participants (
    game_id, player_id, deck_id, deck_name_snapshot, bracket_snapshot, power_level_snapshot
  )
  SELECT p_game_id, deck.owner_player_id, deck.id, deck.name, deck.bracket, deck.power_level
  FROM jsonb_array_elements(p_participants) item
  JOIN app.decks deck ON deck.id = (item->>'deckId')::uuid;

  INSERT INTO app.audit_events (pod_id, actor_player_id, action, entity_type, entity_id, metadata)
  VALUES (p_pod_id, p_actor_player_id, 'GAME_UPDATED', 'game', p_game_id::text,
    jsonb_build_object('participantCount', v_participant_count, 'previousVersion', p_expected_version));
  RETURN true;
END
$$;
--> statement-breakpoint
CREATE VIEW api.players WITH (security_invoker = true) AS
SELECT id, display_name, created_at, archived_at, version FROM app.players;
--> statement-breakpoint
CREATE VIEW api.pods WITH (security_invoker = true) AS
SELECT id, name, timezone, created_by_player_id, created_at, updated_at, archived_at, version FROM app.pods;
--> statement-breakpoint
CREATE VIEW api.pod_memberships WITH (security_invoker = true) AS
SELECT pod_id, player_id, role, status, created_at, updated_at, archived_at, version FROM app.pod_memberships;
--> statement-breakpoint
CREATE VIEW api.decks WITH (security_invoker = true) AS
SELECT id, owner_player_id, name, bracket, power_level, moxfield_url, created_at, updated_at, archived_at, version FROM app.decks;
--> statement-breakpoint
CREATE VIEW api.games WITH (security_invoker = true) AS
SELECT id, pod_id, played_at, result_kind, winner_player_id, notes, created_at, updated_at, archived_at, version FROM app.games;
--> statement-breakpoint
CREATE VIEW api.game_participants WITH (security_invoker = true) AS
SELECT game_id, player_id, deck_id, deck_name_snapshot, bracket_snapshot, power_level_snapshot, created_at FROM app.game_participants;
--> statement-breakpoint
CREATE VIEW api.achievements WITH (security_invoker = true) AS
SELECT id, code, name, description, category, display_order, created_at, updated_at, archived_at, version FROM app.achievements;
--> statement-breakpoint
CREATE VIEW api.pod_player_achievements WITH (security_invoker = true) AS
SELECT pod_id, player_id, achievement_id, granted_by_player_id, granted_at, notes,
       revoked_by_player_id, revoked_at, version
FROM app.pod_player_achievements;
--> statement-breakpoint
ALTER TABLE app.players ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.pods ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.pod_memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.decks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.games ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.game_participants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.achievements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.pod_player_achievements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.audit_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE private.player_claim_emails ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE private.app_superuser ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY players_read_shared ON app.players FOR SELECT
USING (private.can_view_player(id));
--> statement-breakpoint
CREATE POLICY players_update_self ON app.players FOR UPDATE
USING (id = private.current_player_id())
WITH CHECK (id = private.current_player_id() AND auth_user_id = private.current_auth_user_id());
--> statement-breakpoint
CREATE POLICY pods_read_member ON app.pods FOR SELECT
USING (private.has_pod_role(id, 'GUEST') OR private.has_pod_role_including_archived(id, 'ADMIN'));
--> statement-breakpoint
CREATE POLICY pods_insert_owner ON app.pods FOR INSERT
WITH CHECK (created_by_player_id = private.current_player_id() AND archived_at IS NULL);
--> statement-breakpoint
CREATE POLICY pods_update_admin ON app.pods FOR UPDATE
USING (private.has_pod_role_including_archived(id, 'ADMIN'))
WITH CHECK (private.has_pod_role_including_archived(id, 'ADMIN'));
--> statement-breakpoint
CREATE POLICY memberships_read_pod ON app.pod_memberships FOR SELECT
USING (private.has_pod_role(pod_id, 'GUEST') OR private.has_pod_role_including_archived(pod_id, 'ADMIN'));
--> statement-breakpoint
CREATE POLICY memberships_insert_admin ON app.pod_memberships FOR INSERT
WITH CHECK (
  private.has_pod_role(pod_id, 'ADMIN')
  OR (
    player_id = private.current_player_id()
    AND role = 'ADMIN'
    AND status = 'ACTIVE'
    AND archived_at IS NULL
    AND private.can_create_initial_admin(pod_id, player_id)
  )
);
--> statement-breakpoint
CREATE POLICY memberships_update_admin ON app.pod_memberships FOR UPDATE
USING (private.has_pod_role(pod_id, 'ADMIN'))
WITH CHECK (
  private.has_pod_role_including_archived(pod_id, 'ADMIN')
  OR (
    player_id = private.current_player_id()
    AND private.pod_has_other_administrator(pod_id, player_id)
  )
);
--> statement-breakpoint
CREATE POLICY decks_read_shared ON app.decks FOR SELECT
USING (private.can_view_deck(owner_player_id));
--> statement-breakpoint
CREATE POLICY decks_insert_allowed ON app.decks FOR INSERT
WITH CHECK (private.can_manage_deck(owner_player_id) AND created_by_player_id = private.current_player_id());
--> statement-breakpoint
CREATE POLICY decks_update_allowed ON app.decks FOR UPDATE
USING (private.can_manage_deck(owner_player_id))
WITH CHECK (private.can_manage_deck(owner_player_id));
--> statement-breakpoint
CREATE POLICY games_read_member ON app.games FOR SELECT
USING (private.has_pod_role(pod_id, 'GUEST'));
--> statement-breakpoint
CREATE POLICY games_update_admin ON app.games FOR UPDATE
USING (private.has_pod_role(pod_id, 'ADMIN'))
WITH CHECK (private.has_pod_role(pod_id, 'ADMIN'));
--> statement-breakpoint
CREATE POLICY game_participants_read_member ON app.game_participants FOR SELECT
USING (EXISTS (
  SELECT 1 FROM app.games game
  WHERE game.id = game_id AND private.has_pod_role(game.pod_id, 'GUEST')
));
--> statement-breakpoint
CREATE POLICY achievements_read_authenticated ON app.achievements FOR SELECT
USING (private.current_player_id() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY achievements_superuser_write ON app.achievements FOR ALL
USING (private.is_superuser()) WITH CHECK (private.is_superuser());
--> statement-breakpoint
CREATE POLICY grants_read_member ON app.pod_player_achievements FOR SELECT
USING (private.has_pod_role(pod_id, 'GUEST'));
--> statement-breakpoint
CREATE POLICY grants_staff_write ON app.pod_player_achievements FOR ALL
USING (private.has_pod_role(pod_id, 'EDITOR'))
WITH CHECK (private.has_pod_role(pod_id, 'EDITOR'));
--> statement-breakpoint
CREATE POLICY audit_read_admin ON app.audit_events FOR SELECT
USING (pod_id IS NOT NULL AND private.has_pod_role_including_archived(pod_id, 'ADMIN'));
--> statement-breakpoint
CREATE POLICY audit_insert_actor ON app.audit_events FOR INSERT
WITH CHECK (actor_player_id = private.current_player_id());
--> statement-breakpoint
REVOKE ALL ON SCHEMA private FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA api FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON SCHEMA api FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA api FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA app, api TO authenticated;
    GRANT SELECT ON ALL TABLES IN SCHEMA app TO authenticated;
    GRANT SELECT ON ALL TABLES IN SCHEMA api TO authenticated;
    GRANT INSERT, UPDATE ON app.decks TO authenticated;
    GRANT INSERT, UPDATE ON app.pods, app.pod_memberships TO authenticated;
    GRANT UPDATE ON app.players, app.games TO authenticated;
    GRANT INSERT ON app.audit_events TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON app.achievements, app.pod_player_achievements TO authenticated;
    GRANT EXECUTE ON FUNCTION private.current_auth_user_id() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.current_player_id() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.role_rank(app.pod_role) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.has_pod_role(uuid, app.pod_role) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.has_pod_role_including_archived(uuid, app.pod_role) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.can_create_initial_admin(uuid, uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.pod_has_other_administrator(uuid, uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.is_superuser() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.can_view_player(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.can_view_deck(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.can_manage_deck(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION api.create_game(uuid, uuid, timestamptz, app.game_result_kind, uuid, text, uuid, jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION api.update_game(uuid, uuid, uuid, integer, timestamptz, app.game_result_kind, uuid, text, jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION api.add_pod_member(uuid, uuid, text, text, app.pod_role) TO authenticated;
    GRANT EXECUTE ON FUNCTION api.set_member_claim_email(uuid, uuid, uuid, text) TO authenticated;
  END IF;
END
$$;
