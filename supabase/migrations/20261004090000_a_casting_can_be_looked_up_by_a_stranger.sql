-- What a casting may say about itself to somebody who is not signed in.
--
-- The catalogue is already readable by anyone -- policy "Anyone can view car
-- catalog" -- because it describes castings rather than people. What it cannot
-- do is answer the question a collector actually arrives with: is this rare,
-- and what does it go for. That answer lives in tesoro_raw, which is nobody's
-- business but its owner's, and the RLS there says so.
--
-- So: one function, security definer, that reads tesoro_raw and returns
-- nothing anybody could trace back to a person. No user ids, no names, no
-- single purchase. A price band appears only once three different collectors
-- have paid for the casting, which is the smallest number where the middle one
-- is not doing arithmetic on the other two.
--
-- 20260930130000_your_price_and_name_are_yours.sql drew this line for the app;
-- this keeps it in the one place that is about to face the open internet.

-- ── Where a photo came from ─────────────────────────────────────────────────

-- The wikis' pictures are CC BY-SA: free to reuse, not free to take credit for.
-- Once a copy is served from our own bucket the original URL is the only record
-- of what is owed to whom, so it is kept beside the copy rather than lost in
-- the overwrite.
alter table public.tesoro_car_catalog
  add column if not exists image_source_url text;

comment on column public.tesoro_car_catalog.image_source_url is
  'Where image_url was copied from, for attribution. Null when the photo was uploaded here.';

-- ── What the public may know ────────────────────────────────────────────────

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
      -- "Spent" is text from the sheet import, so it is parsed rather than
      -- cast: "1,250", "Rs 900" and "" all arrive in this column.
      nullif(regexp_replace(coalesce(r."Spent", ''), '[^0-9.]', '', 'g'), '')::numeric as spent,
      public.tesoro_parse_day(
        coalesce(nullif(trim(coalesce(r."Date", '')), ''), r."O_Date")
      ) as day,
      public.tesoro_norm_status(r."Status") as status
    from public.tesoro_raw r
    where trim(coalesce(_car_id, '')) <> ''
      and upper(trim(coalesce(r."Catalog ID", ''))) = upper(trim(_car_id))
  ),
  -- A wanted car is not a bought one. ISO rows count towards how many people
  -- are interested and never towards what anything costs.
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
    case when c.payers >= 3 then (select count(*)::int from bought) end,
    case when c.payers >= 3 then (select min(spent) from bought) end,
    case when c.payers >= 3 then (select max(spent) from bought) end,
    -- The month, never the day: "12 Sep" plus one public order ID is a person.
    case when c.payers >= 3 then (select to_char(max(day), 'Mon YYYY') from bought) end
  from counted c;
$function$;

comment on function public.tesoro_casting_public_stats(text) is
  'Owner and copy counts for a casting, plus a price band once three different collectors have paid for one. Readable by anyone; names nobody.';

grant execute on function public.tesoro_casting_public_stats(text) to anon, authenticated;
