import { Lock, Sparkles } from "lucide-react";

import { useAuth } from "@/lib/auth-store";
import { FREE_CAR_LIMIT } from "@/lib/tiers";
import { openProDialog } from "@/components/pro-dialog";
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
  const { isPro } = useAuth();

  if (isPro) return <>{children}</>;

  return (
    <div>
      {/* THE EXAMPLE. Hidden from the reading order as well as from the
          pointer: a screen reader walking a page of cars that are not the
          listener's is worse than one that skips them. */}
      <div
        aria-hidden
        inert
        className="pointer-events-none max-h-[26rem] select-none overflow-hidden [mask-image:linear-gradient(to_bottom,black,black_16rem,transparent_26rem)]"
      >
        <SampleCars>{children}</SampleCars>
      </div>

      {/* THE PANEL, under it rather than over it: a card floating in the
          middle of the example covers the half of it worth looking at, and
          what is being sold here is the look of the thing. */}
      <div className="flex justify-center px-4 pb-6">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-center shadow-lg">
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
          {/* The comparison rather than a single button: there are three
              plans now, and only two of them open this section. */}
          <Button
            type="button"
            className="mt-4 w-full gap-1.5 font-semibold"
            onClick={() => openProDialog()}
          >
            <Sparkles className="size-4" />
            See the plans
          </Button>
        </div>
      </div>
    </div>
  );
}
