import { strict as assert } from "node:assert";

import {
  FREE_CAR_LIMIT,
  EXPIRY_WARNING_DAYS,
  TRIM_GRACE_DAYS,
  isProPath,
  monthlyPrice,
  PLAN_PRICES,
  proStatus,
  savingVsMonthly,
  trimWarning,
} from "./tiers";

const day = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};

// ---- which routes are Pro ----
for (const p of [
  "/favourites",
  "/collection",
  "/duplicates",
  "/habits",
  "/sellers",
  "/orders",
  "/preorders",
]) {
  assert.equal(isProPath(p), true, p);
}
assert.equal(isProPath("/orders/9"), true, "a car inside a locked section is locked");
// Each section is listed in its own right. A route that merely starts with the
// letters of one is not that one, however it is spelled.
assert.equal(isProPath("/ordersomething"), false);
assert.equal(isProPath("/preorderss"), false);
assert.equal(isProPath("/inventory"), false);
assert.equal(isProPath("/catalog"), false);
assert.equal(isProPath("/"), false);

// ---- where a subscription stands ----
const on = (until: string | null) => ({ is_pro: true, pro_until: until });
const today = day("2026-10-06");

assert.deepEqual(proStatus({ is_pro: false, pro_until: null }, today), {
  state: "lapsed",
  daysLeft: null,
});
assert.deepEqual(proStatus(null, today), { state: "lapsed", daysLeft: null });
// No end date is the grandfathered account, and it never expires.
assert.deepEqual(proStatus(on(null), today), { state: "comped", daysLeft: null });

// pro_until is the last day it works, not the first day it does not.
assert.equal(proStatus(on("2026-10-06"), today).state, "expiring", "today is still Pro");
assert.equal(proStatus(on("2026-10-06"), today).daysLeft, 0);
assert.equal(proStatus(on("2026-10-05"), today).state, "lapsed", "yesterday is not");
assert.equal(proStatus(on("2026-10-05"), today).daysLeft, -1);

// Exactly five days is a warning; six is not.
assert.equal(EXPIRY_WARNING_DAYS, 5);
assert.equal(proStatus(on("2026-10-11"), today).state, "expiring");
assert.equal(proStatus(on("2026-10-11"), today).daysLeft, 5);
assert.equal(proStatus(on("2026-10-12"), today).state, "active");
assert.equal(proStatus(on("2026-10-12"), today).daysLeft, 6);

// A month out is unremarkable.
assert.equal(proStatus(on("2026-11-06"), today).state, "active");

// ---- the trim countdown ----
assert.equal(TRIM_GRACE_DAYS, 15);
assert.equal(FREE_CAR_LIMIT, 50);

assert.equal(trimWarning(null, 900, today), null, "no clock, nothing to say");
assert.equal(trimWarning("2026-10-01", 50, today), null, "at the limit, nothing goes");
assert.equal(trimWarning("2026-10-01", 20, today), null, "under it either");

const w = trimWarning("2026-10-01", 63, today);
assert.ok(w);
assert.equal(w.goes, 13, "everything past the fifty it keeps");
assert.equal(w.daysLeft, 10, "15 days from the 1st is the 16th");
assert.equal(w.on.getDate(), 16);
assert.equal(w.on.getMonth(), 9);

// Day 14 still warns; day 15 is the day itself, and the sweep has it.
assert.equal(trimWarning("2026-09-21", 51, today)!.daysLeft, 0, "today is the day");
assert.equal(trimWarning("2026-09-22", 51, today)!.daysLeft, 1);
assert.equal(trimWarning("2026-09-20", 51, today)!.daysLeft, -1, "overdue, sweep not run yet");

// One car over is still a warning — it is somebody's car.
assert.equal(trimWarning("2026-10-01", 51, today)!.goes, 1);

// Month and year boundaries, where adding 15 days is easy to get wrong.
assert.equal(trimWarning("2026-12-25", 60, day("2026-12-26"))!.on.getFullYear(), 2027);
assert.equal(trimWarning("2026-12-25", 60, day("2026-12-26"))!.on.getMonth(), 0);
assert.equal(trimWarning("2026-12-25", 60, day("2026-12-26"))!.on.getDate(), 9);

// ---- what the plans cost ----
assert.equal(monthlyPrice("plus"), 49);
assert.equal(monthlyPrice("pro"), 99);
// Monthly is first, because the comparison prints PLAN_PRICES[plan][0].
assert.equal(PLAN_PRICES.plus[0]!.term, "month");
assert.equal(PLAN_PRICES.pro[0]!.term, "month");
// Both plans offer the same three terms, in the same order.
for (const plan of ["plus", "pro"] as const) {
  assert.deepEqual(
    PLAN_PRICES[plan].map((p) => p.term),
    ["month", "half", "year"],
    plan,
  );
  assert.deepEqual(
    PLAN_PRICES[plan].map((p) => p.months),
    [1, 6, 12],
    plan,
  );
}

// ---- and what the longer ones save ----
// Plus: 49 x 6 = 294 against 249, and 49 x 12 = 588 against 499.
assert.equal(savingVsMonthly("plus", "half"), 45);
assert.equal(savingVsMonthly("plus", "year"), 89);
// Pro: 99 x 6 = 594 against 499, and 99 x 12 = 1188 against 999.
assert.equal(savingVsMonthly("pro", "half"), 95);
assert.equal(savingVsMonthly("pro", "year"), 189);
// Monthly cannot save against itself, and a saving is never negative: a term
// priced above its months of monthly says nothing rather than "save -40".
assert.equal(savingVsMonthly("plus", "month"), 0);
assert.equal(savingVsMonthly("pro", "month"), 0);
// Every long term here is cheaper than paying monthly. If one stops being,
// this is what says so before the screen does.
for (const plan of ["plus", "pro"] as const) {
  for (const term of ["half", "year"] as const) {
    assert.ok(savingVsMonthly(plan, term) > 0, `${plan} ${term} should beat monthly`);
  }
}

console.log("tiers selfcheck: ok");
