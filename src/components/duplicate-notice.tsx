import { AlertTriangle, Car, Merge, Plus } from "lucide-react";

import type { CatalogCar } from "@/lib/catalog";
import type { DuplicateHit, DuplicateLevel } from "@/lib/duplicate";
import { carSubLine } from "@/lib/car-subline";
import { inrFull } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * What the catalogue already has that looks like what you are typing.
 * Suggests existing cars with "Add this car" to prevent duplicates.
 */

const HEADING: Record<DuplicateLevel, string> = {
  certain: "Duplicate entry found in catalogue",
  likely: "Matches an existing catalogue entry",
  possible: "Similar casting found in catalogue",
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
  onAddThisCar,
  onMergeToThis,
  onUse,
  className,
}: {
  hits: DuplicateHit[];
  /** Handler to add this existing car rather than create a new duplicate */
  onAddThisCar?: (car: CatalogCar) => void;
  /**
   * Fold the entry being edited into this one: every car pointing at it moves
   * here and the entry goes. Only offered where there is an entry to fold --
   * a casting still being typed has nobody on it.
   */
  onMergeToThis?: (car: CatalogCar) => void;
  onUse?: (car: CatalogCar) => void;
  className?: string;
}) {
  if (hits.length === 0) return null;
  const worst = hits[0].level;
  const loud = worst === "certain";
  const handleAdd = onAddThisCar || onUse;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border",
        loud ? "border-amber-500/60 bg-amber-500/10" : "border-amber-500/40 bg-amber-500/5",
        className,
      )}
    >
      <div className="flex items-start gap-2 px-3 pt-2.5">
        <AlertTriangle
          className={cn(
            "mt-0.5 size-4 shrink-0",
            loud ? "text-amber-600 dark:text-amber-400" : "text-amber-500",
          )}
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">{HEADING[worst]}</p>
          <p className="text-[11px] text-muted-foreground">
            {handleAdd
              ? "This casting already exists. We suggest adding the existing car below instead."
              : "Check before adding a second one. Duplicate entries are blocked unless confirmed."}
          </p>
        </div>
      </div>

      <div className="space-y-1.5 p-2.5">
        {hits.map(({ car, because, match }) => (
          <div
            key={car.car_id}
            className="flex items-center gap-2 rounded-md border border-border bg-background/85 p-2"
          >
            {/* How much of the description the two share. 100% is every field
                either of them states agreeing; anything less is the thing to
                look at before deciding it is the same car. */}
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                match >= 95
                  ? "bg-amber-500/25 text-amber-800 dark:text-amber-300"
                  : "bg-muted text-muted-foreground",
              )}
              title="How much of the description matches"
            >
              {match}%
            </span>
            <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded bg-muted">
              {car.image_url ? (
                <img src={car.image_url} alt="" className="size-full object-cover" />
              ) : (
                <Car className="size-4 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">{car.name}</div>
              <div className="truncate text-[10px] text-muted-foreground">{subLineOf(car)}</div>
              <div className="truncate text-[10px] font-medium text-amber-700 dark:text-amber-400">
                {because} · {inrFull(Number(car.mrp) || 0)}
              </div>
            </div>
            {onMergeToThis && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 gap-1 px-2.5 text-xs font-semibold"
                onClick={() => onMergeToThis(car)}
              >
                <Merge className="size-3.5" />
                Merge to this
              </Button>
            )}
            {handleAdd && (
              <Button
                type="button"
                size="sm"
                className="h-7 shrink-0 px-2.5 text-xs font-semibold gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => handleAdd(car)}
              >
                <Plus className="size-3.5" />
                Add this car
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The same warning as one line, pinned while the rest of the form is filled in.
 *
 * Separate from the notice above rather than a mode of it, because a sticky
 * element cannot outlive its own parent: put inside the notice, the line left
 * the screen with the entries it was summarising, which is the one thing it is
 * there not to do. As a sibling of the sections it pins over, its parent is the
 * whole scrolling column and it stays for as long as there is form left.
 *
 * It says how many and nothing else. The entries are directly under it, and
 * scrolling back up is how you read them.
 */
const PINNED: Record<DuplicateLevel, string> = {
  certain: "Duplicate in catalogue",
  likely: "Matches an existing entry",
  possible: "Possible duplicate",
};

export function DuplicateBar({ hits, className }: { hits: DuplicateHit[]; className?: string }) {
  if (hits.length === 0) return null;
  const worst = hits[0].level;
  const loud = worst === "certain";

  return (
    <div
      className={cn(
        // h-7, and the identity card below pins at top-7 to come to rest under
        // it rather than behind it.
        "sticky top-0 z-30 flex h-7 items-center gap-2 rounded-lg border px-3",
        loud
          ? "border-amber-500/60 bg-amber-500/20 text-foreground"
          : "border-amber-500/40 bg-amber-500/15 text-foreground",
        className,
      )}
    >
      <AlertTriangle
        className={cn(
          "size-3.5 shrink-0",
          loud ? "text-amber-600 dark:text-amber-400" : "text-amber-500",
        )}
      />
      <p className="min-w-0 truncate text-[11px] font-semibold">
        {PINNED[worst]}
        <span className="font-normal text-muted-foreground">
          {" · "}
          {hits.length === 1 ? hits[0].car.name : `${hits.length} entries`}
        </span>
      </p>
    </div>
  );
}
