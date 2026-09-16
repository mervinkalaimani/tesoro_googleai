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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const { catalog, isLoading } = useCatalog();
  const { isAdmin, isGuest } = useAuth();
  const { query } = useApp();
  const mine = useCars();

  const [segment, setSegment] = useState<Segment>("all");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
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
    const q = query.trim().toLowerCase();
    return catalog.filter((c) => {
      if (segment === "released" && isPreOrder(c)) return false;
      if (segment === "preorder" && !isPreOrder(c)) return false;
      if (!q) return true;
      return [
        c.name,
        c.brand,
        c.make,
        c.model,
        c.variant,
        c.year,
        c.colour,
        c.assortment,
        c.series,
        c.sub_series,
        c.car_number,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [catalog, segment, query]);

  const matches = (c: CatalogCar, f: Filters, skip?: FilterKey) =>
    FILTERS.every((d) => d.key === skip || f[d.key] === "all" || d.get(c) === f[d.key]);

  const rows = useMemo(
    () =>
      searched
        .filter((c) => matches(c, filters))
        .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [searched, filters],
  );

  /** Each filter's choices, narrowed by the other filters, with counts. */
  const options = useMemo(() => {
    const out = {} as Record<FilterKey, { value: string; count: number }[]>;
    for (const d of FILTERS) {
      const counts = new Map<string, number>();
      for (const c of searched) {
        if (!matches(c, filters, d.key)) continue;
        const v = d.get(c).trim();
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      out[d.key] = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));
    }
    return out;
  }, [searched, filters]);

  const activeCount = Object.values(filters).filter((v) => v !== "all").length;

  useEffect(() => setVisible(LOAD_BATCH), [segment, filters, query]);

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
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-8 md:gap-3">
            {FILTERS.map((d) => (
              <div key={d.key} className="min-w-0">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {d.label}
                </label>
                <select
                  value={filters[d.key]}
                  onChange={(e) => setFilters((f) => ({ ...f, [d.key]: e.target.value }))}
                  className="mt-0.5 h-8 w-full min-w-0 rounded-md border border-input bg-background px-1.5 text-xs sm:px-2 sm:text-sm md:h-9"
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
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              <b className="text-foreground">{rows.length.toLocaleString()}</b> of{" "}
              {searched.length.toLocaleString()}
            </p>
            <Button
              size="sm"
              variant="ghost"
              disabled={!activeCount}
              onClick={() => setFilters(NO_FILTERS)}
            >
              Clear filters
            </Button>
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
        <CatalogEntryDialog entry={editing} onClose={() => setEditing(null)} />
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

const ENTRY_FIELDS: { key: keyof CatalogCar; label: string; required?: boolean }[] = [
  { key: "brand", label: "Brand", required: true },
  { key: "make", label: "Make", required: true },
  { key: "model", label: "Model", required: true },
  { key: "variant", label: "Variant" },
  { key: "year", label: "Year" },
  { key: "colour", label: "Colour" },
  { key: "type", label: "Type" },
  { key: "assortment", label: "Assortment", required: true },
  { key: "series", label: "Series" },
  { key: "sub_series", label: "Sub series" },
  { key: "car_number", label: "Car number" },
  { key: "size", label: "Size" },
  { key: "name", label: "Name" },
  { key: "image_url", label: "Image URL" },
];

/**
 * Admin only: add a casting, or correct one. Saving a correction rewrites the
 * matching car in every collection — the database does that, not this dialog.
 */
function CatalogEntryDialog({
  entry,
  onClose,
}: {
  entry: CatalogCar | "new" | null;
  onClose: () => void;
}) {
  const { catalog, addCatalogCar, updateCatalogCar } = useCatalog();
  const isNew = entry === "new";
  const [form, setForm] = useState<CatalogCar | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!entry) return setForm(null);
    setForm(
      entry === "new"
        ? {
            car_id: "",
            brand: "",
            make: "",
            model: "",
            assortment: "",
            series: "",
            sub_series: "",
            car_number: "",
            mrp: 0,
            name: "",
            size: "1:64",
            release_status: "Released",
            rarity: "Normal",
            expected_date: null,
          }
        : { ...entry, release_status: entry.release_status ?? "Released" },
    );
    setSaving(false);
  }, [entry]);

  if (!entry || !form) return null;

  const set = <K extends keyof CatalogCar>(k: K, v: CatalogCar[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));
  const missing = ENTRY_FIELDS.find((f) => f.required && !String(form[f.key] ?? "").trim());

  const save = async () => {
    if (missing) return;
    setSaving(true);
    const car: CatalogCar = {
      ...form,
      // A new entry is keyed like every other; an existing one keeps its key, so
      // the cars already linked to it stay linked.
      car_id: isNew
        ? generateCatalogCarId({
            brand: form.brand,
            make: form.make,
            model: form.model,
            assortment: form.assortment,
            series: form.series,
            subSeries: form.sub_series,
            carNumber: form.car_number,
            mrp: form.mrp,
          })
        : form.car_id,
      name: form.name.trim() || `${form.make} ${form.model}`.trim(),
    };
    if (isNew && catalog.some((c) => c.car_id.toUpperCase() === car.car_id.toUpperCase())) {
      setSaving(false);
      toast.error("That casting is already in the catalogue", { description: car.car_id });
      return;
    }
    const ok = isNew ? await addCatalogCar(car) : await updateCatalogCar(car);
    setSaving(false);
    if (ok) {
      toast.success(isNew ? "Added to the catalogue" : "Catalogue entry updated", {
        description: isNew ? car.name : "Every collection with this car now shows the change.",
      });
      onClose();
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="size-4 text-primary" />
            {isNew ? "New casting" : "Edit catalogue entry"}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? "Added to the shared catalogue for everyone to browse."
              : "Changes are written into this car in every collection that has it. Owners can still edit their own copy afterwards."}
          </DialogDescription>
        </DialogHeader>

        {!isNew && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <div>
              <span className="text-muted-foreground/75">Added by:</span>{" "}
              <span className="font-semibold text-foreground">
                {resolveCatalogUserId(entry.created_by)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground/75">Added on:</span>{" "}
              <span className="font-semibold text-foreground">
                {formatDayMonthYear(entry.created_at) || "—"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground/75">Last updated:</span>{" "}
              <span className="font-semibold text-foreground">
                {formatDayMonthYear(entry.updated_at) ||
                  formatDayMonthYear(entry.created_at) ||
                  "—"}
              </span>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Release</Label>
            <SegmentControl<ReleaseStatus>
              value={form.release_status ?? "Released"}
              onChange={(v) => set("release_status", v)}
              options={[
                { value: "Released", label: "Released" },
                { value: "Pre Order", label: "Pre Order" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Rarity</Label>
            <SegmentControl<string>
              value={form.rarity || "Normal"}
              onChange={(v) => set("rarity", v)}
              options={RARITIES.map((r) => ({ value: r, label: r }))}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {form.release_status === "Pre Order" && (
              <div className="space-y-1">
                <Label className="text-xs">Expected date</Label>
                <Input
                  type="date"
                  value={form.expected_date || ""}
                  onChange={(e) => set("expected_date", e.target.value || null)}
                  className="h-9"
                />
              </div>
            )}
            {ENTRY_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs">
                  {f.label}
                  {f.required ? " *" : ""}
                </Label>
                <Input
                  value={String(form[f.key] ?? "")}
                  onChange={(e) => set(f.key, e.target.value as never)}
                  className="h-9"
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs">MRP (₹) *</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={form.mrp || ""}
                onChange={(e) => set("mrp", Number(e.target.value) || 0)}
                className="h-9"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2 flex flex-row items-center justify-between gap-2 border-t border-border pt-3 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={saving}
            className="text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void save()}
            disabled={saving || Boolean(missing)}
            className="gap-1.5"
            title={missing ? `${missing.label} is required` : undefined}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            {isNew ? "Add casting" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
