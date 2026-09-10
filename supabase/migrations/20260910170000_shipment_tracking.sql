-- Shipment tracking: expected date, carrier, and consignment number.
--
-- Until now `expectedDate` had nowhere to live. tesoroRawToDiecast read it back
-- out of the "Date" column — the *arrival* date — and diecastToTesoroRaw never
-- wrote it at all, so every expected date set from the batch update dialog was
-- discarded on the next refresh. Give it a column of its own.
--
-- The other two are new. Pre-orders were recording the courier and consignment
-- number as free text in "Transit Info / ETA", mixed in with release-month
-- guesses like "Mar 2027", which meant neither could be used for anything: no
-- tracking link, no sorting by date, no notice that a release was imminent.
--
-- All three are text rather than date/enum on purpose. The sheet these rows came
-- from holds dates as strings in several formats, and a courier name typed by
-- hand should never be rejected outright — normalising happens in the client,
-- where a value that does not parse can still be shown.

ALTER TABLE public.tesoro_raw
  ADD COLUMN IF NOT EXISTS "Expected Date" text;

ALTER TABLE public.tesoro_raw
  ADD COLUMN IF NOT EXISTS "Delivery Partner" text;

ALTER TABLE public.tesoro_raw
  ADD COLUMN IF NOT EXISTS "Tracking ID" text;

-- Backfill the expected date for pre-orders that recorded a release month in the
-- ETA note ("Mar 2027", "Oct 2026", …). Anchored to the 10th: these are month
-- level promises, and the 10th sits far enough into the month that a card does
-- not announce itself as due on the 1st, while still landing inside the window
-- the seller named.
--
-- Only rows with no expected date already are touched, and only where the note
-- is *nothing but* a month and year — "Waiting for Arrival to Ankush" and
-- "Not Released" are left exactly as they are.
-- The month is cut back to its three-letter form before parsing, so "March
-- 2027" and "Mar 2027" both reach to_date in the one shape 'Mon YYYY' accepts.
UPDATE public.tesoro_raw
SET "Expected Date" = to_char(
      to_date(
        substring(btrim("Transit Info / ETA") from '^[A-Za-z]{3}')
          || ' '
          || substring("Transit Info / ETA" from '[0-9]{4}'),
        'Mon YYYY'
      ) + INTERVAL '9 days',
      'YYYY-MM-DD'
    )
WHERE COALESCE("Expected Date", '') = ''
  AND "Transit Info / ETA" ~*
      '^\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+[0-9]{4}\s*$';
