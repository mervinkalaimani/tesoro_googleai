import { useMemo } from "react";
import { ArrowUpRight, Car as CarIcon, Sparkles } from "lucide-react";
import type { Diecast } from "@/lib/types";
import { filterRows, groupedSuggestions, parseQuery } from "@/lib/search";
import { carSubLine } from "@/lib/car-subline";
import { inrFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RecentSearches } from "@/components/recent-searches";
import { useCars } from "@/lib/cars-store";
import { rarityOf } from "@/lib/rarity";
import { isIso } from "@/lib/status";

const SEARCH_TIPS: [string, string][] = [
  ["make = toyota", "to search one field"],
  ["fav · chase · th · sth", "for marks"],
  ["+", "for “or” (red+yellow)"],
  [",", "to add another filter"],
  ["> / <", "for cost & year"],
];

const QUICK_MARKS = [
  { label: "Favourites", query: "fav", has: (c: Diecast) => Boolean(c.favourite) },
  { label: "Chase", query: "chase", has: (c: Diecast) => rarityOf(c) === "Chase" },
  { label: "Treasure Hunt (TH)", query: "th", has: (c: Diecast) => rarityOf(c) === "TH" },
  { label: "Super TH (STH)", query: "sth", has: (c: Diecast) => rarityOf(c) === "STH" },
];

/** How many makes and brands the shortcuts show. */
const TOP = 8;

/**
 * The shortcuts under an empty search come from your own collection, not from a fixed list: a mark
 * only if you own one, and the makes and brands you own the most of.
 */
function useCollectionShortcuts() {
  const mine = useCars();
  return useMemo(() => {
    const owned = mine.filter((c) => !isIso(c.status));
    const marks = QUICK_MARKS.map((m) => ({ ...m, n: owned.filter(m.has).length })).filter(
      (m) => m.n > 0,
    );
    const counts = new Map<string, { label: string; n: number }>();
    const add = (name: string | undefined, seen: Set<string>) => {
      const label = (name || "").trim();
      const k = label.toLowerCase();
      if (!k || k === "na" || k === "-" || seen.has(k)) return;
      seen.add(k);
      const at = counts.get(k);
      if (at) at.n += 1;
      else counts.set(k, { label, n: 1 });
    };
    // One car counts once for a name, whether the name is its make or its brand.
    for (const c of owned) {
      const seen = new Set<string>();
      add(c.make, seen);
      add(c.brand, seen);
    }
    const top = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, TOP);
    return { marks, top };
  }, [mine]);
}

export function SearchSuggestionsTray({
  open,
  query,
  cars,
  onClose,
  onSelectQuery,
  onSelectCar,
  className,
}: {
  open: boolean;
  query: string;
  cars: Diecast[];
  onClose: () => void;
  onSelectQuery: (q: string) => void;
  onSelectCar: (car: Diecast) => void;
  className?: string;
}) {
  const trimmed = query.trim();
  const { marks, top } = useCollectionShortcuts();

  const groups = useMemo(() => (open ? groupedSuggestions(query, cars) : []), [open, query, cars]);
  const matches = useMemo(
    () => (open && trimmed.length >= 1 ? filterRows(cars, query) : []),
    [open, trimmed, query, cars],
  );
  const showCost = useMemo(() => parseQuery(query).some((g) => g.field === "spent"), [query]);

  if (!open) return null;

  return (
    <div
      role="listbox"
      aria-label="Search suggestions"
      className={cn(
        "absolute left-0 right-0 top-full z-50 mt-1.5 max-h-[min(500px,70vh)] overflow-y-auto overscroll-contain rounded-2xl border border-border/80 bg-background/98 p-3 shadow-2xl backdrop-blur-xl transition-all duration-150 scrollbar-thin",
        className,
      )}
      onMouseDown={(e) => {
        // Prevent input blur when clicking inside the tray
        e.preventDefault();
      }}
    >
      <div className="space-y-3.5">
        {/* Matching cars */}
        {matches.length > 0 && (
          <section>
            <div className="mb-1.5 flex items-baseline justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Matching Cars ({matches.length.toLocaleString()})
              </span>
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-medium text-primary hover:underline"
              >
                View all in list
              </button>
            </div>
            <ul className="overflow-hidden rounded-xl border border-border/70 bg-card">
              {matches.slice(0, 5).map((car) => (
                <li key={car.id} className="border-b border-border/50 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSelectCar(car);
                    }}
                    className="group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60 active:bg-muted"
                  >
                    {car.imageUrl ? (
                      <img
                        src={car.imageUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        decoding="async"
                        className="size-9 shrink-0 rounded-md border border-border/50 bg-muted/40 object-cover"
                      />
                    ) : (
                      <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border/50 bg-muted/60 text-muted-foreground">
                        <CarIcon className="size-4" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-foreground sm:text-sm">
                        {car.name || `${car.make} ${car.model}`.trim() || "Unnamed car"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {carSubLine(car)}
                      </span>
                    </span>
                    {showCost && car.spent ? (
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                        {inrFull(car.spent)}
                      </span>
                    ) : null}
                    <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/60 group-hover:text-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Dynamic Groups from groupedSuggestions */}
        {groups.map((g) => (
          <section key={g.title}>
            <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {g.title}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {g.items.map((it) => (
                <button
                  key={it.value}
                  type="button"
                  onClick={() => {
                    onSelectQuery(it.query);
                  }}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/80 bg-card px-2.5 py-1 text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 active:scale-[0.97]"
                >
                  <span className="truncate">{it.value}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{it.count}</span>
                </button>
              ))}
            </div>
          </section>
        ))}

        {/* Quick filters when query is empty or short */}
        {!trimmed && (
          <div className="space-y-3">
            <RecentSearches onPick={onSelectQuery} />

            {marks.length > 0 && (
              <section>
                <div className="mb-1.5 flex items-center gap-1 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Sparkles className="size-3 text-primary" />
                  <span>Quick Filters</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {marks.map((m) => (
                    <button
                      key={m.query}
                      type="button"
                      onClick={() => onSelectQuery(m.query)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-2.5 py-1 text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 active:scale-95"
                    >
                      <span>{m.label}</span>
                      <span className="tabular-nums text-muted-foreground">{m.n}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {top.length > 0 && (
              <section>
                <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Your Top Makes & Brands
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {top.map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => onSelectQuery(t.label)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-2.5 py-1 text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 active:scale-95"
                    >
                      <span>{t.label}</span>
                      <span className="tabular-nums text-muted-foreground">{t.n}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Empty matching notice */}
        {trimmed && matches.length === 0 && groups.length === 0 && (
          <p className="px-1 py-3 text-center text-xs text-muted-foreground">
            No cars or categories match “{trimmed}”.
          </p>
        )}

        {/* Search Syntax & Tips */}
        <div className="border-t border-border/60 px-1 pt-2.5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
            Search Syntax Tips
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {SEARCH_TIPS.map(([code, text]) => (
              <li key={code}>
                <b className="font-semibold text-foreground">{code}</b> {text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
