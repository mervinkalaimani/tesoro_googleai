-- The hold ends on the database's clock, not on somebody opening the app.
--
-- Every other periodic job in this project is a setInterval that stops the
-- moment the tab is hidden -- the 15s collection refresh, the 2min approvals
-- poll. That is fine for refreshing a screen somebody is looking at, and no use
-- at all for a promise that a casting reaches the catalogue 24 hours after it
-- was imported. If the hold depended on a browser, a collection nobody opened
-- for a week would hold its import for a week.
--
-- Ten minutes: the hold is a day, so the worst case is a casting arriving
-- 24h10m after import. Nobody is watching that clock closely enough for a
-- tighter schedule to buy anything, and every run is a scan of one small
-- partial index (tesoro_raw_catalog_pending_idx) that is usually empty.
create extension if not exists pg_cron with schema extensions;

select cron.unschedule('tesoro-promote-staged-cars')
 where exists (select 1 from cron.job where jobname = 'tesoro-promote-staged-cars');

select cron.schedule(
  'tesoro-promote-staged-cars',
  '*/10 * * * *',
  $cron$ select public.promote_staged_cars(); $cron$
);
