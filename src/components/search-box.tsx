import { useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Search, X, Camera, Filter } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { useCars } from "@/lib/cars-store";
import { useCatalog } from "@/lib/catalog-store";
import type { Diecast } from "@/lib/types";
import { useCarDrawer } from "@/components/car-details-drawer";
import { ImageSearchDialog } from "@/components/image-search-dialog";
import { SearchSuggestionsTray } from "@/components/search-suggestions-tray";

/**
 * Cycled through the empty search box one at a time. Every entry is a query the
 * parser actually accepts, so anything shown here can be typed verbatim.
 */
const PLACEHOLDER_EXAMPLES = [
  "mustang",
  "make = toyota",
  "model = supra",
  "brand = hot wheels",
  "fav",
  "chase",
  "sth",
  "car # = 1133",
  "colour = red + yellow",
  "seller = first cry",
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

/**
 * The desktop search field. Live: every keystroke filters the page behind it,
 * with no suggestion list in the way.
 */
export function SearchBox({ className }: { className?: string }) {
  const { query, setQuery } = useApp();
  const cars = useCars();
  const { open: openCar } = useCarDrawer();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const onUsers = pathname === "/admin";
  const onCatalog = pathname === "/catalog";
  const { catalog } = useCatalog();

  const catalogCars = useMemo(() => {
    if (!onCatalog) return [];
    return catalog.map(
      (c) =>
        ({
          id: c.car_id,
          name: c.name || `${c.make} ${c.model}`.trim(),
          make: c.make,
          model: c.model,
          variant: c.variant || "",
          year: c.year || "",
          colour: c.colour || "",
          type: c.type || "",
          brand: c.brand,
          assortment: c.assortment,
          series: c.series,
          subSeries: c.sub_series,
          carNumber: c.car_number,
          size: c.size || "1:64",
          mrp: c.mrp,
          spent: c.mrp,
          imageUrl: c.image_url || undefined,
          rarity: c.rarity || "Normal",
          chase: (c.rarity || "Normal") !== "Normal",
        }) as unknown as Diecast,
    );
  }, [onCatalog, catalog]);

  const activeCars = onCatalog ? catalogCars : cars;

  const [scanOpen, setScanOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { example, visible } = useRotatingExample(!query && !onUsers);

  // "/" or Ctrl/⌘+K from anywhere that is not already a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t?.closest("input, textarea, select, [contenteditable='true']");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Dismiss suggestions tray when clicking outside
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAdvancedOpen(false);
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const showTray = !onUsers && (advancedOpen || (isFocused && query.trim().length > 0));

  return (
    <div ref={containerRef} className={cn("relative max-w-2xl flex-1 md:ml-2", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={query}
        onFocus={() => setIsFocused(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsFocused(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            inputRef.current?.blur();
            setAdvancedOpen(false);
            setIsFocused(false);
          }
        }}
        // The visible hint is the animated overlay below; a real placeholder
        // would sit on top of it.
        placeholder=""
        aria-label={onUsers ? "Search users" : "Search cars"}
        className={query ? "pl-9 pr-24" : "pl-9 pr-18"}
      />
      {!query && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-9 flex items-center gap-1.5 overflow-hidden pr-20 text-sm text-muted-foreground"
        >
          <span className="shrink-0">{onUsers ? "Search users" : "Search"}</span>
          {!onUsers && (
            <span
              className="truncate transition-opacity duration-300 ease-in-out"
              style={{ opacity: visible ? 1 : 0 }}
            >
              {example}
            </span>
          )}
        </div>
      )}

      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="grid size-6 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
        {!onUsers && (
          <>
            <button
              type="button"
              aria-label="Advanced search filters and suggestions"
              title="Advanced search filters and suggestions"
              aria-pressed={advancedOpen}
              onClick={() => {
                setAdvancedOpen((v) => {
                  const next = !v;
                  if (next) inputRef.current?.focus();
                  return next;
                });
              }}
              className={cn(
                "grid size-7 cursor-pointer place-items-center rounded-md transition-colors active:scale-95",
                advancedOpen
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Filter className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Search by image"
              title="Search by image (AI attribute search) or barcode"
              onClick={() => setScanOpen(true)}
              className="grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
            >
              <Camera className="size-4" />
            </button>
          </>
        )}
      </div>

      <SearchSuggestionsTray
        open={showTray}
        query={query}
        cars={activeCars}
        onClose={() => {
          setAdvancedOpen(false);
          setIsFocused(false);
        }}
        onSelectQuery={(q) => {
          setQuery(q);
          inputRef.current?.focus();
        }}
        onSelectCar={(car) => {
          if (onCatalog) {
            setQuery(car.name || `${car.make} ${car.model}`);
          } else {
            openCar(car);
          }
          setAdvancedOpen(false);
          setIsFocused(false);
        }}
      />
      <ImageSearchDialog open={scanOpen} onOpenChange={setScanOpen} />
    </div>
  );
}
