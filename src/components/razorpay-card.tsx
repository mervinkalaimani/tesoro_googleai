import { useEffect, useState } from "react";
import { CheckCircle2, CreditCard, Loader2, XCircle } from "lucide-react";

import { payConfig } from "@/lib/pay-client";
import { GATEWAY_FEE_PCT } from "@/lib/tiers";
import { cn } from "@/lib/utils";

/**
 * Whether this deployment can take a card, and which keys it is doing it with.
 *
 * Read from the server rather than from anything typed here. Keys are set as
 * environment variables and nowhere else — a settings screen that could write
 * them would be a settings screen that stores them, and a key secret in a
 * database row is a key secret with one more place to leak from.
 *
 * So this screen reports and does not configure. What it is for is answering
 * "is it on", which until now could only be found out by trying to pay.
 */
export function RazorpayCard() {
  const [state, setState] = useState<{ enabled: boolean; keyId: string | null } | null>(null);

  useEffect(() => {
    void payConfig().then(setState);
  }, []);

  const live = state?.keyId?.startsWith("rzp_live_") ?? false;

  return (
    <section className="card-elevated space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <CreditCard className="size-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Razorpay
        </h2>
        {state && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              state.enabled
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            {state.enabled ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
            {state.enabled ? "Taking payments" : "Off"}
          </span>
        )}
        {state?.enabled && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              live
                ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
            )}
          >
            {live ? "Live keys — real money" : "Test keys"}
          </span>
        )}
      </div>

      {!state ? (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Asking the server…
        </p>
      ) : state.enabled ? (
        <>
          <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
            <Fact label="Key id">
              {/* The public half. The secret is never sent anywhere a browser
                  can reach, including this one. */}
              <code className="text-[12px]">{state.keyId}</code>
            </Fact>
            <Fact label="Card fee added">{GATEWAY_FEE_PCT}% on top of the plan price</Fact>
          </dl>
          {!live && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px]">
              Test keys take test cards only — a real card is declined. Swap{" "}
              <code>RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code> for{" "}
              <code>rzp_live_</code> keys when you want real money.
            </p>
          )}
        </>
      ) : (
        <div className="space-y-2 text-[13px]">
          <p>
            Nobody can pay by card. The plans screen falls back to asking an admin, which is what it
            did before any of this existed.
          </p>
          <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
            Set <code>RAZORPAY_KEY_ID</code>, <code>RAZORPAY_KEY_SECRET</code> and{" "}
            <code>SUPABASE_SERVICE_ROLE_KEY</code> on the deployment, then redeploy. All three:
            granting a plan writes a row the paying account cannot write itself, so without the last
            one the money would be taken and nothing would happen.
          </p>
        </div>
      )}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}
