import { useState } from "react";
import { BellRing, CalendarClock, Loader2, Rocket, Sparkles, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { openPlanTermDialog } from "@/components/plan-term-dialog";
import { openProDialog } from "@/components/pro-dialog";
import { ProChip } from "@/components/tier-avatar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { formatDayMonthYear } from "@/lib/format";
import {
  FREE_CAR_LIMIT,
  SCANS_PER_MONTH,
  TRIAL_DAYS,
  canStartTrial,
  paidPlanOf,
  planOf,
  trialDaysLeft,
  trialLastDay,
  type PaidPlan,
} from "@/lib/tiers";
import { startTrial } from "@/lib/pro-request";
import { cn } from "@/lib/utils";

/**
 * What this account is paying for, and the two things it can do about it.
 *
 * The admin screen answers "who is on what". This answers "what am I on", for
 * the person on it — the same columns read from the other side, plus the one
 * thing only they can say: that they are not renewing.
 */

/** Everything a paid plan opens, said in the order the sidebar lists it. */
const PRO_SECTIONS = [
  "Favourites",
  "Collection",
  "Duplicates",
  "Habit",
  "Sellers",
  "My Orders",
  "Pre Orders",
];

/**
 * Stopping, or changing your mind about stopping.
 *
 * It takes nothing away — the plan runs to its end date exactly as it would
 * have — so there is nothing here to confirm twice and nothing to undo but a
 * sentence on a screen.
 */
async function setCancel(on: boolean): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("tesoro_set_cancel", { _on: on });
  if (error) {
    toast.error(on ? "Could not stop the subscription" : "Could not restart it", {
      description: error.message || "Try again in a moment.",
    });
    return false;
  }
  return true;
}

export function SubscriptionPanel() {
  const { profile, isGuest, reloadProfile } = useAuth();
  const [busy, setBusy] = useState(false);

  const plan = planOf(profile);
  const paid = paidPlanOf(profile);
  const trialLeft = trialDaysLeft(profile);
  const endsOn = profile?.pro_until ?? null;
  const leaving = Boolean(profile?.cancel_requested_at);
  const askedPlan = (profile?.pro_requested_plan ?? null) as PaidPlan | null;

  if (isGuest) {
    return (
      <section className="card-elevated p-5">
        <p className="text-sm text-muted-foreground">
          A demo has no subscription. Sign in to see yours.
        </p>
      </section>
    );
  }

  const act = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (!ok) return;
    // Every line on this panel is read off the profile, so it is re-read before
    // any of them is allowed to be stale.
    await reloadProfile();
  };

  return (
    <div className="space-y-4">
      {/* WHAT YOU ARE ON */}
      <section className="card-elevated p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Your plan
        </h2>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {plan === "free" ? (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Free
            </span>
          ) : trialLeft !== null && paid === "free" ? (
            <ProChip label="Trial" />
          ) : (
            <ProChip label={plan === "plus" ? "Plus" : "Pro"} />
          )}
          <span className="text-sm text-muted-foreground">
            <Until
              plan={plan}
              paid={paid}
              trialLeft={trialLeft}
              trialEnds={trialLastDay(profile)}
              endsOn={endsOn}
              isOwner={Boolean(profile?.is_owner)}
            />
          </span>
        </div>

        <dl className="mt-4 grid gap-2 text-[13px] sm:grid-cols-2">
          <Fact label="Cars you can add">
            {paid === "pro"
              ? "No limit"
              : `${(paid === "plus" ? FREE_CAR_LIMIT + 100 : FREE_CAR_LIMIT).toLocaleString()}`}
          </Fact>
          <Fact label="Card scans a month">
            {SCANS_PER_MONTH[plan] === null ? "No limit" : SCANS_PER_MONTH[plan]}
          </Fact>
        </dl>
      </section>

      {/* CHANGING IT */}
      <section className="card-elevated space-y-3 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Change it
        </h2>

        {askedPlan && (
          <p className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-[12px]">
            <BellRing className="mr-1.5 inline size-3.5 text-primary" />
            You asked for {askedPlan === "plus" ? "Plus" : "Pro"}. An admin will send a payment link
            by email.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {paid === "free" ? (
            <Button type="button" className="gap-1.5" onClick={() => openProDialog()}>
              <Sparkles className="size-4" />
              See the plans
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={() => openPlanTermDialog(paid)}
            >
              <CalendarClock className="size-4" />
              Change how long for
            </Button>
          )}

          {paid !== "free" && (
            <Button
              type="button"
              variant="ghost"
              className="gap-1.5"
              onClick={() => openProDialog()}
            >
              Compare the plans
            </Button>
          )}

          {canStartTrial(profile) && (
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const ok = await startTrial();
                  return ok;
                })
              }
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
              Start {TRIAL_DAYS}-day trial
            </Button>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Nothing is charged here. Asking tells the admins, and a payment link comes by email.
        </p>
      </section>

      {/* STOPPING IT */}
      {paid !== "free" && !profile?.is_owner && (
        <section
          className={cn(
            "card-elevated space-y-3 p-5",
            leaving && "border-amber-500/50 bg-amber-500/5",
          )}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {leaving ? "Not renewing" : "Stop the subscription"}
          </h2>

          {/* The date first. The one question somebody stopping a subscription
              actually has is whether it stops now, and it does not. */}
          <p className="text-[13px]">
            {endsOn ? (
              <>
                You keep everything until <strong>{formatDayMonthYear(endsOn)}</strong>, the last
                day already paid for. Nothing is taken away before then.
              </>
            ) : (
              <>
                This plan has no end date, so an admin has to close it. Telling them here is how
                they know.
              </>
            )}
          </p>

          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-[12px] font-semibold">After that day you would lose</p>
            <ul className="mt-1.5 space-y-1 text-[12px] text-muted-foreground">
              <li>· {PRO_SECTIONS.join(", ")} — all locked</li>
              <li>· The card scanner drops to {SCANS_PER_MONTH.free} scans a month</li>
              <li>
                · Anything above {FREE_CAR_LIMIT} cars is put away — not deleted, and it all comes
                back if you subscribe again
              </li>
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Your cars, the catalogue and everything you have logged stay yours either way.
            </p>
          </div>

          {leaving ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-[12px] text-muted-foreground">
                The admins know you are not renewing.
              </p>
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                disabled={busy}
                onClick={() => void act(() => setCancel(false))}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
                Keep my subscription
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="gap-1.5 text-rose-500 hover:bg-rose-500/10 hover:text-rose-400"
              disabled={busy}
              onClick={() => void act(() => setCancel(true))}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
              Stop the subscription
            </Button>
          )}
        </section>
      )}
    </div>
  );
}

/** The date, in whichever of the five ways there is one. */
function Until({
  plan,
  paid,
  trialLeft,
  trialEnds,
  endsOn,
  isOwner,
}: {
  plan: string;
  paid: string;
  trialLeft: number | null;
  trialEnds: Date | null;
  endsOn: string | null;
  isOwner: boolean;
}) {
  if (isOwner) return <>No end date</>;
  if (plan === "free") return <>Up to {FREE_CAR_LIMIT} cars, and the full catalogue</>;
  if (paid === "free" && trialLeft !== null) {
    return (
      <>
        {trialLeft === 1 ? "Last day" : `${trialLeft} days left`}
        {trialEnds ? <> — until {formatDayMonthYear(trialEnds)}</> : null}
      </>
    );
  }
  if (!endsOn) return <>No end date</>;
  return <>Until {formatDayMonthYear(endsOn)}</>;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * The same facts in one line, for the row that opens this panel.
 *
 * Deliberately the plan and its date and nothing else: a settings row is read
 * on the way past, and what somebody wants from it is whether they are paying
 * and until when.
 */
export function PlanSummary() {
  const { profile } = useAuth();
  const plan = planOf(profile);
  const paid = paidPlanOf(profile);
  const trialLeft = trialDaysLeft(profile);

  if (profile?.is_owner) return <>Pro · no end date</>;
  if (paid === "free" && trialLeft !== null) {
    return <>Trial · {trialLeft === 1 ? "last day" : `${trialLeft} days left`}</>;
  }
  if (plan === "free") return <>Free · up to {FREE_CAR_LIMIT} cars</>;

  const name = plan === "plus" ? "Plus" : "Pro";
  if (!profile?.pro_until) return <>{name} · no end date</>;
  return (
    <>
      {name} · until {formatDayMonthYear(profile.pro_until)}
      {profile.cancel_requested_at ? " · not renewing" : ""}
    </>
  );
}
