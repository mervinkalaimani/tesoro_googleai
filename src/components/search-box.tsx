import { useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Search, X, Camera, Car as CarIcon, ArrowUpRight } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useApp } from "@/lib/store";
import { useCars } from "@/lib/cars-store";
import { suggestFor } from "@/lib/search";
import { useCarDrawer } from "@/components/car-details-drawer";
import { ImageSearchDialog } from "@/components/image-search-dialog";
import { inrFull } from "@/lib/format";
import type { Diecast } from "@/lib/types";

/**
 * Cycled through the empty search box one at a time. Every entry is a query the
 * parser actually accepts, so anything shown here can be typed verbatim.
 */
const PLACEHOLDER_EXAMPLES = [
  "mustang",
  "make = toyota",
  "model = supra",
  "brand = hot wheels",
  "manufacturer = mini gt",
  "car # = 1133",
  "colour = red",
  "seller = first cry",
  "colour = red + yellow",
  "cost > 500",
  "year < 2000",
];

const HOLD_MS = 2200;
const FADE_MS = 350;

/** Rotates the example, fading out before the swap and back in after it. */
function useRotatingExample(enabled: boolean) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    // Someone who asked the OS for less motion gets a single steady example.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let swap = 0;
    const cycle = window.setInterval(() => {
      setVisible(false);
      swap = window.setTimeout(() => {
        setIndex((n) => (n + 1) % PLACEHOLDER_EXAMPLES.length);
        setVisible(true);
      }, FADE_MS);
    }, HOLD_MS + FADE_MS);

    return () => {
      window.clearInterval(cycle);
      window.clearTimeout(swap);
    };
  }, [enabled]);

  return { example: PLACEHOLDER_EXAMPLES[index], visible };
}

/** Replace the segment after the last comma with `insert`. */
function applySuggestion(query: string, insert: string, kind: "field" | "value") {
  const idx = query.lastIndexOf(",");
  const head = idx >= 0 ? query.slice(0, idx + 1) + " " : "";
  const seg = idx >= 0 ? query.slice(idx + 1) : query;

  if (kind === "field") return head + insert;

  // Keep any "field = " prefix and previous "+" values in the segment
  const eq = seg.match(/^(\s*[A-Za-z#][A-Za-z0-9\s_#.-]*?\s*(?:=|:)\s*)(.*)$/);
  const prefix = eq ? eq[1].trimStart() : "";
  const rest = eq ? eq[2] : seg.trimStart();
  const plus = rest.lastIndexOf("+");
  const kept = plus >= 0 ? rest.slice(0, plus + 1) : "";
  return head + prefix + kept + insert;
}

export function SearchBox({
  autoFocus = false,
  className,
}: {
  autoFocus?: boolean;
  className?: string;
}) {
  const { query, setQuery } = useApp();
  // On the Users page this box searches accounts: that page filters by the
  // same query, and car suggestions and photo search mean nothing there.
  const onUsers = useRouterState({ select: (r) => r.location.pathname === "/admin" });
  const cars = useCars();
  const { open: openCar } = useCarDrawer();
  const [open, setOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * Set when focus is being restored by something that is not a request to
   * search — clearing the box. Without it the caret lands back in the input,
   * onFocus fires, and the suggestion list the X just dismissed reopens.
   */
  const skipFocusOpen = useRef(false);
  const isMobile = useIsMobile();
  // Too little room on a phone for a rotating example to read as anything but
  // noise, so the hint stays a plain "Search" there.
  const { example, visible } = useRotatingExample(!query && !isMobile && !onUsers);

  const fragment = useMemo(() => {
    const idx = query.lastIndexOf(",");
    return idx >= 0 ? query.slice(idx + 1) : query;
  }, [query]);

  const matchingCars = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return cars
      .filter((c) => {
        const name = (c.name || "").toLowerCase();
        const model = (c.model || "").toLowerCase();
        const make = (c.make || "").toLowerCase();
        const brand = (c.brand || "").toLowerCase();
        const id = (c.id || "").toLowerCase();
        const carNum = (c.carNumber || "").toLowerCase();
        const series = (c.series || "").toLowerCase();
        const subSeries = (c.subSeries || "").toLowerCase();
        return (
          name.includes(q) ||
          model.includes(q) ||
          make.includes(q) ||
          brand.includes(q) ||
          id.includes(q) ||
          carNum.includes(q) ||
          series.includes(q) ||
          subSeries.includes(q)
        );
      })
      .slice(0, 5);
  }, [cars, query]);

  const suggestions = useMemo(
    () => (open ? suggestFor(fragment, cars).slice(0, 8) : []),
    [open, fragment, cars],
  );

  useEffect(() => setActive(0), [fragment]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const choose = (i: number) => {
    const s = suggestions[i];
    if (!s) return;
    setQuery(applySuggestion(query, s.insert, s.kind));
    inputRef.current?.focus();
  };

  return (
    // The left margin separated this from the sidebar trigger, which is
    // desktop-only now — so on a phone it was 8px of nothing against the
    // header's own padding, leaving more room on the left of the bar than on
    // the right. It goes when the button it was spacing away from does.
    <div ref={wrapRef} className={cn("relative max-w-2xl flex-1 md:ml-2", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        autoFocus={autoFocus}
        value={query}
        onFocus={() => {
          if (skipFocusOpen.current) {
            skipFocusOpen.current = false;
            return;
          }
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (onUsers || !open || suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(active);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        // The visible hint is the animated overlay below; a real placeholder
        // would sit on top of it.
        placeholder=""
        aria-label={onUsers ? "Search users" : "Search cars"}
        className={query ? "pl-9 pr-16" : "pl-9 pr-10"}
      />
      {!query && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-9 flex items-center gap-1.5 overflow-hidden pr-10 text-sm text-muted-foreground"
        >
          <span className="shrink-0">{onUsers ? "Search users" : "Search"}</span>
          {!isMobile && !onUsers && (
            <span
              className="truncate transition-opacity duration-300 ease-in-out"
              style={{ opacity: visible ? 1 : 0 }}
            >
              {example}
            </span>
          )}
        </div>
      )}

      {/* Right controls: Clear button + Scan button */}
      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setOpen(false);
              // The caret goes back in the box, the suggestions stay shut.
              skipFocusOpen.current = true;
              inputRef.current?.focus();
            }}
            className="grid size-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        )}
        {!onUsers && (
          <button
            type="button"
            aria-label="Search by image"
            title="Search by image (AI attribute search) or barcode"
            onClick={() => setScanOpen(true)}
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer active:scale-95"
          >
            <Camera className="size-4" />
          </button>
        )}
      </div>

      {open && !onUsers && (matchingCars.length > 0 || suggestions.length > 0) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-xl">
          {matchingCars.length > 0 && (
            <div className="border-b border-border/70 p-1 bg-muted/10">
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Cars in collection ({matchingCars.length})
              </div>
              <div className="space-y-0.5">
                {matchingCars.map((car) => (
                  <button
                    key={car.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOpen(false);
                      openCar(car);
                    }}
                    className="flex w-full items-center justify-between gap-2.5 rounded px-2.5 py-1.5 text-left transition-colors hover:bg-muted cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {car.imageUrl ? (
                        <img
                          src={car.imageUrl}
                          alt={car.name || car.model}
                          referrerPolicy="no-referrer"
                          className="size-8 rounded object-cover border border-border/50 shrink-0 bg-muted/40"
                        />
                      ) : (
                        <div className="size-8 rounded bg-muted/60 border border-border/50 flex items-center justify-center shrink-0 text-muted-foreground">
                          <CarIcon className="size-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <span className="group-hover:text-primary transition-colors">
                            {car.name || `${car.make} ${car.model}`}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {car.id}
                          </span>
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {[car.brand, car.assortment, car.series].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {car.spent ? (
                        <span className="text-xs font-semibold tabular-nums text-foreground">
                          {inrFull(car.spent)}
                        </span>
                      ) : null}
                      <ArrowUpRight className="size-3.5 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {suggestions.length > 0 && (
            <div>
              <ul className="max-h-56 overflow-y-auto py-1 text-sm">
                {suggestions.map((s, i) => (
                  <li key={s.kind + s.label}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(i)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left cursor-pointer ${
                        i === active ? "bg-muted" : ""
                      }`}
                    >
                      <span className="truncate">{s.label}</span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {s.hint}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
                Use <b>+</b> for “or” (red+yellow) · <b>,</b> to add another filter · <b>&gt;</b> /{" "}
                <b>&lt;</b> for cost &amp; year
              </div>
            </div>
          )}
        </div>
      )}

      <ImageSearchDialog open={scanOpen} onOpenChange={setScanOpen} />
    </div>
  );
}
