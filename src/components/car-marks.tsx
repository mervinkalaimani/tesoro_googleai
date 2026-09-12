import { Flame, Star } from "lucide-react";

import type { Diecast } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The two things you scan a page of cars for: is it a chase, is it a favourite.
 *
 * They were drawn six different ways. Chase was a sparkle on amber here, a
 * sparkle on black there, a flame in rose in the table, and the word CHASE in a
 * chip on three of those. Favourite was an amber star everywhere except the
 * filter toggle, which used the accent colour, so it changed hue when you
 * changed the theme. Six spellings of two ideas.
 *
 * One spelling each now, and no words. A red flame and a gold star are already
 * the shortest way to say it — "CHASE" beside a flame is the flame's caption,
 * and on a grid of forty cards those five letters were most of what the badges
 * cost. The label survives for screen readers, which is where it was actually
 * doing work.
 */
export const CHASE_COLOUR = "fill-red-500 text-red-500";
export const FAVOURITE_COLOUR = "fill-amber-400 text-amber-500";

export function ChaseMark({ className }: { className?: string }) {
  return (
    <Flame
      role="img"
      aria-label="Chase"
      className={cn("size-4 shrink-0", CHASE_COLOUR, className)}
    />
  );
}

export function FavouriteMark({ className }: { className?: string }) {
  return (
    <Star
      role="img"
      aria-label="Favourite"
      className={cn("size-4 shrink-0", FAVOURITE_COLOUR, className)}
    />
  );
}

/**
 * Both marks for one car, in whichever order matters on this page — the
 * favourites page leads with the star, the duplicates page with the flame.
 */
export function CarMarks({
  car,
  primary = "favourite",
  className,
  iconClassName,
}: {
  car: Diecast;
  primary?: "favourite" | "chase";
  className?: string;
  iconClassName?: string;
}) {
  if (!car.chase && !car.favourite) return null;
  const chase = car.chase ? <ChaseMark key="chase" className={iconClassName} /> : null;
  const fav = car.favourite ? <FavouriteMark key="fav" className={iconClassName} /> : null;
  const items = primary === "chase" ? [chase, fav] : [fav, chase];
  return <span className={cn("inline-flex items-center gap-1", className)}>{items}</span>;
}

/**
 * The same marks over a photograph, where the card's own colours are not behind
 * them. An opaque disc rather than a drop shadow: a red flame on a red car is
 * invisible either way, and a disc is the only one of the two that fixes it.
 */
export function CarMarkOverlay({ car }: { car: Diecast }) {
  if (!car.chase && !car.favourite) return null;
  return (
    <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1">
      {car.chase && (
        <span className="grid size-7 place-items-center rounded-full bg-black/70 backdrop-blur-sm">
          <ChaseMark className="size-3.5" />
        </span>
      )}
      {car.favourite && (
        <span className="grid size-7 place-items-center rounded-full bg-black/70 backdrop-blur-sm">
          <FavouriteMark className="size-3.5" />
        </span>
      )}
    </span>
  );
}
