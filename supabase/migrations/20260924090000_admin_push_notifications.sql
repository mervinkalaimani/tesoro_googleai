-- Push notifications for admins when someone new asks to join, with Approve
-- and Reject straight from the notification.
--
--   rejected_at       an admin said no. The account stays blocked (it was never
--                     approved) and drops out of the approval queue.
--   approval_push_at  when the admins were pushed about this account, so a
--                     reload of the waiting screen does not ping them again.
--
-- Subscriptions are per device: one admin can have a phone and a laptop.

ALTER TABLE public.tesoro_users
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_push_at timestamptz;

-- Both sit on a row its owner may update, and neither is theirs to change: a
-- rejected account clearing its own rejection would be back in the queue, and
-- clearing approval_push_at would let it ping the admins at will. The service
-- role (no auth.uid()) and admins pass through.
CREATE OR REPLACE FUNCTION public.protect_tesoro_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_tesoro_admin(auth.uid()) THEN
    NEW.rejected_at      := OLD.rejected_at;
    NEW.approval_push_at := OLD.approval_push_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tesoro_users_protect_review ON public.tesoro_users;
CREATE TRIGGER tesoro_users_protect_review
  BEFORE UPDATE ON public.tesoro_users
  FOR EACH ROW EXECUTE FUNCTION public.protect_tesoro_review();

-- ---------------------------------------------------------------------------
-- Admin list gains rejected_at (a changed return type needs a drop first)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE FUNCTION public.admin_list_users()
RETURNS TABLE (
  sno           bigint,
  user_id       text,
  auth_uid      uuid,
  first_name    text,
  last_name     text,
  email_id      text,
  dob           date,
  is_admin      boolean,
  is_approved   boolean,
  is_owner      boolean,
  created_at    timestamptz,
  car_count     bigint,
  last_sign_in  timestamptz,
  rejected_at   timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.sno, t.user_id, t.auth_uid, t.first_name, t.last_name, t.email_id, t.dob,
    t.is_admin, t.is_approved, t.is_owner, t.created_at,
    (SELECT count(*) FROM public.tesoro_raw c WHERE c.user_id = t.auth_uid) AS car_count,
    u.last_sign_in_at,
    t.rejected_at
  FROM public.tesoro_users t
  LEFT JOIN auth.users u ON u.id = t.auth_uid
  WHERE public.is_tesoro_admin(auth.uid())
  ORDER BY t.sno;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM public;
REVOKE ALL ON FUNCTION public.admin_list_users() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- ---------------------------------------------------------------------------
-- Push subscriptions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tesoro_push_subscriptions (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auth_uid     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tesoro_push_subscriptions_auth_uid_idx
  ON public.tesoro_push_subscriptions (auth_uid);

ALTER TABLE public.tesoro_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Read-only to the client: a device lists its own rows to show the switch's
-- state. Writes go through the functions below; the server reads everyone's
-- with the service role when it sends.
DROP POLICY IF EXISTS "Users read own push subscriptions" ON public.tesoro_push_subscriptions;
CREATE POLICY "Users read own push subscriptions" ON public.tesoro_push_subscriptions
  FOR SELECT USING (auth_uid = auth.uid());

REVOKE ALL ON public.tesoro_push_subscriptions FROM anon, authenticated;
GRANT SELECT ON public.tesoro_push_subscriptions TO authenticated;

-- A browser has one endpoint whoever is signed in, so saving takes it over from
-- any account that used this device before. Admins only: nobody else is sent
-- anything yet.
CREATE OR REPLACE FUNCTION public.save_push_subscription(
  _endpoint text, _p256dh text, _auth text, _user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_tesoro_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only an admin can turn on these notifications.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF COALESCE(_endpoint, '') !~ '^https://' OR COALESCE(_p256dh, '') = '' OR COALESCE(_auth, '') = '' THEN
    RAISE EXCEPTION 'That is not a push subscription.' USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.tesoro_push_subscriptions WHERE endpoint = _endpoint;
  INSERT INTO public.tesoro_push_subscriptions (auth_uid, endpoint, p256dh, auth, user_agent)
  VALUES (auth.uid(), _endpoint, _p256dh, _auth, left(_user_agent, 300));
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_push_subscription(_endpoint text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.tesoro_push_subscriptions
  WHERE endpoint = _endpoint AND auth_uid = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.save_push_subscription(text, text, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.delete_push_subscription(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(text) TO authenticated;
