import { strict as assert } from "node:assert";

import {
  DEFAULT_PRICES,
  monthlyOf,
  monthsLabel,
  pricesFor,
  project,
  savingOf,
  suggestions,
  type PriceRow,
  type Subscriber,
} from "./plan-prices";

const rows = (...r: [string, number, number][]): PriceRow[] =>
  r.map(([plan, months, price]) => ({ plan: plan as "plus" | "pro", months, price }));

// ---- the fallback is what the app shipped with ----
assert.equal(DEFAULT_PRICES.length, 6);
assert.equal(monthlyOf(DEFAULT_PRICES, "plus"), 49);
assert.equal(monthlyOf(DEFAULT_PRICES, "pro"), 99);
assert.equal(savingOf(DEFAULT_PRICES, "plus", 12), 49 * 12 - 499);
assert.equal(savingOf(DEFAULT_PRICES, "pro", 6), 99 * 6 - 499);
assert.equal(savingOf(DEFAULT_PRICES, "plus", 1), 0, "a month saves nothing against itself");
assert.equal(savingOf(DEFAULT_PRICES, "plus", 99), 0, "a length nobody sells saves nothing");

// Lengths come back shortest first, whatever order the table gave them.
assert.deepEqual(
  pricesFor(rows(["pro", 12, 999], ["pro", 1, 99], ["pro", 6, 499]), "pro").map((r) => r.months),
  [1, 6, 12],
);

// No monthly row: the shortest thing on offer, divided out, rather than zero.
assert.equal(monthlyOf(rows(["pro", 6, 600]), "pro"), 100);
assert.equal(monthlyOf([], "pro"), 0, "no prices at all is not a crash");

assert.equal(monthsLabel(1), "Monthly");
assert.equal(monthsLabel(12), "A year");
assert.equal(monthsLabel(3), "3 months");

// ---- what the books are worth ----
const subs = (...s: [string, number, boolean][]): Subscriber[] =>
  s.map(([plan, months, forever]) => ({ plan: plan as "plus" | "pro", months, forever }));

assert.deepEqual(project(DEFAULT_PRICES, []), {
  paying: 0,
  monthly: 0,
  byPlan: { plus: 0, pro: 0 },
  committed: 0,
});

// A year of Pro is 999 over twelve months: ~83 a month, and the other eleven
// months of it are money already promised.
const year = project(DEFAULT_PRICES, subs(["pro", 12, false]));
assert.equal(year.paying, 1);
assert.equal(year.monthly, Math.round(999 / 12));
assert.equal(year.committed, Math.round(999 - 999 / 12));

// A monthly subscription promises nothing beyond this month.
const monthly = project(DEFAULT_PRICES, subs(["plus", 1, false]));
assert.equal(monthly.monthly, 49);
assert.equal(monthly.committed, 0);

// No end date is counted at the monthly price — the least it could be worth —
// and never as committed, because nothing was sold.
const forever = project(DEFAULT_PRICES, subs(["pro", 12, true]));
assert.equal(forever.monthly, 99);
assert.equal(forever.committed, 0);

// The two plans are kept apart, and they add up to the total.
const both = project(DEFAULT_PRICES, subs(["plus", 1, false], ["pro", 1, false]));
assert.equal(both.byPlan.plus, 49);
assert.equal(both.byPlan.pro, 99);
assert.equal(both.monthly, 148);

// A length with no price falls back to the monthly rate times its months,
// rather than counting a paying account as worth nothing.
const odd = project(DEFAULT_PRICES, subs(["pro", 3, false]));
assert.equal(odd.monthly, 99);

// ---- what the prices imply ----
assert.equal(
  suggestions(rows(["pro", 1, 99])).length,
  0,
  "one length on its own has nothing to compare",
);

// A longer run that costs more than paying monthly is the loud one.
const dearer = suggestions(rows(["pro", 1, 99], ["pro", 12, 1300]));
assert.ok(
  dearer.some((a) => a.kind === "problem" && a.title.includes("costs more than paying monthly")),
);

// The shipped prices: six months at half the year's price, so the year is not
// the obvious buy — which is exactly the decoy note.
const shipped = suggestions(DEFAULT_PRICES);
assert.ok(shipped.some((a) => a.key === "plus-decoy-cheap-6"));
assert.ok(shipped.some((a) => a.key === "pro-decoy-cheap-6"));

// A middle priced almost at the longest reads as a trick.
const tooClose = suggestions(rows(["pro", 1, 99], ["pro", 6, 960], ["pro", 12, 999]));
assert.ok(tooClose.some((a) => a.key === "pro-decoy-dear-6"));

// A middle that beats the longest on price per month leaves no reason to buy
// the longest. Nine months rather than six: a six-month middle cheap enough
// per month to beat a year is also cheap enough to be the easy pick, and that
// is the note that fires first.
const inverted = suggestions(rows(["pro", 1, 100], ["pro", 9, 600], ["pro", 12, 850]));
assert.ok(
  inverted.some((a) => a.key === "pro-decoy-inverted-9"),
  `expected the inverted note, got ${inverted.map((a) => a.key).join(", ")}`,
);

// Nothing between a month and a year is a missing step.
const noMiddle = suggestions(rows(["pro", 1, 99], ["pro", 12, 850]));
assert.ok(noMiddle.some((a) => a.key === "pro-no-middle"));

// Well-priced: a middle at ~88% of the year, and the year cheapest per month.
const good = suggestions(rows(["pro", 1, 100], ["pro", 6, 530], ["pro", 12, 600]));
assert.equal(good.length, 0, `expected nothing to flag, got ${good.map((a) => a.key).join(", ")}`);

console.log("plan prices selfcheck: ok");
