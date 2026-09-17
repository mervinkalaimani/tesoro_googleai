import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Pencil, Plus, SlidersHorizontal, Store } from "lucide-react";
import { toast } from "sonner";

import { useCatalog } from "@/lib/catalog-store";
import { useCars } from "@/lib/cars-store";
import { useApp } from "@/lib/store";
import { useAuth } from "@/lib/auth-store";
import type { CatalogCar, ReleaseStatus } from "@/lib/catalog";
import { resolveCatalogUserId, loadUserHandles } from "@/lib/catalog";
import type { CatalogueCar } from "@/lib/catalogue-search";
import { generateCatalogCarId } from "@/lib/car-id";
import { carSubLine } from "@/lib/car-subline";
import { inr, formatDayMonthYear } from "@/lib/format";
import type { Diecast } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RARITIES } from "@/lib/rarity";
import { PageHeading, PageToolbar } from "@/components/page-header";
import { SegmentControl } from "@/components/segment-control";
import { ViewToggle, GRID_COLS, COMPACT_GRID_COLS, type ViewMode } from "@/components/view-toggle";
import { CompactCarCard } from "@/components/compact-car-card";
import { CarThumb } from "@/components/car-thumb";
import { CarFormDialog } from "@/components/car-form-dialog";
import { CatalogCarDetails } from "@/components/car-details-drawer";
import { CatalogFormDialog } from "@/components/catalog-form-dialog";
import { parseQuery, matchesQuery } from "@/lib/search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/catalog")({
  head: () => ({
    meta: [
      { title: "Catalog | Tesoro" },
      {
        name: "description",
        content: "Browse every casting in the catalogue and add one to your collection.",
      },
      { property: "og:title", content: "Catalog | Tesoro" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CatalogPage,
});

type Segment = "all" | "released" | "preorder";

const FILTERS = [
  { key: "make", label: "Make", get: (c: CatalogCar) => c.make },
  { key: "model", label: "Model", get: (c: CatalogCar) => c.model },
  { key: "variant", label: "Variant", get: (c: CatalogCar) => c.variant || "" },
  { key: "year", label: "Year", get: (c: CatalogCar) => (c.year || "").replace(/\.0+$/, "") },
  { key: "colour", label: "Colour", get: (c: CatalogCar) => c.colour || "" },
  { key: "brand", label: "Brand", get: (c: CatalogCar) => c.brand },
  { key: "assortment", label: "Assortment", get: (c: CatalogCar) => c.assortment },
  { key: "series", label: "Series", get: (c: CatalogCar) => c.series || "" },
  { key: "subSeries", label: "Sub-series", get: (c: CatalogCar) => c.sub_series || "" },
  { key: "rarity", label: "Rarity", get: (c: CatalogCar) => c.rarity || "Normal" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];
type Filters = Record<FilterKey, string>;

const NO_FILTERS: Filters = {
  make: "all",
  model: "all",
  variant: "all",
  year: "all",
  colour: "all",
  brand: "all",
  assortment: "all",
  series: "all",
  subSeries: "all",
  rarity: "all",
};

/** How many cards go on the page at a time; more load as the end comes into view. */
const LOAD_BATCH = 60;

const isPreOrder = (c: CatalogCar) => c.release_status === "Pre Order";

/** A catalogue entry shaped as a car, for the cards and thumbnails. The price shown is the MRP. */
function asCar(c: CatalogCar): Diecast {
  return {
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
  } as unknown as Diecast;
}

/** Everything the catalogue knows, for the Add a car form. */
function toPrefill(c: CatalogCar): CatalogueCar {
  return {
    name: c.name || `${c.make} ${c.model}`.trim(),
    make: c.make,
    model: c.model,
    variant: c.variant || "",
    year: (c.year || "").replace(/\.0+$/, ""),
    colour: c.colour || "",
    type: c.type || "",
    brand: c.brand,
    assortment: c.assortment,
    series: c.series,
    subSeries: c.sub_series,
    carNumber: c.car_number,
    size: c.size || "1:64",
    rarity: c.rarity || "Normal",
    chase: (c.rarity || "Normal") !== "Normal",
    mrp: c.mrp,
    imageUrl: c.image_url || undefined,
  };
}

/**
 * Every casting in the shared catalogue, for anyone to browse and add to their
 * own collection with its details already filled in. Admins can also correct an
 * entry — which corrects it in every collection that has the car.
 */
function CatalogPage() {
  const { catalog, isLoading, addCatalogCar, updateCatalogCar } = useCatalog();
  const { isAdmin, isGuest } = useAuth();
  const { query } = useApp();
  const mine = useCars();

  const [segment, setSegment] = useState<Segment>("all");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [hideOwned, setHideOwned] = useState(false);
  const [view, setView] = useState<ViewMode>("grid");
  const [adding, setAdding] = useState<CatalogCar | null>(null);
  /** The entry whose details are open. */
  const [viewing, setViewing] = useState<CatalogCar | null>(null);
  const [editing, setEditing] = useState<CatalogCar | "new" | null>(null);
  const [visible, setVisible] = useState(LOAD_BATCH);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadUserHandles();
  }, []);

  const owned = useMemo(() => new Set(mine.map((c) => (c.id || "").toUpperCase())), [mine]);

  // Segment and the top bar's search first; the filter options come from what is left.
  const searched = useMemo(() => {
    const q = query.trim();
    if (!q) {
      return catalog.filter((c) => {
        if (segment === "released" && isPreOrder(c)) return false;
        if (segment === "preorder" && !isPreOrder(c)) return false;
        return true;
      });
    }

    const groups = parseQuery(q);
    return catalog.filter((c) => {
      if (segment === "released" && isPreOrder(c)) return false;
      if (segment === "preorder" && !isPreOrder(c)) return false;
      return matchesQuery(asCar(c), groups);
    });
  }, [catalog, segment, query]);

  const matches = (c: CatalogCar, f: Filters, skip?: FilterKey) =>
    FILTERS.every((d) => d.key === skip || f[d.key] === "all" || d.get(c) === f[d.key]);

  const rows = useMemo(() => {
    let result = searched.filter((c) => matches(c, filters));
    if (hideOwned) {
      result = result.filter((c) => !owned.has(c.car_id.toUpperCase()));
    }
    return result.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [searched, filters, hideOwned, owned]);

  /** Each filter's choices, narrowed by the other filters, with counts. */
  const options = useMemo(() => {
    const out = {} as Record<FilterKey, { value: string; count: number }[]>;
    for (const d of FILTERS) {
      const counts = new Map<string, number>();
      for (const c of searched) {
        if (hideOwned && owned.has(c.car_id.toUpperCase())) continue;
        if (!matches(c, filters, d.key)) continue;
        const v = d.get(c).trim();
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      out[d.key] = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));
    }
    return out;
  }, [searched, filters, hideOwned, owned]);

  const activeCount =
    Object.values(filters).filter((v) => v !== "all").length + (hideOwned ? 1 : 0);

  useEffect(() => setVisible(LOAD_BATCH), [segment, filters, hideOwned, query]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || visible >= rows.length) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible((n) => Math.min(n + LOAD_BATCH, rows.length));
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, rows.length]);

  const shown = rows.slice(0, visible);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-3 md:p-6">
      <PageHeading
        title="Catalog"
        subtitle={`${rows.length.toLocaleString()} casting${rows.length === 1 ? "" : "s"} · tap one to add it to your collection`}
      >
        {isAdmin && (
          <Button size="sm" className="gap-1.5" onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            New casting
          </Button>
        )}
      </PageHeading>

      <PageToolbar
        sticky
        oneLine
        left={
          <SegmentControl
            value={segment}
            onChange={setSegment}
            className="w-auto max-sm:text-[11px] max-sm:[&>button]:px-2 max-sm:[&>button]:py-0.5"
            options={[
              { value: "all", label: "All" },
              { value: "released", label: "Released" },
              { value: "preorder", label: "Pre Order" },
            ]}
          />
        }
        right={
          <>
            <Button
              size="sm"
              variant={activeCount ? "default" : "outline"}
              className="shrink-0 gap-1"
              onClick={() => setFilterOpen((v) => !v)}
              aria-expanded={filterOpen}
              aria-label={activeCount ? `Filters, ${activeCount} active` : "Filters"}
              title="Filters"
            >
              <SlidersHorizontal className="size-4" />
              {activeCount ? <span className="text-xs tabular-nums">{activeCount}</span> : null}
            </Button>
            <ViewToggle value={view} onChange={setView} modes={["grid", "compact"]} />
          </>
        }
      />

      {filterOpen && (
        <div className="card-elevated space-y-2.5 bg-muted/20 p-2.5 md:space-y-3 md:p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10 md:gap-2">
            {FILTERS.map((d) => (
              <div key={d.key} className="min-w-0">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground truncate block">
                  {d.label}
                </label>
                <select
                  value={filters[d.key]}
                  onChange={(e) => setFilters((f) => ({ ...f, [d.key]: e.target.value }))}
                  className="mt-0.5 h-8 w-full min-w-0 rounded-md border border-input bg-background px-1.5 text-xs sm:px-2 sm:text-sm md:h-9 truncate"
                >
                  <option value="all">All</option>
                  {options[d.key].map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.value} ({o.count})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/60">
            <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideOwned}
                onChange={(e) => setHideOwned(e.target.checked)}
                className="size-4 rounded border-input text-primary accent-primary focus:ring-primary/20 cursor-pointer"
              />
              <span>Hide owned cars</span>
            </label>

            <div className="flex items-center gap-3">
              <p className="text-xs text-muted-foreground">
                <b className="text-foreground">{rows.length.toLocaleString()}</b> of{" "}
                {searched.length.toLocaleString()}
              </p>
              <Button
                size="sm"
                variant="ghost"
                disabled={!activeCount}
                onClick={() => {
                  setFilters(NO_FILTERS);
                  setHideOwned(false);
                }}
              >
                Clear filters
              </Button>
            </div>
          </div>
        </div>
      )}

      {isLoading && catalog.length === 0 ? (
        <div className="grid place-items-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="card-elevated p-8 text-center text-sm text-muted-foreground">
          {segment === "preorder" ? "Nothing open to pre-order matches." : "No castings match."}
        </div>
      ) : view === "compact" ? (
        // Three across on a phone rather than the shared two.
        <div className={cn(COMPACT_GRID_COLS, "max-sm:grid-cols-3")}>
          {shown.map((c) => (
            <CompactCarCard
              key={c.car_id}
              car={asCar(c)}
              onOpen={() => setViewing(c)}
              caption={
                owned.has(c.car_id.toUpperCase())
                  ? "Owned"
                  : isPreOrder(c)
                    ? "Pre Order"
                    : undefined
              }
            />
          ))}
        </div>
      ) : (
        // Two across on a phone rather than one full-width card per row.
        <div className={cn(GRID_COLS, "max-sm:grid-cols-2 max-sm:gap-2")}>
          {shown.map((c) => (
            <CatalogCard
              key={c.car_id}
              c={c}
              owned={owned.has(c.car_id.toUpperCase())}
              onOpen={() => setViewing(c)}
              onAdd={() => setAdding(c)}
              onEdit={isAdmin ? () => setEditing(c) : undefined}
            />
          ))}
        </div>
      )}
      {visible < rows.length && <div ref={sentinel} className="h-8" />}

      <CatalogCarDetails
        car={viewing ? asCar(viewing) : null}
        catalogCar={viewing}
        preOrder={viewing ? isPreOrder(viewing) : false}
        expectedDate={viewing?.expected_date}
        owned={viewing ? owned.has(viewing.car_id.toUpperCase()) : false}
        onClose={() => setViewing(null)}
        canEdit={isAdmin && !isGuest}
        onEdit={() => {
          const target = viewing;
          setViewing(null);
          setEditing(target);
        }}
        onAdd={() => {
          setAdding(viewing);
          setViewing(null);
        }}
      />
      <CarFormDialog
        open={adding !== null}
        onOpenChange={(v) => !v && setAdding(null)}
        mode="add"
        prefill={adding ? toPrefill(adding) : null}
        prefillStatus={adding && isPreOrder(adding) ? "Pre Order" : "Waiting"}
      />
      {isAdmin && !isGuest && (
        <CatalogFormDialog
          open={editing !== null}
          entry={editing}
          catalog={catalog}
          onClose={() => setEditing(null)}
          onSave={async (car) => {
            if (editing === "new") {
              return await addCatalogCar(car);
            } else {
              return await updateCatalogCar(car);
            }
          }}
        />
      )}
    </div>
  );
}

function CatalogCard({
  c,
  owned,
  onOpen,
  onAdd,
  onEdit,
}: {
  c: CatalogCar;
  owned: boolean;
  onOpen: () => void;
  onAdd: () => void;
  onEdit?: () => void;
}) {
  const car = asCar(c);

  return (
    <article className="card-elevated flex flex-col overflow-hidden">
      <button type="button" onClick={onOpen} className="relative block w-full">
        <CarThumb car={car} className="aspect-[16/10] w-full" />
        {isPreOrder(c) && (
          <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-amber-400 backdrop-blur-sm">
            Pre Order
          </span>
        )}
        {owned && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 backdrop-blur-sm">
            <Check className="size-3" /> Owned
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col p-3">
        <button
          type="button"
          onClick={onOpen}
          className="text-left text-sm font-bold leading-snug hover:text-primary"
        >
          {car.name}
        </button>
        <p className="mt-1 truncate text-xs text-muted-foreground">{carSubLine(car)}</p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">MRP</div>
            <div className="text-sm font-semibold tabular-nums">{c.mrp ? inr(c.mrp) : "—"}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {onEdit && (
              <Button
                size="icon"
                variant="outline"
                className="size-8"
                onClick={onEdit}
                aria-label={`Edit ${car.name} in the catalogue`}
                title="Edit catalogue entry"
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
            <Button size="sm" className="gap-1.5" onClick={onAdd}>
              <Plus className="size-3.5" />
              Add
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
