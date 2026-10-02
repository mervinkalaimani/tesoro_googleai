-- What a stranger could read, and call, and what a price band gives away.
--
-- Four things, all of them the same mistake in different clothes: something
-- was made for one purpose and left reachable by everyone.
--
-- 1. Six backup tables sat in `public` with no row-level security, which in
--    PostgREST means the anon key reads them. Two were copies of tesoro_raw:
--    Spent, Seller, Paid, Balance, Shipping ID, Order ID and user_id, which is
--    exactly what 20260925051110_your_price_and_name_are_yours.sql exists to
--    keep private. The other fifteen backup tables in this database already
--    have RLS on and no policy; these six were missed.
--
--    RLS with no policy is the right shape for a backup: the service role
--    still reads it, nobody else does, and nothing has to be deleted to make
--    it safe.
--
-- 2. `promote_staged_cars` is SECURITY DEFINER, writes to tesoro_raw, and had
--    no caller check. 20260927061934 revoked it from public and granted it to
--    service_role alone; something since then handed it back, so anon could
--    file every held car in the database by asking. The cron job that actually
--    runs it (20260927062011) runs as the table owner and is unaffected.
--
-- 3. `tesoro_assign_id_prefix` writes a user's ID prefix and has no caller
--    either. Nothing in the app calls it -- the signup trigger does, as the
--    definer -- so no client needs it at all.
--
-- 4. A price band of one price is not a band. The floor is two buyers
--    (20260928070028), and when both paid the same, publishing the "range"
--    publishes what each of them paid, exactly. A band that has collapsed to a
--    point says nothing a range was meant to say and everything it was meant
--    to hide, so it is withheld. The floor itself is left alone.
--
-- Also sets search_path on the seven functions the linter flagged, so a
-- caller cannot change what an unqualified name in them resolves to.

-- 1 ────────────────────────────────────────────────────────────────────────
alter table public.tesoro_setu_backup_20260927_raw      enable row level security;
alter table public.tesoro_setu_backup_20260927_catalog  enable row level security;
alter table public.tesoro_id_backup_20260927            enable row level security;
alter table public.tesoro_raw_mix_backup_20260929       enable row level security;
alter table public.tesoro_catalog_mix_backup_20260929   enable row level security;
alter table public.tesoro_catalog_dupe_backup_20260925  enable row level security;

-- 2, 3 ─────────────────────────────────────────────────────────────────────
revoke all on function public.promote_staged_cars(interval) from public, anon, authenticated;
grant execute on function public.promote_staged_cars(interval) to service_role;

revoke all on function public.tesoro_assign_id_prefix(text, text, uuid) from public, anon, authenticated;
grant execute on function public.tesoro_assign_id_prefix(text, text, uuid) to service_role;

-- 4 ────────────────────────────────────────────────────────────────────────
create or replace function public.tesoro_casting_public_stats(_car_id text)
returns table(owners integer, copies integer, prices integer, paid_min numeric, paid_max numeric, last_seen text)
language sql
stable security definer
set search_path to 'public'
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
      (select count(distinct user_id) from bought)::int as payers,
      (select min(spent) from bought) as lo,
      (select max(spent) from bought) as hi
  ),
  -- Two buyers who paid the same are not a range, they are two disclosures.
  publishable as (
    select c.*, (c.payers >= 2 and c.hi > c.lo) as say_it from counted c
  )
  select
    p.owners,
    p.copies,
    case when p.say_it then (select count(*)::int from bought) end,
    case when p.say_it then p.lo end,
    case when p.say_it then p.hi end,
    case when p.say_it then (select to_char(max(day), 'Mon YYYY') from bought) end
  from publishable p;
$function$;

-- search_path ──────────────────────────────────────────────────────────────
alter function public.normalize_tesoro_handle(text)     set search_path to 'public', 'pg_temp';
alter function public.is_valid_tesoro_handle(text)      set search_path to 'public', 'pg_temp';
alter function public.tesoro_b32(integer, integer)      set search_path to 'public', 'pg_temp';
alter function public.tesoro_b32_decode(text)           set search_path to 'public', 'pg_temp';
alter function public.tesoro_norm_status(text)          set search_path to 'public', 'pg_temp';
alter function public.tesoro_catalog_release_stamp()    set search_path to 'public', 'pg_temp';
alter function public.fn_generate_catalog_car_id(text, text, text, text, text, text, text, numeric)
  set search_path to 'public', 'pg_temp';
