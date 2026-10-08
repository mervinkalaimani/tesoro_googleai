import { strict as assert } from "node:assert";

import {
  FREE_CAR_LIMIT,
  EXPIRY_WARNING_DAYS,
  TRIM_GRACE_DAYS,
  GATEWAY_FEE_PCT,
  RECEIPT_GOOD_FOR_DAYS,
  receiptInDate,
  withGatewayFee,
  TRIAL_DAYS,
  canStartTrial,
  ceilingFor,
  isProPath,
  planForPath,
  planIncludes,
  planOpensPath,
  monthlyPrice,
  paidPlanOf,
  planOf,
  PLAN_PRICES,
  proStatus,
  savingVsMonthly,
  SCANS_PER_MONTH,
  scansLeft,
  trialDaysLeft,
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

// ---- which plan an account is on ----
const nobody = { is_pro: false, is_owner: false, pro_plan: null, pro_until: null };
assert.equal(planOf(nobody, today), "free");
assert.equal(planOf(null, today), "free");
assert.equal(planOf(undefined, today), "free");

// The owner is Pro whatever the row says about paying.
assert.equal(planOf({ ...nobody, is_owner: true }, today), "pro");

// A plan name without is_pro is not a plan: turning somebody off leaves the
// name behind, and the switch is what decides.
assert.equal(planOf({ ...nobody, pro_plan: "pro" }, today), "free");
assert.equal(planOf({ is_pro: true, pro_plan: "pro", pro_until: null }, today), "pro");
assert.equal(planOf({ is_pro: true, pro_plan: "plus", pro_until: null }, today), "plus");

// No end date is the comped account, and it never lapses.
assert.equal(planOf({ is_pro: true, pro_plan: "pro", pro_until: null }, day("2099-01-01")), "pro");

// The last day works; the day after does not.
assert.equal(planOf({ is_pro: true, pro_plan: "pro", pro_until: "2026-10-06" }, today), "pro");
assert.equal(planOf({ is_pro: true, pro_plan: "pro", pro_until: "2026-10-05" }, today), "free");
assert.equal(planOf({ is_pro: true, pro_plan: "plus", pro_until: "2026-10-05" }, today), "free");

// A plan nobody recognises is free rather than a crash.
assert.equal(planOf({ is_pro: true, pro_plan: "gold", pro_until: null }, today), "free");

// ---- and how many cars it holds ----
assert.equal(ceilingFor("free"), 50);
assert.equal(ceilingFor("plus"), 150);
assert.equal(ceilingFor("pro"), null, "Pro has no ceiling");
// Plus is the free ceiling and the hundred it advertises, not a number typed twice.
assert.equal(ceilingFor("plus"), ceilingFor("free")! + 100);

// ---- the trial: fifteen days counting the first ----
assert.equal(TRIAL_DAYS, 15);
assert.equal(trialDaysLeft({ trial_started_on: null }, today), null, "no trial is no clock");

// Started today: all fifteen, today included.
assert.equal(trialDaysLeft({ trial_started_on: "2026-10-06" }, today), 15);
// Day fourteen and day fifteen are the two the screen asks on.
assert.equal(trialDaysLeft({ trial_started_on: "2026-09-23" }, today), 2);
assert.equal(trialDaysLeft({ trial_started_on: "2026-09-22" }, today), 1);
// The sixteenth day is free again, and nothing had to run for it to be.
assert.equal(trialDaysLeft({ trial_started_on: "2026-09-21" }, today), null);
assert.equal(trialDaysLeft({ trial_started_on: "2026-01-01" }, today), null);

// A running trial is Pro, and the day after it is not.
assert.equal(planOf({ ...nobody, trial_started_on: "2026-09-22" }, today), "pro");
assert.equal(planOf({ ...nobody, trial_started_on: "2026-09-21" }, today), "free");
// A trial opens the sections and leaves the shelf alone: the ceiling is read
// off what was paid for, so nothing added on a trial is over the line when it
// ends.
assert.equal(ceilingFor(paidPlanOf({ ...nobody, trial_started_on: "2026-10-06" }, today)), 50);
assert.equal(paidPlanOf({ ...nobody, trial_started_on: "2026-10-06" }, today), "free");
assert.equal(
  ceilingFor(paidPlanOf({ is_pro: true, pro_plan: "plus", pro_until: null }, today)),
  150,
  "a paid plan still raises it",
);
assert.equal(ceilingFor(paidPlanOf({ ...nobody, is_owner: true }, today)), null);

// A plan beats a trial, so buying Plus mid-trial is Plus rather than a
// fortnight of accidental Pro.
assert.equal(
  planOf(
    { is_pro: true, pro_plan: "plus", pro_until: null, trial_started_on: "2026-10-06" },
    today,
  ),
  "plus",
);
// ...and a trial still running outlives a plan that has ended.
assert.equal(
  planOf(
    { is_pro: true, pro_plan: "pro", pro_until: "2026-09-01", trial_started_on: "2026-10-06" },
    today,
  ),
  "pro",
);

// Once per account: the date is the record, and it is never cleared.
assert.equal(canStartTrial({ ...nobody, trial_started_on: null }), true);
assert.equal(canStartTrial({ ...nobody, trial_started_on: "2026-01-01" }), false, "already used");
assert.equal(canStartTrial({ is_pro: true, pro_plan: "pro", pro_until: null }), false, "on a plan");
assert.equal(canStartTrial({ ...nobody, is_owner: true }), false);

// ---- scans, counted by the month ----
assert.equal(SCANS_PER_MONTH.free, 10);
assert.equal(SCANS_PER_MONTH.plus, 20);
assert.equal(SCANS_PER_MONTH.pro, null, "Pro is not counted");

const thisMonth = "2026-10-01";
assert.equal(scansLeft({ ...nobody, scan_month: thisMonth, scans_used: 0 }, today), 10);
assert.equal(scansLeft({ ...nobody, scan_month: thisMonth, scans_used: 7 }, today), 3);
assert.equal(scansLeft({ ...nobody, scan_month: thisMonth, scans_used: 10 }, today), 0);
// Never negative: an allowance that drops mid-month should read as spent, not
// as a number the screen has to explain.
assert.equal(scansLeft({ ...nobody, scan_month: thisMonth, scans_used: 99 }, today), 0);

// Last month's count is not this month's. The database zeroes it on the next
// claim; until then the screen must not show it.
assert.equal(scansLeft({ ...nobody, scan_month: "2026-09-01", scans_used: 10 }, today), 10);
assert.equal(scansLeft({ ...nobody, scan_month: "2025-10-01", scans_used: 10 }, today), 10);
assert.equal(
  scansLeft({ ...nobody, scan_month: null, scans_used: 4 }, today),
  10,
  "no month, no count",
);

// The tier decides the allowance, and a trial gets the Pro one.
assert.equal(
  scansLeft(
    { is_pro: true, pro_plan: "plus", pro_until: null, scan_month: thisMonth, scans_used: 5 },
    today,
  ),
  15,
);
assert.equal(scansLeft({ ...nobody, trial_started_on: "2026-10-06" }, today), null);
assert.equal(scansLeft({ ...nobody, is_owner: true }, today), null);

// ---- what a card adds ----
// The screen prints this and the server charges it, from the same function:
// two copies of a percentage is how a receipt stops matching a price.
assert.equal(GATEWAY_FEE_PCT, 2);
assert.equal(withGatewayFee(100), 102);
assert.equal(withGatewayFee(999), 1019, "999 + 2% is 1018.98, which bills as 1019");
assert.equal(withGatewayFee(49), 50);
assert.equal(withGatewayFee(0), 0, "nothing plus a fee is still nothing");
// Always whole rupees: a gateway counts paise, and a price ending .98 is a
// price nobody can read back off a statement.
for (const p of [1, 7, 49, 99, 149, 249, 399, 499, 599, 799, 999, 1199]) {
  assert.equal(withGatewayFee(p), Math.round(p * 1.02));
  assert.ok(Number.isInteger(withGatewayFee(p)), p + " plus the fee is a whole number");
  assert.ok(withGatewayFee(p) >= p, "the fee never makes a plan cheaper");
}

// ---- a receipt stops counting ----
assert.equal(RECEIPT_GOOD_FOR_DAYS, 25);
assert.equal(receiptInDate(null), false, "no account, no receipt");
assert.equal(receiptInDate({}), false, "never sent one");
assert.equal(receiptInDate({ pay_receipt_at: null }), false);

// Today counts, and so does the twenty-fifth day. The twenty-sixth does not:
// after that the screen offers the upload again rather than saying a payment
// nobody acted on is in hand.
assert.equal(receiptInDate({ pay_receipt_at: "2026-10-06" }, today), true, "sent today");
assert.equal(receiptInDate({ pay_receipt_at: "2026-09-11" }, today), true, "25 days ago");
assert.equal(receiptInDate({ pay_receipt_at: "2026-09-10" }, today), false, "26 days ago");
assert.equal(receiptInDate({ pay_receipt_at: "2026-01-01" }, today), false, "months ago");

// A clock slightly ahead of the server is not a reason to throw one away.
assert.equal(receiptInDate({ pay_receipt_at: "2026-10-07" }, today), true, "dated tomorrow");

// WHO OPENS WHAT. My Orders is the one paid section Plus opens, so a plan is no
// longer a single yes or no over the whole locked list.
assert.equal(planOpensPath("plus", "/orders"), true, "Plus opens My Orders");
assert.equal(planOpensPath("plus", "/orders/9"), true, "and a car inside it");
assert.equal(planOpensPath("plus", "/preorders"), false, "Pre Orders stays Pro");
assert.equal(planOpensPath("plus", "/sellers"), false, "Sellers stays Pro");
assert.equal(planOpensPath("plus", "/inventory"), true, "nobody paid for My Cars");
assert.equal(planOpensPath("free", "/orders"), false, "free does not");
assert.equal(planOpensPath("pro", "/sellers"), true, "Pro opens everything");

assert.equal(planForPath("/orders"), "plus");
assert.equal(planForPath("/preorders"), "pro");
assert.equal(planForPath("/inventory"), null);

assert.equal(planIncludes("pro", "plus"), true, "Pro includes what Plus has");
assert.equal(planIncludes("plus", "pro"), false);
assert.equal(planIncludes("free", "plus"), false);

console.log("tiers selfcheck: ok");
