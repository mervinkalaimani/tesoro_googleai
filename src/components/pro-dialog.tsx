import { useEffect, useState } from "react";
import { BellRing, Check, Loader2, Minus, Rocket, Sparkles } from "lucide-react";

import { useAuth } from "@/lib/auth-store";
import {
  FREE_CAR_LIMIT,
  PLUS_CAR_LIMIT,
  PLUS_EXTRA_CARS,
  SCANS_PER_MONTH,
  TRIAL_DAYS,
  TRIAL_REMIND_DAYS,
  canStartTrial,
  monthlyPrice,
  trialDaysLeft,
  type PaidPlan,
} from "@/lib/tiers";
import { requestPro, startTrial } from "@/lib/pro-request";
import { openPlanTermDialog } from "@/components/plan-term-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The three plans side by side, once per sign-in and whenever something stops
 * somebody.
 *
 * Once per session rather than once ever: a person who is not paying should be
 * reminded what they are not getting, and a person who closed it has closed it
 * until next time. It never opens for an account already on Pro.
 */

const SESSION_KEY = "dg.proDialogSeen";
/** The trial nag is per day, not per session: the last two days each get one. */
const TRIAL_KEY = "dg.trialNagOn";

/**
 * Opening it from somewhere else — the Get Pro button, or the car ceiling.
 *
 * A module-level handle rather than a context: there is exactly one dialog,
 * mounted once in the shell, and a provider wrapping the whole app to carry a
 * single boolean would be more moving parts than the thing it moves.
 */
let openFromAnywhere: ((reason?: string) => void) | null = null;

/**
 * Opens the comparison, optionally with the thing that just stopped somebody.
 *
 * "Max cars reached for your plan" is not a different dialog from "here is what
 * Pro is" — it is this one with a sentence at the top saying why it opened now.
 * Two dialogs would be two places to keep the plans in step.
 */
export function openProDialog(reason?: string) {
  openFromAnywhere?.(reason);
}

type Line = { label: string; yes: boolean };

type Plan = {
  key: "free" | PaidPlan;
  title: string;
  price: string;
  per?: string;
  subtitle: string;
  lines: Line[];
  featured?: boolean;
};

/** The sections Pro opens. Free and Plus are the same list, unticked. */
const SECTIONS = [
  "Favourites and Collection",
  "Orders, Pre Orders, Duplicates",
  "Habit and Sellers",
];

/** The scanner is on every plan now; what differs is how much of it. */
function scanLine(plan: Plan["key"]): Line {
  const n = SCANS_PER_MONTH[plan];
  return { label: n === null ? "Unlimited card scans" : `${n} card scans a month`, yes: true };
}

/**
 * Each plan states its own list rather than a shared matrix with exceptions.
 * The ceiling is a different sentence in every column — fifty, a hundred and
 * fifty, none — which is the one thing a matrix cannot say without a special
 * case on its only interesting row.
 */
const PLANS: Plan[] = [
  {
    key: "free",
    title: "Free",
    price: "₹0",
    subtitle: "What you have now",
    lines: [
      { label: `Add up to ${FREE_CAR_LIMIT} cars`, yes: true },
      { label: "The full catalogue", yes: true },
      scanLine("free"),
      ...SECTIONS.map((label) => ({ label, yes: false })),
    ],
  },
  {
    key: "plus",
    title: "Plus",
    price: `₹${monthlyPrice("plus")}`,
    per: "per month",
    subtitle: `${PLUS_EXTRA_CARS} more cars`,
    lines: [
      { label: `Add up to ${PLUS_CAR_LIMIT} cars`, yes: true },
      { label: "The full catalogue", yes: true },
      scanLine("plus"),
      ...SECTIONS.map((label) => ({ label, yes: false })),
    ],
  },
  {
    key: "pro",
    title: "Pro",
    price: `₹${monthlyPrice("pro")}`,
    per: "per month",
    subtitle: "Everything, no ceiling",
    featured: true,
    lines: [
      { label: "Add unlimited cars", yes: true },
      { label: "The full catalogue", yes: true },
      scanLine("pro"),
      ...SECTIONS.map((label) => ({ label, yes: true })),
    ],
  },
];

export function ProDialog() {
  const { isPro, isGuest, status, profile, reloadProfile } = useAuth();
  const trialLeft = trialDaysLeft(profile);
  const canTrial = canStartTrial(profile);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState<PaidPlan | null>(null);
  const askedPlan = (profile?.pro_requested_plan ?? null) as PaidPlan | null;

  useEffect(() => {
    openFromAnywhere = (why?: string) => {
      setReason(why ?? null);
      setOpen(true);
    };
    return () => {
      openFromAnywhere = null;
    };
  }, []);

  useEffect(() => {
    if (status !== "ready" || isGuest) return;

    // The last two days of a trial. Once a day rather than once a session,
    // because the thing being asked for is a decision and the deadline moves.
    if (trialLeft !== null && trialLeft <= TRIAL_REMIND_DAYS) {
      const today = new Date().toDateString();
      try {
        if (localStorage.getItem(TRIAL_KEY) === today) return;
        localStorage.setItem(TRIAL_KEY, today);
      } catch {
        // Storage refused: it asks once per load instead, which on the last
        // two days of a trial is the side to err on.
      }
      setReason(
        trialLeft === 1
          ? "Your trial ends today — pick a plan to keep everything"
          : `Your trial ends in ${trialLeft} days — pick a plan to keep everything`,
      );
      setOpen(true);
      return;
    }

    if (isPro) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // A browser that refuses session storage shows it once per render of the
      // shell instead, which is still once per visit.
    }
    setReason(null);
    setOpen(true);
  }, [status, isGuest, isPro, trialLeft]);

  // A reminder is per-opening: it stops the button being pressed ten times in
  // a row, and comes back next time the dialog does.
  const [reminded, setReminded] = useState<PaidPlan | null>(null);

  const [trialBusy, setTrialBusy] = useState(false);

  const takeTrial = async () => {
    setTrialBusy(true);
    const ok = await startTrial();
    setTrialBusy(false);
    if (!ok) return;
    // The plan is read off the profile, so it has to be read again before the
    // locks come off.
    await reloadProfile();
    setOpen(false);
  };

  const ask = async (plan: PaidPlan) => {
    // Already asked for this one: the button is a nudge, and the term was
    // settled the first time round.
    if (askedPlan === plan) {
      setBusy(plan);
      const ok = await requestPro(plan, (profile?.pro_requested_term as never) ?? "month", true);
      setBusy(null);
      if (ok) setReminded(plan);
      return;
    }
    // Otherwise this is only half the question. Close, and ask the other half.
    setOpen(false);
    openPlanTermDialog(plan);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-full max-w-full sm:max-w-3xl">
        <div className="text-center">
          {reason && (
            <p className="mx-auto mb-3 w-fit rounded-full border border-amber-500/50 bg-amber-500/15 px-3 py-1 text-[13px] font-semibold">
              {reason}
            </p>
          )}
          <DialogTitle className="text-xl font-bold tracking-tight">
            Tesoro is better with Pro
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            Everything you have stays yours. These open the rest of it.
          </DialogDescription>
        </div>

        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {PLANS.map((p) => (
            <PlanCard
              key={p.key}
              plan={p}
              mine={p.key === "free"}
              asked={p.key !== "free" && askedPlan === p.key}
              reminded={reminded === p.key}
              busy={p.key === "free" ? trialBusy : busy === p.key}
              disabled={busy !== null || trialBusy}
              onTrial={p.key === "free" && canTrial ? () => void takeTrial() : undefined}
              onAsk={() => void ask(p.key as PaidPlan)}
            />
          ))}
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          Asking tells the admins. You get a payment link by email — nothing is charged here.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function PlanCard({
  plan,
  mine,
  asked,
  reminded,
  busy,
  disabled,
  onTrial,
  onAsk,
}: {
  plan: Plan;
  /** The plan this account is on, so one of the three is labelled rather than sold. */
  mine?: boolean;
  /** A request for this plan is already with the admins. */
  asked?: boolean;
  /** ...and it has been nudged since this dialog opened. */
  reminded?: boolean;
  busy?: boolean;
  disabled?: boolean;
  /** Set on the Free column when this account still has its trial to take. */
  onTrial?: () => void;
  onAsk: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border p-4",
        plan.featured ? "border-primary/60 bg-primary/5" : "border-border bg-muted/20",
      )}
    >
      <div className="flex items-center gap-2">
        <h3 className="text-base font-bold tracking-tight">{plan.title}</h3>
        {mine && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            You
          </span>
        )}
      </div>

      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-xl font-bold tracking-tight">{plan.price}</span>
        {plan.per && <span className="text-[11px] text-muted-foreground">{plan.per}</span>}
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{plan.subtitle}</p>

      <div className="mt-3 flex-1 space-y-1.5">
        {plan.lines.map((l) => (
          <div key={l.label} className="flex items-start gap-2 text-[13px]">
            {l.yes ? (
              <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Minus className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" />
            )}
            <span className={cn("min-w-0", !l.yes && "text-muted-foreground/60")}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* The free column's own offer: everything, for a fortnight, decided
          here rather than asked for. */}
      {mine && onTrial && (
        <div className="mt-4 space-y-1.5">
          {/* The terms first, then the button: what a trial costs is the
              question anybody has before pressing it, and an answer printed
              underneath is an answer given after the fact. */}
          <p className="text-center text-[10px] text-muted-foreground">
            Every Pro section, still {FREE_CAR_LIMIT} cars. No card, once per account.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full gap-1.5 font-semibold"
            disabled={disabled}
            onClick={onTrial}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
            Start {TRIAL_DAYS}-day trial
          </Button>
        </div>
      )}

      {!mine && (
        <div className="mt-4 space-y-1.5">
          <Button
            type="button"
            variant={plan.featured ? "default" : "outline"}
            className="w-full gap-1.5 font-semibold"
            disabled={disabled || reminded}
            onClick={onAsk}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : asked ? (
              <BellRing className="size-4" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {reminded ? "Reminder sent" : asked ? "Remind again" : `Choose ${plan.title}`}
          </Button>
          {asked && (
            <p className="text-center text-[10px] text-muted-foreground">
              Already asked — this nudges the admins.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
