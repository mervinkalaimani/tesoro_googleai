-- Rebuild every "Shipping ID" from the sheet formula.
--
--   prefix   = UPPER(LEFT(seller_without_spaces, 3) || RIGHT(seller_without_spaces, 1))
--   eff_date = "Date" (arrival), else "Expected Date" while in flight, else "O_Date"
--   is_po    = the car is a pre-order
--   rank     = COUNTUNIQUE(eff_dates for the same seller and same is_po, up to eff_date)
--   id       = prefix || CASE WHEN is_po THEN '/PO/' ELSE '/' END || lpad(rank, 2, '0')
--
-- The app derives the same value in src/lib/shipping-id.ts and keeps it current
-- as cars are edited. This is the one-shot pass for rows that predate it —
-- imported from the sheet, or written while only the edited car was renumbered.
--
-- Two deliberate departures from the original sheet formula:
--
--   is_po was `(Date = "") * (O_Date <> "")` — no arrival date yet — which is
--   true of anything that has not turned up, so every car in transit or waiting
--   came out tagged /PO/ too. A pre-order is a car bought before it existed, and
--   "Status" is what records that.
--
--   eff_date was `IF(Date = "", O_Date, Date)`, dating a car still on its way by
--   when it was ordered. The cars in one parcel are often bought on different
--   days, which split a single shipment into as many IDs as it had order dates.
--   A car in flight is dated by when it is due instead: one parcel, one ID.
--
-- DENSE_RANK is the direct equivalent of COUNTUNIQUE over a running window: it
-- numbers distinct dates and shares a number between ties, which is what makes
-- every car arriving on one day come out with the same ID.
--
-- Idempotent: running it twice changes nothing the second time.
--
-- To see what it would do first, replace the final UPDATE (from "UPDATE
-- public.tesoro_raw" to the semicolon) with:
--
--   SELECT t."Car ID", t."Name", t."Seller", t."Status",
--          t."Shipping ID" AS from_id, tg.shipping_id AS to_id
--   FROM public.tesoro_raw t
--   JOIN target tg ON t."Car ID" = tg.car_id
--   WHERE COALESCE(t."Shipping ID", '') IS DISTINCT FROM COALESCE(tg.shipping_id, '')
--   ORDER BY t."Seller", tg.shipping_id;

BEGIN;

WITH raw AS (
  -- Everything as text first.
  --
  -- tesoro_raw was created by importing the sheet rather than by a migration, so
  -- the date-ish columns are whatever the importer inferred at the time — "Date"
  -- is text, "O_Date" may be either, and "Expected Date" is text by construction.
  -- Casting them all to text and parsing once below means this runs the same
  -- whichever way the column was typed, instead of failing to plan because a
  -- date and a text sat in the same COALESCE.
  SELECT
    "Car ID"                                          AS car_id,
    -- A seller's run of shipping days belongs to one collection. Without this
    -- two accounts buying from the same shop would interleave their orders and
    -- renumber each other.
    user_id                                           AS owner,
    btrim(COALESCE("Seller", ''))                     AS seller,
    lower(btrim(regexp_replace(COALESCE("Status", ''), '[\s-]+', ' ', 'g'))) AS status,
    btrim(COALESCE("Date"::text, ''))                 AS arrival_txt,
    btrim(COALESCE("O_Date"::text, ''))               AS ordered_txt,
    btrim(COALESCE("Expected Date"::text, ''))        AS expected_txt
  FROM public.tesoro_raw
),
chosen AS (
  SELECT
    car_id,
    owner,
    seller,
    -- Pre-order, and not already arrived: a car in hand has left the /PO/ run
    -- whatever its status column still says.
    (status = 'pre order' AND arrival_txt = '')       AS is_po,
    -- An arrival date wins: the car is here, and the day it came is the day its
    -- shipment landed. Failing that, a car on its way is dated by when it is
    -- due. Everything else is dated by when it was ordered.
    --
    -- The in-flight branch insists on a day-precision ISO value, the same test
    -- `isDayPrecise` makes in the app: a row carrying a note like "Mar 2027"
    -- there names a month, not a delivery, and would otherwise rank a whole
    -- shipment by a day nobody promised.
    CASE
      WHEN arrival_txt <> '' THEN arrival_txt
      WHEN status IN ('transit', 'out for delivery', 'waiting')
       AND expected_txt ~ '^\d{4}-\d{2}-\d{2}' THEN expected_txt
      ELSE ordered_txt
    END                                               AS eff_txt
  FROM raw
),
effective AS (
  SELECT
    car_id,
    owner,
    seller,
    is_po,
    -- The same two shapes `parseDMY` reads, in the same order: ISO first, then
    -- day-first. The ranges are in the pattern rather than left to to_date so a
    -- typo like "2026-13-01" comes out as no date at all instead of aborting the
    -- migration on a 22008. Anything else — blank, a note, a month name — is
    -- simply not a day, and a car without a day contributes no shipping ID.
    CASE
      WHEN eff_txt ~ '^\d{4}[/-](0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])'
        THEN to_date(substring(eff_txt from '^\d{4}[/-]\d{1,2}[/-]\d{1,2}'), 'YYYY-MM-DD')
      WHEN eff_txt ~ '^(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])[/-]\d{4}'
        THEN to_date(substring(eff_txt from '^\d{1,2}[/-]\d{1,2}[/-]\d{4}'), 'DD-MM-YYYY')
    END                                               AS eff_date
  FROM chosen
),
ranked AS (
  SELECT
    car_id,
    seller,
    is_po,
    DENSE_RANK() OVER (
      PARTITION BY owner, lower(seller), is_po
      ORDER BY eff_date
    ) AS rank
  FROM effective
  -- The formula's IF(seller = "", ""): no seller or no usable date, no ID.
  WHERE seller <> '' AND eff_date IS NOT NULL
),
computed AS (
  SELECT
    car_id,
    upper(
      left(replace(seller, ' ', ''), 3) || right(replace(seller, ' ', ''), 1)
    )
    || CASE WHEN is_po THEN '/PO/' ELSE '/' END
    -- lpad, not to_char(rank, 'FM00'): a seller with a hundred shipping days
    -- would come out of that mask as '###'. This pads to two and lets a
    -- three-digit rank through, which is what TEXT(rank, "00") does too.
    || lpad(rank::text, 2, '0') AS shipping_id
  FROM ranked
),
target AS (
  -- Every row, against the ID it should carry. The LEFT JOIN is what makes the
  -- clearing case fall out of the same expression instead of needing a second
  -- statement with its own copy of the rules: a row the formula declines to
  -- number gets NULL here, and NULL is what it is set to.
  SELECT e.car_id, c.shipping_id
  FROM effective e
  LEFT JOIN computed c ON c.car_id = e.car_id
)
UPDATE public.tesoro_raw AS t
SET "Shipping ID" = tg.shipping_id
FROM target AS tg
WHERE t."Car ID" = tg.car_id
  -- COALESCE on both sides so an empty string and a NULL count as the same
  -- absence; otherwise every run would rewrite NULL over '' for ever.
  AND COALESCE(t."Shipping ID", '') IS DISTINCT FROM COALESCE(tg.shipping_id, '');

COMMIT;
