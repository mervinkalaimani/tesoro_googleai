import { useState } from "react";
import { Loader2, Lock, Sparkles } from "lucide-react";

import { useAuth } from "@/lib/auth-store";
import { FREE_CAR_LIMIT } from "@/lib/tiers";
import { requestPro } from "@/lib/pro-request";
import { SampleCars } from "@/components/sample-cars";
import { Button } from "@/components/ui/button";

/**
 * A section somebody has not paid for, shown working over cars that are not
 * theirs.
 *
 * A locked page that is only a padlock says what you cannot do. This says what
 * you would get: the real section, running, over the demo collection — so
 * Favourites looks like Favourites and Habit looks like Habit without anybody's
 * own rows being rendered behind a blur.
 *
 * The preview is inert. `pointer-events-none` stops the clicks and SampleCars
 * refuses the writes, which is belt and braces on purpose: this is somebody
 * else's data model being driven by a page that thinks it is live.
 */
export function ProGate({
  title,
  children,
}: {
  /** The section's name, for the panel over the example. */
  title: string;
  children: React.ReactNode;
}) {
  const { isPro, profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(Boolean(profile?.pro_requested_at));

  if (isPro) return <>{children}</>;

  const ask = async () => {
    setBusy(true);
    if (await requestPro()) setAsked(true);
    setBusy(false);
  };

  return (
    <div className="relative">
      {/* THE EXAMPLE. Hidden from the reading order as well as from the
          pointer: a screen reader walking a page of cars that are not the
          listener's is worse than one that skips them. */}
      <div
        aria-hidden
        inert
        className="pointer-events-none select-none [mask-image:linear-gradient(to_bottom,black,black_28rem,transparent_42rem)]"
      >
        <SampleCars>{children}</SampleCars>
      </div>

      {/* THE PANEL, over the top of it. */}
      <div className="absolute inset-x-0 top-24 flex justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card/95 p-5 text-center shadow-xl backdrop-blur">
          <div className="mx-auto grid size-11 place-items-center rounded-2xl bg-primary/10">
            <Lock className="size-5 text-primary" />
          </div>
          <h2 className="mt-3 text-lg font-bold tracking-tight">{title} is part of Pro</h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            This is {title} with somebody else&rsquo;s cars in it. Pro fills it with yours, along
            with every other section and no limit on how many you log.
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Free keeps My Cars, the catalogue and up to {FREE_CAR_LIMIT} cars.
          </p>
          <Button
            type="button"
            className="mt-4 w-full gap-1.5 font-semibold"
            disabled={busy || asked}
            onClick={() => void ask()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {asked ? "Already asked" : "Ask for Pro"}
          </Button>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {asked
              ? "Your request is with the admins. The payment link comes by email."
              : "The admins are told, and a payment link comes back by email."}
          </p>
        </div>
      </div>
    </div>
  );
}
