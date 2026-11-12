-- The Alfa Romeo 33 Stradale was filed with no assortment, so its Car ID got the
-- placeholder STD: MKCCB/BBR/STD/001. It is a Box.
--
-- Set the assortment on the catalogue entry and on the collection row, then give
-- the row the next BBR/BOX number in that collection. The catalogue ID keeps its
-- value: it does not change when an entry is corrected.
--
-- Run after 20261112100000_bbr_numbers_close_the_gap, so the next number follows
-- the renumbered boxes (007) rather than the old ones (009).

insert into public.tesoro_raw_car_id_backup_20261112 (user_id, old_car_id)
select user_id, "Car ID" from public.tesoro_raw where "Car ID" = 'MKCCB/BBR/STD/001';

update public.tesoro_car_catalog set assortment = 'Box'
where car_id = '1Q0106-00-0000-1' and coalesce(assortment, '') = '';

do $$
declare
  uid uuid;
  new_id text;
begin
  select user_id into uid from public.tesoro_raw where "Car ID" = 'MKCCB/BBR/STD/001';
  if uid is null then
    return;
  end if;
  update public.tesoro_raw set "Assortment" = 'Box' where user_id = uid and "Car ID" = 'MKCCB/BBR/STD/001';
  new_id := public.tesoro_raw_new_car_id(uid, 'BBR', 'Box');
  insert into public.tesoro_raw_car_id_map (user_id, old_id, new_id)
    values (uid, 'MKCCB/BBR/STD/001', new_id) on conflict do nothing;
  update public.tesoro_raw set "Car ID" = new_id where user_id = uid and "Car ID" = 'MKCCB/BBR/STD/001';
end $$;
