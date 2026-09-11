-- "Date" is the day a car was received. Say so, and stop orders that have not
-- arrived from carrying one.
--
-- The column has always meant two things at once. For a delivered car it is the
-- arrival date; for anything still on its way it was the only place an estimate
-- could go, because "Expected Date" did not exist until the shipment-tracking
-- migration added it. So a pre-order due next March sat in the table with a
-- received date, which reads as delivered to everything downstream — the month
-- charts counted it as bought, the habit tracker counted it as landed, and the
-- orders page had to guess which of the two dates to believe.
--
-- Move the estimate to the column that means estimate, and clear the received
-- date on every order that is still open. Nothing is lost: a row with an
-- expected date already keeps it, and the received date is only cleared once its
-- value has somewhere to be.
--
-- Only Waiting, Pre Order and Delayed are touched. Transit and Out for Delivery
-- are left alone deliberately — a car mid-journey may have been given a genuine
-- arrival date by a partial delivery, and On Hold and ISO rows are not orders
-- with a timeline at all.

-- "Date" is text in this table — tesoro_raw came from a sheet import, not from a
-- migration — so the value is read the two ways the app reads it (ISO first,
-- then day-first, as parseDMY does) rather than handed to ::date, which would
-- read 04/03/2026 as the 3rd of April under the server's MDY DateStyle.
--
-- The last COALESCE branch is the safety net: a "Date" that is not a day at all
-- ("Mar 2027", say) moves across verbatim instead of being dropped on the floor.
-- Nothing is cleared until its value has somewhere to be.

UPDATE public.tesoro_raw
SET
  "Expected Date" = COALESCE(
    NULLIF(btrim(COALESCE("Expected Date", '')), ''),
    to_char(
      CASE
        WHEN btrim("Date"::text) ~ '^\d{4}[/-](0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])'
          THEN to_date(substring(btrim("Date"::text) from '^\d{4}[/-]\d{1,2}[/-]\d{1,2}'),
                       'YYYY-MM-DD')
        WHEN btrim("Date"::text) ~ '^(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])[/-]\d{4}'
          THEN to_date(substring(btrim("Date"::text) from '^\d{1,2}[/-]\d{1,2}[/-]\d{4}'),
                       'DD-MM-YYYY')
      END,
      'YYYY-MM-DD'
    ),
    btrim("Date"::text)
  ),
  "Date" = NULL
WHERE btrim(COALESCE("Date"::text, '')) <> ''
  AND lower(btrim(COALESCE("Status", ''))) IN ('waiting', 'pre order', 'preorder', 'delayed');
