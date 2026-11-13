-- Give every car already in a collection an "Added" entry in the activity log.
--
-- Run after 20261113090000_activity_log. Safe to run twice: a car that already
-- has an Added entry is skipped.
--
-- The date comes from the best record there is:
--
--   record     created_at, for a car that was added after that column existed
--   estimated  1,478 cars carry 2026-09-15, the day the column was created, which
--              says nothing about when they were added. Their order date stands
--              in for it, then their received date, then the 15th itself.
--
-- The person is the car's owner. An admin import would show under the owner's
-- name; the log cannot know any better for rows written before it existed.
-- Only fields that do not drift are copied: today's status or price would claim
-- things about the day it was added that nobody can vouch for.

alter table public.tesoro_change_log add column if not exists backfill text
  check (backfill in ('record', 'estimated'));

insert into public.tesoro_change_log
  (at, actor_id, actor_name, owner_id, source, action, row_key, catalog_id, title,
   order_id, shipping_id, changes, backfill)
select
  d.at,
  r.user_id,
  nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''),
  r.user_id,
  'car',
  'add',
  r."Car ID",
  nullif(r."Catalog ID", ''),
  r."Name",
  nullif(r."Order ID", ''),
  nullif(r."Shipping ID", ''),
  coalesce(f.changes, '{}'::jsonb),
  d.kind
from public.tesoro_raw r
left join public.tesoro_users u on u.auth_uid = r.user_id
cross join lateral (
  select
    case
      when r.created_at::date <> date '2026-09-15' then r.created_at
      when r."O_Date" ~ '^\d{4}-\d{2}-\d{2}$' then r."O_Date"::date::timestamptz
      when r."Date" ~ '^\d{4}-\d{2}-\d{2}$' then r."Date"::date::timestamptz
      else r.created_at
    end as at,
    case when r.created_at::date <> date '2026-09-15' then 'record' else 'estimated' end as kind
) d
left join lateral (
  select jsonb_object_agg(k, jsonb_build_object('to', v)) as changes
  from (values
    ('Name', r."Name"),
    ('Brand', r."Brand"),
    ('Assortment', r."Assortment"),
    ('Seller', r."Seller"),
    ('Order ID', r."Order ID"),
    ('Shipping ID', r."Shipping ID"),
    ('Spent', r."Spent"),
    ('MRP', r."MRP"::text)
  ) t(k, v)
  where coalesce(v, '') <> ''
) f on true
where not exists (
  select 1 from public.tesoro_change_log l
  where l.row_key = r."Car ID" and l.action = 'add' and l.source = 'car'
);
