-- Order IDs: which order a car was bought in.
--
--   prefix = UPPER(LEFT(seller_without_spaces, 3) || RIGHT(seller_without_spaces, 1))
--   id     = prefix || '-' || YYYY || '-' || MM || '-' || lpad(rank, 3, '0')
--
-- The shipping ID says which parcel a car turned up in. This says which time
-- you bought from that seller it came from, and the two are genuinely different
-- questions: one order is very often split across three parcels, and one parcel
-- just as often carries cars bought weeks apart.
--
-- Three departures from the shipping ID, all following from that:
--
--   The date is always O_Date. Never the arrival, never the ETA — an order
--   happened on the day it was placed, whatever became of it afterwards.
--
--   Pre-orders are not a separate run. A shipping ID splits them out because a
--   pre-order arrives by a different route; an order is an order, and splitting
--   would give one seller two SHLL-2026-06-001s in the same month.
--
--   The count resets every month, which is what putting YYYY-MM in the ID is
--   for. A seller's third order of June is -003 and their first of July is -001
--   again, so the ID says when without anyone having to look it up.
--
-- The app derives the same value in src/lib/order-id.ts and keeps it current as
-- cars are edited. This is the one-shot pass for rows that predate it.
--
-- Idempotent: running it twice changes nothing the second time.
--
-- To see what it would do first, replace the final UPDATE (from "UPDATE
-- public.tesoro_raw" to the semicolon) with:
--
--   SELECT t."Car ID", t."Name", t."Seller", t."O_Date",
--          t."Order ID" AS from_id, tg.order_id AS to_id
--   FROM public.tesoro_raw t
--   JOIN target tg ON t."Car ID" = tg.car_id
--   WHERE COALESCE(t."Order ID", '') IS DISTINCT FROM COALESCE(tg.order_id, '')
--   ORDER BY t."Seller", tg.order_id;

ALTER TABLE public.tesoro_raw
  ADD COLUMN IF NOT EXISTS "Order ID" text;

BEGIN;

WITH raw AS (
  -- Cast to text and parse once below rather than trusting the column type.
  -- tesoro_raw came from a sheet import, not from a migration, so "O_Date" may
  -- be text or date depending on what the importer inferred — and ::date would
  -- read 04/03/2026 as the 3rd of April under the server's MDY DateStyle.
  SELECT
    "Car ID"                            AS car_id,
    -- A seller's run of order days belongs to one collection. Without this two
    -- accounts buying from the same shop would interleave and renumber each
    -- other.
    user_id                             AS owner,
    btrim(COALESCE("Seller", ''))       AS seller,
    btrim(COALESCE("O_Date"::text, '')) AS ordered_txt
  FROM public.tesoro_raw
),
effective AS (
  SELECT
    car_id,
    owner,
    seller,
    -- The same two shapes parseDMY reads, in the same order: ISO first, then
    -- day-first. The ranges are in the pattern rather than left to to_date so a
    -- typo like "2026-13-01" comes out as no date at all instead of aborting
    -- the migration on a 22008. Anything else — blank, a note, a month name —
    -- is simply not a day, and a car without a day has no order ID.
    CASE
      WHEN ordered_txt ~ '^\d{4}[/-](0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])'
        THEN to_date(substring(ordered_txt from '^\d{4}[/-]\d{1,2}[/-]\d{1,2}'), 'YYYY-MM-DD')
      WHEN ordered_txt ~ '^(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])[/-]\d{4}'
        THEN to_date(substring(ordered_txt from '^\d{1,2}[/-]\d{1,2}[/-]\d{4}'), 'DD-MM-YYYY')
    END                                 AS eff_date
  FROM raw
),
ranked AS (
  SELECT
    car_id,
    seller,
    eff_date,
    -- DENSE_RANK is the direct equivalent of counting a run's distinct days: it
    -- numbers them and shares a number between ties, which is what makes every
    -- car ordered on one day come out with the same ID.
    DENSE_RANK() OVER (
      PARTITION BY owner, lower(seller), to_char(eff_date, 'YYYY-MM')
      ORDER BY eff_date
    ) AS rank
  FROM effective
  -- No seller or no usable date, no ID. That is a normal state, not a gap.
  WHERE seller <> '' AND eff_date IS NOT NULL
),
computed AS (
  SELECT
    car_id,
    upper(
      left(replace(seller, ' ', ''), 3) || right(replace(seller, ' ', ''), 1)
    )
    || '-' || to_char(eff_date, 'YYYY-MM') || '-'
    -- lpad, not to_char(rank, 'FM000'): a seller with a thousand order days in
    -- one month would come out of that mask as '###'. This pads to three and
    -- lets a four-digit rank through.
    || lpad(rank::text, 3, '0') AS order_id
  FROM ranked
),
target AS (
  -- Every row, against the ID it should carry. The LEFT JOIN is what makes the
  -- clearing case fall out of the same expression instead of needing a second
  -- statement with its own copy of the rules: a row the formula declines to
  -- number gets NULL here, and NULL is what it is set to.
  SELECT e.car_id, c.order_id
  FROM effective e
  LEFT JOIN computed c ON c.car_id = e.car_id
)
UPDATE public.tesoro_raw AS t
SET "Order ID" = tg.order_id
FROM target AS tg
WHERE t."Car ID" = tg.car_id
  -- COALESCE on both sides so an empty string and a NULL count as the same
  -- absence; otherwise every run would rewrite NULL over '' for ever.
  AND COALESCE(t."Order ID", '') IS DISTINCT FROM COALESCE(tg.order_id, '');

COMMIT;
