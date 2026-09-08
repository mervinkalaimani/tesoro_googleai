# Tesoro — Pre-orders tab, habit tracker rework, insights, smarter search

## 1. Rename the app to Tesoro

- Sidebar title, page titles and descriptions across every route ("… | Tesoro").
- Keep "Personal collection" subtitle.

## 2. New Pre-orders tab

- New left-nav entry "Pre-orders" between My Orders and Habits, with its own route and metadata.
- Table columns: Model, Seller, Order date, ETA (from the Transit info / ETA column), Payment, Cost (was "Total"), Adv paid, Balance.
- Payment cell shows only the payment status text — the second line with "Partly paid / Adv not paid" is removed.
- Balance stays calculated as cost minus advance paid.
- Keeps the summary strip (count committed, paid, balance) and click-to-open car details.
- Remove the pre-order tracker from My Orders, and drop "Pre Order" from that page's status filter so it only covers in-flight shipments.

## 3. Habit tracker rework

- Day details panel moves below the tracker card, full width, instead of sitting to its right.
- Grid gets larger, better-spaced squares (bigger cells that stay readable at 6 months) with all seven weekday labels shown.
- Month labels above every month, plus a year marker above the first month of each year.
- Range segment control becomes: This month, Last month, 3M, 6M, 12M.
- New view segment control: Daily / Weekly / Monthly / Yearly. Daily keeps the heatmap; the other views aggregate cells into weeks, months or years (bar-style blocks) and clicking a block shows that period's cars.
- KPI cards recalculate for the selected view and range (e.g. active weeks/months instead of active days, best period, streak in the selected unit).
- Day/period detail rows include the seller name alongside name, sub-line, spend and status.

## 4. Insight cards

- A row of insight cards sits below/next to the detail panel, driven by the same filtered range:
  - Top seller by number of cars.
  - Top seller by amount spent.
  - Top brand by number of cars (HW, MBX, etc.).
  - Top make by number of cars.
- Each card shows the leader plus the next few entries with counts/values; clicking an entry filters the detail list to those cars.

## 5. Search improvements

- The search box gets a suggestion dropdown: typing shows matching field names (make, model, brand, seller, colour, series, status, year, cost …) to click and insert as `field = `, plus matching values from the current data.
- Support `+` as an OR joiner: `mustang+ferrari` matches either, `red+yellow` matches either, and it works with fields too (`make = ferrari+lamborghini`). Comma keeps its current meaning (new condition / list continuation).
- Keyboard support: arrow keys and Enter to accept a suggestion, Escape to dismiss.

## 6. KPI layout

- Dashboard and habit tracker KPI cards render in a single row (horizontally scrollable on small screens) with equal heights.

## Technical notes

- New route `src/routes/preorders.tsx`; nav entry added in `src/components/app-sidebar.tsx`; `PoTracker` removed from `src/routes/orders.tsx`.
- `src/lib/search.ts` gains `+` OR-splitting inside token/value parsing; suggestion list built from a new helper exposing field aliases plus distinct values from the car store.
- Habit tracker aggregation refactored into a period-bucket helper in `src/routes/habits.tsx` so daily/weekly/monthly/yearly views share the same code path.
- No backend or data-source changes; everything continues to read from the RAW sheet mapping.
