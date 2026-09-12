import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Sparkles,
  Star,
} from "lucide-react";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { useCars } from "@/lib/cars-store";
import { filterRows } from "@/lib/search";
import { StatusPill, CostCell, CarListCard } from "@/components/cars-table";
import { CarThumb } from "@/components/car-thumb";
import { useCarDrawer } from "@/components/car-details-drawer";
import { CarFormDialog } from "@/components/car-form-dialog";
import { CompactCarCard } from "@/components/compact-car-card";
import { COMPACT_GRID_COLS, GRID_COLS, ViewToggle, type ViewMode } from "@/components/view-toggle";
import { useRegisterExportScope } from "@/lib/export-scope";
import { inr, mrpRatio } from "@/lib/format";
import { sortCars, statusRank } from "@/lib/status-order";
import { Button } from "@/components/ui/button";
import { SegmentControl } from "@/components/segment-control";
import { PageHeading, PageToolbar } from "@/components/page-header";
import { FilterSelect } from "@/components/filter-select";
import { ExportButton } from "@/components/export-button";

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

type SortKey =
  "sno" | "newest" | "oldest" | "valueDesc" | "valueAsc" | "costDesc" | "model" | "brand";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "sno", label: "Serial no" },
  { value: "newest", label: "Newest added" },
  { value: "oldest", label: "Oldest added" },
  { value: "valueDesc", label: "Highest value" },
  { value: "valueAsc", label: "Lowest value" },
  { value: "costDesc", label: "Highest cost" },
  { value: "model", label: "Model" },
  { value: "brand", label: "Brand" },
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
        {car.chase && (
          <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-black">
            <Sparkles className="size-3" />
            CHASE
          </span>
        )}

        {car.favourite && (
          <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/70 backdrop-blur-sm">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
          </span>
        )}

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

        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          {[car.brand, car.series, car.subSeries, car.carNumber, car.colour]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>

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

function InventoryPage() {
  const { query } = useApp();
  const data = useCars();
  const { open: openDrawer } = useCarDrawer();

  const [filters, setFilters] = useState<Record<FilterKey, string>>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<Record<FilterKey, string>>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const search = Route.useSearch();
  // Seeded from ?status= so a KPI click lands on a pre-filtered table; the
  // chips remain free to change it afterwards.
  const [status, setStatus] = useState(search.status ?? "all");

  useEffect(() => {
    if (search.status) setStatus(search.status);
  }, [search.status]);
  const [sort, setSort] = useState<SortKey>("sno");
  const [view, setView] = useState<ViewMode>("table");
  const [chaseOnly, setChaseOnly] = useState(false);
  const [favOnly, setFavOnly] = useState(false);

  const [visibleCount, setVisibleCount] = useState(LOAD_BATCH);

  // Editing and deleting are no longer reachable from this page — a car is
  // edited from the car, and deleted from inside that edit — so the dialogs
  // that used to be hosted down here have gone with the buttons that raised
  // them.
  const [addOpen, setAddOpen] = useState(false);

  const bodyRef = useRef<HTMLDivElement | null>(null);

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

  const statusOptions = useMemo(() => {
    // Filter chips follow the same canonical status order as the rows.
    const present = [...new Set(searched.map((r) => r.status).filter(Boolean))];
    present.sort((a, b) => statusRank(a) - statusRank(b) || a.localeCompare(b));
    return ["all", ...present];
  }, [searched]);

  const rows = useMemo(() => {
    let out = applyFilters(searched, filters);
    if (status !== "all") out = out.filter((r) => r.status === status);
    if (chaseOnly) out = out.filter((r) => r.chase);
    if (favOnly) out = out.filter((r) => r.favourite);
    // Default order is status group, then SNO within the group — the same order
    // every other view uses.
    const sno = (r: Diecast) => (typeof r.sno === "number" ? r.sno : Number.MAX_SAFE_INTEGER);
    // "Value" is what the card labels MRP value, falling back to cost.
    const value = (r: Diecast) => r.mrp || r.spent || 0;
    const title = (r: Diecast) => (r.name || `${r.make} ${r.model}`).trim();

    switch (sort) {
      case "newest":
        return [...out].sort((a, b) => sno(b) - sno(a));
      case "oldest":
        return [...out].sort((a, b) => sno(a) - sno(b));
      case "valueDesc":
        return [...out].sort((a, b) => value(b) - value(a));
      case "valueAsc":
        return [...out].sort((a, b) => value(a) - value(b));
      case "costDesc":
        return [...out].sort((a, b) => (b.spent || 0) - (a.spent || 0));
      case "model":
        return [...out].sort((a, b) => title(a).localeCompare(title(b)));
      case "brand":
        return [...out].sort(
          (a, b) =>
            (a.brand || "").localeCompare(b.brand || "") || title(a).localeCompare(title(b)),
        );
      default:
        // Serial no: status group first, then SNO — the app-wide default order.
        return sortCars(out);
    }
  }, [searched, filters, status, sort, chaseOnly, favOnly]);

  useEffect(() => {
    setVisibleCount(LOAD_BATCH);
    bodyRef.current?.scrollTo({ top: 0 });
  }, [query, filters, status, sort, chaseOnly, favOnly]);

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

  const loadMoreOnScroll = () => {
    const el = bodyRef.current;
    if (!el || visibleCount >= rows.length) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 160) {
      setVisibleCount((count) => Math.min(count + LOAD_BATCH, rows.length));
    }
  };

  return (
    /* The bottom nav floats over the last rows on a phone, so the card stops
       short of it rather than scrolling underneath. */
    <div className="flex h-[calc(100svh-3.5rem-5.5rem-env(safe-area-inset-bottom))] flex-col p-3 md:h-[calc(100svh-3.5rem)] md:p-6">
      <div className="card-elevated mx-auto flex w-full max-w-[1600px] min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4">
          {/* The heading is its own row rather than sharing one with the
              controls. It used to sit in a flex line beside them, and the
              status dropdown's ml-auto ate the width the title needed, so on a
              phone "Inventory" was squeezed to nothing. */}
          <PageHeading title="Inventory" subtitle={`${rows.length.toLocaleString()} cars`}>
            {/* Phones get the status as one dropdown, here beside the title.
                The chip row below is eleven segments; on a 375px screen it
                wraps to four lines and takes more of the page than the cars do.
                A dropdown is one line, and it is the filter reached for most,
                so it sits with the heading rather than below it. */}
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filter by status"
              className="h-8 max-w-[9rem] shrink-0 rounded-md border border-input bg-background px-2 text-sm md:hidden"
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All statuses" : s}
                </option>
              ))}
            </select>
          </PageHeading>

          <PageToolbar
            left={
              /* Desktop only — the phone has the dropdown beside the title.
                 There is room to spare here, and stretching ten segments across
                 1600px only makes "ISO" a button the width of a paragraph, so
                 they wrap to their text and the control ends where the labels
                 do. */
              <SegmentControl
                value={status}
                onChange={setStatus}
                className="hidden gap-0.5 md:inline-flex md:w-auto md:flex-wrap"
                options={statusOptions.map((s) => ({ value: s, label: s === "all" ? "All" : s }))}
              />
            }
            right={
              <>
                {sort !== "sno" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    onClick={() => setSort("sno")}
                  >
                    Reset sort
                  </Button>
                )}
                {/* Icon alone. The word "Filters" beside a slider icon is the
                    icon's own caption; the count is the part that says
                    something, so that is what stays. */}
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
                {/* Sorting lives here rather than in column headers so it
                    applies to the grid view too. */}
                <FilterSelect
                  value={sort}
                  onChange={(v) => setSort(v as SortKey)}
                  icon={<ArrowUpDown className="size-3.5" />}
                  label="Sort cars"
                  neutral="sno"
                  options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />
                {/* Exactly the rows on screen, filtered and sorted as they are. */}
                <ExportButton rows={rows} name="inventory" label="Inventory" iconOnly />
                <ViewToggle value={view} onChange={setView} />
              </>
            }
          />
        </div>

        {/* Inline filter row, revealed by the Filters button. It wraps on small
            screens, so there is no separate sliding panel. */}
        {filterOpen && (
          <div className="space-y-3 border-b border-border bg-muted/20 p-4">
            <div className="flex flex-wrap items-end gap-3">
              {FILTERS.map((d) => (
                <div key={d.key} className="min-w-[9rem] flex-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {d.label}
                  </label>
                  <select
                    value={draft[d.key]}
                    onChange={(e) => setDraftFilter(d.key, e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
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

              <button
                type="button"
                onClick={() => setChaseOnly((v) => !v)}
                aria-pressed={chaseOnly}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors ${
                  chaseOnly
                    ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <Sparkles className="size-4" />
                Chase only
              </button>
              <button
                type="button"
                onClick={() => setFavOnly((v) => !v)}
                aria-pressed={favOnly}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors ${
                  favOnly
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <Star className={`size-4 ${favOnly ? "fill-primary" : ""}`} />
                Favourites only
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Showing <b className="text-foreground">{rows.length.toLocaleString()}</b> of{" "}
                {searched.length.toLocaleString()} diecast models
              </p>
              <div className="flex gap-2">
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

        {view !== "table" ? (
          <div
            ref={bodyRef}
            onScroll={loadMoreOnScroll}
            className="min-h-0 flex-1 overflow-auto p-3"
          >
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
              <p className="p-8 text-center text-sm text-muted-foreground">No cars match.</p>
            )}
          </div>
        ) : (
          <div ref={bodyRef} onScroll={loadMoreOnScroll} className="min-h-0 flex-1 overflow-auto">
            {/* Phones get the same rows as cards: nine columns on a 375px screen
                is a table you read by dragging it sideways. */}
            <div className="space-y-2 p-2 md:hidden">
              {shown.map((r, i) => (
                <CarListCard key={(r.id || "") + i} car={r} onOpen={() => openDrawer(r)} />
              ))}
              {shown.length === 0 && (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  No cars match those filters.
                </p>
              )}
            </div>

            {/* The detailed view: every field, no thumbnail. Sorting lives in
                the header dropdown so it works in grid view too. */}
            {/* No Actions column. Editing a car is something you do after
                looking at one, so it is on the car; deleting is behind that,
                inside the edit form. A bin at the end of every row of a
                1,500-row table is a destructive action you can reach by
                accident. The table is 80px narrower for it. */}
            <table className="hidden w-full min-w-[1000px] table-fixed text-sm md:table">
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
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
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
                {shown.map((r, i) => (
                  <tr
                    key={r.id + i}
                    onClick={() => openDrawer(r)}
                    className="cursor-pointer border-t border-border/60 hover:bg-muted/30"
                  >
                    <td className="px-4 py-2.5 align-top">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{r.name || "—"}</span>
                        {r.chase && (
                          <span className="shrink-0 rounded-sm bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                            CHASE
                          </span>
                        )}
                        {r.favourite && (
                          <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" />
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[r.brand, r.assortment, r.series, r.subSeries, r.carNumber]
                          .filter(Boolean)
                          .join(" · ") || "—"}
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
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          <span className="text-xs text-muted-foreground">
            Showing {shown.length.toLocaleString()} of {rows.length.toLocaleString()}
          </span>
          {shown.length < rows.length && (
            <span className="text-xs text-muted-foreground">Scroll for more</span>
          )}
        </div>
      </div>

      <CarFormDialog open={addOpen} onOpenChange={setAddOpen} mode="add" />
    </div>
  );
}
