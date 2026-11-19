/**
 * The marketplace rules that cost money or trust if they break: stock, retries,
 * ownership, bids. Runs against the real data layer.
 *
 *   npx esbuild src/market/db.selfcheck.ts --bundle --format=esm \
 *     --platform=node --outfile=.selfcheck.mjs && node .selfcheck.mjs
 */
import assert from "node:assert";

import { api, getState, setCatalogue } from "./db";
import type { CatalogueItem } from "./types";

const addr = {
  name: "Aarav",
  phone: "9876543210",
  line1: "14 Lake Rd",
  city: "Pune",
  state: "MH",
  pincode: "411001",
};
const get = () => getState();
const must = <T>(r: { ok: boolean; data?: T; error?: string }) => (
  assert.ok(r.ok, r.ok ? "" : r.error),
  r.data as T
);

// 400 stand-in catalogue cars; the market seeds itself on top of whatever it is given.
const cars: CatalogueItem[] = Array.from({ length: 400 }, (_, i) => ({
  id: `CAR-${i}`,
  code: `CAR-${i}`,
  name: `Car ${i}`,
  brand: "Hotwheels",
  make: "Make",
  model: `Model ${i}`,
  scale: "1:64",
  series: "",
  assortment: "Mainline",
  variant: "",
  colour: "Red",
  year: "",
  manufacturer: "Hotwheels",
  origin: "Imported",
  aliases: [],
  mrpPaise: 17900,
  imageUrl: null,
  source: "viiv-catalogue",
  review: "approved",
  createdAt: 0,
}));
setCatalogue(cars);
assert.ok(get().seeded && get().listings.length > 20, "seeds once the catalogue arrives");

api.signIn("u_aarav");
// A listing nobody has bought yet, from a seller who isn't Aarav.
const l = get().listings.find((x) => x.sellerId === "u_pitlane" && x.quantity >= 2)!;
const stock = l.quantity;

// 1. Checkout is idempotent: the same key twice is one order, one decrement, one collection add.
const o1 = must(api.checkout({ listingId: l.id, qty: 1, address: addr, key: "k1" }));
const o1b = must(api.checkout({ listingId: l.id, qty: 1, address: addr, key: "k1" }));
assert.equal(o1.id, o1b.id);
assert.equal(get().listings.find((x) => x.id === l.id)!.quantity, stock - 1);

// 2. Oversell is refused; bad address is refused.
assert.ok(!api.checkout({ listingId: l.id, qty: stock, address: addr, key: "k2" }).ok);
assert.ok(
  !api.checkout({ listingId: l.id, qty: 1, address: { ...addr, pincode: "12" }, key: "k3" }).ok,
);

// 3. Only the owning seller ships; a different seller can't even see the order.
api.signIn("u_garage64");
assert.ok(
  !api.markShipped(o1.id, {
    carrier: "X",
    trackingNumber: "1",
    trackingUrl: "",
    dispatchDate: "2026-01-01",
    eta: "",
  }).ok,
);
api.signIn("u_pitlane");
assert.ok(
  !api.markShipped(o1.id, {
    carrier: "",
    trackingNumber: "1",
    trackingUrl: "",
    dispatchDate: "2026-01-01",
    eta: "",
  }).ok,
);
must(
  api.markShipped(o1.id, {
    carrier: "Delhivery",
    trackingNumber: "T123",
    trackingUrl: "",
    dispatchDate: "2026-01-01",
    eta: "",
  }),
);
assert.equal(get().orders.find((o) => o.id === o1.id)!.status, "shipped");
assert.ok(!api.cancelOrder(o1.id, "x").ok, "a shipped order can't be cancelled");

// 4. Cancelling a processing order puts stock and collection back.
api.signIn("u_aarav");
const o2 = must(api.checkout({ listingId: l.id, qty: 1, address: addr, key: "k4" }));
must(api.cancelOrder(o2.id, "changed my mind"));
assert.equal(get().listings.find((x) => x.id === l.id)!.quantity, stock - 1);

// 5. Auction: sellers can't bid, raises must clear the increment, no self-outbid, winner follows the reserve.
const a = get().events.find((e) => e.type === "auction")!;
const top = a.bids.at(-1)!.amountPaise;
api.signIn(a.sellerId);
assert.ok(!api.placeBid(a.id, top + 100000).ok);
api.signIn("u_aarav");
assert.ok(!api.placeBid(a.id, top + 1).ok, "below the increment");
must(api.placeBid(a.id, top + a.minIncrementPaise));
api.signIn(a.sellerId);
must(api.closeEventNow(a.id));
assert.equal(get().events.find((e) => e.id === a.id)!.winnerId, null, "reserve not met: no winner");
// Restarting copies the terms into a fresh draft with no bids; bidding over the reserve then wins.
const copy = must(api.restartEvent(a.id));
assert.equal(copy.bids.length, 0);
must(api.setEventStatus(copy.id, "live"));
api.signIn("u_aarav");
must(api.placeBid(copy.id, copy.reservePaise!));
assert.ok(
  !api.placeBid(copy.id, copy.reservePaise! + 10 * copy.minIncrementPaise).ok,
  "already the high bidder",
);
api.signIn(a.sellerId);
must(api.closeEventNow(copy.id));
assert.equal(get().events.find((e) => e.id === copy.id)!.winnerId, "u_aarav");

// 6. Raffle: one entry each, sellers can't enter, closing records a reproducible draw.
const r = get().events.find((e) => e.type === "raffle")!;
api.signIn("u_aarav");
must(api.enterRaffle(r.id));
assert.ok(!api.enterRaffle(r.id).ok);
api.signIn(r.sellerId);
assert.ok(!api.enterRaffle(r.id).ok);
must(api.closeEventNow(r.id));
const done = get().events.find((e) => e.id === r.id)!;
assert.ok(done.winnerId && done.draw && done.draw.entryCount === 3);

// 7. A seller adds a car the catalogue lacks; a duplicate is refused; it can then be listed.
api.signIn("u_pitlane");
const fresh = {
  car_id: "NEW-1",
  brand: "Mini GT",
  make: "Nissan",
  model: "Skyline GT-R",
  assortment: "Premium",
  series: "",
  sub_series: "",
  car_number: "",
  mrp: 899,
  name: "Skyline GT-R",
  variant: "",
  colour: "Blue",
  size: "1:64",
};
const item = must(api.addCar(fresh as never));
assert.equal(item.id, "NEW-1");
assert.ok(get().items.some((i) => i.id === "NEW-1"));
assert.ok(!api.addCar({ ...fresh, car_id: "NEW-2" } as never).ok, "same car twice");
api.signIn("u_aarav");
assert.ok(
  !api.addCar({ ...fresh, car_id: "NEW-3", model: "Other" } as never).ok,
  "only sellers add cars",
);

/* photos: cap of 5, requests, replace-not-remove */
const px = (n: number) => `data:image/jpeg;base64,${n}`;
const pl = get().listings.find((x) => x.sellerId === "u_pitlane" && x.status === "active")!;
api.signIn("u_aarav");
assert.ok(!api.setPhotos(pl.id, [px(1)]).ok, "only the seller sets photos");
assert.ok(!api.requestPhoto(pl.id, "replace", 0, "").ok, "nothing to replace yet");
must(api.requestPhoto(pl.id, "more", null, "side view"));
assert.ok(!api.requestPhoto(pl.id, "more", null, "").ok, "no duplicate open request");
api.signIn("u_pitlane");
assert.ok(!api.setPhotos(pl.id, [1, 2, 3, 4, 5, 6].map(px)).ok, "max 5");
must(api.setPhotos(pl.id, [px(1), px(2)]));
assert.equal(get().photoRequests[0].status, "done", "adding a photo answers 'more'");
assert.ok(!api.setPhotos(pl.id, [px(1)]).ok, "live: replace, don't remove");
api.signIn("u_aarav");
must(api.requestPhoto(pl.id, "replace", 1, "blurry"));
api.signIn("u_pitlane");
must(api.setPhotos(pl.id, [px(1), px(9)]));
assert.ok(get().photoRequests.every((r) => r.status === "done"), "replacing answers 'replace'");
must(api.setPhotos(pl.id, [1, 2, 3, 4, 5].map(px)));
api.signIn("u_aarav");
assert.ok(!api.requestPhoto(pl.id, "more", null, "").ok, "at 5 photos no more to ask for");
must(api.requestPhoto(pl.id, "replace", 4, ""));
api.signIn("u_pitlane");
must(api.declinePhotoRequest(get().photoRequests.at(-1)!.id));

console.log("market selfcheck ok");
