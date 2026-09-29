-- A casting that only looks like another one.
--
-- Which boxes a casting comes in is derived, not recorded: two catalogue
-- entries are the same casting when their brand, make and model agree and
-- nothing they both state disagrees. That is right nearly always, and it has no
-- way at all of saying "these two are different products that happen to read
-- the same" -- two Matchbox reissues a year apart, say, where the only
-- difference is on the card.
--
-- One flag, set from the assortments section of the catalogue form. An entry
-- marked standalone is its own casting and is never offered as a box of
-- another; clearing it puts it back in the group.

alter table public.tesoro_car_catalog
  add column if not exists standalone boolean not null default false;

comment on column public.tesoro_car_catalog.standalone is
  'This entry is its own casting, never a box of another one. Grouping is otherwise derived from brand/make/model and whatever of variant, series, sub-series and car number both entries state, which has no way of saying "these two only look alike".';
