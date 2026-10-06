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
/** Days of notice before Pro ends. */
export const EXPIRY_WARNING_DAYS = 5;
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
