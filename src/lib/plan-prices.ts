import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { PLAN_PRICES, type PaidPlan } from "@/lib/tiers";

/**
 * What the plans cost, read from the database rather than compiled in.
 *
 * A price is a business decision, and it was three numbers in a constant, so
 * changing one meant a deploy. One row per plan and length: the row is also
 * what makes a length buyable, so adding three months is adding a row rather
 * than an enum, a constant and a label.
 *
 * The constants stay as the fallback. A table that has not loaded yet, or a
 * deployment whose migration has not run, shows the prices the app shipped
 * with instead of an empty modal.
 */

export type PriceRow = { plan: PaidPlan; months: number; price: number };

/** What the app shipped with, and what it falls back to. */
export const DEFAULT_PRICES: PriceRow[] = (["plus", "pro"] as const).flatMap((plan) =>
  PLAN_PRICES[plan].map((p) => ({ plan, months: p.months, price: p.price })),
);

/**
 * Loaded once per page, not once per dialog.
 *
 * Prices change about as often as the app is deployed, and the plans modal
 * opens on every sign-in; a fetch each time would be a request per opening for
 * six rows that have not moved.
 */
let cache: PriceRow[] | null = null;
let inFlight: Promise<PriceRow[]> | null = null;

async function load(): Promise<PriceRow[]> {
  // The generated Database types predate this table, as they do for every
  // table added since they were last written out.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("tesoro_plan_prices")
    .select("plan, months, price")
    .order("months");

  if (error || !data?.length) {
    // Including the case where this deployment has no such table yet. A modal
    // with no prices in it is worse than one with last month's.
    return DEFAULT_PRICES;
  }
  return (data as PriceRow[]).filter(
    (r) => (r.plan === "plus" || r.plan === "pro") && Number.isFinite(r.price),
  );
}

export function planPrices(): Promise<PriceRow[]> {
  if (cache) return Promise.resolve(cache);
  inFlight ??= load().then((rows) => {
    cache = rows;
    inFlight = null;
    return rows;
  });
  return inFlight;
}

/** Throws away what was loaded, so the next read sees what was just written. */
export function forgetPlanPrices() {
  cache = null;
  inFlight = null;
}

export function usePlanPrices(): PriceRow[] {
  const [rows, setRows] = useState<PriceRow[]>(cache ?? DEFAULT_PRICES);
  useEffect(() => {
    let alive = true;
    void planPrices().then((r) => {
      if (alive) setRows(r);
    });
    return () => {
      alive = false;
    };
  }, []);
  return rows;
}

/** One plan's lengths, cheapest length first. */
export function pricesFor(rows: PriceRow[], plan: PaidPlan): PriceRow[] {
  return rows.filter((r) => r.plan === plan).sort((a, b) => a.months - b.months);
}

/** The monthly price, which is the one the comparison prints. */
export function monthlyOf(rows: PriceRow[], plan: PaidPlan): number {
  const one = pricesFor(rows, plan).find((r) => r.months === 1);
  // No monthly row: the shortest thing on offer, divided out, rather than
  // nothing — a column with no price is a column nobody can read.
  if (one) return one.price;
  const first = pricesFor(rows, plan)[0];
  return first ? Math.round(first.price / first.months) : 0;
}

/**
 * What a longer length saves against paying monthly, in rupees.
 *
 * Worked out rather than stored, so a price change cannot leave a saving
 * behind claiming something that is no longer true. Zero or less is no saving,
 * and the screen says nothing rather than "save ₹0".
 */
export function savingOf(rows: PriceRow[], plan: PaidPlan, months: number): number {
  if (months < 2) return 0;
  const row = pricesFor(rows, plan).find((r) => r.months === months);
  if (!row) return 0;
  return Math.max(0, monthlyOf(rows, plan) * months - row.price);
}

/** "Monthly", "6 months", "A year" — what a length is called on a button. */
export function monthsLabel(months: number): string {
  if (months === 1) return "Monthly";
  if (months === 12) return "A year";
  if (months === 24) return "Two years";
  return `${months} months`;
}

/** Who is on what, for the projection. */
export type Subscriber = { plan: PaidPlan; months: number; forever: boolean };

/**
 * Every way an account can be on the books.
 *
 * One per plan and length that the prices table actually offers, and nothing
 * else. The list grows on its own: adding a length adds a scenario, so nothing
 * here has to be kept in step by hand.
 *
 * Free is not among them, and neither is no end date. This is a projection of
 * earnings: a row that is always zero adds a number to read and nothing to
 * read it for, and no end date is not something anybody is sold — those
 * accounts are counted in their plan's monthly field, where their money was
 * already going.
 */
export type Scenario = {
  key: string;
  plan: PaidPlan;
  /** Months per run. */
  months: number;
  forever: boolean;
  label: string;
  /** What one account on it is worth a month. */
  perMonth: number;
};

export function scenarios(rows: PriceRow[]): Scenario[] {
  const out: Scenario[] = [];
  for (const plan of ["plus", "pro"] as const) {
    const name = plan === "plus" ? "Plus" : "Pro";
    for (const r of pricesFor(rows, plan)) {
      out.push({
        key: `${plan}-${r.months}`,
        plan,
        months: r.months,
        forever: false,
        label: `${name} · ${monthsLabel(r.months).toLowerCase()}`,
        perMonth: Math.round(r.price / r.months),
      });
    }
  }
  return out;
}

/** A count against each scenario, as the accounts the projection takes. */
export function subscribersFromCounts(
  list: Scenario[],
  counts: Record<string, number>,
): Subscriber[] {
  const out: Subscriber[] = [];
  for (const s of list) {
    const n = Math.max(0, Math.floor(counts[s.key] ?? 0));
    for (let i = 0; i < n; i++) {
      out.push({ plan: s.plan, months: s.months, forever: s.forever });
    }
  }
  return out;
}

/**
 * Which field an account that exists today is counted in.
 *
 * An account with no end date lands in its plan's monthly field, which is
 * where its money is counted anyway: the alternative is a field for a thing
 * nobody is sold, holding accounts that would otherwise vanish from the
 * projection entirely.
 */
export function scenarioKeyOf(s: Subscriber): string {
  return s.forever ? `${s.plan}-1` : `${s.plan}-${s.months}`;
}

/**
 * What the accounts on the books are worth at these prices.
 *
 * Per month rather than per sale, because that is the only figure two plans
 * bought for different lengths can be compared on. A run of twelve months is
 * a twelfth of its price every month, whatever day the money arrived.
 */
export function project(rows: PriceRow[], subscribers: Subscriber[]) {
  const priceOf = (plan: PaidPlan, months: number) =>
    rows.find((r) => r.plan === plan && r.months === months)?.price ??
    (rows.find((r) => r.plan === plan && r.months === 1)?.price ?? 0) * months;

  const byPlan = { plus: 0, pro: 0 };
  let committed = 0;

  for (const s of subscribers) {
    // No end date is not a sale with a length; it is counted at the monthly
    // price, which is the least it could be worth.
    const months = s.forever ? 1 : s.months;
    const total = priceOf(s.plan, months);
    const perMonth = total / Math.max(1, months);
    byPlan[s.plan] += perMonth;
    // Everything past the first month of a run is money already promised.
    if (!s.forever && months > 1) committed += total - perMonth;
  }

  return {
    paying: subscribers.length,
    monthly: Math.round(byPlan.plus + byPlan.pro),
    byPlan: { plus: Math.round(byPlan.plus), pro: Math.round(byPlan.pro) },
    committed: Math.round(committed),
  };
}

export type Advice = { key: string; kind: "problem" | "idea"; title: string; body: string };

/**
 * What the current prices imply, said as arithmetic rather than as opinion.
 *
 * Three things are worth flagging: a longer length that is not actually
 * cheaper, a middle length so close to monthly that nobody will reach past it,
 * and a middle length that is not pulling anybody towards the longest. The
 * last is the decoy, and it has a number: a middle priced about 85–95% of the
 * longest makes the longest the obvious buy.
 */
export function suggestions(rows: PriceRow[]): Advice[] {
  const out: Advice[] = [];

  for (const plan of ["plus", "pro"] as const) {
    const name = plan === "plus" ? "Plus" : "Pro";
    const mine = pricesFor(rows, plan);
    const monthly = mine.find((r) => r.months === 1)?.price ?? 0;
    if (!monthly || mine.length < 2) continue;

    // 1. A longer run that is not cheaper is a length nobody has a reason to
    //    buy, and it makes the whole table look careless.
    for (const r of mine) {
      if (r.months > 1 && r.price >= monthly * r.months) {
        out.push({
          key: `${plan}-dearer-${r.months}`,
          kind: "problem",
          title: `${name} for ${r.months} months costs more than paying monthly`,
          body: `₹${r.price.toLocaleString()} against ₹${(monthly * r.months).toLocaleString()}. Nobody buys the longer run at that price — price it under ₹${Math.round(monthly * r.months * 0.9).toLocaleString()} to give it a reason to exist.`,
        });
      }
    }

    const longest = mine[mine.length - 1]!;
    const middles = mine.filter((r) => r.months > 1 && r.months < longest.months);
    if (longest.months <= 1) continue;

    // 2. The decoy. A middle length exists to make the longest look obvious.
    for (const mid of middles) {
      const ratio = mid.price / longest.price;
      const midPerMonth = mid.price / mid.months;
      const longPerMonth = longest.price / longest.months;
      if (ratio < 0.6) {
        out.push({
          key: `${plan}-decoy-cheap-${mid.months}`,
          kind: "idea",
          title: `${name}: ${mid.months} months is the easy pick, not ${longest.months}`,
          body: `At ₹${mid.price.toLocaleString()} it is ${Math.round(ratio * 100)}% of the ${longest.months}-month price, so most people stop there. Raising it to about ₹${Math.round(longest.price * 0.85).toLocaleString()} makes ₹${longest.price.toLocaleString()} for ${longest.months} months the obvious buy — the same decision, more of it paid up front.`,
        });
      } else if (ratio > 0.95) {
        out.push({
          key: `${plan}-decoy-dear-${mid.months}`,
          kind: "problem",
          title: `${name}: ${mid.months} months is too close to ${longest.months}`,
          body: `₹${mid.price.toLocaleString()} against ₹${longest.price.toLocaleString()}. A middle that nearly costs the same reads as a trick rather than a choice. Somewhere near ₹${Math.round(longest.price * 0.88).toLocaleString()} keeps it credible and still points at the longer one.`,
        });
      } else if (midPerMonth <= longPerMonth) {
        out.push({
          key: `${plan}-decoy-inverted-${mid.months}`,
          kind: "problem",
          title: `${name}: ${mid.months} months is better value per month than ${longest.months}`,
          body: `₹${Math.round(midPerMonth).toLocaleString()} a month against ₹${Math.round(longPerMonth).toLocaleString()}. The longest run should always be the cheapest per month, or there is no argument for buying it.`,
        });
      }
    }

    // 3. Nothing in the middle at all.
    if (middles.length === 0 && longest.months >= 12) {
      out.push({
        key: `${plan}-no-middle`,
        kind: "idea",
        title: `${name} has nothing between a month and ${longest.months}`,
        body: `A six-month option at about ₹${Math.round(longest.price * 0.6).toLocaleString()} gives people a step up from monthly — and makes the ${longest.months}-month price look like the better deal it is.`,
      });
    }
  }

  return out;
}
