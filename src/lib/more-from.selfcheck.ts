/**
 * Which one shelf is drawn under a car, and under a catalogue entry.
 *
 * Run: npx esbuild src/lib/more-from.selfcheck.ts --bundle --format=esm
 *      --platform=node --alias:@=./src --outfile=.sc.mjs && node .sc.mjs
 */
import assert from "node:assert/strict";

import { moreFrom, type MoreFromFields } from "@/lib/more-from";

const car = (over: Partial<MoreFromFields>): MoreFromFields => ({
  brand: "Mini GT",
  make: "Toyota",
  model: "2000GT",
  series: "James Bond",
  subSeries: "You Only Live Twice",
  ...over,
});

const read = (c: MoreFromFields) => c;
const many = (n: number, over: Partial<MoreFromFields>) =>
  Array.from({ length: n }, () => car(over));

// The set wins once it is bigger than a pair.
{
  const pool = many(4, {});
  const ring = moreFrom(car({}), pool, read);
  assert.equal(ring?.key, "set", "four in the set earns the set shelf");
  assert.equal(ring?.heading, "You Only Live Twice");
  assert.equal(ring?.cars.length, 4);
}

// Exactly three is still a pair-and-a-bit: the series answers instead.
{
  const pool = [...many(3, {}), car({ subSeries: "Goldfinger" })];
  const ring = moreFrom(car({}), pool, read);
  assert.equal(ring?.key, "series", "three in the set falls through to the series");
  assert.equal(ring?.heading, "James Bond");
  assert.equal(ring?.cars.length, 4, "the series shelf holds every sub series");
}

// No sub series at all, but a series: the series.
{
  const subject = car({ subSeries: "" });
  const ring = moreFrom(subject, many(2, { subSeries: "" }), read);
  assert.equal(ring?.key, "series");
}

// No series and no sub series: the casting's own make and model.
{
  const subject = car({ series: "", subSeries: "" });
  const pool = [
    ...many(2, { series: "", subSeries: "" }),
    car({ series: "", subSeries: "", model: "Supra" }),
  ];
  const ring = moreFrom(subject, pool, read);
  assert.equal(ring?.key, "model");
  assert.equal(ring?.heading, "Toyota 2000GT");
  assert.equal(ring?.cars.length, 2, "a different model is not the same shelf");
}

// A series that nothing else shares draws nothing — it does not fall back to
// the model, which would offer the same casting under a collection's name.
{
  const subject = car({ subSeries: "" });
  assert.equal(moreFrom(subject, [car({ series: "Vol. 1", subSeries: "" })], read), null);
}

// Every ring is the brand's.
{
  const pool = many(6, { brand: "Hot Wheels" });
  assert.equal(moreFrom(car({}), pool, read), null, "another maker's series is not this one");
}

// Nothing to go on.
{
  assert.equal(moreFrom(car({ brand: "" }), many(6, {}), read), null);
  assert.equal(moreFrom(car({ series: "", subSeries: "", model: "" }), many(6, {}), read), null);
}

// Case and padding do not split a shelf.
{
  const pool = many(4, { series: "  james bond  ", subSeries: "YOU ONLY LIVE TWICE" });
  const ring = moreFrom(car({}), pool, read);
  assert.equal(ring?.key, "set");
  assert.equal(ring?.cars.length, 4);
}

console.log("more-from: all checks passed");
