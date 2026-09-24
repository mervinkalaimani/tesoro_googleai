-- Undoing the images /api/sync-images flattened by make and model.
--
-- That endpoint ran an unconditional second write —
--   .update({ "Image URL": image }).ilike("Make", make).ilike("Model", model)
-- — so one photo uploaded against one Porsche 911 landed on every Porsche 911
-- row in the table, in every collection. 582 rows across six people were
-- wearing a picture of a different car. The endpoint is fixed (865beb2); this
-- repairs what it left.
--
-- A photo sitting on rows that belong to two or more different castings was
-- put there by that write, not chosen for any of them. Each such row takes the
-- photo of its own catalogue entry instead, matched on Catalog ID — the link
-- that was always correct and never the thing at fault.
--
-- Left alone, deliberately:
--   * personal uploads (/storage/v1/object/) — somebody's own photograph, and
--     121 of them survive this untouched
--   * rows whose photo IS their catalogue entry's — legitimately theirs
--   * rows whose catalogue entry has no photo yet. A wrong picture is bad, but
--     blanking 434 rows to placeholders while the catalogue is still half
--     empty is worse. Those are fixed by filling the catalogue in — Settings ›
--     Catalogue Photos — and running this again.
--
-- Proven first with the project's rolled-back DO block: 121 rows fixed, 121
-- personal uploads intact, 1,615 rows total before and after.
--
-- tesoro_raw_image_snapshot_20260924b holds every value as it was.
begin;

create table if not exists public.tesoro_raw_image_snapshot_20260924b as
select "SNO", "Catalog ID", "Image URL", "Make", "Model", user_id, now() as captured_at
from public.tesoro_raw;

alter table public.tesoro_raw_image_snapshot_20260924b enable row level security;

update public.tesoro_raw r
set "Image URL" = c.image_url
from public.tesoro_car_catalog c
where c.car_id = trim(r."Catalog ID")
  and coalesce(trim(c.image_url), '') <> ''
  and trim(c.image_url) is distinct from trim(r."Image URL")
  and r."Image URL" in (
    select "Image URL" from public.tesoro_raw
    where coalesce(trim("Image URL"), '') <> ''
      and "Image URL" not ilike '%/storage/v1/object/%'
    group by 1
    having count(distinct trim("Catalog ID")) > 1
  );

commit;
