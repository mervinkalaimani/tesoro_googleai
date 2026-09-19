import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { useCars } from "@/lib/cars-store";
import { filterRows } from "@/lib/search";
import { StatusPill, CostCell, CarListCard } from "@/components/cars-table";
import { CarMarkOverlay, CarMarks, ChaseMark, FavouriteMark } from "@/components/car-marks";
import { CarThumb } from "@/components/car-thumb";
import { useCarDrawer } from "@/components/car-details-drawer";
import { CarFormDialog } from "@/components/car-form-dialog";
import { CompactCarCard } from "@/components/compact-car-card";
import { COMPACT_GRID_COLS, GRID_COLS, ViewToggle, type ViewMode } from "@/components/view-toggle";
import { useRegisterExportScope } from "@/lib/export-scope";
import { inr, mrpRatio } from "@/lib/format";
import { isPreOrder, sortCars, statusRank } from "@/lib/status-order";
import { Button } from "@/components/ui/button";
import { TopBarChips } from "@/components/page-top-bar";
import { FilterSelect, SortSelect, type SortDir } from "@/components/filter-select";
import { ExportButton } from "@/components/export-button";
import { carSubLine } from "@/lib/car-subline";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory | Tesoro" },
      {
        name: "description",
        content:
          "Browse the full diecast inventory with filters, car details, status, seller and spend.",
      },
      { property: "og:title", content: "Inventory | Tesoro" },
      {
        property: "og:description",
        content:
          "Browse the full diecast inventory with filters, car details, status, seller and spend.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // Lets the dashboard KPIs deep-link straight into a filtered inventory.
  validateSearch: (search: Record<string, unknown>): { status?: string } => {
    const status = search.status;
    return typeof status === "string" && status.trim() ? { status } : {};
  },
  component: InventoryPage,
});

function countBy(items: Diecast[], key: (r: Diecast) => string) {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function decadeOf(r: Diecast) {
  const y = Number(r.year);
  if (!Number.isFinite(y) || y < 1000) return "";
  return `${Math.floor(y / 10) * 10}s`;
}

const FILTERS = [
  { key: "brand", label: "Brand", get: (r: Diecast) => r.brand },
  { key: "type", label: "Type", get: (r: Diecast) => r.type },
  { key: "colour", label: "Colour", get: (r: Diecast) => r.colour },
  { key: "decade", label: "Decade", get: decadeOf },
  { key: "size", label: "Size", get: (r: Diecast) => r.size },
  { key: "seller", label: "Seller", get: (r: Diecast) => r.seller },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const EMPTY_FILTERS: Record<FilterKey, string> = {
  brand: "all",
  type: "all",
  colour: "all",
  decade: "all",
  size: "all",
  seller: "all",
};

type SortKey = "added" | "sno" | "value" | "cost" | "model" | "brand";

/** Each order with the direction it starts in; picking it again flips it. */
const SORT_OPTIONS: { value: SortKey; label: string; dir: SortDir }[] = [
  { value: "added", label: "Date added", dir: "desc" },
  { value: "sno", label: "Serial no", dir: "asc" },
  { value: "value", label: "Value", dir: "desc" },
  { value: "cost", label: "Cost", dir: "desc" },
  { value: "model", label: "Model", dir: "asc" },
  { value: "brand", label: "Brand", dir: "asc" },
];

const LOAD_BATCH = 50;

/**
 * What the car cost against what it lists for. Returns null when either side is
 * missing, or when the two agree — a delta of zero is noise, not information.
 */
function priceDelta(spent: number, mrp: number) {
  if (!spent || !mrp) return null;
  const diff = Math.round(spent - mrp);
  if (diff === 0) return null;
  const ratio = mrpRatio(spent, mrp);
  return {
    text: inr(Math.abs(diff)),
    over: diff > 0,
    hint: ratio ? `${ratio.text} ${ratio.over ? "over" : "under"} MRP` : undefined,
  };
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 truncate text-sm font-semibold tabular-nums ${className ?? ""}`}>
        {value}
      </div>
    </div>
  );
}

/** Spend, list price, and the gap between them. */
function PriceStrip({ car }: { car: Diecast }) {
  const spent = car.spent || 0;
  const mrp = car.mrp || 0;
  const delta = priceDelta(spent, mrp);

  return (
    <div className="flex min-w-0 items-end gap-3">
      <Metric label="Spent" value={spent ? inr(spent) : "—"} />
      <Metric label="MRP" value={mrp ? inr(mrp) : "—"} />
      {delta && (
        <div className="min-w-0" title={delta.hint}>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Delta</div>
          <div
            className={`mt-0.5 inline-flex items-center text-sm font-semibold tabular-nums ${
              delta.over ? "text-rose-400" : "text-emerald-500"
            }`}
          >
            {delta.over ? (
              <ChevronUp className="size-3.5 shrink-0" />
            ) : (
              <ChevronDown className="size-3.5 shrink-0" />
            )}
            {delta.text}
          </div>
        </div>
      )}
    </div>
  );
}

function InventoryCard({ car, onOpen }: { car: Diecast; onOpen: () => void }) {
  return (
    <article className="card-elevated flex flex-col overflow-hidden">
      <div className="relative">
        <button type="button" onClick={onOpen} className="block w-full">
          <CarThumb car={car} className="aspect-[16/10] w-full" />
        </button>

        {/* The car ID, size, assortment and type used to be pinned over the
            photograph. They are catalogue detail, not identity: four chips
            covering the car you are trying to look at, to tell you things the
            text below already says. Only chase and favourite stay — they are
            what you scan a whole page for. */}
        <CarMarkOverlay car={car} />

        {/* The pill's own colours are translucent, so it sits on an opaque
            backdrop rather than directly on the photograph. */}
        <div className="pointer-events-none absolute bottom-2 right-2">
          <span className="inline-block rounded-full bg-black/75 backdrop-blur-sm">
            <StatusPill status={car.status} />
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <button
          type="button"
          onClick={onOpen}
          className="text-left text-sm font-bold leading-snug hover:text-primary"
        >
          {car.name || `${car.make} ${car.model}`.trim() || "Unnamed car"}
        </button>

        <p className="mt-1 text-xs leading-snug text-muted-foreground">{carSubLine(car)}</p>

        {/* Where the chips taken off the image now live: readable, and not on
            top of the photograph. */}
        {[car.assortment, car.type, car.size].some(Boolean) && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
            {[car.assortment, car.type, car.size].filter(Boolean).join(" · ")}
          </p>
        )}

        {/* Edit and Delete used to sit here. Editing a car is something you do
            after looking at it, so it lives on the car itself; deleting one is
            behind that, inside the edit form. A pencil and a bin on every tile
            of a page of forty put a destructive action one mis-tap from
            scrolling. */}
        <div className="mt-auto border-t border-border pt-2.5">
          <PriceStrip car={car} />
        </div>
      </div>
    </article>
  );
}

const OTHERS_CANONICAL_ORDER = ["wrong item", "delayed", "lost"];

function getOthersRank(statusName: string): number {
  const norm = (statusName || "").trim().toLowerCase();
  const idx = OTHERS_CANONICAL_ORDER.indexOf(norm);
  if (idx !== -1) return idx;
  return OTHERS_CANONICAL_ORDER.length + statusRank(statusName);
}

function isOtherStatus(s: string | undefined | null): boolean {
  const norm = (s || "").trim().toLowerCase();
  return (
    norm !== "available" && norm !== "waiting" && !isPreOrder(s) && norm !== "po" && norm !== "iso"
  );
}

function InventoryPage() {
  const { query } = useApp();
  const data = useCars();
  const { open: openDrawer } = useCarDrawer();

  const [filters, setFilters] = useState<Record<FilterKey, string>>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<Record<FilterKey, string>>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const search = Route.useSearch();
  // Seeded from ?status= so a KPI click lands on a pre-filtered table; the
  // chips remain free to change it afterwards. Defaults to "Available".
  const [status, setStatus] = useState(search.status ?? "Available");
  const [otherSubFilter, setOtherSubFilter] = useState<string>("all_others");
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 28);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (search.status) setStatus(search.status);
  }, [search.status]);
  const [sort, setSort] = useState<SortKey>("added");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [view, setView] = useState<ViewMode>("table");
  const [chaseOnly, setChaseOnly] = useState(false);
  const [favOnly, setFavOnly] = useState(false);

  const [visibleCount, setVisibleCount] = useState(LOAD_BATCH);

  // Editing and deleting are no longer reachable from this page — a car is
  // edited from the car, and deleted from inside that edit — so the dialogs
  // that used to be hosted down here have gone with the buttons that raised
  // them.
  const [addOpen, setAddOpen] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const searched = useMemo(() => filterRows(data, query), [data, query]);

  const applyFilters = (rows: Diecast[], f: Record<FilterKey, string>, skip?: FilterKey) =>
    rows.filter((r) =>
      FILTERS.every((d) => d.key === skip || f[d.key] === "all" || d.get(r) === f[d.key]),
    );

  // Options for each dropdown reflect the other active (draft) filters
  const options = useMemo(() => {
    const out = {} as Record<FilterKey, { name: string; value: number }[]>;
    for (const d of FILTERS) {
      out[d.key] = countBy(applyFilters(searched, draft, d.key), d.get);
    }
    return out;
  }, [searched, draft]);

  // Base rows for computing status chip counts
  const baseForStatus = useMemo(() => {
    let base = applyFilters(searched, filters);
    if (chaseOnly) base = base.filter((r) => r.chase);
    if (favOnly) base = base.filter((r) => r.favourite);
    return base;
  }, [searched, filters, chaseOnly, favOnly]);

  const countAvailable = useMemo(
    () => baseForStatus.filter((r) => (r.status || "").trim().toLowerCase() === "available").length,
    [baseForStatus],
  );
  const countWaiting = useMemo(
    () => baseForStatus.filter((r) => (r.status || "").trim().toLowerCase() === "waiting").length,
    [baseForStatus],
  );
  const countPO = useMemo(
    () =>
      baseForStatus.filter(
        (r) => isPreOrder(r.status) || (r.status || "").trim().toLowerCase() === "po",
      ).length,
    [baseForStatus],
  );
  const countISO = useMemo(
    () => baseForStatus.filter((r) => (r.status || "").trim().toLowerCase() === "iso").length,
    [baseForStatus],
  );
  const countOthers = useMemo(
    () => baseForStatus.filter((r) => isOtherStatus(r.status)).length,
    [baseForStatus],
  );

  // Status chips: only show Available, Waiting, PO, ISO and others
  const statusChipsOptions = useMemo(
    () => [
      { value: "Available", label: "Available", count: countAvailable },
      { value: "Waiting", label: "Waiting", count: countWaiting },
      { value: "PO", label: "PO", count: countPO },
      { value: "ISO", label: "ISO", count: countISO },
      { value: "others", label: "Others", count: countOthers },
    ],
    [countAvailable, countWaiting, countPO, countISO, countOthers],
  );

  const rows = useMemo(() => {
    let out = applyFilters(searched, filters);
    const normStatus = (status || "").trim().toLowerCase();

    if (normStatus === "available") {
      out = out.filter((r) => (r.status || "").trim().toLowerCase() === "available");
    } else if (normStatus === "waiting") {
      out = out.filter((r) => (r.status || "").trim().toLowerCase() === "waiting");
    } else if (normStatus === "po") {
      out = out.filter(
        (r) => isPreOrder(r.status) || (r.status || "").trim().toLowerCase() === "po",
      );
    } else if (normStatus === "iso") {
      out = out.filter((r) => (r.status || "").trim().toLowerCase() === "iso");
    } else if (normStatus === "others") {
      out = out.filter((r) => isOtherStatus(r.status));
      if (otherSubFilter !== "all_others") {
        out = out.filter(
          (r) => (r.status || "").trim().toLowerCase() === otherSubFilter.trim().toLowerCase(),
        );
      }
    } else if (normStatus !== "all") {
      out = out.filter((r) => (r.status || "").toLowerCase() === normStatus);
    }

    if (chaseOnly) out = out.filter((r) => r.chase);
    if (favOnly) out = out.filter((r) => r.favourite);

    // Default order is status group, then SNO within the group — the same order
    // every other view uses.
    const sno = (r: Diecast) => (typeof r.sno === "number" ? r.sno : Number.MAX_SAFE_INTEGER);
    // "Value" is what the card labels MRP value, falling back to cost.
    const value = (r: Diecast) => r.mrp || r.spent || 0;
    const title = (r: Diecast) => (r.name || `${r.make} ${r.model}`).trim();

    // Every comparison is written ascending; descending flips it.
    const sign = sortDir === "asc" ? 1 : -1;
    switch (sort) {
      case "added":
        return [...out].sort(
          (a, b) => (sno(a) - sno(b) || (a.id || "").localeCompare(b.id || "")) * sign,
        );
      case "value":
        return [...out].sort((a, b) => (value(a) - value(b)) * sign);
      case "cost":
        return [...out].sort((a, b) => ((a.spent || 0) - (b.spent || 0)) * sign);
      case "model":
        return [...out].sort((a, b) => title(a).localeCompare(title(b)) * sign);
      case "brand":
        return [...out].sort(
          (a, b) =>
            ((a.brand || "").localeCompare(b.brand || "") || title(a).localeCompare(title(b))) *
            sign,
        );
      default: {
        // Serial no: status group first, then SNO — the app-wide default order.
        const sorted = sortCars(out);
        return sign === 1 ? sorted : sorted.reverse();
      }
    }
  }, [searched, filters, status, otherSubFilter, sort, sortDir, chaseOnly, favOnly]);

  useEffect(() => {
    setVisibleCount(LOAD_BATCH);
    window.scrollTo({ top: 0 });
  }, [query, filters, status, otherSubFilter, sort, sortDir, chaseOnly, favOnly]);

  /**
   * Loads the next batch when the foot of the list comes into view.
   */
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visibleCount >= rows.length) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((count) => Math.min(count + LOAD_BATCH, rows.length));
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visibleCount, rows.length]);

  // What the top bar's Export button acts on: exactly the filtered, sorted rows
  // on screen, not the whole collection.
  useRegisterExportScope("inventory", "Inventory", rows);

  const setDraftFilter = (key: FilterKey, v: string) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: v };
      for (const d of FILTERS) {
        if (d.key === key || next[d.key] === "all") continue;
        const still = applyFilters(searched, { ...next, [d.key]: "all" }, undefined).some(
          (r) => d.get(r) === next[d.key],
        );
        if (!still) next[d.key] = "all";
      }
      return next;
    });
  };

  const activeCount = Object.values(filters).filter((v) => v !== "all").length;
  const shown = rows.slice(0, visibleCount);

  // Grouped other statuses in canonical order: Wrong Item, Delayed, Lost, and any others
  const otherGroups = useMemo(() => {
    if (status.toLowerCase() !== "others") return [];
    const map = new Map<string, Diecast[]>();
    for (const r of shown) {
      const name = (r.status || "Other").trim();
      const existing = map.get(name) ?? [];
      existing.push(r);
      map.set(name, existing);
    }
    return [...map.entries()]
      .map(([statusName, cars]) => ({ statusName, cars }))
      .sort(
        (a, b) =>
          getOthersRank(a.statusName) - getOthersRank(b.statusName) ||
          a.statusName.localeCompare(b.statusName),
      );
  }, [status, shown]);

  const allOtherGroups = useMemo(() => {
    if (status.toLowerCase() !== "others") return [];
    const map = new Map<string, number>();
    for (const r of rows) {
      const name = (r.status || "Other").trim();
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([statusName, count]) => ({ statusName, count }))
      .sort(
        (a, b) =>
          getOthersRank(a.statusName) - getOthersRank(b.statusName) ||
          a.statusName.localeCompare(b.statusName),
      );
  }, [status, rows]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-3 p-3 md:p-6">
      {/* Page Title: scrolls away with the page. When not scrolled, buttons sit inline on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:flex-nowrap min-w-0">
        <div className="min-w-0 shrink-0">
          <h1 className="text-display truncate text-lg sm:text-xl font-semibold">Inventory</h1>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            {rows.length.toLocaleString()} cars
          </p>
        </div>

        {!isScrolled && (
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap justify-end shrink-0 ml-auto">
            <ExportButton rows={rows} name="inventory" label="Inventory" iconOnly />
            <SortSelect
              value={sort}
              dir={sortDir}
              onChange={(v, d) => {
                setSort(v);
                setSortDir(d);
              }}
              label="Sort cars"
              neutral="added"
              options={SORT_OPTIONS}
            />
            <Button
              size="sm"
              variant={activeCount ? "default" : "outline"}
              className="shrink-0 gap-1"
              onClick={() => {
                setDraft(filters);
                setFilterOpen((v) => !v);
              }}
              title={activeCount ? `Filters (${activeCount} active)` : "Filters"}
              aria-label={activeCount ? `Filters, ${activeCount} active` : "Filters"}
              aria-expanded={filterOpen}
            >
              <SlidersHorizontal className="size-4" />
              {activeCount ? <span className="tabular-nums text-xs">{activeCount}</span> : null}
            </Button>
            {(sort !== "added" || sortDir !== "desc") && (
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground hidden sm:inline-flex"
                onClick={() => {
                  setSort("added");
                  setSortDir("desc");
                }}
              >
                Reset sort
              </Button>
            )}
            <ViewToggle value={view} onChange={setView} />
          </div>
        )}
      </div>

      {/* Sticky top section: sticks at top-14 (under global TopBar). On scroll: export, sort, filter buttons move to the left, view buttons sticky, chips sticky below. */}
      <div
        className={cn(
          "sticky top-14 z-30 -mx-3 px-3 md:-mx-6 md:px-6 bg-background/95 backdrop-blur-md space-y-2 py-2 border-b border-border/40 transition-all",
          isScrolled ? "shadow-xs" : "",
        )}
      >
        {isScrolled && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <ExportButton rows={rows} name="inventory" label="Inventory" iconOnly />
              <SortSelect
                value={sort}
                dir={sortDir}
                onChange={(v, d) => {
                  setSort(v);
                  setSortDir(d);
                }}
                label="Sort cars"
                neutral="added"
                options={SORT_OPTIONS}
              />
              <Button
                size="sm"
                variant={activeCount ? "default" : "outline"}
                className="shrink-0 gap-1"
                onClick={() => {
                  setDraft(filters);
                  setFilterOpen((v) => !v);
                }}
                title={activeCount ? `Filters (${activeCount} active)` : "Filters"}
                aria-label={activeCount ? `Filters, ${activeCount} active` : "Filters"}
                aria-expanded={filterOpen}
              >
                <SlidersHorizontal className="size-4" />
                {activeCount ? <span className="tabular-nums text-xs">{activeCount}</span> : null}
              </Button>
              {(sort !== "added" || sortDir !== "desc") && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground hidden sm:inline-flex"
                  onClick={() => {
                    setSort("added");
                    setSortDir("desc");
                  }}
                >
                  Reset sort
                </Button>
              )}
            </div>
            <div className="shrink-0">
              <ViewToggle value={view} onChange={setView} />
            </div>
          </div>
        )}

        {/* Expandable filter panel */}
        {filterOpen && (
          <div className="card-elevated space-y-2.5 bg-muted/20 p-2.5 md:space-y-3 md:p-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6 md:gap-3">
              {FILTERS.map((d) => (
                <div key={d.key} className="min-w-0">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {d.label}
                  </label>
                  <select
                    value={draft[d.key]}
                    onChange={(e) => setDraftFilter(d.key, e.target.value)}
                    className="mt-0.5 h-8 w-full rounded-md border border-input bg-background px-2 text-sm md:h-9"
                  >
                    <option value="all">All</option>
                    {options[d.key].map((o) => (
                      <option key={o.name} value={o.name}>
                        {o.name} ({o.value})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setChaseOnly((v) => !v)}
                aria-pressed={chaseOnly}
                className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md border text-sm transition-colors md:h-9 ${
                  chaseOnly
                    ? "border-red-500/50 bg-red-500/10 text-red-500"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <ChaseMark className={chaseOnly ? "size-4" : "size-4 fill-none text-current"} />
                Chase only
              </button>
              <button
                type="button"
                onClick={() => setFavOnly((v) => !v)}
                aria-pressed={favOnly}
                className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md border text-sm transition-colors md:h-9 ${
                  favOnly
                    ? "border-amber-500/50 bg-amber-500/10 text-amber-500"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <FavouriteMark className={favOnly ? "size-4" : "size-4 fill-none text-current"} />
                Favourites only
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 text-xs text-muted-foreground">
                <b className="text-foreground">{rows.length.toLocaleString()}</b> of{" "}
                {searched.length.toLocaleString()}
              </p>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(EMPTY_FILTERS);
                    setFilters(EMPTY_FILTERS);
                    setChaseOnly(false);
                    setFavOnly(false);
                  }}
                >
                  Clear
                </Button>
                <Button size="sm" onClick={() => setFilters(draft)}>
                  Apply
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Sticky chips: only show Available, Waiting, PO, ISO and others */}
        <div className="space-y-1.5">
          <TopBarChips
            value={status}
            onChange={(newStatus) => {
              setStatus(newStatus);
              setOtherSubFilter("all_others");
            }}
            options={statusChipsOptions}
          />

          {/* When Others is selected: other statuses shown in groups (Wrong Item, Delayed, Lost, etc.) */}
          {status.toLowerCase() === "others" && allOtherGroups.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-none sm:flex-wrap pl-1 border-t border-border/40 pt-1.5">
              <span className="text-[11px] font-medium text-muted-foreground shrink-0 mr-1">
                Other groups:
              </span>
              <button
                type="button"
                onClick={() => setOtherSubFilter("all_others")}
                className={cn(
                  "shrink-0 text-xs px-2.5 py-0.5 rounded-full border transition-colors cursor-pointer",
                  otherSubFilter === "all_others"
                    ? "bg-primary text-primary-foreground font-semibold border-primary shadow-xs"
                    : "bg-muted/40 text-muted-foreground border-border/60 hover:text-foreground hover:bg-muted",
                )}
              >
                All Others ({countOthers})
              </button>
              {allOtherGroups.map((grp) => (
                <button
                  key={grp.statusName}
                  type="button"
                  onClick={() => setOtherSubFilter(grp.statusName)}
                  className={cn(
                    "shrink-0 text-xs px-2.5 py-0.5 rounded-full border transition-colors cursor-pointer",
                    otherSubFilter.toLowerCase() === grp.statusName.toLowerCase()
                      ? "bg-primary text-primary-foreground font-semibold border-primary shadow-xs"
                      : "bg-muted/40 text-muted-foreground border-border/60 hover:text-foreground hover:bg-muted",
                  )}
                >
                  {grp.statusName} ({grp.count})
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {view !== "table" ? (
        <>
          {status.toLowerCase() === "others" && otherSubFilter === "all_others" ? (
            <div className="space-y-6">
              {otherGroups.map((grp) => (
                <div key={grp.statusName} className="space-y-2.5">
                  <div className="flex items-center justify-between border-b border-border/60 pb-1.5 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground tracking-tight">
                        {grp.statusName}
                      </span>
                      <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                        {grp.cars.length} {grp.cars.length === 1 ? "car" : "cars"}
                      </span>
                    </div>
                  </div>
                  <div className={view === "compact" ? COMPACT_GRID_COLS : GRID_COLS}>
                    {grp.cars.map((r, i) =>
                      view === "compact" ? (
                        <CompactCarCard
                          key={(r.id || "") + i}
                          car={r}
                          onOpen={() => openDrawer(r)}
                        />
                      ) : (
                        <InventoryCard
                          key={(r.id || "") + i}
                          car={r}
                          onOpen={() => openDrawer(r)}
                        />
                      ),
                    )}
                  </div>
                </div>
              ))}
              {otherGroups.length === 0 && (
                <p className="card-elevated p-8 text-center text-sm text-muted-foreground">
                  No cars match.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className={view === "compact" ? COMPACT_GRID_COLS : GRID_COLS}>
                {shown.map((r, i) =>
                  view === "compact" ? (
                    <CompactCarCard key={(r.id || "") + i} car={r} onOpen={() => openDrawer(r)} />
                  ) : (
                    <InventoryCard key={(r.id || "") + i} car={r} onOpen={() => openDrawer(r)} />
                  ),
                )}
              </div>
              {shown.length === 0 && (
                <p className="card-elevated p-8 text-center text-sm text-muted-foreground">
                  No cars match.
                </p>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {/* Phones get the same rows as cards */}
          <div className="space-y-2 md:hidden">
            {status.toLowerCase() === "others" && otherSubFilter === "all_others"
              ? otherGroups.map((grp) => (
                  <div key={grp.statusName} className="space-y-2">
                    <div className="flex items-center justify-between border-b border-border/60 pb-1 pt-2">
                      <span className="font-semibold text-sm text-foreground">
                        {grp.statusName}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        ({grp.cars.length})
                      </span>
                    </div>
                    {grp.cars.map((r, i) => (
                      <CarListCard key={(r.id || "") + i} car={r} onOpen={() => openDrawer(r)} />
                    ))}
                  </div>
                ))
              : shown.map((r, i) => (
                  <CarListCard key={(r.id || "") + i} car={r} onOpen={() => openDrawer(r)} />
                ))}
            {shown.length === 0 && (
              <p className="card-elevated p-8 text-center text-sm text-muted-foreground">
                No cars match those filters.
              </p>
            )}
          </div>

          <div className="card-elevated hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1000px] table-fixed text-sm">
              <colgroup>
                <col className="w-[18rem]" />
                <col className="w-[7rem]" />
                <col className="w-[7rem]" />
                <col className="w-[9rem]" />
                <col className="w-[9rem]" />
                <col className="w-[8rem]" />
                <col className="w-[7rem]" />
                <col className="w-[7rem]" />
              </colgroup>
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Model</th>
                  <th className="px-3 py-2.5 font-medium">Colour</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 text-right font-medium">Cost</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Seller</th>
                  <th className="px-3 py-2.5 font-medium">Order date</th>
                  <th className="px-3 py-2.5 font-medium">Received date</th>
                </tr>
              </thead>

              <tbody>
                {status.toLowerCase() === "others" && otherSubFilter === "all_others"
                  ? otherGroups.map((grp) => (
                      <Fragment key={grp.statusName}>
                        <tr className="bg-muted/40 border-t-2 border-border/80 font-medium text-foreground">
                          <td colSpan={8} className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs uppercase tracking-wider text-foreground">
                                {grp.statusName}
                              </span>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                ({grp.cars.length} {grp.cars.length === 1 ? "car" : "cars"})
                              </span>
                            </div>
                          </td>
                        </tr>
                        {grp.cars.map((r, i) => (
                          <tr
                            key={r.id + i}
                            onClick={() => openDrawer(r)}
                            className="cursor-pointer border-t border-border/60 hover:bg-muted/30"
                          >
                            <td className="px-4 py-2.5 align-top">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-medium">{r.name || "—"}</span>
                                <CarMarks car={r} primary="chase" iconClassName="size-3.5" />
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {carSubLine(r)}
                              </div>
                            </td>
                            <td className="truncate px-3 py-2.5 align-top text-muted-foreground">
                              {r.colour || "—"}
                            </td>
                            <td className="truncate px-3 py-2.5 align-top text-muted-foreground">
                              {r.type || "—"}
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <CostCell car={r} />
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <StatusPill status={r.status} />
                            </td>
                            <td className="truncate px-3 py-2.5 align-top text-muted-foreground">
                              {r.seller || "—"}
                            </td>
                            <td className="px-3 py-2.5 align-top tabular-nums text-muted-foreground">
                              {r.orderDate || "—"}
                            </td>
                            <td className="px-3 py-2.5 align-top tabular-nums text-muted-foreground">
                              {r.date || "—"}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))
                  : shown.map((r, i) => (
                      <tr
                        key={r.id + i}
                        onClick={() => openDrawer(r)}
                        className="cursor-pointer border-t border-border/60 hover:bg-muted/30"
                      >
                        <td className="px-4 py-2.5 align-top">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-medium">{r.name || "—"}</span>
                            <CarMarks car={r} primary="chase" iconClassName="size-3.5" />
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {carSubLine(r)}
                          </div>
                        </td>
                        <td className="truncate px-3 py-2.5 align-top text-muted-foreground">
                          {r.colour || "—"}
                        </td>
                        <td className="truncate px-3 py-2.5 align-top text-muted-foreground">
                          {r.type || "—"}
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <CostCell car={r} />
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <StatusPill status={r.status} />
                        </td>
                        <td className="truncate px-3 py-2.5 align-top text-muted-foreground">
                          {r.seller || "—"}
                        </td>
                        <td className="px-3 py-2.5 align-top tabular-nums text-muted-foreground">
                          {r.orderDate || "—"}
                        </td>
                        <td className="px-3 py-2.5 align-top tabular-nums text-muted-foreground">
                          {r.date || "—"}
                        </td>
                      </tr>
                    ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-muted-foreground">
                      No cars match those filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* What "Showing 50 of 1,500 · Scroll for more" was for, without saying
          it: crossing this line loads the next batch. The count under the
          heading already says how many cars there are, and "scroll for more" is
          an instruction to do the thing you were already doing. */}
      <div ref={sentinelRef} aria-hidden className="h-px" />

      <CarFormDialog open={addOpen} onOpenChange={setAddOpen} mode="add" />
    </div>
  );
}
