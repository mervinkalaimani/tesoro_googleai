-- ---------------------------------------------------------------------------
-- Approve by hand, or let them in on arrival.
--
-- Until now every signup landed as pending and waited for an admin to press
-- Approve. That is the right default for a collection nobody else should see,
-- and the wrong one the week the app is handed to a room of people -- so it
-- becomes a switch rather than a rule.
--
-- The switch is a deployment setting, not a column on anybody's row: it is a
-- fact about the install, the same for everyone, and `deployment_settings`
-- already holds exactly that kind of fact.
--
-- What it does NOT do is touch handle_new_user. That function is a hundred
-- lines of signup bookkeeping and rewriting it to change one boolean would put
-- all of it at risk for no reason. A second trigger, firing after it by name
-- order, flips the flag on the row it just wrote. Off, nothing happens at all.
-- ---------------------------------------------------------------------------

INSERT INTO public.deployment_settings (key, value)
VALUES ('auto_approve_signups', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tesoro_auto_approve_signups()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT value = 'true'::jsonb FROM public.deployment_settings
      WHERE key = 'auto_approve_signups'),
    false);
$$;

CREATE OR REPLACE FUNCTION public.tesoro_approve_on_arrival()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.tesoro_auto_approve_signups() THEN
    -- rejected_at is left alone on purpose: somebody who was turned away stays
    -- turned away until an admin says otherwise, switch or no switch.
    UPDATE public.tesoro_users
    SET is_approved = true
    WHERE auth_uid = NEW.id AND NOT is_approved AND rejected_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- The name matters. Postgres fires same-event triggers in alphabetical order,
-- and this one has to run after on_auth_user_created has written the row.
DROP TRIGGER IF EXISTS z_on_auth_user_auto_approve ON auth.users;
CREATE TRIGGER z_on_auth_user_auto_approve
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.tesoro_approve_on_arrival();

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF public.tesoro_auto_approve_signups() THEN
    RAISE EXCEPTION 'CHECK: the switch must arrive off, approval by hand stays the default';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'z_on_auth_user_auto_approve' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'CHECK: the auto-approve trigger was not created';
  END IF;

  -- Order, not just presence: alphabetically after the one that inserts the row.
  IF 'z_on_auth_user_auto_approve' <= 'on_auth_user_created' THEN
    RAISE EXCEPTION 'CHECK: this trigger would fire before the row exists';
  END IF;
END $$;
