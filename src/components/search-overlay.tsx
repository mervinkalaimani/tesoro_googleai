import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouterState } from "@tanstack/react-router";
import { ArrowUpRight, Camera, Car as CarIcon, Search, SlidersHorizontal, X } from "lucide-react";

import { useApp } from "@/lib/store";
import { useCars } from "@/lib/cars-store";
import { filterRows, groupedSuggestions, parseQuery } from "@/lib/search";
import { carSubLine } from "@/lib/car-subline";
import { useCarDrawer } from "@/components/car-details-drawer";
import { ImageSearchDialog } from "@/components/image-search-dialog";
import { inrFull } from "@/lib/format";

const SEARCH_TIPS: [string, string][] = [
  ["make = toyota", "to search one field"],
  ["fav · chase · th · sth", "for marks"],
  ["+", "for “or” (red+yellow)"],
  [",", "to add another filter"],
  ["> / <", "for cost & year"],
];

/* Open/closed lives outside React so the bottom bar's button and the bar
   itself can share it without a provider. */
let isOpen = false;
let inputEl: HTMLInputElement | null = null;
const listeners = new Set<() => void>();
const setOpen = (v: boolean) => {
  if (isOpen === v) return;
  isOpen = v;
  listeners.forEach((l) => l());
};
/** Opens the bar and focuses it in the same tap, which iOS needs to raise the keyboard. */
export const openSearch = () => {
  setOpen(true);
  inputEl?.focus({ preventScroll: true });
};
export const closeSearch = () => {
  setOpen(false);
  inputEl?.blur();
};
export function useSearchOpen() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => isOpen,
    () => false,
  );
}

/** How far the on-screen keyboard pushes up from the bottom of the layout viewport. */
export function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const update = () =>
      setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);
  return active ? inset : 0;
}

const MORPH = "cubic-bezier(0.3, 1.15, 0.45, 1)";

/**
 * The phone's search field. It lives in the bottom bar, collapsed into the
 * round search button's footprint, and opens by growing leftwards out of it.
 * Search is live — the page behind filters as you type. The sliders button
 * pulls down suggestions only when asked for.
 */
export function MobileSearchBar({ onDrawerChange }: { onDrawerChange?: (open: boolean) => void }) {
  const open = useSearchOpen();
  const { query, setQuery } = useApp();
  const onUsers = useRouterState({ select: (r) => r.location.pathname === "/admin" });
  const ref = useRef<HTMLInputElement>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The drawer is portalled: the bar sits inside the bottom bar's transformed
  // layer, and a fixed element in there would be fixed to that layer instead.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    inputEl = ref.current;
    return () => {
      if (inputEl === ref.current) inputEl = null;
    };
  }, []);

  useEffect(() => {
    if (!open) setDrawerOpen(false);
  }, [open]);
  useEffect(() => onDrawerChange?.(drawerOpen), [drawerOpen, onDrawerChange]);

  // Leaving the page (a link, the Home button) puts the bar away; the filter stays.
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  useEffect(() => closeSearch(), [pathname]);

  return (
    <>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          closeSearch();
        }}
        aria-hidden={!open}
        className="pointer-events-auto relative flex h-[58px] min-w-0 flex-1 items-center gap-0.5 rounded-full border border-black/10 bg-background/85 pl-4 pr-1.5 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.4)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-background/75"
        style={{
          // Closed, only the circle at the right-hand end is uncovered — exactly
          // where the search button sits — so opening reads as that button
          // stretching out to the left.
          clipPath: open
            ? "inset(0 0 0 0 round 29px)"
            : "inset(0 0 0 calc(100% - 58px) round 29px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: open
            ? `clip-path 420ms ${MORPH}, opacity 0ms`
            : `clip-path 320ms ${MORPH}, opacity 120ms ease 260ms`,
        }}
      >
        <div
          className="flex min-w-0 flex-1 items-center gap-0.5"
          style={{
            opacity: open ? 1 : 0,
            transition: open ? "opacity 200ms ease 160ms" : "opacity 100ms ease",
          }}
        >
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <input
            ref={ref}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            tabIndex={open ? 0 : -1}
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={onUsers ? "Search users" : "Search"}
            aria-label={onUsers ? "Search users" : "Search cars"}
            className="h-full min-w-0 flex-1 bg-transparent px-2 text-base text-foreground outline-none placeholder:text-muted-foreground"
          />
          {!onUsers && (
            <>
              <button
                type="button"
                tabIndex={open ? 0 : -1}
                aria-label="Search filters and suggestions"
                aria-pressed={drawerOpen}
                // Keeps the caret (and the keyboard) in the field.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setDrawerOpen((v) => !v)}
                className={`grid size-9 shrink-0 place-items-center rounded-full transition-colors active:scale-95 ${
                  drawerOpen
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <SlidersHorizontal className="size-[18px]" />
              </button>
              <button
                type="button"
                tabIndex={open ? 0 : -1}
                aria-label="Search by image"
                onClick={() => setScanOpen(true)}
                className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
              >
                <Camera className="size-[18px]" />
              </button>
            </>
          )}
          {/* Cancel: clears the search and folds the bar back into its button.
              The search key on the keyboard closes it and keeps the filter. */}
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            aria-label="Cancel search"
            onClick={() => {
              setQuery("");
              closeSearch();
            }}
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
          >
            <X className="size-5" />
          </button>
        </div>
      </form>

      {mounted &&
        createPortal(
          <SuggestionsDrawer open={open && drawerOpen} onClose={() => setDrawerOpen(false)} />,
          document.body,
        )}
      <ImageSearchDialog open={scanOpen} onOpenChange={setScanOpen} />
    </>
  );
}

/** Suggestions, grouped by what they are — pulled down from the top on request. */
function SuggestionsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { query, setQuery } = useApp();
  const cars = useCars();
  const { open: openCar } = useCarDrawer();
  const trimmed = query.trim();

  const groups = useMemo(() => (open ? groupedSuggestions(query, cars) : []), [open, query, cars]);
  const matches = useMemo(
    () => (open && trimmed.length >= 2 ? filterRows(cars, query) : []),
    [open, trimmed, query, cars],
  );
  // A price is noise in a list of names, unless the search is about price.
  const showCost = useMemo(() => parseQuery(query).some((g) => g.field === "spent"), [query]);

  return (
    <>
      <button
        type="button"
        aria-label="Close suggestions"
        tabIndex={-1}
        onClick={onClose}
        className={`pointer-events-auto fixed inset-0 z-50 cursor-default bg-black/30 transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        className={`fixed inset-x-0 top-0 z-50 transition-transform duration-500 ease-[cubic-bezier(0.32,1.25,0.5,1)] motion-reduce:transition-none ${
          open ? "pointer-events-auto translate-y-0" : "pointer-events-none -translate-y-[110%]"
        }`}
      >
        <div className="mx-auto max-h-[calc(100dvh-7rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-b-[1.75rem] border-x border-b border-border/80 bg-background/95 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
          <div className="space-y-4">
            {matches.length > 0 && (
              <section>
                <div className="mb-1.5 flex items-baseline justify-between px-1">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Cars
                  </h2>
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    Show all {matches.length.toLocaleString()}
                  </button>
                </div>
                <ul className="overflow-hidden rounded-2xl border border-border/80 bg-card">
                  {matches.slice(0, 5).map((car) => (
                    <li key={car.id} className="border-b border-border/60 last:border-b-0">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          openCar(car);
                        }}
                        className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 active:bg-muted"
                      >
                        {car.imageUrl ? (
                          <img
                            src={car.imageUrl}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="size-10 shrink-0 rounded-lg border border-border/50 bg-muted/40 object-cover"
                          />
                        ) : (
                          <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border/50 bg-muted/60 text-muted-foreground">
                            <CarIcon className="size-4" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
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

            {groups.map((g) => (
              <section key={g.title}>
                <h2 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.title}
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {g.items.map((it) => (
                    <button
                      key={it.value}
                      type="button"
                      onClick={() => {
                        setQuery(it.query);
                        onClose();
                      }}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/80 bg-card px-3 py-1.5 text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 active:scale-[0.97]"
                    >
                      <span className="truncate">{it.value}</span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {it.count}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}

            {trimmed && matches.length === 0 && groups.length === 0 && (
              <p className="px-1 py-2 text-center text-sm text-muted-foreground">
                Nothing matches “{trimmed}”.
              </p>
            )}
            {!trimmed && (
              <p className="px-1 text-sm text-muted-foreground">
                Start typing to see matching cars and values.
              </p>
            )}

            {/* The syntax, taught rather than offered as things to tap. */}
            <ul className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border/60 px-1 pt-3 text-[11px] text-muted-foreground">
              {SEARCH_TIPS.map(([code, text]) => (
                <li key={code}>
                  Use <b className="font-semibold text-foreground">{code}</b> {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
