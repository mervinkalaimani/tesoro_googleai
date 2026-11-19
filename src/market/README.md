# Viiv Market

The Viiv Store: a buyer-and-seller marketplace for collectible model cars, part of the Viiv app. It lives under `/market` and opens in the app shell's content panel beside the sidebar (the store and catalogue links sit above the totals). It has its own data and demo session and does not touch the collection tracker's tables.

Spec: [`VIIV Store.md`](../../VIIV%20Store.md).

## What was found in the repo

- **Stack:** TanStack Start + React 19 + Tailwind 4 + shadcn/Radix UI, Supabase for the tracker. Kept as is; no new dependencies were added.
- **Viiv design (reused):** the `HomeScreenMark` wordmark, the `--viiv-orange` brand colour and light/dark tokens in `src/styles.css`, the shared `ui/` components, and the `viiv_*` icons.
- **Viiv catalogue (reused, all of it):** the market has no catalogue of its own. `MarketCatalogueBridge` (mounted once under the catalogue provider) feeds every car from the live catalogue (`useCatalog()`, 1,800+ castings) into the market, keyed by the catalogue's own `car_id`. The market only stores demo content on top (sellers, listings, orders, events), generated the first time the catalogue arrives (about one car in ten gets sellers).

## Catalogue and market are one thing

- **Sellers on the catalogue.** A catalogue car that has sellers shows a **For sale** button in the car window's right-hand panel (and a For sale panel on `/catalog/<id>`) listing each seller with price, condition and **Buy now**, which goes straight to checkout.
- **Making a car adds it to the catalogue.** In the listing form, _Add the car to the catalogue_ creates a catalogue entry (a real `car_id`, duplicate-checked) that other sellers can list and the catalogue then shows.
  - **Demo mode (default):** the car joins the catalogue list in this browser only. Nothing is written to the shared catalogue table.
  - **Live mode:** set `VITE_MARKET_WRITE_CATALOG=true` and sign in to the tracker; the car is filed with `addCatalogCar` (Supabase `tesoro_car_catalog`). Don't turn this on for a demo.
  - The public page `/catalog/<id>` reads the database, so a demo-mode car has no public page.

## Assumptions and gaps

- The catalogue has **no product photos** for many cars: cards then show a local car illustration in the casting's colour. A catalogue `image_url` is used when there is one.
- The catalogue has **no country-of-origin column**. `INDIAN_BRANDS` in `catalogue.ts` (`CCA`, `Pop Race`) is a placeholder mapping.
- **Seller ratings** are seeded demo figures. There is no review flow.

## Run it

```sh
npm i
npm run dev        # then open http://localhost:3000/market
```

No environment variables are needed. Everything is seeded and runs in the browser.

**The store is off by default.** Turn it on in **Settings → Viiv Store (beta)** (stored per Viiv account on this device, `src/market/enabled.ts`). While it is off there is no sidebar link, `/market` shows an "off" page, catalogue cars show no sellers, and nothing is seeded or loaded.

**Your Viiv login is your store account.** There is no separate sign-in: the first time you open the store, a store profile is created for your Viiv account (a demo guest gets one too). Buy, collect, or use **Become a seller** from Store account. The seeded sellers (**Garage 64**, **Diecast Dukaan**, **Pit Lane Models**, **Rev Kart**) are demo data you can buy from, not logins. _Reset demo data_ is on the Store account page; it keeps your account.

## How it is built

```
src/market/
  types.ts        data model (money = integer paise)
  catalogue.ts    catalogue car -> market item
  seed.ts         deterministic demo data on top of the catalogue, every record `demo: true`
  db.ts           the "server": all rules and authorization, one atomic write per action
  queries.ts      grouping offers by catalogue car, search, filters, sort
  format.ts       ₹ formatting, local times with zone, order labels
  use-market.ts   React hooks over the store
  components/     shell, cards, shared bits, address form
  pages/          one file per area (home, search, item, checkout, orders, collection, sell, events, …)
src/routes/market*.tsx    thin route files
public/market-sw.js       offline shell for the store
```

**Data model:** `CatalogueItem` (canonical car) is separate from `Listing` (a seller's offer: price, MRP, stock, condition, shipping). `Order` has `lines`, a timestamped `history` and tracking fields. `CollectionEntry` is unique per user and car and keeps `sources` (each order, or manual). `MarketEvent` holds `bids` or `entries`, an `audit` log and the draw record. `Notification`, `User` (one identity, `sellerMode` flag) and `SellerProfile` (`Unverified` / `Pending` / `Verified`, never granted automatically).

**Rules enforced in `db.ts`** (and covered by `db.selfcheck.ts`):

- Checkout is idempotent on a client key: a retry returns the first order, never a second purchase, stock decrement or collection add.
- Stock cannot go negative; an out-of-stock or paused offer is refused. Cancelling a processing order restocks and reverses the collection add.
- A buyer's purchase increments the single collection record for that car (no duplicates). Manual adds are tracked separately.
- A seller can only read or ship their own orders (someone else's is "not found"). Only `processing → shipped → delivered` moves forward; a shipped order shows as **In transit** to the buyer; a seller can't change the buyer's payment.
- Auctions: bid must beat the current bid by the minimum raise; seller can't bid; no bidding on yourself; deadline enforced; late-bid extension; reserve decides whether there is a winner.
- Raffles: free entry only, per-person limit, seller can't enter, winner drawn at close with the seed, entry count and position stored on the event.
- Event terms lock once anyone takes part; the seller must cancel (with a reason participants see) and restart a copy. Everything is audited.
- Adding a car to the catalogue is duplicate-checked (brand, model, scale, assortment, variant, colour) and sellers only.

## PWA

`/market` registers `market-sw.js` (scope `/market`) in production builds; installing is the Viiv app's own manifest: network-first pages with a cached shell fallback, cache-first hashed assets. Writes are never cached or answered by the worker; when the browser is offline every write action is refused with a message instead of pretending to succeed. The tracker's own `sw.js` is untouched.

## Known MVP boundaries (be honest about these)

- **Persistence is `localStorage`.** The rules are real but live in client code, so this is a demo, not a trust boundary. To go live, port `db.ts` to Supabase tables with RLS and run checkout, bidding and event close as Postgres RPCs (one transaction each, an `idempotency_key` unique index, `CHECK (quantity >= 0)`). The function signatures in `api` map to those RPCs one to one.
- **Identity is your Viiv login, but the store's rules still run in the browser** (see above); a real backend must verify the Supabase session server-side.
- **Payment is simulated.** Orders say "demo payment" everywhere and nothing is charged. Plug a provider in at `api.checkout`, and only move an order out of _processing_ when it confirms.
- **Auction and raffle money is simulated.** Real-money bids or entries need a compliant provider and a legal review for your jurisdiction. The raffle draw is reproducible, not an audited lottery.
- No image upload (listings use the catalogue illustration), no email or push (notifications are in-app), no shipping-rate or pincode-coverage engine (`regions` is free text), no catalogue review step, no seller reviews.
- Event closing is evaluated when someone opens the app (and every 15 s while it is open); in production close events from a scheduled job.

## Checks performed

- `db.selfcheck.ts` passes (idempotent checkout, oversell, ownership, cancellation, bids, reserve, restart, raffle draw).
- ESLint on the new code: no errors (4 fast-refresh warnings). `tsc` reports no errors in the new code.
- Manually in the browser: browse, exact-car seller comparison, search filters, checkout, collection merge, seller ship flow, buyer sees **In transit** with tracking, no horizontal scroll at 375 px. Not tested: real devices, the production service worker, installing the PWA.
