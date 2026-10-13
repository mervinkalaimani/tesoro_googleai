import assert from "node:assert/strict";

import { carNumberOf, carSubLine, carSubLineParts } from "./car-subline";

const full = {
  brand: "Hot Wheels",
  assortment: "Mainline",
  series: "J-Imports",
  subSeries: "2024 Mix 1",
  carNumber: "142/250",
  caseNumber: "",
};

// --- the whole line, as a car card still prints it
assert.equal(
  carSubLine(full),
  "Hot Wheels · Mainline · J-Imports · 2024 Mix 1 · 142/250",
  "every part, in order",
);

// --- the table's two columns, which must not say the same thing twice
assert.equal(carSubLine(full, true), "J-Imports · 2024 Mix 1 · 142/250", "brand column drops two");
assert.equal(
  carSubLine(full, true, true),
  "J-Imports · 2024 Mix 1",
  "and the number, which now sits beside the assortment",
);

// --- a car with nothing to say under its name
const bare = { brand: "Hot Wheels", assortment: "Mainline", series: "", subSeries: "" };
assert.deepEqual(carSubLineParts(bare, true, true), [], "no second line at all");
assert.equal(carSubLine(bare, true, true), "—", "the joined form still has its placeholder");

// --- the number itself: its own, or the case it came in, or nothing
assert.equal(carNumberOf(full), "142/250");
assert.equal(carNumberOf({ carNumber: "", caseNumber: "2026 K Case" }), "2026 K Case");
assert.equal(carNumberOf({ carNumber: "  117/250  " }), "117/250", "trimmed");
assert.equal(carNumberOf({}), "", "nothing to print");

// A case release stands in the number's place rather than beside it.
assert.equal(
  carSubLine({ ...full, carNumber: "", caseNumber: "2026 K Case" }, true),
  "J-Imports · 2024 Mix 1 · 2026 K Case",
);

console.log("ok — 10 checks");
