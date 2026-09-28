-- A casting's price line appears once two collectors have bought one.
--
-- The previous rule wanted three, on the reasoning that at two each buyer can
-- work out what the other paid. Measured against the collection as it stands,
-- three was a rule that applied to nothing: no casting anywhere has three
-- independent buyers, so the line was correct and permanently blank. Two gives
-- 19 castings a price line, 12 of them a real range.
--
-- What one person paid is still never shown: below two buyers the page falls
-- back to the catalogue's MRP, which is the maker's list price and nobody's
-- receipt.

create or replace function public.tesoro_casting_public_stats(_car_id text)
returns table (
  owners int,
  copies int,
  prices int,
  paid_min numeric,
  paid_max numeric,
  last_seen text
)
language sql
stable
security definer
set search_path = public
as $function$
  with mine as (
    select
      r.user_id,
      nullif(regexp_replace(coalesce(r."Spent", ''), '[^0-9.]', '', 'g'), '')::numeric as spent,
      public.tesoro_parse_day(
        coalesce(nullif(trim(coalesce(r."Date", '')), ''), r."O_Date")
      ) as day,
      public.tesoro_norm_status(r."Status") as status
    from public.tesoro_raw r
    where trim(coalesce(_car_id, '')) <> ''
      and upper(trim(coalesce(r."Catalog ID", ''))) = upper(trim(_car_id))
  ),
  bought as (
    select * from mine
    where status <> 'ISO' and spent is not null and spent > 0
  ),
  counted as (
    select
      (select count(distinct user_id) from mine)::int as owners,
      (select count(*) from mine)::int as copies,
      (select count(distinct user_id) from bought)::int as payers
  )
  select
    c.owners,
    c.copies,
    case when c.payers >= 2 then (select count(*)::int from bought) end,
    case when c.payers >= 2 then (select min(spent) from bought) end,
    case when c.payers >= 2 then (select max(spent) from bought) end,
    case when c.payers >= 2 then (select to_char(max(day), 'Mon YYYY') from bought) end
  from counted c;
$function$;

comment on function public.tesoro_casting_public_stats(text) is
  'Owner and copy counts for a casting, plus what it typically sold for once two different collectors have bought one. Readable by anyone; names nobody.';
