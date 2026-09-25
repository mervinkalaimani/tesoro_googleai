/**
 * What the catalogue pickers will find. The ones that used to fail are the
 * searches that are not a name: the colour, the year, the number on the card,
 * and the ID pasted in whole.
 *
 *   npx esbuild src/lib/catalog-match.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=.selfcheck.mjs && node .selfcheck.mjs
 */
import assert from "node:assert";

import { catalogMatches } from "@/lib/catalog";
import type { CatalogCar } from "@/lib/catalog";

const skyline: CatalogCar = {
  car_id: "0F1H02-01-0102-1",
  brand: "Mini GT",
  make: "Nissan",
  model: "Skyline",
  assortment: "Qube Carz",
  series: "Mijo Exclusives",
  sub_series: "LHD",
  car_number: "23",
  mrp: 1350,
  name: "2024 Nissan Skyline GT-R R34",
  variant: "R34",
  year: "2024",
  colour: "Bayside Blue",
  type: "Sports Car",
  size: "1:64",
  rarity: "Chase",
  image_url: "https://example.test/photo-red-ferrari.jpg",
};

const find = (q: string) => catalogMatches(skyline, q.toLowerCase().split(/\s+/).filter(Boolean));

// What already worked.
assert.equal(find("skyline"), true);
assert.equal(find("mini gt"), true);

// What did not: every one of these was invisible to the pickers.
assert.equal(find("bayside"), true, "colour");
assert.equal(find("blue"), true, "colour");
assert.equal(find("2024"), true, "year");
assert.equal(find("23"), true, "car number");
assert.equal(find("0F1H02-01-0102-1"), true, "the ID, pasted whole");
assert.equal(find("qube"), true, "assortment");
assert.equal(find("mijo"), true, "series");
assert.equal(find("lhd"), true, "sub series");
assert.equal(find("1:64"), true, "size");
assert.equal(find("chase"), true, "rarity");

// Every word, in any order — not one long substring.
assert.equal(find("blue skyline"), true);
assert.equal(find("skyline blue"), true);
assert.equal(find("blue ferrari"), false, "one word missing is no match");

// The photograph's address is not searched, or every casting would answer to
// "red" and to "ferrari".
assert.equal(find("ferrari"), false, "the image URL is not part of the haystack");
assert.equal(find("red"), false, "the image URL is not part of the haystack");
assert.equal(find("https"), false);

console.log("catalog: a casting answers to any field it carries, and to nothing it does not.");
