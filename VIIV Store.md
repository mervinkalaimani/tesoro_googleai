# Claude Code build prompt: Viiv collector marketplace PWA

You are a senior product designer and full-stack engineer. Build a polished, responsive seller-and-buyer marketplace PWA for collectible model cars, using the **Viiv design and catalogue** as the source of truth for visual identity, product taxonomy, and catalogue data.

## First: inspect the project and references

Before changing code:

1. Inspect the repository, existing app, dependencies, and any design files, screenshots, tokens, brand assets, catalogue files, or documentation named Viiv. Preserve the current stack and established conventions where they exist.
2. Treat the supplied Viiv design as the visual authority. Reuse its logo, colors, typography, spacing, component style, iconography, and image treatment. Treat the Viiv catalogue as the authority for car makes, models, scales, series, assortments, variants, and product images. Do not invent a competing brand system or silently replace catalogue values.
3. If the references are not present or accessible, build a coherent, premium collector-marketplace interface and keep all brand-sensitive values and catalogue data easy to replace. Document this assumption in the README. Do not block implementation on missing references.
4. Identify the existing app's framework and available backend. If the repository is a starter or empty, choose a small, well-supported stack that can deliver a working PWA and persistent data; explain the choice briefly in the README.
5. Make a short implementation plan, then build the complete, usable MVP. Do not stop after a static mockup.

## Product goal

Create a marketplace where one account can act as both collector/buyer and seller. A user who enables seller mode can publish collectible model-car listings. Buyers browse a shared feed, search for an exact catalogue item, compare all sellers offering it, and buy from the seller they choose. A completed purchase automatically adds that exact item and quantity to the buyer's collection. The seller can fulfill the order by entering shipping details and changing its status; the buyer sees the order as **In transit** and can follow its progress. Sellers can also host transparent car auctions or raffle-style events where eligible participants place bids/entries and a winner is selected according to the published rules.

This is a marketplace for **collectible/model cars**, not road vehicles. Use terminology, imagery, and fields appropriate to die-cast and other catalogued collectible cars.

## Roles and account model

- Use one user identity and one sign-in/session model. Do not create separate buyer and seller account types.
- Every signed-in user can browse, purchase, save cars, participate in events, and manage a personal collection.
- Add a clear **Become a seller / Seller mode** flow on the same account. Collect the seller profile details needed by the UI (display/store name, avatar/logo, location, short bio, contact preferences, and payout placeholder if needed). Include a visible verification state such as `Unverified`, `Pending`, or `Verified`; do not imply verification that has not happened.
- Seller mode reveals seller navigation and tools without removing buyer/collector features. Users can switch modes and return to their collection or orders at any time.
- Include an admin/moderation role only if the existing project already has one or it is needed to make the MVP coherent. Never expose admin actions to ordinary users.

## Primary navigation and screens

Design responsive mobile-first layouts, then adapt them for tablet and desktop. Use an installable PWA shell with an appropriate manifest, icons/placeholders, theme color, and offline-friendly app shell where the stack supports it.

Provide the screens and meaningful states below:

1. **Home / marketplace feed** — curated and recent listings, featured sellers, upcoming auctions/raffles, and useful category or scale entry points. Search should be prominent. Use believable seeded content, not lorem ipsum.
2. **Search and browse** — search across make, model name, scale, series, assortment, variant, and seller. Include useful filters: scale, brand/make, series, assortment, country of origin (`Indian` / `Imported`), condition, price range, seller location, availability, and sale type. Sort by relevance, newest, price, and ending soon where appropriate. Show useful empty and no-results states.
3. **Catalogue item detail** — show the canonical catalogue identity and images, key specs, and all active seller offers for that exact item. Each offer must clearly show seller, condition, packaging, quantity/availability, MRP, selling price, savings, shipping charge/estimate when known, seller rating/verification state, and sale type. Let the buyer choose the seller/listing before purchasing.
4. **Seller/store profile** — store identity, location, verification state, rating/reviews where implemented, current listings, and seller's active events.
5. **Listing detail and checkout** — confirm the selected seller and listing, quantity, item price, shipping, total, delivery address, and order confirmation. Use a payment abstraction or clearly marked demo checkout; never claim a payment succeeded unless the implemented payment provider confirms it.
6. **My collection** — collection organized around catalogue items, with quantity owned, condition/notes if supplied, acquisition date, and source seller/order. Buying a car automatically adds/increments the matching item in the collection after the order reaches the configured successful purchase state. Prevent duplicate collection records for the same catalogue item when the intended behavior is to increment quantity. Offer a manual “Add to collection” action for items acquired elsewhere, clearly distinct from a purchase.
7. **My orders / order detail** — buyer can inspect each order, seller, items, totals, address, fulfillment status, shipping carrier, tracking number/link, and tracking updates. Clearly show `Processing`, `Shipped` / `In transit`, `Delivered`, and `Cancelled` or equivalent states. A seller marking the order shipped must make it appear as **In transit** in the buyer view.
8. **Seller dashboard** — overview cards for active listings, sold orders awaiting fulfillment, shipped orders, event activity, and quick actions. Include inventory and listing management.
9. **Create/edit listing** — catalogue-first form. Seller selects an existing catalogue item or creates a catalogue suggestion if allowed; do not let free text silently create a duplicate canonical item. Seller enters offer-specific stock, pricing, condition, and shipping information. Support draft, preview, publish, pause, and sold-out states.
10. **Seller orders / fulfillment** — order queue, order detail, add/edit carrier, tracking number, tracking URL, estimated dispatch/delivery details, and an explicit **Mark as shipped** action with confirmation. Keep a timestamped status history. Prevent invalid transitions and do not let the seller alter a completed buyer payment.
11. **Seller events and event detail** — create, edit, publish, pause/cancel, and close an auction or raffle-style event for a catalogue car/listing. Include current bid/entry state, event end time, rules, participant count, winner, and clear next action. Provide fair, understandable participant flows described below.
12. **Account/settings** — profile, addresses, notification preferences, seller-mode toggle/profile, and sign out. Keep forms accessible and usable on small screens.

## Catalogue and listing data

Represent the canonical **catalogue item** separately from a seller's **listing/offer**. This is essential so search results can group multiple sellers under the same car while preserving seller-specific price, stock, condition, and shipping.

### Catalogue item fields

Use fields available in the Viiv catalogue; map its actual schema rather than duplicating it. At minimum, support the relevant fields below when present:

- Stable ID / catalogue code or SKU, canonical display name, make/brand, model/name, scale, series/collection, assortment, variant/edition, color/livery, release year, manufacturer, country of origin (`Indian` or `Imported`), product images, and searchable aliases.
- Optional collectible-specific specifications when the catalogue contains them: material, body type, special features, limited edition/production count, and barcode.
- Catalogue import or seed data must be repeatable and must not create duplicates. Preserve source identifiers and image attribution/URLs if present.

### Seller listing fields

- Seller and canonical catalogue item references.
- Listing title override (optional), description, photos, available quantity, reserved/sold quantity, and listing status.
- MRP (original/reference price) and selling price, both stored as integer paise in INR. Validate that selling price is positive. MRP may be absent; if supplied, validate it sensibly and display discount only when valid. Do not confuse MRP with the seller's purchase cost.
- Condition for item and packaging (for example: sealed/new, opened, display condition, box condition), with notes and photos. Make the seller's condition disclosure visible before checkout.
- Country of origin should primarily come from the canonical catalogue entry; allow a seller correction request or a listing-level override only with a visible provenance/verification state. Never silently equate seller location with origin.
- Shipping charge or “calculated later” state, dispatch estimate, shipping regions/pincode coverage when supported, and return/cancellation policy text or configured policy reference.
- Created/updated timestamps; optional SKU and seller notes should remain private to the seller.

Format money as Indian rupees, for example `₹1,299`. Keep prices and quantities consistent across detail, cart/checkout, order, and collection views.

## Core workflows and business rules

### Browse, compare, buy, and collect

1. A user searches for a car or opens a catalogue detail page.
2. The app groups exact catalogue matches and displays every active seller offer for the same item. Do not group near-matches with different scales, variants, or assortments as if they are identical.
3. The user chooses a seller's offer, quantity, and shipping/delivery details, reviews a clear order summary, and confirms checkout.
4. Create an order tied to the selected seller and listing; reduce available inventory safely so two concurrent purchases cannot oversell stock.
5. On confirmed successful payment/order creation (use an explicit demo mode if no payment provider exists), add the purchased quantity of that canonical item to the buyer's collection and link it to the order. Make the order and collection update idempotent so retries never add the same purchase twice.
6. Show a confirmation and the order's next state. Make failures, out-of-stock conflicts, and payment-pending states clear.

### Seller fulfillment and tracking

1. Seller opens a paid/confirmed order assigned to that seller.
2. Seller enters carrier, tracking number, optional tracking link, and dispatch date, then confirms **Mark as shipped**.
3. Record the event in order history and change status to `shipped` on the backend. In buyer UI, label it **In transit** and show the tracking information.
4. Validate seller ownership server-side. A seller must not read or fulfill another seller's orders. Keep an audit trail for changes.

### Auctions and raffle-style events

Build an explicit event type instead of mixing auction and raffle semantics:

- **Auction:** eligible authenticated users place bids above the current bid and any minimum increment before the deadline. Show the current high bid, minimum next bid, end time, participant count, and winner state. Enforce bid order, deadline, and winner calculation on the server/database, not only in the UI. Prevent a seller from bidding on their own event. Make ties, extensions, cancellation, reserve price, and failed winner payment behavior explicit in event rules.
- **Raffle:** users enter the draw according to published eligibility, entry limit, closing time, and winner-selection method. If the product intends bids in a raffle, model those as bids in an auction instead; do not disguise a highest-bid contest as random raffle selection. If raffle entries or bids involve money, keep real payment and live operation disabled until a compliant provider and jurisdiction-specific review are configured; use demo data/UI states for the MVP. Do not claim random selection is live or fair unless it is implemented with an auditable server-side method.
- For both modes, show rules, seller, car condition, entry/bid history appropriate to privacy, status, deadline in local time, and the winner/next steps. Notify participants of outbid, closing, cancellation, and result states using in-app notifications or a working placeholder.
- Do not permit sellers to edit an event's core terms after participation starts without a visible cancellation/restart flow and audit history.

## UI and interaction quality

- Match the Viiv design references where available. Keep the interface polished, collector-focused, trustworthy, and image-led. Use the catalogue's real images when provided; otherwise use consistent local placeholders and avoid hotlinking arbitrary copyrighted product photos.
- Make listing cards scan-friendly: clear car image, make/model, scale, series/assortment or variant, origin badge, condition, seller, and price. Clearly distinguish MRP from selling price.
- Use responsive layouts, semantic HTML, keyboard-accessible controls, visible focus states, labels and helpful validation, accessible contrast, alt text, and touch targets sized for phones.
- Include loading, empty, success, validation, offline/network error, permission-denied, and stale/out-of-stock states. Use toasts only for brief feedback; important order and event updates must remain visible in page content.
- Keep seller actions deliberate and reversible where possible. Confirm destructive actions such as deleting a draft, cancelling an order/event, or removing stock.
- Use consistent date/time formatting and clearly indicate the local time zone for event deadlines.

## Technical and data requirements

- Use the repository's existing architecture and backend if available. If none exists, keep the implementation modular and choose a practical backend appropriate to the current environment. Do not add a large dependency for a trivial feature.
- Persist users/profiles, catalogue items, seller profiles, listings, orders, order lines, collection entries, shipping updates, events, bids/entries, and notifications using explicit relationships and constraints.
- Enforce authorization and seller ownership at the server/API/database boundary. Validate input on the server as well as in the UI. Do not rely on hidden buttons as security.
- Use transactions or equivalent atomic operations for checkout/inventory reservation, collection updates, bid placement, event closing, and winner selection.
- Keep secrets server-side. Do not commit credentials. If external services are absent, provide a documented local/demo adapter and environment variable examples.
- Add search indexes or sensible query handling across catalogue fields. Paginate feeds and seller offers rather than loading an unbounded catalogue.
- Make the PWA installable and ensure core navigation and cached shell behave gracefully offline. Do not allow an offline client to claim an order, bid, or shipment update has succeeded before the server confirms it.
- Include sample data that demonstrates the exact same catalogue car offered by several sellers, Indian and imported products, multiple assortments/scales, a buyer collection, an order in transit with tracking, an auction, and a raffle-style event. Clearly mark seeded/demo records.
- Keep application code typed where the existing stack supports it. Organize by feature/domain rather than building one giant screen/component.

## Definition of done

- A new user can browse/search without being forced to create a seller account; a signed-in buyer can enable seller mode on the same account.
- A seller can create and publish an offer tied to a catalogue car with assortment/variant, origin, condition, quantity, MRP, selling price, and shipping details.
- Searching an exact car shows all active seller offers for that exact catalogue identity, and the buyer can choose one seller.
- A successful purchase creates an order, updates inventory, and automatically adds the right quantity of the canonical car to the buyer's collection exactly once.
- The seller can add shipping details and mark the order shipped; the buyer sees **In transit**, tracking details, and a status timeline.
- A seller can publish an auction or raffle-style event with explicit rules; eligible users can participate through the correct bid or entry mechanism, and status/winner states are understandable and safely enforced.
- The app works on narrow mobile widths and desktop, has coherent empty/loading/error states, and can be installed as a PWA.
- No placeholder control looks functional while doing nothing. Where an external integration is unavailable, label the demo behavior honestly and explain how to configure the production integration.
- Add/update README documentation covering setup, environment variables, data model, reference assets used, demo credentials/data if applicable, and known MVP boundaries.

## Delivery approach

Work directly in the current repository. Start by reporting the relevant existing stack and Viiv references found. Then implement the core flows end-to-end, populate a small believable demo catalogue, and finish with a concise summary of changed areas, how to run the app, the checks actually performed, and any integration or reference gaps. Do not claim tests or checks were run if they were not.
