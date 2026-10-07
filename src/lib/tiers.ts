import { parseDMY } from "@/lib/format";

/**
 * What a free account gets, what a Pro one gets, and the two clocks between.
 *
 * Every rule about the tiers is here: which sections are Pro, how many cars a
 * free account may keep, when the subscription is about to end, and when a
 * collection that is over the line gets trimmed. The database enforces the
 * walls — the RLS insert policy and the sweep — and this is what the screen
 * says about them. Two places would drift, and the half that drifts is the one
 * that promises a date.
 */

export const FREE_CAR_LIMIT = 50;
/** What Plus buys: the free ceiling and another hundred on top of it. */
export const PLUS_EXTRA_CARS = 100;
export const PLUS_CAR_LIMIT = FREE_CAR_LIMIT + PLUS_EXTRA_CARS;

/** The two plans somebody can ask for. Free is not asked for; it is where you start. */
export type PaidPlan = "plus" | "pro";

/** How long a plan is bought for. */
export type PlanTerm = "month" | "half" | "year";

/** What an account is on today. Free is where everybody starts. */
export type Plan = "free" | PaidPlan;

/**
 * Which plan an account is on, from its own row.
 *
 * The same three rules the database applies in tesoro_plan(): the owner is
 * always Pro, a plan with no start date never expires, and the last day it
 * works is pro_until rather than the day before. Both exist because the policy
 * cannot ask the browser and the screen should not wait for the database to
 * say what it can already see.
 */
export function planOf(p: TierFields | null | undefined, today: Date = new Date()): Plan {
  // A paid plan before a trial, deliberately: somebody who buys Plus halfway
  // through a trial is on Plus. Reading the trial first would quietly give
  // them Pro for the rest of the fortnight and take it away when it ended.
  const paid = paidPlanOf(p, today);
  if (paid !== "free") return paid;
  return trialDaysLeft(p, today) === null ? "free" : "pro";
}

/**
 * What this account has actually paid for, ignoring any trial.
 *
 * The ceiling is read off this rather than off the tier, and that is the whole
 * point of having two answers: a trial opens the Pro sections, and leaving the
 * car limit where it is means a trial that is not taken up cannot leave
 * somebody with cars to lose. tesoro_paid_plan() in the database.
 */
export function paidPlanOf(p: TierFields | null | undefined, today: Date = new Date()): Plan {
  if (p?.is_owner) return "pro";
  if (p?.is_pro && (p.pro_plan === "plus" || p.pro_plan === "pro")) {
    const until = parseDMY(p.pro_until);
    if (!until || wholeDays(today, until) >= 0) return p.pro_plan;
  }
  return "free";
}

/** The columns every tier question is answered from. */
export type TierFields = {
  is_pro?: boolean | null;
  is_owner?: boolean | null;
  pro_plan?: string | null;
  pro_until?: string | null;
  trial_started_on?: string | null;
};

/**
 * Days of trial left, counting today. Null when none is running.
 *
 * The day it starts counts as the first, so a trial started today has all
 * fifteen and one started fifteen days ago has none — which is the sixteenth
 * day, the one the account is free again on. Nothing expires it: the
 * arithmetic stops saying Pro, the same way the database does.
 */
export function trialDaysLeft(
  p: { trial_started_on?: string | null } | null | undefined,
  today: Date = new Date(),
): number | null {
  const over = trialOverOn(p);
  if (!over) return null;
  const left = wholeDays(today, over);
  return left > 0 ? left : null;
}

/** The first day a trial does not work. Null when there never was one. */
export function trialOverOn(
  p: { trial_started_on?: string | null } | null | undefined,
): Date | null {
  const start = parseDMY(p?.trial_started_on);
  if (!start) return null;
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + TRIAL_DAYS);
}

/** The last day it does work — what a date on the screen should say. */
export function trialLastDay(
  p: { trial_started_on?: string | null } | null | undefined,
): Date | null {
  const over = trialOverOn(p);
  if (!over) return null;
  return new Date(over.getFullYear(), over.getMonth(), over.getDate() - 1);
}

/**
 * Whether this account may start one.
 *
 * Once ever, and only while nothing better is running: the column is never
 * cleared, so it is both the start date and the record that a trial was used.
 */
export function canStartTrial(p: TierFields | null | undefined): boolean {
  return !p?.trial_started_on && planOf(p) === "free";
}

/** How many cars this plan may hold. Null is no ceiling. */
export function ceilingFor(plan: Plan): number | null {
  if (plan === "pro") return null;
  return plan === "plus" ? PLUS_CAR_LIMIT : FREE_CAR_LIMIT;
}

export type PlanPrice = {
  term: PlanTerm;
  /** What it is called on the button. */
  label: string;
  /** Rupees, whole. */
  price: number;
  months: number;
};

/**
 * What each plan costs, by how long it is bought for.
 *
 * Monthly first, and it is the only one the comparison shows: three prices in
 * a column somebody is still deciding between two plans in is three decisions
 * at once. The longer terms are the second question, asked once the plan is
 * chosen.
 */
export const PLAN_PRICES: Record<PaidPlan, PlanPrice[]> = {
  plus: [
    { term: "month", label: "Monthly", price: 49, months: 1 },
    { term: "half", label: "6 months", price: 249, months: 6 },
    { term: "year", label: "A year", price: 499, months: 12 },
  ],
  pro: [
    { term: "month", label: "Monthly", price: 99, months: 1 },
    { term: "half", label: "6 months", price: 499, months: 6 },
    { term: "year", label: "A year", price: 999, months: 12 },
  ],
};

/** The monthly price, which is the one the comparison prints. */
export function monthlyPrice(plan: PaidPlan): number {
  return PLAN_PRICES[plan][0]!.price;
}

/**
 * What a longer term saves against paying monthly, in rupees.
 *
 * Worked out rather than written down, so a price change cannot leave a saving
 * behind claiming something that is no longer true. Zero or less is no saving,
 * and the screen says nothing rather than "save ₹0".
 */
export function savingVsMonthly(plan: PaidPlan, term: PlanTerm): number {
  const option = PLAN_PRICES[plan].find((p) => p.term === term);
  if (!option || option.months < 2) return 0;
  return Math.max(0, monthlyPrice(plan) * option.months - option.price);
}
/** Days of notice before Pro ends. */
export const EXPIRY_WARNING_DAYS = 5;
/** How long a trial runs, counting the day it starts. tesoro_trial_days() in the database. */
export const TRIAL_DAYS = 15;
/** The last days of a trial, when the screen starts asking for a decision. */
export const TRIAL_REMIND_DAYS = 2;
/** Days between dropping to free over the limit and the trim. */
export const TRIM_GRACE_DAYS = 15;

/** The sections Pro pays for. Prefixes — `/orders/9` is `/orders`. */
export const PRO_PATHS = [
  "/favourites",
  "/collection",
  "/duplicates",
  "/habits",
  "/sellers",
  "/orders",
  "/preorders",
] as const;

/**
 * Whether this route is behind Pro.
 *
 * Exact match or a path segment below it, never a bare `startsWith`. Every
 * section here is listed on its own — `/preorders` is Pro because it is in the
 * list, not because `/orders` happens to be a prefix of it. A bare prefix test
 * would also lock a future `/ordersomething`, which nobody put there.
 */
export function isProPath(pathname: string): boolean {
  return PRO_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export type ProState =
  /** Pro with no end date — the accounts that predate the tiers. */
  "comped" | "active" | "expiring" | "lapsed";

export type ProStatus = {
  state: ProState;
  /** Days until Pro ends, inclusive of the last day. Null when nothing is counting. */
  daysLeft: number | null;
};

/**
 * Where a subscription stands today.
 *
 * `pro_until` is the last day it works, not the first day it does not: a
 * subscription that reads "until 6 November" is still Pro all of the 6th. That
 * is the off-by-one this whole file exists to have in one place.
 */
export function proStatus(
  profile: { is_pro?: boolean | null; pro_until?: string | null } | null | undefined,
  today: Date = new Date(),
): ProStatus {
  if (!profile?.is_pro) return { state: "lapsed", daysLeft: null };
  const until = parseDMY(profile.pro_until);
  if (!until) return { state: "comped", daysLeft: null };
  const daysLeft = wholeDays(today, until);
  if (daysLeft < 0) return { state: "lapsed", daysLeft };
  if (daysLeft <= EXPIRY_WARNING_DAYS) return { state: "expiring", daysLeft };
  return { state: "active", daysLeft };
}

export type TrimWarning = {
  /** The day the excess is archived. */
  on: Date;
  /** Days until then. 0 is today; negative means the sweep has not run yet. */
  daysLeft: number;
  /** How many cars go. Never below 1 — no warning is shown without one. */
  goes: number;
};

/**
 * The countdown on a free collection that is over the limit.
 *
 * Null unless there is something to say: no clock running, or already down to
 * the limit. The clock is the database's — `over_limit_since` is set by the
 * sweep and cleared by it — so this only reads it.
 */
export function trimWarning(
  overLimitSince: string | null | undefined,
  liveCars: number,
  today: Date = new Date(),
): TrimWarning | null {
  const started = parseDMY(overLimitSince);
  if (!started) return null;
  const goes = liveCars - FREE_CAR_LIMIT;
  if (goes < 1) return null;
  const on = new Date(started);
  on.setDate(on.getDate() + TRIM_GRACE_DAYS);
  return { on, daysLeft: wholeDays(today, on), goes };
}

/**
 * Whole days from one date to another, counting calendar days rather than
 * 24-hour spans.
 *
 * Not `daysBetween` from format.ts, which floors: these are two local midnights
 * and an hour's drift between them — a clock change, or a Date built in one
 * offset and compared in another — turns 24 hours into 23 and a day into none.
 * Rounding cannot be wrong by less than twelve hours.
 */
function wholeDays(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
