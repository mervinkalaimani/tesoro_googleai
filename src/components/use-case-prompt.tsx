import { useState } from "react";
import { Car, Check, Receipt, Store, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-store";
import { useApp } from "@/lib/store";
import { USE_CASES } from "@/lib/use-cases";
import { cn } from "@/lib/utils";

const ICONS = { car: Car, store: Store, receipt: Receipt, truck: Truck } as const;

/**
 * Asked once, right after a person first signs in: what they use VIIV for.
 *
 * The answer trims the app down to the details they care about, so a collector
 * who only logs cars is not handed columns of prices and tracking numbers. It is
 * not a gate: skipping keeps everything, and Settings changes the answer later.
 */
export function UseCasePrompt() {
  const { useCases, setUseCases, settingsReady } = useApp();
  const { user, isGuest } = useAuth();
  const [picked, setPicked] = useState<string[]>(USE_CASES.map((u) => u.key));

  const asked = !settingsReady || useCases !== null || !user || isGuest;
  const all = USE_CASES.map((u) => u.key);

  return (
    // Only the two buttons close it: a stray tap outside must not answer for them.
    <Dialog open={!asked}>
      <DialogContent hideClose className="gap-4 sm:max-w-sm">
        <div>
          <DialogTitle className="text-xl font-semibold">What do you use VIIV for?</DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            Pick all that apply. We&rsquo;ll show only those details, and you can change it any time
            in Settings.
          </DialogDescription>
        </div>
        <div className="space-y-2.5">
          {USE_CASES.map((u) => {
            const on = picked.includes(u.key);
            const Icon = ICONS[u.icon as keyof typeof ICONS];
            return (
              <button
                key={u.key}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setPicked((p) => (on ? p.filter((k) => k !== u.key) : [...p, u.key]))
                }
                className={cn(
                  "card-elevated flex w-full cursor-pointer items-center gap-3 p-3 text-left transition-colors !rounded-2xl",
                  on && "!border-primary/70 bg-primary/10",
                )}
              >
                <Icon className="size-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{u.label}</span>
                  <span className="block text-xs text-muted-foreground">{u.hint}</span>
                </span>
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {on && <Check className="size-3.5" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="space-y-1">
          <Button className="h-11 w-full rounded-full" onClick={() => setUseCases(picked)}>
            Continue
          </Button>
          <Button
            variant="ghost"
            className="h-9 w-full text-muted-foreground"
            onClick={() => setUseCases(all)}
          >
            Skip for now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
