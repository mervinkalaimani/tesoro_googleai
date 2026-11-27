-- Photos for castings that have none, sent by anyone and approved by an admin.
--
-- A casting with no picture shows a polaroid asking for one. Anybody signed in can send a photograph
-- of it. It does not go to the catalogue straight away: it waits here until an admin or the owner
-- approves it. Approving writes it onto the catalogue entry, with the name of whoever sent it, and
-- every collection that holds the casting and has no picture of its own reads it from there (the app
-- already falls back to the catalogue's picture when a car has none).

-- Who gave the catalogue entry its picture, for the "Added by" tag on it.
alter table public.tesoro_car_catalog
  add column if not exists image_added_by text,
  add column if not exists image_added_at timestamptz;

create table if not exists public.tesoro_catalog_photo_submissions (
  id uuid primary key default gen_random_uuid(),
  -- The catalogue entry (tesoro_car_catalog.car_id) the photograph is of.
  car_id text not null,
  -- Public URL in the car-photos bucket; the file is under the sender's own folder, as every upload is.
  image_url text not null,
  submitted_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The sender's name as it should read on the tag, kept as it was when they sent it.
  submitted_by_name text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz
);

create index if not exists tesoro_catalog_photo_submissions_status_idx
  on public.tesoro_catalog_photo_submissions (status, created_at desc);
create index if not exists tesoro_catalog_photo_submissions_car_idx
  on public.tesoro_catalog_photo_submissions (upper(car_id));

-- One waiting photograph per person per casting: sending another is a mistake, not a second chance.
create unique index if not exists tesoro_catalog_photo_submissions_one_pending
  on public.tesoro_catalog_photo_submissions (upper(car_id), submitted_by)
  where status = 'pending';

alter table public.tesoro_catalog_photo_submissions enable row level security;

-- Anyone signed in can send one, as themselves, and only as pending.
drop policy if exists "send a photo for a casting" on public.tesoro_catalog_photo_submissions;
create policy "send a photo for a casting"
  on public.tesoro_catalog_photo_submissions for insert to authenticated
  with check (submitted_by = auth.uid() and status = 'pending');

-- You see your own; an admin or the owner sees all of them.
drop policy if exists "see your own photos, or all as an admin" on public.tesoro_catalog_photo_submissions;
create policy "see your own photos, or all as an admin"
  on public.tesoro_catalog_photo_submissions for select to authenticated
  using (submitted_by = auth.uid() or public.is_tesoro_admin(auth.uid()));

-- There is no update or delete policy on purpose: a photograph is approved or rejected only through
-- the function below, which checks who is asking.

create or replace function public.tesoro_review_photo_submission(_id uuid, _approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.tesoro_catalog_photo_submissions%rowtype;
begin
  if not public.is_tesoro_admin(auth.uid()) then
    raise exception 'Only an admin can review photos';
  end if;

  select * into s from public.tesoro_catalog_photo_submissions where id = _id for update;
  if not found then
    raise exception 'No such photo';
  end if;
  if s.status <> 'pending' then
    raise exception 'That photo has already been reviewed';
  end if;

  update public.tesoro_catalog_photo_submissions
     set status = case when _approve then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = _id;

  if _approve then
    update public.tesoro_car_catalog
       set image_url = s.image_url,
           image_added_by = s.submitted_by_name,
           image_added_at = now(),
           updated_at = now()
     where upper(car_id) = upper(s.car_id);

    -- The casting has its picture now: anyone else's waiting photograph of it is no longer needed.
    update public.tesoro_catalog_photo_submissions
       set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
     where upper(car_id) = upper(s.car_id) and status = 'pending' and id <> _id;
  end if;
end;
$$;

revoke all on function public.tesoro_review_photo_submission(uuid, boolean) from public;
grant execute on function public.tesoro_review_photo_submission(uuid, boolean) to authenticated;
