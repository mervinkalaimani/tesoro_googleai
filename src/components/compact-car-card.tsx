import { Sparkles, Star } from "lucide-react";

import type { Diecast } from "@/lib/types";
import { CarThumb } from "@/components/car-thumb";
import { inr } from "@/lib/format";

/**
 * The densest of the three views: as many castings on screen at once as will
 * still read.
 *
 * Everything that is a detail rather than an identity is gone. At this size a
 * row of chips would cover the photograph it is sitting on, and the photograph
 * is the entire reason to be in a grid rather than the table. What is left is
 * what tells one casting from another at a glance — the picture, the name, the
 * brand, the price — plus the two flags worth spotting across a whole page.
 */
export function CompactCarCard({ car, onOpen }: { car: Diecast; onOpen: () => void }) {
  const title = car.name || `${car.make} ${car.model}`.trim() || "Unnamed car";

  return (
    <button
      type="button"
      onClick={onOpen}
      title={title}
      className="card-elevated group flex flex-col overflow-hidden text-left transition-colors hover:border-primary/40"
    >
      <div className="relative">
        <CarThumb car={car} className="aspect-[16/10] w-full" />

        {(car.chase || car.favourite) && (
          <div className="pointer-events-none absolute right-1 top-1 flex items-center gap-1">
            {car.chase && (
              <span className="grid size-5 place-items-center rounded-full bg-amber-500 text-black">
                <Sparkles className="size-3" />
              </span>
            )}
            {car.favourite && (
              <span className="grid size-5 place-items-center rounded-full bg-black/70 backdrop-blur-sm">
                <Star className="size-3 fill-amber-400 text-amber-400" />
              </span>
            )}
          </div>
        )}
      </div>

      <div className="min-w-0 p-2">
        <div className="truncate text-xs font-semibold leading-tight group-hover:text-primary">
          {title}
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-1.5">
          <span className="truncate text-[10px] text-muted-foreground">{car.brand || "—"}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {car.spent ? inr(car.spent) : "—"}
          </span>
        </div>
      </div>
    </button>
  );
}
