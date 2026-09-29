-- A seller is a shop with a phone number, not a word typed on a car.
--
-- Until now a seller existed only as text on tesoro_raw."Seller": 137 of them,
-- and nowhere to put the thing you actually want when you go back to buy again
-- — which shop this is, the number to ring, the WhatsApp to message, where they
-- are. That had to live in somebody's phone, which is not where the collection
-- lives.
--
-- Keyed on the lower-cased name for the same reason the brand logos are:
-- "Crossword" and "crossword" are one shop, and the cars spell it both ways.
-- The name on the cars is never rewritten from here; `prefer` only decides
-- which of the two names this page shows.
--
-- Shared, like the catalogue and the assortment list: several collectors buy
-- from the same shop, so one person correcting a phone number corrects it for
-- everybody. Written by admins for that reason, read by anybody signed in.

create table if not exists public.tesoro_sellers (
  -- lower(trim("Seller")) as the cars carry it.
  seller_key text primary key,
  -- The spelling seen most often on the cars, kept so the row is legible on
  -- its own and so a rename upstream can be noticed.
  owner_name text not null default '',
  store_name text,
  phone text,
  -- A wa.me/… link, or whatever the shop hands out. Stored as given.
  whatsapp text,
  location text,
  -- Which name this seller goes by on screen.
  prefer text not null default 'owner' check (prefer in ('owner', 'store')),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.tesoro_sellers is
  'Shop details for a seller named on a car. Keyed on the lower-cased seller name; the cars themselves are never rewritten from here.';

alter table public.tesoro_sellers enable row level security;

-- Signed in, and that is all: this is a page behind the gate, and a shop's
-- phone number is not something the public casting pages have any use for.
drop policy if exists "seller details are readable by members" on public.tesoro_sellers;
create policy "seller details are readable by members"
  on public.tesoro_sellers for select to authenticated using (true);

drop policy if exists "seller details are written by admins" on public.tesoro_sellers;
create policy "seller details are written by admins"
  on public.tesoro_sellers for all to authenticated
  using (public.is_tesoro_admin(auth.uid()))
  with check (public.is_tesoro_admin(auth.uid()));
