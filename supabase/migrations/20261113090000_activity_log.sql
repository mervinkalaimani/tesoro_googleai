-- An activity log: who changed what, on which car, and when.
--
--   tesoro_change_log        one row per change, written only by the triggers below
--
-- Cars (tesoro_raw) and catalogue entries (tesoro_car_catalog) are watched, so
-- every write is caught wherever it came from: the app, an admin editing on
-- somebody's behalf, a server job, or a SQL fix. A person reads the changes to
-- their own collection; an admin reads everything. Nobody writes to it.
--
-- History starts when this is applied. Nothing earlier is recoverable.
--
-- `changes` holds each changed field as {"Status": {"from": "Ordered", "to": "In Hand"}}.
-- An added or deleted row records its main fields only: the log says what
-- happened, it is not a second copy of the table.

create table if not exists public.tesoro_change_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  /** Who did it: auth.uid() at the time. Null for SQL fixes and server jobs. */
  actor_id    uuid,
  actor_name  text,
  /** Whose collection it happened in. For a catalogue entry, whoever edited it. */
  owner_id    uuid,
  source      text not null check (source in ('car', 'catalogue')),
  action      text not null check (action in ('add', 'edit', 'delete')),
  /** Car ID for a car, catalogue ID for a catalogue entry. */
  row_key     text not null,
  catalog_id  text,
  title       text,
  order_id    text,
  shipping_id text,
  changes     jsonb not null default '{}'::jsonb
);

create index if not exists tesoro_change_log_owner_at_idx on public.tesoro_change_log (owner_id, at desc);
create index if not exists tesoro_change_log_row_idx on public.tesoro_change_log (row_key, at desc);
create index if not exists tesoro_change_log_order_idx on public.tesoro_change_log (order_id) where order_id is not null;
create index if not exists tesoro_change_log_shipping_idx on public.tesoro_change_log (shipping_id) where shipping_id is not null;

alter table public.tesoro_change_log enable row level security;
drop policy if exists "Read own changes, admins read all" on public.tesoro_change_log;
create policy "Read own changes, admins read all" on public.tesoro_change_log
  for select using (owner_id = auth.uid() or public.is_tesoro_admin(auth.uid()));
grant select on public.tesoro_change_log to authenticated;

create or replace function public.tesoro_log_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  actor    uuid := auth.uid();
  actor_nm text;
  r        jsonb;
  n        jsonb;
  o        jsonb;
  k        text;
  chg      jsonb := '{}'::jsonb;
  skip     text[];
  main     text[];
  src      text;
  rk       text;
  ttl      text;
  own    uuid;
  cat      text;
  ord      text;
  shp      text;
begin
  if TG_OP = 'DELETE' then r := to_jsonb(OLD); else r := to_jsonb(NEW); end if;

  if TG_TABLE_NAME = 'tesoro_raw' then
    src := 'car';
    -- Derived or bookkeeping columns: they change because something else did.
    skip := array['SNO', 'Balance', 'Month', 'O_Month', 'created_at', 'catalog_pending_at',
                  'admin_changed_at', 'admin_changed_by', 'owner_seen_at'];
    main := array['Name', 'Brand', 'Assortment', 'Status', 'Spent', 'MRP', 'Seller', 'Order ID', 'Shipping ID'];
    rk := r->>'Car ID';
    ttl := r->>'Name';
    own := nullif(r->>'user_id', '')::uuid;
    cat := nullif(r->>'Catalog ID', '');
    ord := nullif(r->>'Order ID', '');
    shp := nullif(r->>'Shipping ID', '');
  else
    src := 'catalogue';
    skip := array['created_at', 'updated_at', 'updated_by', 'created_by', 'synced_at',
                  'synced_source', 'released_at', 'image_source_url'];
    main := array['name', 'brand', 'assortment', 'mrp', 'release_status'];
    rk := r->>'car_id';
    ttl := r->>'name';
    own := coalesce(actor, nullif(r->>'updated_by', '')::uuid, nullif(r->>'created_by', '')::uuid);
    cat := rk;
  end if;

  if TG_OP = 'INSERT' then
    n := to_jsonb(NEW);
    foreach k in array main loop
      if coalesce(n->>k, '') <> '' then
        chg := chg || jsonb_build_object(k, jsonb_build_object('to', n->k));
      end if;
    end loop;
  elsif TG_OP = 'DELETE' then
    o := to_jsonb(OLD);
    foreach k in array main loop
      if coalesce(o->>k, '') <> '' then
        chg := chg || jsonb_build_object(k, jsonb_build_object('from', o->k));
      end if;
    end loop;
  else
    n := to_jsonb(NEW);
    o := to_jsonb(OLD);
    for k in select jsonb_object_keys(n) loop
      if k = any(skip) then continue; end if;
      -- A background photo sync is not somebody editing the car.
      if actor is null and k in ('Image URL', 'image_url') then continue; end if;
      if n->k is distinct from o->k then
        chg := chg || jsonb_build_object(k, jsonb_build_object('from', o->k, 'to', n->k));
      end if;
    end loop;
    -- Only derived columns moved: nothing happened worth writing down.
    if chg = '{}'::jsonb then return null; end if;
  end if;

  if actor is not null then
    select nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
      into actor_nm from public.tesoro_users where auth_uid = actor limit 1;
  end if;

  insert into public.tesoro_change_log
    (actor_id, actor_name, owner_id, source, action, row_key, catalog_id, title, order_id, shipping_id, changes)
  values
    (actor, actor_nm, own, src,
     case TG_OP when 'INSERT' then 'add' when 'DELETE' then 'delete' else 'edit' end,
     coalesce(rk, ''), cat, ttl, ord, shp, chg);

  return null;
end $$;

revoke execute on function public.tesoro_log_change() from public, anon, authenticated;

drop trigger if exists tesoro_raw_log_change on public.tesoro_raw;
create trigger tesoro_raw_log_change
  after insert or update or delete on public.tesoro_raw
  for each row execute function public.tesoro_log_change();

drop trigger if exists tesoro_catalog_log_change on public.tesoro_car_catalog;
create trigger tesoro_catalog_log_change
  after insert or update or delete on public.tesoro_car_catalog
  for each row execute function public.tesoro_log_change();

-- Taking your data back takes your history with it: the delete below would
-- otherwise log every car it removes, and leave that behind.
create or replace function public.tesoro_delete_my_data()
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me   uuid := auth.uid();
  cars integer := 0;
  who  bigint;
begin
  if me is null then
    raise exception 'Sign in before deleting your data';
  end if;

  -- user_id is a uuid here, not the text it looks like elsewhere in this table.
  delete from public.tesoro_raw where user_id = me;
  get diagnostics cars = row_count;

  delete from public.tesoro_change_log where owner_id = me or actor_id = me;

  -- Emptied rather than removed, and unlinked before the login goes.
  update public.tesoro_users
     set first_name  = 'Deleted',
         last_name   = '',
         email_id    = 'deleted.' || sno || '@tesoro.invalid',
         phone       = null,
         dob         = null,
         gender      = null,
         avatar_url  = null,
         auth_uid    = null,
         is_approved = false,
         is_admin    = false,
         is_owner    = false,
         deleted_at  = now()
   where auth_uid = me
   returning sno into who;

  -- The login. Sessions, identities, settings and push subscriptions all
  -- cascade from here; the catalogue entries only lose the name on them.
  delete from auth.users where id = me;

  return json_build_object('cars', cars, 'profile', coalesce(who, 0));
end $function$;

grant execute on function public.tesoro_delete_my_data() to authenticated;
