-- Scans kept for later.
--
-- A phone is the right thing to scan with and the wrong thing to review a
-- batch on. A scan can now be saved instead of added: what the photograph held
-- is kept as it was read, the camera is ready for the next, and the saved
-- scans are opened on the web later, where the table and the prices are.
--
-- Private to whoever scanned them. They are a to-do list, not a record: a
-- scan is deleted when its cars have been added.

create table if not exists public.tesoro_saved_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The cars the scan read, as the scanner returned them (pack label included).
  cars jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists tesoro_saved_scans_user_idx
  on public.tesoro_saved_scans (user_id, created_at desc);

alter table public.tesoro_saved_scans enable row level security;

drop policy if exists "saved scans belong to their owner" on public.tesoro_saved_scans;
create policy "saved scans belong to their owner"
  on public.tesoro_saved_scans for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
