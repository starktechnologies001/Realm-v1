-- =================================================================────────────
-- live_location_sharing.sql
-- Live Location Sharing Feature Schema, RLS, and RPCs
-- =================================================================────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 1: live_location_shares (Consent relationships)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.live_location_shares (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status           text        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','accepted','declined','revoked','expired')),
    duration_minutes integer     NOT NULL CHECK (duration_minutes IN (15, 60, 480)),
    created_at       timestamptz NOT NULL DEFAULT now(),
    accepted_at      timestamptz,
    expires_at       timestamptz,
    revoked_at       timestamptz,
    revoked_by       uuid        REFERENCES public.profiles(id),
    CONSTRAINT lls_no_self_share CHECK (requester_id != recipient_id),
    CONSTRAINT lls_revoked_by_is_participant CHECK (
        revoked_by IS NULL
        OR revoked_by = requester_id
        OR revoked_by = recipient_id
    )
);

CREATE INDEX IF NOT EXISTS idx_lls_requester ON public.live_location_shares(requester_id);
CREATE INDEX IF NOT EXISTS idx_lls_recipient ON public.live_location_shares(recipient_id);
CREATE INDEX IF NOT EXISTS idx_lls_status    ON public.live_location_shares(status);
CREATE INDEX IF NOT EXISTS idx_lls_active    ON public.live_location_shares(requester_id, recipient_id, status, expires_at);

ALTER TABLE public.live_location_shares ENABLE ROW LEVEL SECURITY;

-- SELECT Policy on live_location_shares: participants can view their own shares
DROP POLICY IF EXISTS "lls_participants_select" ON public.live_location_shares;
CREATE POLICY "lls_participants_select"
ON public.live_location_shares FOR SELECT
TO authenticated
USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

-- Note: No INSERT, UPDATE, or DELETE policies are granted to authenticated clients on live_location_shares.
-- All mutations MUST go through SECURITY DEFINER RPC functions.


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 2: live_locations (Exact GPS coordinates)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.live_locations (
    user_id    uuid             PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    latitude   double precision NOT NULL,
    longitude  double precision NOT NULL,
    accuracy   double precision,
    updated_at timestamptz      NOT NULL DEFAULT now()
);

ALTER TABLE public.live_locations ENABLE ROW LEVEL SECURITY;

-- ── 1. INSERT POLICY ──
DROP POLICY IF EXISTS "ll_own_insert" ON public.live_locations;
CREATE POLICY "ll_own_insert"
ON public.live_locations FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
        SELECT 1
        FROM   public.live_location_shares lls
        WHERE  lls.status     = 'accepted'
        AND    lls.expires_at > now()
        AND    lls.revoked_at IS NULL
        AND    (lls.requester_id = auth.uid() OR lls.recipient_id = auth.uid())
        AND    EXISTS (
                   SELECT 1 FROM public.friendships f
                   WHERE  f.status = 'accepted'
                   AND    (
                              (f.requester_id = lls.requester_id AND f.receiver_id  = lls.recipient_id)
                           OR (f.receiver_id  = lls.requester_id AND f.requester_id = lls.recipient_id)
                          )
               )
        AND    NOT EXISTS (
                   SELECT 1 FROM public.blocked_users bu
                   WHERE  (bu.blocker_id = lls.requester_id AND bu.blocked_id = lls.recipient_id)
                       OR (bu.blocker_id = lls.recipient_id AND bu.blocked_id = lls.requester_id)
               )
    )
);

-- ── 2. UPDATE POLICY ──
DROP POLICY IF EXISTS "ll_own_update" ON public.live_locations;
CREATE POLICY "ll_own_update"
ON public.live_locations FOR UPDATE
TO authenticated
USING  (auth.uid() = user_id)
WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
        SELECT 1
        FROM   public.live_location_shares lls
        WHERE  lls.status     = 'accepted'
        AND    lls.expires_at > now()
        AND    lls.revoked_at IS NULL
        AND    (lls.requester_id = auth.uid() OR lls.recipient_id = auth.uid())
        AND    EXISTS (
                   SELECT 1 FROM public.friendships f
                   WHERE  f.status = 'accepted'
                   AND    (
                              (f.requester_id = lls.requester_id AND f.receiver_id  = lls.recipient_id)
                           OR (f.receiver_id  = lls.requester_id AND f.requester_id = lls.recipient_id)
                          )
               )
        AND    NOT EXISTS (
                   SELECT 1 FROM public.blocked_users bu
                   WHERE  (bu.blocker_id = lls.requester_id AND bu.blocked_id = lls.recipient_id)
                       OR (bu.blocker_id = lls.recipient_id AND bu.blocked_id = lls.requester_id)
               )
    )
);

-- ── 3. DELETE POLICY ──
DROP POLICY IF EXISTS "ll_own_delete" ON public.live_locations;
CREATE POLICY "ll_own_delete"
ON public.live_locations FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- ── 4. SELECT POLICY ──
DROP POLICY IF EXISTS "ll_authorized_select" ON public.live_locations;
CREATE POLICY "ll_authorized_select"
ON public.live_locations FOR SELECT
TO authenticated
USING (
    auth.uid() = user_id
    OR (
        EXISTS (
            SELECT 1
            FROM   public.live_location_shares lls
            WHERE  lls.status = 'accepted'
            AND    lls.expires_at > now()
            AND    lls.revoked_at IS NULL
            AND    (
                       (lls.requester_id = auth.uid() AND lls.recipient_id = live_locations.user_id)
                    OR (lls.recipient_id = auth.uid() AND lls.requester_id = live_locations.user_id)
                   )
        )
        AND EXISTS (
            SELECT 1
            FROM   public.friendships f
            WHERE  f.status = 'accepted'
            AND    (
                       (f.requester_id = auth.uid() AND f.receiver_id = live_locations.user_id)
                    OR (f.receiver_id  = auth.uid() AND f.requester_id = live_locations.user_id)
                   )
        )
        AND NOT EXISTS (
            SELECT 1
            FROM   public.blocked_users bu
            WHERE  (bu.blocker_id = auth.uid()             AND bu.blocked_id = live_locations.user_id)
                OR (bu.blocker_id = live_locations.user_id AND bu.blocked_id = auth.uid())
        )
    )
);


-- ─────────────────────────────────────────────────────────────────────────────
-- REALTIME PUBLICATION SETUP
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND tablename = 'live_locations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.live_locations;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND tablename = 'live_location_shares'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.live_location_shares;
    END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER RPC FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- ── RPC 1: request_live_location_share ──
CREATE OR REPLACE FUNCTION public.request_live_location_share(
    p_recipient_id     uuid,
    p_duration_minutes integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_requester_id uuid;
    v_share_id     uuid;
BEGIN
    v_requester_id := auth.uid();
    IF v_requester_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_requester_id = p_recipient_id THEN
        RAISE EXCEPTION 'Cannot share location with yourself' USING ERRCODE = 'check_violation';
    END IF;

    IF p_duration_minutes NOT IN (15, 60, 480) THEN
        RAISE EXCEPTION 'Invalid duration. Must be 15, 60, or 480' USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.friendships
        WHERE status = 'accepted'
        AND (
            (requester_id = v_requester_id AND receiver_id = p_recipient_id)
            OR (receiver_id = v_requester_id AND requester_id = p_recipient_id)
        )
    ) THEN
        RAISE EXCEPTION 'Users must be friends to share live location' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.blocked_users
        WHERE (blocker_id = v_requester_id AND blocked_id = p_recipient_id)
           OR (blocker_id = p_recipient_id AND blocked_id = v_requester_id)
    ) THEN
        RAISE EXCEPTION 'Cannot share location with a blocked user' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.live_location_shares
        WHERE status IN ('pending', 'accepted')
        AND (
            (requester_id = v_requester_id AND recipient_id = p_recipient_id)
            OR (requester_id = p_recipient_id AND recipient_id = v_requester_id)
        )
    ) THEN
        RAISE EXCEPTION 'A pending or active share already exists with this user' USING ERRCODE = 'unique_violation';
    END IF;

    INSERT INTO public.live_location_shares (requester_id, recipient_id, status, duration_minutes)
    VALUES (v_requester_id, p_recipient_id, 'pending', p_duration_minutes)
    RETURNING id INTO v_share_id;

    INSERT INTO public.messages (sender_id, receiver_id, content, message_type, is_read)
    VALUES (
        v_requester_id,
        p_recipient_id,
        json_build_object('share_id', v_share_id, 'duration_minutes', p_duration_minutes)::text,
        'live_location_request',
        false
    );

    RETURN v_share_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_live_location_share(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_live_location_share(uuid, integer) TO authenticated;


-- ── RPC 2: accept_live_location_share ──
CREATE OR REPLACE FUNCTION public.accept_live_location_share(p_share_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id uuid;
    v_share     public.live_location_shares%ROWTYPE;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_share FROM public.live_location_shares
    WHERE id = p_share_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Share not found' USING ERRCODE = 'no_data_found';
    END IF;

    IF v_share.recipient_id != v_caller_id THEN
        RAISE EXCEPTION 'Only the recipient can accept a share request' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_share.status != 'pending' THEN
        RAISE EXCEPTION 'Share is not in pending state (current: %)', v_share.status
            USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.friendships
        WHERE status = 'accepted'
        AND (
            (requester_id = v_caller_id AND receiver_id = v_share.requester_id)
            OR (receiver_id = v_caller_id AND requester_id = v_share.requester_id)
        )
    ) THEN
        RAISE EXCEPTION 'Friendship no longer exists' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.blocked_users
        WHERE (blocker_id = v_caller_id AND blocked_id = v_share.requester_id)
           OR (blocker_id = v_share.requester_id AND blocked_id = v_caller_id)
    ) THEN
        RAISE EXCEPTION 'Cannot accept — block exists' USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE public.live_location_shares SET
        status      = 'accepted',
        accepted_at = now(),
        expires_at  = now() + (v_share.duration_minutes || ' minutes')::interval
    WHERE id = p_share_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_live_location_share(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_live_location_share(uuid) TO authenticated;


-- ── RPC 3: decline_live_location_share ──
CREATE OR REPLACE FUNCTION public.decline_live_location_share(p_share_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id uuid;
    v_share     public.live_location_shares%ROWTYPE;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_share FROM public.live_location_shares
    WHERE id = p_share_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Share not found' USING ERRCODE = 'no_data_found';
    END IF;

    IF v_share.recipient_id != v_caller_id THEN
        RAISE EXCEPTION 'Only the recipient can decline a share request' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_share.status != 'pending' THEN
        RAISE EXCEPTION 'Share is not in pending state' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.live_location_shares SET status = 'declined' WHERE id = p_share_id;
END;
$$;

REVOKE ALL ON FUNCTION public.decline_live_location_share(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_live_location_share(uuid) TO authenticated;


-- ── RPC 4: revoke_live_location_share ──
CREATE OR REPLACE FUNCTION public.revoke_live_location_share(p_share_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id       uuid;
    v_share           public.live_location_shares%ROWTYPE;
    v_remaining_count integer;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_share FROM public.live_location_shares
    WHERE id = p_share_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Share not found' USING ERRCODE = 'no_data_found';
    END IF;

    IF v_share.requester_id != v_caller_id AND v_share.recipient_id != v_caller_id THEN
        RAISE EXCEPTION 'Not authorized to revoke this share' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_share.status != 'accepted' THEN
        RAISE EXCEPTION 'Can only revoke an accepted share (current: %)', v_share.status
            USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.live_location_shares SET
        status     = 'revoked',
        revoked_at = now(),
        revoked_by = v_caller_id
    WHERE id = p_share_id;

    SELECT COUNT(*) INTO v_remaining_count
    FROM public.live_location_shares
    WHERE id != p_share_id
    AND status = 'accepted'
    AND expires_at > now()
    AND revoked_at IS NULL
    AND (requester_id = v_caller_id OR recipient_id = v_caller_id);

    IF v_remaining_count = 0 THEN
        DELETE FROM public.live_locations WHERE user_id = v_caller_id;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_live_location_share(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_live_location_share(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
