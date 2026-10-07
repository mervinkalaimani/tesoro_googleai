-- What a plan costs was three numbers compiled into the app, so changing a
-- price meant a deploy. It is a table now: one row per plan and length, which
-- is also what makes a length exist -- adding three months is adding a row,
-- not an enum, a constant and a label.

CREATE TABLE IF NOT EXISTS public.tesoro_plan_prices (
  plan   text    NOT NULL CHECK (plan IN ('plus', 'pro')),
  months integer NOT NULL CHECK (months BETWEEN 1 AND 60),
  -- Whole rupees. Nothing here is fractions of a rupee, and an integer cannot
  -- quietly become 48.999999.
  price  integer NOT NULL CHECK (price >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan, months)
);

COMMENT ON TABLE public.tesoro_plan_prices IS
  'What each plan costs for each length, in whole rupees. A row is also what makes that length buyable.';

-- What the constants said, so nothing moves on the day this lands.
INSERT INTO public.tesoro_plan_prices (plan, months, price) VALUES
  ('plus', 1, 49), ('plus', 6, 249), ('plus', 12, 499),
  ('pro',  1, 99), ('pro',  6, 499), ('pro',  12, 999)
ON CONFLICT (plan, months) DO NOTHING;

ALTER TABLE public.tesoro_plan_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone signed in reads prices" ON public.tesoro_plan_prices;
CREATE POLICY "Anyone signed in reads prices" ON public.tesoro_plan_prices
  FOR SELECT TO authenticated USING (true);

-- Writing is the owner's alone: an admin grants plans, the owner sets what
-- they cost.
DROP POLICY IF EXISTS "The owner sets prices" ON public.tesoro_plan_prices;
CREATE POLICY "The owner sets prices" ON public.tesoro_plan_prices
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tesoro_users t
                  WHERE t.auth_uid = auth.uid() AND t.is_owner))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tesoro_users t
                       WHERE t.auth_uid = auth.uid() AND t.is_owner));

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.tesoro_plan_prices;
  IF _n <> 6 THEN
    RAISE EXCEPTION 'CHECK: expected the six prices the app shipped with, found %', _n;
  END IF;

  IF (SELECT price FROM public.tesoro_plan_prices WHERE plan = 'plus' AND months = 1) <> 49 THEN
    RAISE EXCEPTION 'CHECK: Plus is not 49 a month';
  END IF;
  IF (SELECT price FROM public.tesoro_plan_prices WHERE plan = 'pro' AND months = 1) <> 99 THEN
    RAISE EXCEPTION 'CHECK: Pro is not 99 a month';
  END IF;

  -- Every longer run is cheaper per month than paying monthly, which is the
  -- only reason to offer one.
  IF EXISTS (
    SELECT 1 FROM public.tesoro_plan_prices p
      JOIN public.tesoro_plan_prices m ON m.plan = p.plan AND m.months = 1
     WHERE p.months > 1 AND p.price >= m.price * p.months
  ) THEN
    RAISE EXCEPTION 'CHECK: a longer plan costs more than paying monthly for it';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE tablename = 'tesoro_plan_prices' AND policyname = 'The owner sets prices') THEN
    RAISE EXCEPTION 'CHECK: nothing restricts who sets a price';
  END IF;

  RAISE NOTICE 'All checks passed.';
END $$;
