import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Sparkles, Star } from "lucide-react";
import { useCars } from "@/lib/cars-store";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import { CarsTable } from "@/components/cars-table";
import { CarThumb } from "@/components/car-thumb";
import { CompactCarCard } from "@/components/compact-car-card";
import { COMPACT_GRID_COLS, GRID_COLS, ViewToggle, type ViewMode } from "@/components/view-toggle";
import { CarFormDialog } from "@/components/car-form-dialog";
import { useCarDrawer } from "@/components/car-details-drawer";
import { useRegisterExportScope } from "@/lib/export-scope";
import { SegmentControl } from "@/components/segment-control";
import { Button } from "@/components/ui/button";
import { inr, mrpRatio } from "@/lib/format";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/collection")({
  head: () => ({
    meta: [
      { title: "Collection | Tesoro" },
      {
        name: "description",
        content:
          "Explore diecast collection groups by series, set, brand, assortment, maker, seller, and size.",
      },
      { property: "og:title", content: "Collection | Tesoro" },
      {
        property: "og:description",
        content:
          "Explore diecast collection groups by series, set, brand, assortment, maker, seller, and size.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CollectionPage,
});

type GroupBy = "series" | "set" | "brand" | "assortment" | "maker" | "seller" | "size";

type SortField = "name" | "count" | "value";

const SORT_LABELS: Record<SortField, string> = {
  name: "Name",
  count: "No. of cars",
  value: "Value",
};

const GROUP_KEY: Record<GroupBy, (r: Diecast) => string> = {
  series: (r) => r.series || "—",
  set: (r) => [r.brand, r.series, r.subSeries].filter(Boolean).join(" · ") || "—",
  brand: (r) => r.brand || "—",
  assortment: (r) => [r.brand, r.assortment].filter(Boolean).join(" · ") || "—",
  maker: (r) => r.make || "—",
  seller: (r) => r.seller || "—",
  size: (r) => r.size || "—",
};

/**
 * Display titles, where they differ from the grouping key. Brand stays in the
 * key so two brands sharing a series name remain separate groups, but it is
 * dropped from the heading because it already appears as a chip underneath.
 */
const GROUP_LABEL: Partial<Record<GroupBy, (r: Diecast) => string>> = {
  set: (r) => [r.series, r.subSeries].filter(Boolean).join(" · ") || "—",
  assortment: (r) => r.assortment || "—",
};

/** Mirrors the inventory card so both pages read the same way. */
function CollectionCard({
  car,
  onOpen,
  onEdit,
}: {
  car: Diecast;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const cost = car.spent || 0;
  const market = car.mrp || cost;
  const ratio = mrpRatio(cost, car.mrp || 0);

  return (
    <article className="card-elevated flex flex-col overflow-hidden">
      <div className="relative">
        <button type="button" onClick={onOpen} className="block w-full">
          <CarThumb car={car} className="aspect-[16/10] w-full" />
        </button>

        {/* Car ID off the photograph; it belongs in the drawer and the table. */}
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

        {/* Loose/Carded stays — it is the one thing about a casting you cannot
            tell from its photograph. Type moved down into the text. */}
        <div className="pointer-events-none absolute bottom-2 left-2">
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 backdrop-blur-sm">
            {car.open ? "Loose" : "Carded"}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">{car.brand || "—"}</span>
          <span className="shrink-0 tabular-nums">
            {[car.year, car.size].filter(Boolean).join(" · ")}
          </span>
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="mt-1 text-left text-sm font-bold leading-snug hover:text-primary"
        >
          {car.name || `${car.make} ${car.model}`.trim() || "Unnamed car"}
        </button>

        <p className="mt-1 truncate text-xs text-muted-foreground">
          {[car.series, car.subSeries].filter(Boolean).join(" · ") || "—"}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {[car.status, car.type].filter(Boolean).join(" · ") || "—"}
        </p>

        <div className="mt-auto flex items-end justify-between gap-2 border-t border-border pt-2.5">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              MRP value
            </div>
            <span className="mt-0.5 inline-flex items-baseline gap-1 text-sm font-semibold tabular-nums">
              <span>{inr(market)}</span>
              {ratio && (
                <span
                  className={`inline-flex items-center text-[11px] font-medium ${
                    ratio.over ? "text-rose-400" : "text-emerald-500"
                  }`}
                >
                  (
                  {ratio.over ? (
                    <ChevronUp className="size-3" />
                  ) : (
                    <ChevronDown className="size-3" />
                  )}
                  {ratio.text})
                </span>
              )}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label="Edit"
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
        </div>
      </div>
    </article>
  );
}

function CollectionPage() {
  const { query } = useApp();
  const [group, setGroup] = useState<GroupBy>("series");
  const [selected, setSelected] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("count");
  const [dir, setDir] = useState<"desc" | "asc">("desc");
  const [view, setView] = useState<ViewMode>("table");
  const [editCar, setEditCar] = useState<Diecast | null>(null);
  const { open } = useCarDrawer();

  const cars = useCars();
  const filtered = useMemo(() => filterRows(cars, query), [cars, query]);

  const groups = useMemo(() => {
    const map = new Map<string, Diecast[]>();
    for (const r of filtered) {
      // Series and Set both describe a named run of cars, so a car that belongs
      // to neither has nothing meaningful to sit under.
      if ((group === "set" || group === "series") && !(r.series || "").trim()) continue;
      const k = GROUP_KEY[group](r);
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    }

    const built = [...map.entries()]
      .map(([name, items]) => {
        const value = items.reduce((s, r) => s + (r.spent || 0), 0);
        const statusCount = new Map<string, number>();
        for (const it of items) statusCount.set(it.status, (statusCount.get(it.status) ?? 0) + 1);
        const dominant = [...statusCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
        const brands = [...new Set(items.map((r) => r.brand).filter(Boolean))].slice(0, 3);
        const label = GROUP_LABEL[group]?.(items[0]) ?? name;
        return { name, label, items, value, dominant, brands };
      })
      // Ties fall back to the name so the order stays stable between renders
      // instead of shuffling.
      .sort((a, b) => {
        let cmp: number;
        if (sortField === "name") cmp = a.label.localeCompare(b.label);
        else if (sortField === "value") cmp = a.value - b.value;
        else cmp = a.items.length - b.items.length;

        if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
        return a.label.localeCompare(b.label);
      });

    // A "set" of one is just a car; it only reads as a set once it has company.
    return group === "set" ? built.filter((g) => g.items.length > 1) : built;
  }, [filtered, group, sortField, dir]);

  const visible = selected === "all" ? groups : groups.filter((g) => g.name === selected);

  // Export follows the group that is on screen, not the whole collection.
  const visibleCars = useMemo(() => visible.flatMap((g) => g.items), [visible]);
  useRegisterExportScope("collection", "Collection", visibleCars);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-3 md:p-6">
      <div className="card-elevated p-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-display text-xl font-semibold">Collection</h1>
            {/* No collection-wide total here: it is the sidebar's figure, where
                it can be hidden, and per-group values are still on each row. */}
            <p className="text-xs text-muted-foreground">
              {groups.length} {group} · {filtered.length.toLocaleString()} cars
            </p>
          </div>
          {/* min-w-0 so the seven-option control below can scroll instead of
              stretching this row past the edge of the card. */}
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <SegmentControl
              className="w-full md:w-auto"
              value={group}
              onChange={(v) => {
                setGroup(v);
                setSelected("all");
              }}
              options={[
                { value: "series", label: "Series" },
                { value: "set", label: "Set" },
                { value: "brand", label: "Brand" },
                { value: "assortment", label: "Assortment" },
                { value: "maker", label: "Maker" },
                { value: "seller", label: "Seller" },
                { value: "size", label: "Size" },
              ]}
            />
            <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as SortField[]).map((f) => (
                  <SelectItem key={f} value={f}>
                    Sort: {SORT_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dir} onValueChange={(v) => setDir(v as "desc" | "asc")}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Descending</SelectItem>
                <SelectItem value="asc">Ascending</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All {group}s</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.name} value={g.name}>
                    {g.label} ({g.items.length})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ViewToggle value={view} onChange={setView} />
          </div>
        </div>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {visible.map((g) => (
          <AccordionItem
            key={g.name}
            value={g.name}
            className="card-elevated border-0 px-3 md:px-4"
          >
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex w-full items-center justify-between gap-4 pr-3">
                <div className="min-w-0 text-left">
                  <div className="truncate font-medium">{g.label}</div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {g.brands.map((b) => (
                      <span
                        key={b}
                        className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-xs">
                  <span className="tabular-nums">
                    <b className="text-foreground">{g.items.length}</b>{" "}
                    <span className="text-muted-foreground">cars</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">{inr(g.value)}</span>
                  <span className="text-muted-foreground">{g.dominant}</span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {view !== "table" ? (
                <div className={`pb-3 ${view === "compact" ? COMPACT_GRID_COLS : GRID_COLS}`}>
                  {g.items.map((r, i) =>
                    view === "compact" ? (
                      <CompactCarCard key={(r.id || "") + i} car={r} onOpen={() => open(r)} />
                    ) : (
                      <CollectionCard
                        key={(r.id || "") + i}
                        car={r}
                        onOpen={() => open(r)}
                        onEdit={() => setEditCar(r)}
                      />
                    ),
                  )}
                </div>
              ) : (
                <CarsTable rows={g.items} />
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
        {visible.length === 0 && (
          <div className="card-elevated p-8 text-center text-sm text-muted-foreground">
            No groups.
          </div>
        )}
      </Accordion>

      {editCar && (
        <CarFormDialog
          open={Boolean(editCar)}
          onOpenChange={(v) => {
            if (!v) setEditCar(null);
          }}
          initial={editCar}
          mode="edit"
        />
      )}
    </div>
  );
}
