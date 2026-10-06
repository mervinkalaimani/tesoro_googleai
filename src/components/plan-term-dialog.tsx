import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import {
  PLAN_PRICES,
  monthlyPrice,
  savingVsMonthly,
  type PaidPlan,
  type PlanTerm,
} from "@/lib/tiers";
import { requestPro } from "@/lib/pro-request";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * How long for, asked after which plan.
 *
 * A second dialog rather than nine prices in the comparison: choosing between
 * Plus and Pro is one decision and choosing between a month and a year is
 * another, and asking both at once is how a price table turns into a puzzle.
 * The comparison closes before this opens, so there is only ever one question
 * on the screen.
 */

let openFromAnywhere: ((plan: PaidPlan) => void) | null = null;

/** Opens the term chooser for a plan. The comparison closes itself first. */
export function openPlanTermDialog(plan: PaidPlan) {
  openFromAnywhere?.(plan);
}

const TITLE: Record<PaidPlan, string> = {
  plus: "Plus",
  pro: "Pro",
};

export function PlanTermDialog() {
  const [plan, setPlan] = useState<PaidPlan | null>(null);
  const [busy, setBusy] = useState<PlanTerm | null>(null);

  useEffect(() => {
    openFromAnywhere = (p) => setPlan(p);
    return () => {
      openFromAnywhere = null;
    };
  }, []);

  const choose = async (term: PlanTerm) => {
    if (!plan) return;
    setBusy(term);
    const ok = await requestPro(plan, term);
    setBusy(null);
    if (ok) setPlan(null);
  };

  const options = plan ? PLAN_PRICES[plan] : [];

  return (
    <Dialog open={plan !== null} onOpenChange={(v) => !v && !busy && setPlan(null)}>
      <DialogContent className="w-full max-w-full sm:max-w-md">
        <div className="text-center">
          <DialogTitle className="text-xl font-bold tracking-tight">
            {plan ? TITLE[plan] : ""} — how long for?
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            Longer costs less per month. Nothing is charged here; a payment link comes by email.
          </DialogDescription>
        </div>

        <div className="mt-1 space-y-2">
          {options.map((o) => {
            const saving = plan ? savingVsMonthly(plan, o.term) : 0;
            const perMonth = Math.round(o.price / o.months);
            const best = o.term === "year";
            return (
              <button
                key={o.term}
                type="button"
                disabled={busy !== null}
                onClick={() => void choose(o.term)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-60",
                  best
                    ? "border-primary/60 bg-primary/5 hover:bg-primary/10"
                    : "border-border bg-muted/20 hover:bg-muted/40",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{o.label}</span>
                    {saving > 0 && (
                      <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        Save ₹{saving}
                      </span>
                    )}
                  </div>
                  {/* The per-month figure is what makes three prices
                      comparable; the months are what was actually bought. */}
                  <div className="text-[11px] text-muted-foreground">
                    {o.months === 1
                      ? `₹${monthlyPrice(plan ?? "pro")} every month`
                      : `₹${perMonth} a month, paid once`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-lg font-bold tracking-tight">₹{o.price}</div>
                </div>
                {busy === o.term ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                ) : (
                  <Check className="size-4 shrink-0 text-muted-foreground/40" />
                )}
              </button>
            );
          })}
        </div>

        <Button
          type="button"
          variant="ghost"
          disabled={busy !== null}
          onClick={() => setPlan(null)}
          className="text-muted-foreground"
        >
          Back
        </Button>
      </DialogContent>
    </Dialog>
  );
}
