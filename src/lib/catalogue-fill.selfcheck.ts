/**
 * What Get from Catalogue writes, and what it refuses to touch.
 *
 *   npx esbuild src/lib/catalogue-fill.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=.selfcheck.mjs && node .selfcheck.mjs
 */
import assert from "node:assert";

import { catalogueFill, type CatalogueFillFields } from "@/lib/catalogue-fill";
import type { CatalogCar } from "@/lib/catalog";

const entry = {
  car_id: "010506-01-0000-1",
  name: "1969 Chevrolet Camaro SS",
  brand: "Hot Wheels",
  make: "Chevrolet",
  model: "Camaro SS",
  variant: "396",
  colour: "Blue",
  type: "Muscle",
  assortment: "Mainline",
  series: "Muscle Mania",
  sub_series: "2023 Mix 5",
  car_number: "12/250",
  size: "1:64",
  year: "1969",
  mrp: 199,
  image_url: "https://example.test/entry.jpg",
} as unknown as CatalogCar;

const mine: CatalogueFillFields & { spent: number; seller: string } = {
  brand: "Hot Wheels",
  make: "Chevy",
  model: "Camaro",
  variant: "",
  colour: "Bleu",
  type: "",
  assortment: "Mainline",
  series: "Muscle Mania",
  subSeries: "",
  carNumber: "",
  size: "1:64",
  year: "",
  mrp: 450,
  displayName: "The blue one",
  imageUrl: "https://example.test/mine.jpg",
  spent: 380,
  seller: "Shlok Agarwal",
};

const out = catalogueFill(mine, entry);

// The casting is the catalogue's.
assert.equal(out.make, "Chevrolet");
assert.equal(out.model, "Camaro SS");
assert.equal(out.colour, "Blue");
assert.equal(out.subSeries, "2023 Mix 5");
assert.equal(out.carNumber, "12/250");
assert.equal(out.year, "1969");

// Name and price take the entry's, so the row starts accepting corrections
// again rather than reading as one the owner has made their own.
assert.equal(out.displayName, "1969 Chevrolet Camaro SS");
assert.equal(out.mrp, 199);

// The photograph is the entry's when it has one.
assert.equal(out.imageUrl, "https://example.test/entry.jpg");

// The purchase is untouched.
assert.equal(out.spent, 380);
assert.equal(out.seller, "Shlok Agarwal");

// An entry with nothing to say keeps your photo, and empties a price it has
// no figure for rather than inventing one.
const bare = { ...entry, image_url: null, mrp: 0, name: "" } as unknown as CatalogCar;
const kept = catalogueFill(mine, bare);
assert.equal(kept.imageUrl, "https://example.test/mine.jpg");
assert.equal(kept.mrp, "");
assert.equal(kept.displayName, "");

console.log("catalogue-fill: the casting is copied, the purchase is not.");
