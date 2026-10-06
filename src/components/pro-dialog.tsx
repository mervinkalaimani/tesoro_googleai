import { useEffect, useState } from "react";
import { Check, Loader2, Minus, Sparkles } from "lucide-react";

import { useAuth } from "@/lib/auth-store";
import { FREE_CAR_LIMIT } from "@/lib/tiers";
import { requestPro } from "@/lib/pro-request";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * What the two tiers are, side by side, once per sign-in.
 *
 * Once per session rather than once ever: somebody who is not paying should be
 * reminded what they are not getting, and somebody who closed it has closed it
 * until next time. It never appears for an account that is already on Pro, so
 * the only people who ever see it are the people it is for.
 */

const SESSION_KEY = "dg.proDialogSeen";

/** What each tier gets, in the order the sections appear in the sidebar. */
const LINES: { label: string; free: boolean }[] = [
  { label: "My Cars", free: true },
  { label: "The full catalogue", free: true },
  { label: `Up to ${FREE_CAR_LIMIT} cars`, free: true },
  { label: "Unlimited cars", free: false },
  { label: "Favourites", free: false },
  { label: "Collection", free: false },
  { label: "My Orders, Pre Orders, Duplicates", free: false },
  { label: "Habit and Sellers", free: false },
  { label: "Scan a card", free: false },
];

export function ProDialog() {
  const { isPro, isGuest, status, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const asked = Boolean(profile?.pro_requested_at);

  useEffect(() => {
    if (status !== "ready" || isGuest || isPro) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // A browser that refuses session storage shows it once per render of the
      // shell instead, which is still once per visit.
    }
    setOpen(true);
  }, [status, isGuest, isPro]);

  const ask = async () => {
    setBusy(true);
    const ok = await requestPro();
    setBusy(false);
    if (ok) setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-full max-w-full sm:max-w-2xl">
        <div className="text-center">
          <DialogTitle className="text-xl font-bold tracking-tight">
            Tesoro is better with Pro
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            Everything you have stays yours. Pro opens the rest of it.
          </DialogDescription>
        </div>

        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Plan title="Free" subtitle="What you have now" lines={LINES} mine />
          <Plan
            title="Pro"
            subtitle="Everything, with no ceiling"
            lines={LINES}
            featured
            action={
              <Button
                type="button"
                className="w-full gap-1.5 font-semibold"
                disabled={busy || asked}
                onClick={() => void ask()}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {asked ? "Already asked" : "Ask for Pro"}
              </Button>
            }
          />
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          {asked
            ? "Your request is with the admins. The payment link comes by email."
            : "Asking tells the admins. You get a payment link by email — nothing is charged here."}
        </p>
      </DialogContent>
    </Dialog>
  );
}

function Plan({
  title,
  subtitle,
  lines,
  featured,
  mine,
  action,
}: {
  title: string;
  subtitle: string;
  lines: { label: string; free: boolean }[];
  featured?: boolean;
  /** The tier this account is on, so one of the two is labelled rather than sold. */
  mine?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border p-4",
        featured ? "border-primary/60 bg-primary/5" : "border-border bg-muted/20",
      )}
    >
      <div className="flex items-center gap-2">
        <h3 className="text-base font-bold tracking-tight">{title}</h3>
        {mine && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            You
          </span>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>

      <div className="mt-3 flex-1 space-y-1.5">
        {lines.map((l) => {
          // In the free column a Pro line is what you do not get, and saying so
          // with a dash rather than leaving it out is the whole comparison.
          const has = featured || l.free;
          return (
            <div key={l.label} className="flex items-start gap-2 text-[13px]">
              {has ? (
                <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Minus className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" />
              )}
              <span className={cn("min-w-0", !has && "text-muted-foreground/60")}>{l.label}</span>
            </div>
          );
        })}
      </div>

      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
