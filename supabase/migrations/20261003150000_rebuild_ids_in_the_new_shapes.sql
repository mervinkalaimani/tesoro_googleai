-- Every shipping and order ID, rewritten in the shapes the app now derives.
--
--   shipping   ANIH/07              which parcel
--   order      ANIH/26/07/04        which purchase, fourth of July 2026
--   pre-order  ANIH/26/07/PO/01     the same, reserved before release
--
-- Two rules changed with the shapes. A shipping ID no longer splits pre-orders
-- into a run of their own: a seller ships one parcel and it should read as one
-- parcel, so the /PO/ tag moved to the order ID where the fact belongs. And an
-- order ID gained that tag, with a run of its own per month, because otherwise
-- ANIH/26/07/02 and ANIH/26/07/PO/02 would be two purchases wearing what looks
-- like the same number.
--
-- A pre-order is still placed by its order date rather than its expected date.
-- Its expected date is a release date that moves, and renumbering a shipment
-- every time a maker slips a month is worse than not grouping it.
--
-- Without this the app and the stored rows disagree: the IDs are derived on
-- every write, so a collection would drift into a mix of both shapes one edited
-- row at a time.
--
-- The status column still holds the spellings the sheet used -- Available,
-- Waiting, Delayed -- and the app normalises them on the way in. So does this,
-- through tesoro_norm_status, or the two would read the same row differently:
-- "Waiting" is an Ordered car, and an Ordered car is dated by when it is due.

create or replace function public.tesoro_norm_status(_status text)
returns text
language sql
immutable
as $function$
  select case regexp_replace(lower(trim(coalesce(_status, ''))), '[^a-z]', '', 'g')
    when 'inhand' then 'In Hand'
    when 'available' then 'In Hand'
    when 'availableinhand' then 'In Hand'
    when 'delivered' then 'In Hand'
    when 'received' then 'In Hand'
    when 'intransit' then 'In Transit'
    when 'transit' then 'In Transit'
    when 'transitintransit' then 'In Transit'
    when 'outfordelivery' then 'In Transit'
    when 'shipped' then 'In Transit'
    when 'ordered' then 'Ordered'
    when 'waiting' then 'Ordered'
    when 'delayed' then 'Ordered'
    when 'onhold' then 'On Hold'
    when 'hold' then 'On Hold'
    when 'po' then 'PO'
    when 'preorder' then 'PO'
    when 'iso' then 'ISO'
    when 'lost' then 'ISO'
    when 'wrongitem' then 'ISO'
    when 'insearchof' then 'ISO'
    else ''
  end;
$function$;

comment on function public.tesoro_norm_status(text) is
  'The six statuses, from every spelling the column has ever held. Mirrors normaliseStatus in src/lib/status.ts.';

-- ── Shipping IDs ────────────────────────────────────────────────────────────

with effective as (
  select
    r."Car ID" as car_id,
    r.user_id as owner,
    trim(coalesce(r."Seller", '')) as seller,
    -- The same precedence the app uses, on the raw text: the day it arrived,
    -- else -- for a car in flight with a real date -- the day it is due, else
    -- the day it was bought.
    coalesce(
      nullif(trim(coalesce(r."Date", '')), ''),
      case
        when public.tesoro_norm_status(r."Status") in ('In Transit', 'Ordered', 'On Hold')
         and trim(coalesce(r."Expected Date", '')) ~ '^\d{4}-\d{2}-\d{2}'
        then trim(r."Expected Date")
      end,
      nullif(trim(coalesce(r."O_Date", '')), '')
    ) as eff_txt
  from public.tesoro_raw r
),
dated as (
  select car_id, owner, seller, public.tesoro_parse_day(eff_txt) as eff_date
  from effective
),
ranked as (
  select car_id, seller,
         dense_rank() over (partition by owner, lower(seller) order by eff_date) as rank
  from dated
  where seller <> '' and eff_date is not null
),
computed as (
  select car_id,
         upper(left(replace(seller, ' ', ''), 3) || right(replace(seller, ' ', ''), 1))
         || '/' || lpad(rank::text, 2, '0') as shipping_id
  from ranked
),
target as (
  select d.car_id, c.shipping_id
  from dated d
  left join computed c on c.car_id = d.car_id
)
update public.tesoro_raw t
   set "Shipping ID" = target.shipping_id
  from target
 where t."Car ID" = target.car_id
   and t."Shipping ID" is distinct from target.shipping_id;

-- ── Order IDs ───────────────────────────────────────────────────────────────

with effective as (
  select
    r."Car ID" as car_id,
    r.user_id as owner,
    trim(coalesce(r."Seller", '')) as seller,
    public.tesoro_parse_day(r."O_Date") as eff_date,
    -- A car that has arrived is not a pre-order whatever its status still says.
    public.tesoro_norm_status(r."Status") = 'PO'
      and trim(coalesce(r."Date", '')) = '' as is_po
  from public.tesoro_raw r
),
ranked as (
  select car_id, seller, eff_date, is_po,
         dense_rank() over (
           partition by owner, lower(seller), to_char(eff_date, 'YYYY-MM'), is_po
           order by eff_date
         ) as rank
  from effective
  where seller <> '' and eff_date is not null
),
computed as (
  select car_id,
         upper(left(replace(seller, ' ', ''), 3) || right(replace(seller, ' ', ''), 1))
         || '/' || to_char(eff_date, 'YY/MM')
         || case when is_po then '/PO' else '' end
         || '/' || lpad(rank::text, 2, '0') as order_id
  from ranked
),
target as (
  select e.car_id, c.order_id
  from effective e
  left join computed c on c.car_id = e.car_id
)
update public.tesoro_raw t
   set "Order ID" = target.order_id
  from target
 where t."Car ID" = target.car_id
   and t."Order ID" is distinct from target.order_id;
