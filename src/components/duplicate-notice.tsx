import { AlertTriangle, Car } from "lucide-react";

import type { CatalogCar } from "@/lib/catalog";
import type { DuplicateHit, DuplicateLevel } from "@/lib/duplicate";
import { carSubLine } from "@/lib/car-subline";
import { inrFull } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * What the catalogue already has that looks like what you are typing.
 *
 * Shown, never enforced. The catalogue holds real pairs that would fail any
 * automatic test — Matchbox prints the same casting every year with a new year
 * on the card — so this says what it found and leaves the call to you.
 */

const HEADING: Record<DuplicateLevel, string> = {
  certain: "This is already in the catalogue",
  likely: "This looks like one that is already here",
  possible: "Something similar is already here",
};

const subLineOf = (c: CatalogCar) =>
  carSubLine({
    brand: c.brand,
    assortment: c.assortment,
    series: c.series,
    subSeries: c.sub_series,
    carNumber: c.car_number,
  });

export function DuplicateNotice({
  hits,
  onUse,
  className,
}: {
  hits: DuplicateHit[];
  /** Offered when the caller can switch to the entry rather than make a new one. */
  onUse?: (car: CatalogCar) => void;
  className?: string;
}) {
  if (hits.length === 0) return null;
  const worst = hits[0].level;
  const loud = worst === "certain";

  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border",
        loud ? "border-primary/50 bg-primary/5" : "border-amber-500/40 bg-amber-500/5",
        className,
      )}
    >
      <div className="flex items-start gap-2 px-3 pt-2.5">
        <AlertTriangle
          className={cn("mt-0.5 size-4 shrink-0", loud ? "text-primary" : "text-amber-500")}
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">{HEADING[worst]}</p>
          <p className="text-[11px] text-muted-foreground">
            {onUse
              ? "Use the entry you meant, or carry on if yours is genuinely a different release."
              : "Check before adding a second one. Carry on if yours is genuinely a different release."}
          </p>
        </div>
      </div>

      <div className="space-y-1.5 p-2.5">
        {hits.map(({ car, because }) => (
          <div
            key={car.car_id}
            className="flex items-center gap-2 rounded-md border border-border bg-background/70 p-1.5"
          >
            <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded bg-muted">
              {car.image_url ? (
                <img src={car.image_url} alt="" className="size-full object-cover" />
              ) : (
                <Car className="size-4 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{car.name}</div>
              <div className="truncate text-[10px] text-muted-foreground">{subLineOf(car)}</div>
              <div className="truncate text-[10px] text-muted-foreground/80">
                {because} · {inrFull(Number(car.mrp) || 0)}
              </div>
            </div>
            {onUse && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 px-2 text-[11px]"
                onClick={() => onUse(car)}
              >
                Use this
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
