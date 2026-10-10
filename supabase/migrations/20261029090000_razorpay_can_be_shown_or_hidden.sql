-- ---------------------------------------------------------------------------
-- Offering the card, as a switch.
--
-- Razorpay's keys stay where they are, in environment variables, and the
-- server already answers "is it configured". This is the other question: do we
-- want to offer it — which has a different answer on the day the gateway is
-- misbehaving, or the account is not activated, or the test keys stopped
-- authenticating and nobody has swapped them yet.
--
-- Off, the plan dialog shows only the direct route: we send the payment
-- details and switch the plan on once the money arrives. That route is always
-- there, so turning the card off never leaves somebody with no way to pay.
--
-- On to begin with, because that is what the app does today.
-- ---------------------------------------------------------------------------

INSERT INTO public.deployment_settings (key, value)
VALUES ('pay_card', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.deployment_settings WHERE key = 'pay_card' AND value = 'true'::jsonb
  ) THEN
    RAISE EXCEPTION 'CHECK: the card option must arrive switched on';
  END IF;
END $$;
