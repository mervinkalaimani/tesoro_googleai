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

UPDATE public.tesoro_raw
SET
  "Expected Date" = COALESCE(
    NULLIF(btrim(COALESCE("Expected Date", '')), ''),
    to_char("Date"::date, 'YYYY-MM-DD')
  ),
  "Date" = NULL
WHERE "Date" IS NOT NULL
  AND lower(btrim(COALESCE("Status", ''))) IN ('waiting', 'pre order', 'preorder', 'delayed');
