import { useMemo, useState } from "react";
import { Car, Link2, Search, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCatalog } from "@/lib/catalog-store";
import { catalogueCandidates } from "@/lib/catalogue-candidates";
import type { CatalogCar } from "@/lib/catalog";
import { carSubLine } from "@/lib/car-subline";
import { inrFull } from "@/lib/format";
import type { Diecast } from "@/lib/types";

/**
 * Which casting a car is.
 *
 * Two jobs, one list: an imported row that would otherwise file a new casting
 * can be pointed at one that already exists, and a car already in the
 * collection can be moved to a different entry when it was filed against the
 * wrong one. Both are the same question — "which of these is it?" — so both get
 * the same list, ordered by how much of the car it agrees with.
 */
export function CatalogueLinkDialog({
  open,
  onClose,
  car,
  onPick,
  title = "Link to a catalogue entry",
}: {
  open: boolean;
  onClose: () => void;
  car: Diecast | null;
  onPick: (entry: CatalogCar) => void;
  title?: string;
}) {
  const { catalog } = useCatalog();
  const [query, setQuery] = useState("");

  const candidates = useMemo(
    () => (car ? catalogueCandidates(car, catalog, { query }) : []),
    [car, catalog, query],
  );

  const subLineOf = (c: CatalogCar) =>
    carSubLine({
      brand: c.brand,
      assortment: c.assortment,
      series: c.series,
      subSeries: c.sub_series,
      carNumber: c.car_number,
      caseNumber: "",
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setQuery("");
          onClose();
        }
      }}
    >
      <DialogContent className="flex max-h-[85svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg sm:p-0">
        <DialogHeader className="shrink-0 border-b border-border bg-muted/20 px-5 py-4 text-left">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <Link2 className="size-4" />
            <span>Catalogue</span>
          </div>
          <DialogTitle className="mt-1 text-base font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {car
              ? `Matched on brand, make, model, series, sub series, colour and car number for ${car.name || "this car"}.`
              : "No car selected."}
          </DialogDescription>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Or search the whole catalogue…"
              className="h-9 bg-muted/30 pl-8 text-xs"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </DialogHeader>

        {/* In the flow, not a floating panel: a positioned list gets clipped to
            nothing inside a dialog that scrolls. */}
        <div className="min-h-0 flex-1 divide-y divide-border/50 overflow-y-auto p-2">
          {candidates.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              <Car className="mx-auto mb-2 size-7 text-muted-foreground/40" />
              <p className="font-medium text-foreground">
                {query ? "Nothing matches that" : "No entry looks like this car"}
              </p>
              <p className="mt-0.5 text-xs">
                {query
                  ? "Try fewer words, or part of the name."
                  : "Search above, or let it file a new casting."}
              </p>
            </div>
          ) : (
            candidates.map(({ car: entry, agrees }) => (
              <button
                key={entry.car_id}
                type="button"
                onClick={() => {
                  onPick(entry);
                  setQuery("");
                  onClose();
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
              >
                <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted/30">
                  {entry.image_url ? (
                    <img
                      src={entry.image_url}
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <Car className="size-4 text-muted-foreground/60" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{entry.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{subLineOf(entry)}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground/80">
                    {entry.car_id}
                    {agrees.length > 0 && !query && (
                      <span className="ml-1.5 font-sans">· same {agrees.length} details</span>
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {inrFull(entry.mrp)}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-muted/20 px-4 py-3 text-right">
          <Button type="button" size="sm" variant="outline" onClick={onClose} className="text-xs">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
