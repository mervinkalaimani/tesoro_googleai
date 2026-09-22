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
import { sortCars } from "@/lib/status-order";
import { STATUSES, normaliseStatus } from "@/lib/status";
import { groupCopies } from "@/lib/copies";
import { CopiesBadge } from "@/components/copies-badge";
import { Button } from "@/components/ui/button";
import { SegmentControl } from "@/components/segment-control";
import { FilterSelect, SortSelect, type SortDir } from "@/components/filter-select";
import { ExportButton } from "@/components/export-button";
import { carSubLine } from "@/lib/car-subline";
import { toDateInputValue } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "My Cars | Tesoro" },
      {
        name: "description",
        content: "Browse your diecast cars with filters, car details, status, seller and spend.",
      },
      { property: "og:title", content: "My Cars | Tesoro" },
      {
        property: "og:description",
        content: "Browse your diecast cars with filters, car details, status, seller and spend.",
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
function PriceStrip({ car, spentOverride }: { car: Diecast; spentOverride?: number }) {
  // The group total when this tile stands for several copies: what six
  // McQueens cost, not what the newest one cost. The MRP delta goes quiet with
  // it, since one copy is MRP against six copies is spend is not a comparison.
  const spent = spentOverride ?? car.spent ?? 0;
  const mrp = spentOverride === undefined ? car.mrp || 0 : 0;
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

function InventoryCard({
  car,
  onOpen,
  copies = 1,
  copiesTotal,
  expanded = false,
  onToggleCopies,
}: {
  car: Diecast;
  onOpen: () => void;
  /** How many copies of this casting this tile stands for. 1 hides the mark. */
  copies?: number;
  /** What all the copies cost together, shown in place of this one is spend. */
  copiesTotal?: number;
  expanded?: boolean;
  onToggleCopies?: () => void;
}) {
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

        {copies > 1 && (
          <div className="mt-1">
            <CopiesBadge n={copies} expanded={expanded} onToggle={onToggleCopies} />
          </div>
        )}

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
          <PriceStrip car={car} spentOverride={copies > 1 ? copiesTotal : undefined} />
        </div>
      </div>
    </article>
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
  const [status, setStatus] = useState(search.status ?? "In Hand");
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

  /**
   * One chip per status, plus All.
   *
   * There used to be six, one of which was "Others" — a bucket holding Wrong
   * Item, Delayed and Lost behind a second dropdown. All three of those are
   * gone, so the bucket and its sub-filter went with them.
   */
  const statusSegmentOptions = useMemo(
    () => [{ value: "all", label: "All" }, ...STATUSES.map((s) => ({ value: s, label: s }))],
    [],
  );

  const rows = useMemo(() => {
    let out = applyFilters(searched, filters);

    // A deep link from a home tile, or an old bookmark still saying
    // `?status=Available`, both arrive here and both normalise to the same chip.
    const want = normaliseStatus(status);
    if (want && want.toLowerCase() !== "all") {
      out = out.filter((r) => normaliseStatus(r.status) === want);
    }

    if (chaseOnly) out = out.filter((r) => r.chase);
    if (favOnly) out = out.filter((r) => r.favourite);

    // Default order is status group, then SNO within the group — the same order
    // every other view uses.
    const sno = (r: Diecast) => (typeof r.sno === "number" ? r.sno : Number.MAX_SAFE_INTEGER);
    // "Value" is what the card labels MRP value, falling back to cost.
    const value = (r: Diecast) => r.mrp || r.spent || 0;
    const title = (r: Diecast) => (r.name || `${r.make} ${r.model}`).trim();

    // Most relevant chronological date for the car (order date, received date, or ETA)
    const getCarDate = (r: Diecast): string => {
      const o = toDateInputValue(r.orderDate);
      const d = toDateInputValue(r.date);
      if (o && d) return o > d ? o : d;
      return o || d || toDateInputValue(r.expectedDate) || "";
    };

    // Every comparison is written ascending; descending flips it.
    const sign = sortDir === "asc" ? 1 : -1;
    switch (sort) {
      case "added":
        return [...out].sort((a, b) => {
          const dateA = getCarDate(a);
          const dateB = getCarDate(b);
          if (dateA !== dateB) {
            if (dateA && dateB) {
              return dateA.localeCompare(dateB) * sign;
            }
            return (dateA ? 1 : -1) * sign;
          }
          const snoDiff = sno(a) - sno(b);
          if (snoDiff !== 0) {
            return snoDiff * sign;
          }
          return (a.id || "").localeCompare(b.id || "") * sign;
        });
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
  }, [searched, filters, status, sort, sortDir, chaseOnly, favOnly]);

  /**
   * One row per casting, not per copy.
   *
   * 92 castings in the collection are owned more than once, 214 rows between
   * them — six lines of Lightning McQueen reads as a filing error rather than
   * as six real purchases. The newest copy stands for the group and carries
   * the count; the rest open underneath when the badge is tapped.
   *
   * Grouping runs on `rows`, which is already filtered and sorted, so the
   * count always describes what you are looking at and the order is whatever
   * the lead copy sorted to.
   */
  const groups = useMemo(() => groupCopies(rows), [rows]);

  /** Which castings are opened out. Reset whenever the list underneath changes. */
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  /**
   * The flat list the three views render, and what each row should say about
   * its group. Expanded copies follow their lead and carry no badge of their
   * own — the group is already open, so a second "6×" on each of the six would
   * be noise.
   */
  const display = useMemo(() => {
    const out: { car: Diecast; n: number; total: number; lead: boolean }[] = [];
    for (const g of groups) {
      out.push({ car: g.lead, n: g.n, total: g.total, lead: true });
      if (g.n > 1 && expanded.has(g.lead.id)) {
        for (const c of g.copies.slice(1))
          out.push({ car: c, n: 1, total: c.spent || 0, lead: false });
      }
    }
    return out;
  }, [groups, expanded]);

  useEffect(() => {
    setVisibleCount(LOAD_BATCH);
    setExpanded(new Set());
    window.scrollTo({ top: 0 });
  }, [query, filters, status, sort, sortDir, chaseOnly, favOnly]);

  /**
   * Loads the next batch when the foot of the list comes into view.
   */
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visibleCount >= display.length) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((count) => Math.min(count + LOAD_BATCH, display.length));
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visibleCount, display.length]);

  // What the top bar's Export button acts on: exactly the filtered, sorted rows
  // on screen, not the whole collection.
  useRegisterExportScope("inventory", "My Cars", rows);

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

  /**
   * Castings and cars are two different numbers once copies are collapsed, and
   * saying only one of them makes the list look like it is hiding rows.
   */
  const countCaption =
    groups.length === rows.length
      ? `${rows.length.toLocaleString()} cars`
      : `${groups.length.toLocaleString()} castings · ${rows.length.toLocaleString()} cars`;
  const shown = display.slice(0, visibleCount);

  return (
    <div className="mx-auto max-w-[1600px] space-y-3 p-3 md:p-6">
      {/* Page title */}
      <div className="flex items-baseline justify-between gap-2 pb-0.5">
        <div>
          <h1 className="text-display text-xl sm:text-2xl font-semibold tracking-tight">My Cars</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{countCaption}</p>
        </div>
      </div>

      {/* Filter & Actions section below title */}
      <div
        className={cn(
          "sticky top-14 z-30 -mx-3 px-3 md:-mx-6 md:px-6 bg-background/95 backdrop-blur-md space-y-2 py-2 border-b border-border/40 transition-shadow",
          isScrolled ? "shadow-xs" : "",
        )}
      >
        {/* Main controls: Status segment control on top (web only), icon buttons beside views */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 min-w-0">
          {/* Status segment control: on web (md:), this is on the top/left */}
          <div className="order-2 md:order-1 flex items-center min-w-0 overflow-x-auto no-scrollbar">
            <SegmentControl
              value={status}
              onChange={setStatus}
              options={statusSegmentOptions}
              className="w-auto"
            />
          </div>

          {/* Action icon buttons & Views: export, sort, and filter as icon buttons beside views */}
          <div className="order-1 md:order-2 flex items-center justify-between md:justify-end gap-1.5 sm:gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <Button
                size="icon"
                variant={activeCount ? "default" : "outline"}
                className="size-8 relative shrink-0"
                onClick={() => {
                  setDraft(filters);
                  setFilterOpen((v) => !v);
                }}
                title={activeCount ? `Filters (${activeCount} active)` : "Filters"}
                aria-label={activeCount ? `Filters, ${activeCount} active` : "Filters"}
                aria-expanded={filterOpen}
              >
                <SlidersHorizontal className="size-3.5 shrink-0" />
                {activeCount ? (
                  <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold leading-none">
                    {activeCount}
                  </span>
                ) : null}
              </Button>

              <SortSelect
                value={sort}
                dir={sortDir}
                onChange={(v, d) => {
                  setSort(v);
                  setSortDir(d);
                }}
                label="Sort cars"
                triggerLabel="Sort"
                neutral="added"
                options={SORT_OPTIONS}
                iconOnly={true}
                className="size-8 justify-center"
              />

              <ExportButton
                rows={rows}
                name="my-cars"
                label="My Cars"
                iconOnly={true}
                className="size-8 p-0 justify-center"
              />

              {(sort !== "added" || sortDir !== "desc") && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground hidden lg:inline-flex"
                  onClick={() => {
                    setSort("added");
                    setSortDir("desc");
                  }}
                >
                  Reset
                </Button>
              )}
            </div>

            <div className="shrink-0">
              <ViewToggle value={view} onChange={setView} />
            </div>
          </div>
        </div>

        {/* Expandable filter section */}
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
                <b className="text-foreground">{groups.length.toLocaleString()}</b> of{" "}
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
      </div>

      {view !== "table" ? (
        <>
          <div className={view === "compact" ? COMPACT_GRID_COLS : GRID_COLS}>
            {shown.map(({ car: r, n, total, lead }, i) =>
              view === "compact" ? (
                <CompactCarCard
                  key={(r.id || "") + i}
                  car={r}
                  copies={lead ? n : 1}
                  copiesExpanded={expanded.has(r.id)}
                  onToggleCopies={() => toggleExpanded(r.id)}
                  onOpen={() => openDrawer(r)}
                />
              ) : (
                <InventoryCard
                  key={(r.id || "") + i}
                  car={r}
                  copies={lead ? n : 1}
                  copiesTotal={total}
                  expanded={expanded.has(r.id)}
                  onToggleCopies={() => toggleExpanded(r.id)}
                  onOpen={() => openDrawer(r)}
                />
              ),
            )}
          </div>
          {shown.length === 0 && (
            <p className="card-elevated p-8 text-center text-sm text-muted-foreground">
              No cars match.
            </p>
          )}
        </>
      ) : (
        <>
          {/* Phones get the same rows as cards */}
          <div className="space-y-2 md:hidden">
            {shown.map(({ car: r, n, lead }, i) => (
              <CarListCard
                key={(r.id || "") + i}
                car={r}
                copies={lead ? n : 1}
                copiesExpanded={expanded.has(r.id)}
                onToggleCopies={() => toggleExpanded(r.id)}
                onOpen={() => openDrawer(r)}
              />
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
                {shown.map(({ car: r, n, total, lead }, i) => (
                  <tr
                    key={r.id + i}
                    onClick={() => openDrawer(r)}
                    className={cn(
                      "cursor-pointer border-t border-border/60 hover:bg-muted/30",
                      // An opened-out copy is indented under the row it belongs
                      // to, so a group still reads as one thing.
                      !lead && "bg-muted/20",
                    )}
                  >
                    <td className={cn("px-4 py-2.5 align-top", !lead && "pl-9")}>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{r.name || "—"}</span>
                        <CarMarks car={r} primary="chase" iconClassName="size-3.5" />
                        {lead && (
                          <CopiesBadge
                            n={n}
                            expanded={expanded.has(r.id)}
                            onToggle={() => toggleExpanded(r.id)}
                          />
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{carSubLine(r)}</div>
                    </td>
                    <td className="truncate px-3 py-2.5 align-top text-muted-foreground">
                      {r.colour || "—"}
                    </td>
                    <td className="truncate px-3 py-2.5 align-top text-muted-foreground">
                      {r.type || "—"}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {/* The group's total, not the lead copy's own spend: six
                          McQueens cost ₹3,562.58, and the newest one's ₹600 is
                          not what this line is worth. */}
                      <CostCell car={r} spentOverride={lead && n > 1 ? total : undefined} />
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
