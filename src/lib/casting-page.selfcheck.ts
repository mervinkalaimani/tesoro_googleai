/**
 * What a public casting page is allowed to say.
 *
 *   npx esbuild src/lib/casting-page.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=.selfcheck.mjs && node .selfcheck.mjs
 */
import assert from "node:assert/strict";

import {
  castingDescription,
  castingName,
  castingTitle,
  isPublishablePhoto,
  ownersLine,
  typicalPrice,
  typicalPriceNote,
} from "@/lib/casting-page";
import type { CatalogCar } from "@/lib/catalog";

const excavator = {
  car_id: "071A0B-03-0300-1",
  brand: "Matchbox",
  make: "MBX",
  model: "Excavator",
  variant: "890M",
  assortment: "Mainline",
  series: "Matchbox The Movie",
  sub_series: "",
  car_number: "11/12",
  mrp: 110,
  name: "'24 MBX Excavator 890M",
  year: "2024",
  colour: "Yellow",
  type: "Construction Vehicle",
} as CatalogCar;

assert.equal(castingTitle(excavator), "'24 MBX Excavator 890M — Matchbox Mainline 11/12 | VIIV");
assert.match(castingDescription(excavator), /^'24 MBX Excavator 890M is a yellow Matchbox/);
assert.match(castingDescription(excavator), /Matchbox The Movie series/);
assert.match(castingDescription(excavator), /numbered 11\/12/);

// An entry with almost nothing filled in still produces a sentence rather than
// a string of commas — 389 of them have no photo and plenty have no type.
const bare = { car_id: "X", brand: "", make: "Ford", model: "Bronco", name: "" } as CatalogCar;
assert.equal(castingName(bare), "Ford Bronco");
assert.equal(castingTitle(bare), "Ford Bronco | VIIV");
assert.equal(castingDescription(bare), "Ford Bronco is a die-cast model. Catalogued on VIIV.");

// Only a copy on our own storage may be published. The wikis' links are the
// common case and must not pass.
assert.equal(isPublishablePhoto("https://matekrbcflojjooswoha.supabase.co/x/y.jpg"), true);
assert.equal(isPublishablePhoto("https://static.wikia.nocookie.net/a/b.jpg"), false);
assert.equal(isPublishablePhoto("https://i.ebayimg.com/a.jpg"), false);
assert.equal(isPublishablePhoto(""), false);
assert.equal(isPublishablePhoto(null), false);
assert.equal(isPublishablePhoto("not a url"), false);
// A look-alike domain is not ours.
assert.equal(isPublishablePhoto("https://evil-supabase.co/x.jpg"), false);

// What it typically sold for. One buyer is one receipt, so the database sends
// nulls and the page falls back to the MRP instead.
assert.equal(
  typicalPrice({
    owners: 1,
    copies: 1,
    prices: null,
    paid_min: null,
    paid_max: null,
    last_seen: null,
  }),
  null,
);
// Two who paid the same is a price, not a range.
assert.equal(
  typicalPrice({
    owners: 2,
    copies: 2,
    prices: 2,
    paid_min: 400,
    paid_max: 400,
    last_seen: "Apr 2026",
  }),
  "₹400",
);
assert.equal(
  typicalPrice({
    owners: 3,
    copies: 4,
    prices: 4,
    paid_min: 300,
    paid_max: 1250,
    last_seen: "Apr 2026",
  }),
  "₹300 – ₹1,250",
);
assert.equal(typicalPrice(null), null);

assert.equal(
  typicalPriceNote({
    owners: 3,
    copies: 4,
    prices: 4,
    paid_min: 300,
    paid_max: 1250,
    last_seen: "Apr 2026",
  }),
  "over 4 purchases · last seen Apr 2026",
);
assert.equal(
  typicalPriceNote({
    owners: 1,
    copies: 1,
    prices: null,
    paid_min: null,
    paid_max: null,
    last_seen: null,
  }),
  null,
);

assert.equal(
  ownersLine({
    owners: 0,
    copies: 0,
    prices: null,
    paid_min: null,
    paid_max: null,
    last_seen: null,
  }),
  null,
);
assert.equal(
  ownersLine({
    owners: 1,
    copies: 1,
    prices: null,
    paid_min: null,
    paid_max: null,
    last_seen: null,
  }),
  "1 collector here owns one",
);
assert.equal(
  ownersLine({
    owners: 2,
    copies: 5,
    prices: null,
    paid_min: null,
    paid_max: null,
    last_seen: null,
  }),
  "2 collectors here own one — 5 copies between them",
);

// The description is the one sentence a search result shows, so "a orange
// Matchbox" is a typo in public.
assert.match(
  castingDescription({ ...excavator, colour: "Orange", type: "Sports Car" }),
  / is an orange Matchbox Sports Car/,
);
assert.match(
  castingDescription({ ...excavator, colour: "Yellow", type: "Sports Car" }),
  / is a yellow Matchbox Sports Car/,
);
// Nothing to describe at all still has to read as a sentence.
assert.match(
  castingDescription({ ...excavator, colour: "", brand: "", type: "" }),
  / is a die-cast model/,
);

console.log("casting-page: a public page names a casting, never a collector.");
