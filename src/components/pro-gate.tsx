import { Lock } from "lucide-react";

import { useAuth } from "@/lib/auth-store";
import { FREE_CAR_LIMIT } from "@/lib/tiers";

/**
 * A section somebody has not paid for.
 *
 * It wraps the body rather than replacing the route, so the page keeps its own
 * heading and the person can see where they are. Nothing inside it renders for
 * a free account — which is also why it wraps rather than overlays: a blurred
 * preview would still have fetched and shipped the thing we said they cannot
 * have.
 *
 * The sidebar keeps these sections visible and locked rather than hiding them.
 * Somebody who cannot see what Pro is cannot want it.
 */
export function ProGate({
  title,
  children,
}: {
  /** What this section does, in a few words, for the panel. */
  title: string;
  children: React.ReactNode;
}) {
  const { isPro } = useAuth();
  if (isPro) return <>{children}</>;

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10">
        <Lock className="size-5 text-primary" />
      </div>
      <h2 className="mt-4 text-lg font-bold tracking-tight">{title} is part of Pro</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        A free account keeps up to {FREE_CAR_LIMIT} cars and the catalogue. Pro adds Favourites,
        Collection, Duplicates, Habit, Sellers and My Orders, the card scanner, and no limit on how
        many cars you log.
      </p>
      <p className="mt-4 text-xs text-muted-foreground">
        Ask an admin to turn Pro on for your account.
      </p>
    </div>
  );
}
