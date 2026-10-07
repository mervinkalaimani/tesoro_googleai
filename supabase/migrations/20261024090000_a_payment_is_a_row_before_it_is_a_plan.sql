-- What was paid, written before the money moves and settled after.
--
-- A plan granted straight from a browser saying "it worked" is a plan anybody
-- can grant themselves. So the order is created server-side at a price read
-- from tesoro_plan_prices, the row is written here first, and only a signature
-- this deployment can verify turns it into a plan.
--
-- Nothing in this table is written by a browser. There is no insert or update
-- policy at all, which is the point: the only writer is the server, with the
-- service role, after it has checked the signature.

CREATE TABLE IF NOT EXISTS public.tesoro_payments (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auth_uid           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan               text NOT NULL CHECK (plan IN ('plus', 'pro')),
  months             integer NOT NULL CHECK (months BETWEEN 1 AND 60),
  -- In paise, because that is what Razorpay counts in and rounding rupees
  -- twice is how a bill ends up a paisa short.
  amount_paise       integer NOT NULL CHECK (amount_paise >= 0),
  currency           text NOT NULL DEFAULT 'INR',
  razorpay_order_id  text NOT NULL UNIQUE,
  razorpay_payment_id text UNIQUE,
  status             text NOT NULL DEFAULT 'created'
                     CHECK (status IN ('created', 'paid', 'failed')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  paid_at            timestamptz,
  granted_until      date
);

COMMENT ON TABLE public.tesoro_payments IS
  'One row per attempt to pay. Written only by the server; a browser can read its own and nothing else.';

CREATE INDEX IF NOT EXISTS tesoro_payments_by_account
  ON public.tesoro_payments (auth_uid, created_at DESC);

ALTER TABLE public.tesoro_payments ENABLE ROW LEVEL SECURITY;

-- Reading your own receipts, and an admin reading all of them. No insert and
-- no update policy exists, so nothing with an anon or authenticated key can
-- write here however it asks.
DROP POLICY IF EXISTS "Read your own payments" ON public.tesoro_payments;
CREATE POLICY "Read your own payments" ON public.tesoro_payments
  FOR SELECT TO authenticated
  USING (auth_uid = auth.uid() OR public.is_tesoro_admin(auth.uid()));

DO $$
DECLARE _writes int;
BEGIN
  SELECT count(*) INTO _writes FROM pg_policies
   WHERE tablename = 'tesoro_payments' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL');
  IF _writes > 0 THEN
    RAISE EXCEPTION 'CHECK: something other than the server can write a payment';
  END IF;

  IF (SELECT relrowsecurity FROM pg_class WHERE relname = 'tesoro_payments') IS NOT TRUE THEN
    RAISE EXCEPTION 'CHECK: row level security is off on tesoro_payments';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE tablename = 'tesoro_payments' AND indexdef ILIKE '%UNIQUE%razorpay_order_id%'
  ) THEN
    RAISE EXCEPTION 'CHECK: an order id can be used twice';
  END IF;

  RAISE NOTICE 'All checks passed.';
END $$;
