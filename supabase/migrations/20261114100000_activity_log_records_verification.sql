-- Show a person verifying a catalogue entry in the activity log.
--
-- synced_at and synced_source were skipped for catalogue rows, because the
-- maker-site job writes them in bulk and a log line per entry per run is noise.
-- An admin verifying an entry writes the same two columns, and that is worth a
-- line. So they are logged again, but only when a person made the change: a job
-- has no auth.uid(), and its background writes stay out as before.
--
-- Only the catalogue branch changes; the rest of the function is as it was.

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
  own      uuid;
  cat      text;
  ord      text;
  shp      text;
begin
  if TG_OP = 'DELETE' then r := to_jsonb(OLD); else r := to_jsonb(NEW); end if;

  if TG_TABLE_NAME = 'tesoro_raw' then
    src := 'car';
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
    skip := array['created_at', 'updated_at', 'updated_by', 'created_by',
                  'released_at', 'image_source_url'];
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
      -- A background photo sync is not somebody editing the car, and neither is
      -- the maker sync stamping the entries it checked.
      if actor is null and k in ('Image URL', 'image_url', 'synced_at', 'synced_source') then continue; end if;
      if n->k is distinct from o->k then
        chg := chg || jsonb_build_object(k, jsonb_build_object('from', o->k, 'to', n->k));
      end if;
    end loop;
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
