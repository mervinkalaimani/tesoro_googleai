-- BBR's Car IDs started at 003.
--
--   MKCCB/BBR/BOX/003    the first BBR car, with no 001 or 002 before it
--
-- Bburago's cars held BBR/BOX/001 and 002 until they moved to BUR
-- (20261112090000_bburago_gets_its_own_brand_code), and BBR's own numbers had
-- carried on from there. Number each collection's BBR cars again from 001 in
-- their existing order, per assortment.
--
-- Old ids go to tesoro_raw_car_id_backup_20261112 and tesoro_raw_car_id_map, so
-- anything still holding one resolves to the new id.

insert into public.tesoro_raw_car_id_backup_20261112 (user_id, old_car_id)
select user_id, "Car ID" from public.tesoro_raw
where split_part("Car ID", '/', 2) = 'BBR'
  and "Car ID" ~ '^[A-Z0-9]{4,12}/BBR/[A-Z0-9]{3,6}/[0-9]{3}$';

do $$
declare
  r record;
  new_id text;
begin
  -- Ascending, so each number is free by the time the next car moves into it.
  for r in
    select
      user_id,
      "Car ID" as old_id,
      split_part("Car ID", '/', 1) || '/BBR/' || split_part("Car ID", '/', 3) || '/' ||
        lpad(row_number() over (
          partition by user_id, split_part("Car ID", '/', 1), split_part("Car ID", '/', 3)
          order by split_part("Car ID", '/', 4)::integer
        )::text, 3, '0') as target
    from public.tesoro_raw
    where split_part("Car ID", '/', 2) = 'BBR'
      and "Car ID" ~ '^[A-Z0-9]{4,12}/BBR/[A-Z0-9]{3,6}/[0-9]{3}$'
    order by user_id, split_part("Car ID", '/', 3), split_part("Car ID", '/', 4)::integer
  loop
    new_id := r.target;
    if new_id <> r.old_id then
      insert into public.tesoro_raw_car_id_map (user_id, old_id, new_id)
        values (r.user_id, r.old_id, new_id) on conflict do nothing;
      update public.tesoro_raw set "Car ID" = new_id
        where user_id = r.user_id and "Car ID" = r.old_id;
    end if;
  end loop;
end $$;
