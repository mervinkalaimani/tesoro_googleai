import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Pencil,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { useCars } from "@/lib/cars-store";
import { filterRows } from "@/lib/search";
import { StatusPill, CostCell } from "@/components/cars-table";
import { useCarDrawer } from "@/components/car-details-drawer";
import { CarFormDialog, DeleteCarDialog } from "@/components/car-form-dialog";
import { ExportDialog } from "@/components/export-dialog";
import { CAR_CSV_COLUMNS } from "@/lib/car-columns";
import { useIsMobile } from "@/hooks/use-mobile";
import { parseDMY, inr } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { SegmentControl } from "@/components/segment-control";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory | Tesoro" },
      {
        name: "description",
        content:
          "Browse and manage the full diecast inventory with filters, car details, status, seller, spend, edit, and delete actions.",
      },
      { property: "og:title", content: "Inventory | Tesoro" },
      {
        property: "og:description",
        content:
          "Browse and manage the full diecast inventory with filters, car details, status, seller, spend, edit, and delete actions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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

const STATUS_ORDER = ["Available", "Transit", "Waiting", "Delayed", "Pre Order", "ISO"];

type SortKey = "raw" | "orderDate" | "date";

const LOAD_BATCH = 50;

function InventoryPage() {
  const { query } = useApp();
  const data = useCars();
  const { open: openDrawer } = useCarDrawer();

  const [filters, setFilters] = useState<Record<FilterKey, string>>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<Record<FilterKey, string>>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const isMobile = useIsMobile();
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<SortKey>("raw");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const [visibleCount, setVisibleCount] = useState(LOAD_BATCH);

  const [addOpen, setAddOpen] = useState(false);
  const [editCar, setEditCar] = useState<Diecast | null>(null);
  const [deleteCar, setDeleteCar] = useState<Diecast | null>(null);

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
    const present = new Set(searched.map((r) => r.status).filter(Boolean));
    const ordered = STATUS_ORDER.filter((s) => present.has(s));
    const extra = [...present].filter((s) => !STATUS_ORDER.includes(s)).sort();
    return ["all", ...ordered, ...extra];
  }, [searched]);

  const rows = useMemo(() => {
    let out = applyFilters(searched, filters);
    if (status !== "all") out = out.filter((r) => r.status === status);
    if (sort !== "raw") {
      const t = (v: string) => parseDMY(v)?.getTime() ?? 0;
      out = [...out].sort((a, b) => {
        const va = sort === "orderDate" ? t(a.orderDate) : t(a.date);
        const vb = sort === "orderDate" ? t(b.orderDate) : t(b.date);
        return dir === "desc" ? vb - va : va - vb;
      });
    }
    return out;
  }, [searched, filters, status, sort, dir]);

  useEffect(() => {
    setVisibleCount(LOAD_BATCH);
    bodyRef.current?.scrollTo({ top: 0 });
  }, [query, filters, status, sort, dir]);

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

  const toggleSort = (key: Exclude<SortKey, "raw">) => {
    if (sort !== key) {
      setSort(key);
      setDir("desc");
    } else if (dir === "desc") setDir("asc");
    else {
      setSort("raw");
      setDir("desc");
    }
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
    <div className="flex h-[calc(100svh-3.5rem)] flex-col p-3 md:p-6">
      <div className="card-elevated mx-auto flex w-full max-w-[1600px] min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h1 className="text-display truncate text-xl font-semibold">Inventory</h1>
            {(() => {
              const totalCost = rows.reduce((s, r) => s + (r.spent || 0), 0);
              return (
                <p className="text-xs text-muted-foreground">
                  {rows.length.toLocaleString()} cars · Total spend: {inr(totalCost)}
                </p>
              );
            })()}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentControl
              value={status}
              onChange={setStatus}
              className="max-w-full flex-wrap"
              options={statusOptions.map((s) => ({ value: s, label: s === "all" ? "All" : s }))}
            />
            {sort !== "raw" && (
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                onClick={() => {
                  setSort("raw");
                  setDir("desc");
                }}
              >
                Reset sort
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => setExportOpen(true)}
            >
              <Download className="size-4" />
              Export
            </Button>
            <Button
              size="sm"
              variant={activeCount ? "default" : "outline"}
              className="shrink-0"
              onClick={() => {
                setDraft(filters);
                setFilterOpen(true);
              }}
            >
              <SlidersHorizontal className="size-4" />
              Filters{activeCount ? ` (${activeCount})` : ""}
            </Button>
          </div>
        </div>

        <div ref={bodyRef} onScroll={loadMoreOnScroll} className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1080px] table-fixed text-sm">
            <colgroup>
              <col className="w-[18rem]" />
              <col className="w-[7rem]" />
              <col className="w-[7rem]" />
              <col className="w-[9rem]" />
              <col className="w-[9rem]" />
              <col className="w-[8rem]" />
              <col className="w-[7rem]" />
              <col className="w-[7rem]" />
              <col className="w-[5rem]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Model</th>
                <th className="px-3 py-2.5 font-medium">Colour</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 text-right font-medium">Cost</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Seller</th>
                <th className="px-3 py-2.5 font-medium">
                  <SortHeader
                    label="Order date"
                    active={sort === "orderDate"}
                    dir={dir}
                    onClick={() => toggleSort("orderDate")}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <SortHeader
                    label="Date"
                    active={sort === "date"}
                    dir={dir}
                    onClick={() => toggleSort("date")}
                  />
                </th>
                <th className="px-3 py-2.5 text-right font-medium">Actions</th>
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
                        <span className="shrink-0 rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          CHASE
                        </span>
                      )}
                      {r.favourite && (
                        <span className="shrink-0 rounded-sm bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                          ★
                        </span>
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
                  <td className="px-3 py-2.5 align-top text-muted-foreground tabular-nums">
                    {r.orderDate || "—"}
                  </td>
                  <td className="px-3 py-2.5 align-top text-muted-foreground tabular-nums">
                    {r.date || "—"}
                  </td>
                  <td className="px-3 py-2.5 align-top" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() => setEditCar(r)}
                        aria-label="Edit"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteCar(r)}
                        aria-label="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-muted-foreground">
                    No cars match those filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          <span className="text-xs text-muted-foreground">
            Showing {shown.length.toLocaleString()} of {rows.length.toLocaleString()}
          </span>
          {shown.length < rows.length && (
            <span className="text-xs text-muted-foreground">Scroll for more</span>
          )}
        </div>
      </div>

      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className="flex w-full flex-col gap-0 p-0 sm:max-w-sm data-[side=bottom]:max-h-[85svh] data-[side=bottom]:rounded-t-2xl"
        >
          <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30 md:hidden" />
          <SheetHeader className="border-b border-border p-4">
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
            {FILTERS.map((d) => (
              <div key={d.key} className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">{d.label}</div>
                <FilterSelect
                  value={draft[d.key]}
                  onChange={(v) => setDraftFilter(d.key, v)}
                  placeholder={d.label}
                  options={options[d.key]}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button variant="outline" className="flex-1" onClick={() => setDraft(EMPTY_FILTERS)}>
              Clear
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setFilters(draft);
                setVisibleCount(LOAD_BATCH);
                setFilterOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        name="inventory"
        rows={rows}
        columns={CAR_CSV_COLUMNS}
        title="Export inventory"
      />

      <CarFormDialog open={addOpen} onOpenChange={setAddOpen} mode="add" />
      <CarFormDialog
        open={!!editCar}
        onOpenChange={(v) => {
          if (!v) setEditCar(null);
        }}
        mode="edit"
        initial={editCar}
      />
      <DeleteCarDialog
        car={deleteCar}
        open={!!deleteCar}
        onOpenChange={(v) => {
          if (!v) setDeleteCar(null);
        }}
      />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { name: string; value: number }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value="all">All {placeholder.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.name} value={o.name}>
            {o.name} ({o.value})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground ${active ? "text-foreground" : ""}`}
    >
      {label}
      {active ? (
        dir === "desc" ? (
          <ArrowDown className="size-3" />
        ) : (
          <ArrowUp className="size-3" />
        )
      ) : (
        <ArrowUpDown className="size-3 opacity-40" />
      )}
    </button>
  );
}
