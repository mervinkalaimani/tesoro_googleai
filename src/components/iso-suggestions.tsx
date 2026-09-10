import { Layers, Search, X } from "lucide-react";

import type { Diecast } from "@/lib/types";
import { Button } from "@/components/ui/button";
import type { IsoMatch, IsoMatchField } from "@/lib/iso-match";

const FIELD_LABEL: Record<IsoMatchField, string> = {
  make: "make",
  model: "model",
  variant: "variant",
  series: "series",
  subSeries: "sub series",
  brand: "brand",
  assortment: "assortment",
};

/**
 * "You are looking for this" — ISO entries matching the car being typed.
 *
 * Each row says which fields agreed, because a suggestion you cannot check is
 * one you have to take on faith. Two ways out: pull a single entry into the form
 * you are already filling, or send the whole set to bulk add when you have come
 * home with several of them at once.
 */
export function IsoSuggestions({
  matches,
  onUse,
  onBulk,
  onDismiss,
}: {
  matches: IsoMatch[];
  /** Fill the current form from this ISO entry. */
  onUse: (car: Diecast) => void;
  /** Hand every match to the bulk dialog, prefilled. */
  onBulk?: (cars: Diecast[]) => void;
  onDismiss: () => void;
}) {
  if (matches.length === 0) return null;

  return (
    <section className="rounded-lg border border-sky-500/40 bg-sky-500/[0.07] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-sky-500/15 text-sky-500">
            <Search className="size-3.5" />
          </span>
          <p className="min-w-0 text-sm font-medium">
            {matches.length === 1
              ? "This is on your ISO list"
              : `${matches.length} matches on your ISO list`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onBulk && matches.length > 1 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 border-sky-500/40 text-sky-500 hover:bg-sky-500/10"
              onClick={() => onBulk(matches.map((m) => m.car))}
            >
              <Layers className="size-3.5" />
              Add all {matches.length} in bulk
            </Button>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 text-muted-foreground"
            onClick={onDismiss}
            aria-label="Dismiss ISO suggestions"
            title="Dismiss for this car"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <ul className="mt-2 space-y-1.5">
        {matches.map(({ car, matched }) => (
          <li
            key={car.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-background/60 px-2.5 py-1.5"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {car.name || `${car.make} ${car.model}`.trim() || "Unnamed car"}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                Matches on {matched.map((f) => FIELD_LABEL[f]).join(", ")}
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 text-sky-500 hover:bg-sky-500/10 hover:text-sky-400"
              onClick={() => onUse(car)}
            >
              Use these details
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
