import { CopiesBadge } from "@/components/copies-badge";
import { ChaseMark, FavouriteMark, ChangedDot } from "@/components/car-marks";
import { StatusPill } from "@/components/status-pill";
import { CarThumb } from "@/components/car-thumb";
import { rarityOf } from "@/lib/rarity";
import { cn } from "@/lib/utils";

import type { Diecast } from "@/lib/types";

/**
 * Blister view: the photograph in the shape of the packaging.
 *
 * 534 × 658 is the blister card this was drawn from, and it is the picture
 * that takes that ratio — the name and the brand sit underneath it, the way
 * they do in every other grid here. The other views crop the same photograph
 * to a landscape window, which is the car; this one is the card.
 */
export function BlisterTile({
  car,
  onOpen,
  caption,
  copies = 1,
  className = "",
}: {
  car: Diecast;
  onOpen: () => void;
  /** One short word at the end of the second line — "Owned", a price, a day. */
  caption?: string;
  copies?: number;
  className?: string;
}) {
  const title = car.name || `${car.make} ${car.model}`.trim() || "Unnamed car";

  return (
    <button
      type="button"
      onClick={onOpen}
      title={title}
      className={cn(
        "card-elevated group flex h-full flex-col overflow-hidden text-left transition-colors hover:border-primary/40",
        className,
      )}
    >
      {/* A photograph that is not already this shape is zoomed to fill it
          rather than letterboxed: a grid of cards with grey bands above and
          below each one stops reading as a shelf. `object-cover` is CarThumb's
          own default, so there is nothing to override. */}
      <div className="relative shrink-0">
        <CarThumb
          car={car}
          className="aspect-[534/658] w-full"
          // No photograph still fills the window, top to bottom: the car's own
          // name across a tinted panel. A small outline floating in the middle
          // of a tile this tall reads as a tile that failed to load.
          fallback={
            <span className="flex size-full items-center justify-center bg-gradient-to-b from-muted/60 to-muted/20 p-3 text-center text-xs font-semibold leading-tight text-muted-foreground">
              {title}
            </span>
          }
        />

        {copies > 1 && (
          <div className="pointer-events-none absolute bottom-1 left-1">
            <CopiesBadge n={copies} className="bg-black/75 backdrop-blur-sm" />
          </div>
        )}

        {car.status && (
          <div className="pointer-events-none absolute bottom-1 right-1">
            <StatusPill
              status={car.status}
              className="px-1.5 py-0 text-[9px] leading-tight shadow-sm backdrop-blur-sm"
            />
          </div>
        )}

        {(car.chase || car.favourite) && (
          <div className="pointer-events-none absolute right-1 top-1 flex items-center gap-1">
            {car.chase && (
              <span className="grid size-5 place-items-center rounded-full bg-black/70 backdrop-blur-sm">
                <ChaseMark rarity={rarityOf(car)} className="size-3" />
              </span>
            )}
            {car.favourite && (
              <span className="grid size-5 place-items-center rounded-full bg-black/70 backdrop-blur-sm">
                <FavouriteMark className="size-3" />
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-semibold leading-tight group-hover:text-primary">
            {title}
          </span>
          <ChangedDot car={car} />
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-1.5">
          <span className="truncate text-[10px] text-muted-foreground">{car.brand || "—"}</span>
          {caption && (
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/80">
              {caption}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
