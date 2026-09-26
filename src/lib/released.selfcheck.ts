/**
 * The release rules. No test framework in this project, so: plain asserts.
 *
 *   npx esbuild src/lib/released.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=.selfcheck.mjs && node .selfcheck.mjs
 */
import assert from "node:assert/strict";

import type { CatalogCar } from "@/lib/catalog";
import type { Diecast } from "@/lib/types";
import {
  recentReleases,
  releasesYouAreWaitingOn,
  releasedLabel,
  RELEASED_WINDOW_DAYS,
  releasedOnInput,
  releasedOnStamp,
} from "@/lib/released";

const NOW = new Date("2026-09-24T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const entry = (p: Partial<CatalogCar> & { car_id: string }): CatalogCar =>
  ({
    brand: "Hot Wheels",
    make: "Nissan",
    model: "Skyline",
    assortment: "Mainline",
    series: "",
    sub_series: "",
    car_number: "",
    mrp: 179,
    name: "Skyline",
    ...p,
  }) as CatalogCar;

const car = (p: Partial<Diecast>): Diecast => ({ id: "c1", status: "PO", ...p }) as Diecast;

const catalog: CatalogCar[] = [
  entry({ car_id: "A", release_status: "Released", released_at: daysAgo(1) }),
  entry({ car_id: "B", release_status: "Released", released_at: daysAgo(10) }),
  // Released long ago — out of the window.
  entry({ car_id: "C", release_status: "Released", released_at: daysAgo(60) }),
  // Released, but before the trigger existed: no date, so it is not news.
  entry({ car_id: "D", release_status: "Released", released_at: null }),
  // Still a pre-order, date or not.
  entry({ car_id: "E", release_status: "Pre Order", released_at: daysAgo(2) }),
];

const recent = recentReleases(catalog, 21, NOW);
assert.deepEqual(
  recent.map((r) => r.entry.car_id),
  ["A", "B"],
  "only dated releases inside the window, newest first",
);
assert.equal(recent[0].daysAgo, 1);

// Only your own PO rows, and only matched on Catalog ID.
const mine: Diecast[] = [
  car({ id: "1", catalogId: "A", status: "PO" }),
  car({ id: "2", catalogId: "B", status: "Pre Order" }), // the other spelling
  car({ id: "3", catalogId: "B", status: "In Hand" }), // already arrived
  car({ id: "4", catalogId: "C", status: "PO" }), // released too long ago
  car({ id: "5", catalogId: "E", status: "PO" }), // still a pre-order
  car({ id: "6", catalogId: "", status: "PO" }), // no casting to match
  // Same make and model as A, different casting. Must NOT match.
  car({ id: "7", catalogId: "ZZZ", status: "PO" }),
];

const waiting = releasesYouAreWaitingOn(mine, catalog, 21, NOW);
assert.deepEqual(
  waiting.map((w) => w.car.id),
  ["1", "2"],
  "your PO rows whose casting just released, newest first",
);

// Nothing released means nothing to say, and no wasted pass over the collection.
assert.deepEqual(releasesYouAreWaitingOn(mine, [], 21, NOW), []);

// A week by default, so B — ten days old, and inside the window the calls above
// pass explicitly — drops out when nobody names one.
assert.equal(RELEASED_WINDOW_DAYS, 7);
assert.deepEqual(
  recentReleases(catalog, undefined, NOW).map((r) => r.entry.car_id),
  ["A"],
);

assert.equal(releasedLabel(0), "Released today");
assert.equal(releasedLabel(1), "Released yesterday");
assert.equal(releasedLabel(6), "Released 6 days ago");

console.log("released: all checks passed");

// The form's date field and the stored moment, both ways. A stamp late in the
// evening still belongs to the day it was here, not the UTC one.
const evening = new Date(2026, 8, 10, 23, 30).toISOString();
assert.equal(releasedOnInput(evening), "2026-09-10");
assert.equal(releasedOnInput(null), "");
assert.equal(releasedOnInput("not a date"), "");
assert.equal(releasedOnInput(releasedOnStamp("2026-06-28")), "2026-06-28", "round trip");
assert.equal(releasedOnStamp(""), null);
assert.equal(releasedOnStamp(null), null);
// What the field holds while it is being typed is a bare day, and it stays put.
assert.equal(releasedOnInput("2026-06-28"), "2026-06-28");
