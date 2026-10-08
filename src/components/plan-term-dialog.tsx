import { useEffect, useState } from "react";
import { Check, CreditCard, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { GATEWAY_FEE_PCT, termFromMonths, withGatewayFee, type PaidPlan } from "@/lib/tiers";
import { monthlyOf, monthsLabel, pricesFor, savingOf, usePlanPrices } from "@/lib/plan-prices";
import { requestPro } from "@/lib/pro-request";
import { payConfig, payForPlan } from "@/lib/pay-client";
import { useAuth, fullName } from "@/lib/auth-store";
import { inrFull } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * How long for, asked after which plan.
 *
 * A second dialog rather than nine prices in the comparison: choosing between
 * Plus and Pro is one decision and choosing between a month and a year is
 * another, and asking both at once is how a price table turns into a puzzle.
 *
 * Picking a length no longer does anything on its own. It used to open the
 * checkout on the press, which made choosing and paying the same gesture —
 * fine until there is a fee to read first, and a second way to pay underneath.
 */

let openFromAnywhere: ((plan: PaidPlan) => void) | null = null;

/** Opens the term chooser for a plan. The comparison closes itself first. */
export function openPlanTermDialog(plan: PaidPlan) {
  openFromAnywhere?.(plan);
}

const TITLE: Record<PaidPlan, string> = { plus: "Plus", pro: "Pro" };

export function PlanTermDialog() {
  const [plan, setPlan] = useState<PaidPlan | null>(null);
  const [months, setMonths] = useState<number | null>(null);
  const [busy, setBusy] = useState<"card" | "direct" | null>(null);
  const prices = usePlanPrices();
  const { profile, reloadProfile } = useAuth();
  // Whether this deployment can take money at all. Asked once, on open, so the
  // buttons say what will actually happen rather than finding out afterwards.
  const [canPay, setCanPay] = useState(false);

  useEffect(() => {
    void payConfig().then((c) => setCanPay(c.enabled));
  }, []);

  useEffect(() => {
    openFromAnywhere = (p) => {
      setPlan(p);
      setMonths(null);
    };
    return () => {
      openFromAnywhere = null;
    };
  }, []);

  const options = plan ? pricesFor(prices, plan) : [];
  // The best value is whichever is longest, not whichever is a year: the
  // lengths come from a table now and a year may not be one of them.
  const longest = options.length ? options[options.length - 1]!.months : 0;
  const picked = options.find((o) => o.months === months) ?? null;
  const name = plan ? TITLE[plan] : "";

  const close = () => {
    setPlan(null);
    setMonths(null);
  };

  /**
   * Paying by card, which grants the plan itself.
   *
   * Nothing here decides the amount — the server reads the price and adds the
   * fee. What the button says is produced by the same function the server
   * uses, so the figure on the button is the figure on the receipt.
   */
  const payByCard = async () => {
    if (!plan || !picked) return;
    const want = { plan, months: picked.months };

    /**
     * This dialog closes before the checkout opens, and that is the whole fix
     * for the window that froze.
     *
     * Razorpay's checkout is an overlay in an iframe on this page, not a
     * popup. Ours is a Radix dialog, and a Radix dialog holds the page while
     * it is open: pointer-events go to none on the body and focus is trapped
     * inside it. The checkout drew on top and then ignored every click,
     * because the clicks never reached it.
     *
     * So we get out of its way first, and come back if they change their mind.
     */
    setPlan(null);
    setBusy("card");
    const outcome = await payForPlan(want.plan, want.months, {
      name: fullName(profile),
      email: profile?.email_id,
    });
    setBusy(null);

    if (outcome === "paid") {
      // The tier is read off the profile, so it has to be read again before
      // anything unlocks.
      await reloadProfile();
      toast.success(`${TITLE[want.plan]} is on`, {
        description: `Paid for ${want.months} month${want.months === 1 ? "" : "s"}. Everything is open.`,
      });
      close();
      return;
    }

    // Cancelled, failed, or not available: put the chooser back exactly as
    // they left it rather than making them start again.
    setPlan(want.plan);
    setMonths(want.months);
    if (outcome === "unavailable") {
      setCanPay(false);
      toast.info("Card payments are not available", { description: "Ask an admin instead." });
    }
  };

  /** The other way: tell the admins, and pay them however you two arrange it. */
  const payDirect = async () => {
    if (!plan || !picked) return;
    setBusy("direct");
    const ok = await requestPro(plan, termFromMonths(picked.months));
    setBusy(null);
    if (ok) close();
  };

  return (
    <Dialog open={plan !== null} onOpenChange={(v) => !v && !busy && close()}>
      <DialogContent className="w-full max-w-full sm:max-w-md">
        <div className="text-center">
          <DialogTitle className="text-xl font-bold tracking-tight">
            {name} — how long for?
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            Longer costs less per month. Pick one, then choose how to pay.
          </DialogDescription>
        </div>

        <div className="mt-1 space-y-2">
          {options.map((o) => {
            const saving = plan ? savingOf(prices, plan, o.months) : 0;
            const full = saving + o.price;
            const off = full > 0 ? Math.round((saving / full) * 100) : 0;
            const perMonth = Math.round(o.price / o.months);
            const best = o.months === longest && options.length > 1;
            const on = o.months === months;
            return (
              <button
                key={o.months}
                type="button"
                aria-pressed={on}
                disabled={busy !== null}
                onClick={() => setMonths(o.months)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-60",
                  on
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : best
                      ? "border-primary/60 bg-primary/5 hover:bg-primary/10"
                      : "border-border bg-muted/20 hover:bg-muted/40",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{monthsLabel(o.months)}</span>
                    {saving > 0 && (
                      <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        Save ₹{saving.toLocaleString()}
                        {off > 0 && ` · ${off}% off`}
                      </span>
                    )}
                  </div>
                  {/* The per-month figure is what makes three prices
                      comparable; the months are what was actually bought. */}
                  <div className="text-[11px] text-muted-foreground">
                    {o.months === 1
                      ? `₹${monthlyOf(prices, plan ?? "pro")} every month`
                      : `₹${perMonth} a month, paid once`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-lg font-bold tracking-tight">₹{o.price}</div>
                </div>
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full border",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {on && <Check className="size-3" />}
                </span>
              </button>
            );
          })}
        </div>

        {/* THE TWO WAYS. Both need a length picked first, so both are quiet
            until one is. */}
        <div className="space-y-2">
          {canPay && (
            <>
              <Button
                type="button"
                className="w-full gap-1.5 font-semibold"
                disabled={!picked || busy !== null}
                onClick={() => void payByCard()}
              >
                {busy === "card" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CreditCard className="size-4" />
                )}
                {picked ? `Pay ${inrFull(withGatewayFee(picked.price))}` : "Pay"}
              </Button>
              {/* Said before the press, not discovered on the receipt. */}
              <p className="text-center text-[11px] text-muted-foreground">
                {picked
                  ? `₹${picked.price.toLocaleString()} plus ${GATEWAY_FEE_PCT}% card fee. The plan switches on as soon as it clears.`
                  : `Card payments add ${GATEWAY_FEE_PCT}%.`}
              </p>
            </>
          )}

          <Button
            type="button"
            variant={canPay ? "outline" : "default"}
            className="w-full gap-1.5 font-semibold"
            disabled={!picked || busy !== null}
            onClick={() => void payDirect()}
          >
            {busy === "direct" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {canPay ? "Pay directly instead" : "Ask an admin"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            {canPay
              ? `No card fee. We send you the payment details and switch the plan on once it arrives${picked ? ` — ₹${picked.price.toLocaleString()}` : ""}.`
              : "Nothing is charged here; the payment details come to you."}
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          disabled={busy !== null}
          onClick={close}
          className="text-muted-foreground"
        >
          Back
        </Button>
      </DialogContent>
    </Dialog>
  );
}
