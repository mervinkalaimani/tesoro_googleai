import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Lightbulb, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  forgetPlanPrices,
  monthsLabel,
  planPrices,
  pricesFor,
  project,
  scenarioKeyOf,
  scenarios,
  subscribersFromCounts,
  suggestions,
  type PriceRow,
  type Subscriber,
} from "@/lib/plan-prices";
import { SCANS_PER_MONTH } from "@/lib/tiers";
import { inrFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PaidPlan } from "@/lib/tiers";

/**
 * What the plans cost, and what that is likely to earn.
 *
 * Two halves of the same question. A price on its own is a number somebody
 * types; a price beside the run rate it produces and the per-month figure a
 * buyer will compare it against is a decision. The suggestions underneath are
 * arithmetic, not opinion: they say what the current prices imply and where
 * the middle option is not doing the job a middle option exists to do.
 */

type Draft = PriceRow & { dirty?: boolean };

export function PaymentSettings({ subscribers }: { subscribers: Subscriber[] }) {
  const [rows, setRows] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void planPrices().then((r) => {
      setRows(r.map((x) => ({ ...x })));
      setLoading(false);
    });
  }, []);

  const dirty = rows.some((r) => r.dirty);

  const setPrice = (plan: PaidPlan, months: number, price: number) =>
    setRows((prev) =>
      prev.map((r) => (r.plan === plan && r.months === months ? { ...r, price, dirty: true } : r)),
    );

  const addLength = (plan: PaidPlan) => {
    const taken = new Set(pricesFor(rows, plan).map((r) => r.months));
    const months = [3, 2, 9, 18, 24].find((m) => !taken.has(m)) ?? 24;
    const monthly = pricesFor(rows, plan).find((r) => r.months === 1)?.price ?? 0;
    setRows((prev) => [
      ...prev,
      // Priced at a tenth off monthly to start with: a new length that costs
      // exactly its months is a length nobody has a reason to buy, and a
      // zero would read as free until somebody noticed.
      { plan, months, price: Math.round(monthly * months * 0.9), dirty: true },
    ]);
  };

  const removeLength = async (plan: PaidPlan, months: number) => {
    if (months === 1) {
      toast.error("The monthly price has to exist", {
        description: "Every other length is compared against it.",
      });
      return;
    }
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("tesoro_plan_prices")
      .delete()
      .eq("plan", plan)
      .eq("months", months);
    setSaving(false);
    if (error) {
      toast.error("Could not remove that length", { description: error.message });
      return;
    }
    setRows((prev) => prev.filter((r) => !(r.plan === plan && r.months === months)));
    forgetPlanPrices();
    toast.success(`${monthsLabel(months)} removed from ${plan === "plus" ? "Plus" : "Pro"}`);
  };

  const save = async () => {
    const bad = rows.find((r) => !Number.isFinite(r.price) || r.price < 0);
    if (bad) {
      toast.error("Every price has to be a whole number of rupees");
      return;
    }
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("tesoro_plan_prices").upsert(
      rows.map((r) => ({
        plan: r.plan,
        months: r.months,
        price: Math.round(r.price),
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "plan,months" },
    );
    setSaving(false);
    if (error) {
      toast.error("Could not save the prices", { description: error.message });
      return;
    }
    setRows((prev) => prev.map((r) => ({ ...r, dirty: false })));
    // Everything that shows a price reads it through this cache, so it has to
    // forget before the next modal opens.
    forgetPlanPrices();
    toast.success("Prices saved", { description: "Every plan modal shows them from now on." });
  };

  /**
   * How many accounts are on each way of paying.
   *
   * Seeded from the accounts that exist, then typed over. The projection reads
   * these rather than the live list, so the panel answers "what would this
   * earn" as readily as "what does it earn" — and Reset puts today back.
   */
  const list = useMemo(() => scenarios(rows), [rows]);
  const actual = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of subscribers) {
      const k = scenarioKeyOf(s);
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  }, [subscribers]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [touched, setTouched] = useState(false);

  // Until somebody types, the fields are what is actually on the books.
  useEffect(() => {
    if (!touched) setCounts(actual);
  }, [actual, touched]);

  const setCount = (key: string, n: number) => {
    setTouched(true);
    setCounts((prev) => ({ ...prev, [key]: Math.max(0, Math.floor(n || 0)) }));
  };

  const modelled = useMemo(() => subscribersFromCounts(list, counts), [list, counts]);
  const projection = useMemo(() => project(rows, modelled), [rows, modelled]);
  const freeCount = Math.max(0, Math.floor(counts["free"] ?? 0));
  const advice = useMemo(() => suggestions(rows), [rows]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Reading the prices…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* WHAT THEY EARN */}
      <section className="card-elevated p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Projected earnings
        </h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {touched
            ? "From the numbers typed below, at the prices on this screen."
            : "From the accounts as they stand today. Change any number below to ask what something else would earn."}{" "}
          Accounts with no end date are counted at their plan&rsquo;s monthly price.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Money label="A month" value={projection.monthly} tone="strong" />
          <Money label="A year, at this rate" value={projection.monthly * 12} />
          <Money label="Committed, unbilled" value={projection.committed} />
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Money label="Plus, a month" value={projection.byPlan.plus} small />
          <Money label="Pro, a month" value={projection.byPlan.pro} small />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          <strong>Committed, unbilled</strong> is what the longer runs have left in them — money
          that is spoken for but has not arrived yet.
        </p>

        {/* ONE FIELD PER WAY OF BEING ON THE BOOKS, folded away until there
            is a question to ask of them. The prices table decides how many
            there are: a length added above is one more here. */}
        <Accordion type="single" collapsible className="mt-3 border-t border-border/60">
          <AccordionItem value="counts" className="border-none">
            <AccordionTrigger className="py-2.5 hover:no-underline">
              <span className="flex flex-wrap items-center gap-2 text-left">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Accounts, by how they pay
                </span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  {list.length} ways · {projection.paying.toLocaleString()} paying
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {touched && (
                <div className="mb-2 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-[11px]"
                    onClick={() => {
                      setTouched(false);
                      setCounts(actual);
                    }}
                  >
                    <RotateCcw className="size-3.5" />
                    Back to today
                  </Button>
                </div>
              )}

              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((sc) => {
                  const n = Math.max(0, Math.floor(counts[sc.key] ?? 0));
                  const earns = sc.perMonth * n;
                  const was = actual[sc.key] ?? 0;
                  return (
                    <label
                      key={sc.key}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5",
                        sc.plan === "free"
                          ? "border-border/60 bg-muted/10"
                          : "border-border/60 bg-muted/20",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium">{sc.label}</span>
                        <span className="block text-[10px] tabular-nums text-muted-foreground">
                          {sc.plan === "free"
                            ? `${SCANS_PER_MONTH.free} scans a month each, no revenue`
                            : `₹${earns.toLocaleString()} a month`}
                        </span>
                      </span>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={String(n)}
                        onChange={(e) => setCount(sc.key, Number(e.target.value))}
                        className={cn(
                          "h-9 w-24 shrink-0 text-center tabular-nums",
                          touched && n !== was && "border-primary/60",
                        )}
                        aria-label={`Accounts on ${sc.label}`}
                      />
                    </label>
                  );
                })}
              </div>

              {freeCount > 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {freeCount.toLocaleString()} free {freeCount === 1 ? "account" : "accounts"} earn
                  nothing and can still spend up to{" "}
                  {(freeCount * SCANS_PER_MONTH.free!).toLocaleString()} card scans a month between
                  them. They are here because what a price earns depends on how many people are not
                  paying it.
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      {/* WHAT THEY COST */}
      {(["plus", "pro"] as const).map((plan) => {
        const mine = pricesFor(rows, plan);
        const monthly = mine.find((r) => r.months === 1)?.price ?? 0;
        return (
          <section key={plan} className="card-elevated p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold tracking-tight">
                {plan === "plus" ? "Plus" : "Pro"}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-[11px]"
                onClick={() => addLength(plan)}
              >
                <Plus className="size-3.5" />
                Add a length
              </Button>
            </div>

            <div className="mt-2 space-y-1.5">
              {/* A row is a length. The per-month figure beside it is what a
                  buyer actually compares, so it is worked out here rather
                  than left for them to do in their head. */}
              {mine.map((r) => {
                const perMonth = Math.round(r.price / r.months);
                const savesBy = Math.max(0, monthly * r.months - r.price);
                const off = monthly > 0 ? Math.round((savesBy / (monthly * r.months)) * 100) : 0;
                return (
                  <div
                    key={`${r.plan}-${r.months}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2"
                  >
                    <span className="w-24 shrink-0 text-[13px] font-medium">
                      {monthsLabel(r.months)}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">₹</span>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={String(r.price)}
                        onChange={(e) => setPrice(r.plan, r.months, Number(e.target.value))}
                        className="h-8 w-24 tabular-nums"
                        aria-label={`${plan} for ${r.months} months, in rupees`}
                      />
                    </div>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      ₹{perMonth.toLocaleString()} a month
                    </span>
                    {r.months > 1 && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                          off > 0
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-rose-500/15 text-rose-600 dark:text-rose-400",
                        )}
                      >
                        {off > 0
                          ? `${off}% off · saves ₹${savesBy.toLocaleString()}`
                          : "costs more"}
                      </span>
                    )}
                    {r.months !== 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="ml-auto size-7 text-muted-foreground hover:text-rose-500"
                        disabled={saving}
                        onClick={() => void removeLength(r.plan, r.months)}
                        aria-label={`Remove ${monthsLabel(r.months)} from ${plan}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* WHAT THE NUMBERS IMPLY */}
      <section className="card-elevated p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Lightbulb className="size-3.5" />
          Suggestions
        </h2>
        {advice.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">
            Nothing to flag: every length is cheaper per month than the one below it, and the middle
            options are doing their job.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {advice.map((a) => (
              <li
                key={a.key}
                className={cn(
                  "rounded-lg border px-3 py-2 text-[12px] leading-relaxed",
                  a.kind === "problem"
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-border/60 bg-muted/20",
                )}
              >
                <strong className="font-semibold">{a.title}</strong>
                <p className="mt-0.5 text-muted-foreground">{a.body}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          The decoy is the middle length. People do not judge a price on its own — they judge it
          against the one next to it, so a six-month price close to a year&rsquo;s makes the year
          look like the obvious buy. Too cheap and the middle wins instead; too dear and it reads as
          a trick.
        </p>
      </section>

      {/* SAVING */}
      <div className="sticky bottom-0 -mx-1 flex items-center gap-2 border-t border-border bg-background/95 px-1 py-2 backdrop-blur">
        <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
          {dirty ? "Unsaved changes." : "Everything here is saved."}
        </p>
        <Button type="button" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Save prices
        </Button>
      </div>
    </div>
  );
}

function Money({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: number;
  tone?: "strong";
  small?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        tone === "strong" ? "border-primary/40 bg-primary/5" : "border-border/60 bg-muted/20",
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "font-bold tabular-nums tracking-tight",
          small ? "text-sm" : "text-lg",
          tone === "strong" && "text-primary",
        )}
      >
        {inrFull(value)}
      </div>
    </div>
  );
}
