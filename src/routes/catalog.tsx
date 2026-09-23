import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  Check,
  Filter,
  Layers,
  Loader2,
  Merge,
  Package,
  Pencil,
  Plus,
  Store,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { useCatalog } from "@/lib/catalog-store";
import { useCars } from "@/lib/cars-store";
import { useApp } from "@/lib/store";
import { useAuth } from "@/lib/auth-store";
import type { CatalogCar, ReleaseStatus } from "@/lib/catalog";
import {
  catalogEntryUsage,
  resolveCatalogUserId,
  resolveCatalogUserFirstName,
  loadUserHandles,
} from "@/lib/catalog";
import type { CatalogueCar } from "@/lib/catalogue-search";
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
import { MergeDuplicatesDialog } from "@/components/merge-duplicates-dialog";
import { isCarMatchingCatalog, catalogCarToCatalogueCar } from "@/lib/catalog";
import { parseQuery, matchesQuery } from "@/lib/search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

/**
 * How the list is ordered. Tapping the chosen one again turns it round, which
 * is why direction is not a control of its own — there is nothing to set it to
 * until you have said what you are ordering by.
 */
type SortKey = "added" | "sno" | "brand" | "make" | "year";
type Sort = { key: SortKey; dir: "asc" | "desc" };

const SORTS: { value: SortKey; label: string }[] = [
  { value: "added", label: "Date added" },
  { value: "sno", label: "S.No" },
  { value: "brand", label: "Brand" },
  { value: "make", label: "Make" },
  { value: "year", label: "Year" },
];

/**
 * What the list is broken into. "Set" is the three fields that together name a
 * release — Hot Wheels · Car Culture · Japanese Classics — which is how a
 * collector talks about what they are missing, and no single column holds it.
 */
type GroupKey = "none" | "brand" | "make" | "series" | "set" | "added_by";

const GROUPS: { value: GroupKey; label: string }[] = [
  { value: "none", label: "No grouping" },
  { value: "brand", label: "Group by brand" },
  { value: "make", label: "Group by make" },
  { value: "series", label: "Group by series" },
  { value: "set", label: "Group by set" },
  { value: "added_by", label: "Group by added by" },
];

const clean = (v: string | null | undefined) => (v ?? "").trim();
/** Year as it is filed: the sheet import left some as "2024.0". */
const yearOf = (c: CatalogCar) => clean(c.year).replace(/\.0+$/, "");

/** What a casting is filed under, for the chosen grouping. */
function groupLabel(c: CatalogCar, by: GroupKey): string {
  if (by === "brand") return clean(c.brand) || "No brand";
  if (by === "make") return clean(c.make) || "No make";
  if (by === "series") return clean(c.series) || "No series";
  if (by === "set") {
    const parts = [c.brand, c.series, c.sub_series].map(clean).filter(Boolean);
    return parts.length ? parts.join(" · ") : "No set";
  }
  if (by === "added_by") {
    return resolveCatalogUserFirstName(c.created_by) || "Unknown";
  }
  return "";
}

const cmpText = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

function compareBy(a: CatalogCar, b: CatalogCar, sort: Sort, serials: Map<string, number>) {
  const flip = sort.dir === "desc" ? -1 : 1;
  if (sort.key === "added") {
    const da = clean(a.created_at);
    const db = clean(b.created_at);
    if (da !== db) {
      if (da && db) return flip * da.localeCompare(db);
      return flip * (da ? 1 : -1);
    }
    return flip * ((serials.get(a.car_id) ?? 0) - (serials.get(b.car_id) ?? 0));
  }
  if (sort.key === "sno") {
    return flip * ((serials.get(a.car_id) ?? 0) - (serials.get(b.car_id) ?? 0));
  }

  const av = sort.key === "year" ? yearOf(a) : clean(a[sort.key]);
  const bv = sort.key === "year" ? yearOf(b) : clean(b[sort.key]);

  // An entry with the field blank goes last whichever way round the rest is:
  // "unknown" is not early in the alphabet, it is simply not an answer.
  if (!av && !bv) return cmpText(clean(a.name), clean(b.name));
  if (!av) return 1;
  if (!bv) return -1;

  const primary = cmpText(av, bv);
  return primary ? flip * primary : cmpText(clean(a.name), clean(b.name));
}

/** How many cards go on the page at a time; more load as the end comes into view. */
const LOAD_BATCH = 60;

const isPreOrder = (c: CatalogCar) => c.release_status === "Pre Order";

/** How many cars a box holds, for the badge that says it is one. */
const packLabel = (c: CatalogCar) => {
  const n = Number(c.pack_size) || 0;
  return n > 1 ? `${n} CARS` : "PACK";
};

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

/**
 * Every casting in the shared catalogue, for anyone to browse and add to their
 * own collection with its details already filled in. Admins can also correct an
 * entry — which corrects it in every collection that has the car.
 */
function CatalogPage() {
  const {
    catalog,
    isLoading,
    addCatalogCar,
    updateCatalogCar,
    deleteCatalogCar,
    packMembers,
    refreshCatalog,
  } = useCatalog();
  const { isAdmin, isOwner, isGuest } = useAuth();
  const { query } = useApp();
  const mine = useCars();

  const [segment, setSegment] = useState<Segment>("all");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [hideOwned, setHideOwned] = useState(false);
  /**
   * On by default: once a box is in the catalogue, its five cars are listed
   * twice over — as the box and as themselves — and the box is the thing you
   * buy. Turn it off to see the castings individually.
   */
  const [hideInPacks, setHideInPacks] = useState(true);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<Filters>(NO_FILTERS);
  const [draftHideInPacks, setDraftHideInPacks] = useState(true);

  /** Every casting that sits inside some box, by car_id. */
  const inSomePack = useMemo(() => {
    const out = new Set<string>();
    for (const ids of Object.values(packMembers)) {
      for (const id of ids) out.add(id.trim().toUpperCase());
    }
    return out;
  }, [packMembers]);
  const [sort, setSort] = useState<Sort>({ key: "added", dir: "desc" });
  const [group, setGroup] = useState<GroupKey>("none");
  const [view, setView] = useState<ViewMode>("grid");
  const [adding, setAdding] = useState<CatalogCar | null>(null);
  /** The entry whose details are open. */
  const [viewing, setViewing] = useState<CatalogCar | null>(null);
  const [editing, setEditing] = useState<CatalogCar | "new" | null>(null);
  const [merging, setMerging] = useState(false);
  /** Owner only: the entry being removed, with the confirm open over it. */
  const [deleting, setDeleting] = useState<CatalogCar | null>(null);
  const [visible, setVisible] = useState(LOAD_BATCH);
  const sentinel = useRef<HTMLDivElement>(null);

  /**
   * The catalogue's own numbering: oldest entry is 1.
   *
   * Taken over the whole catalogue rather than the filtered list, so an entry
   * keeps its number whatever is being looked at — a serial that renumbered
   * itself every time a filter changed would not be one. car_id breaks a tie
   * between two filed in the same instant, which the seed import did in bulk.
   */
  const serials = useMemo(() => {
    const order = [...catalog].sort(
      (a, b) =>
        clean(a.created_at).localeCompare(clean(b.created_at)) || a.car_id.localeCompare(b.car_id),
    );
    const out = new Map<string, number>();
    order.forEach((c, i) => out.set(c.car_id, i + 1));
    return out;
  }, [catalog]);

  /** Tapping the column you are already sorted by turns it round. */
  const sortBy = (key: SortKey) =>
    setSort((s) => ({
      key,
      dir: s.key === key ? (s.dir === "asc" ? "desc" : "asc") : key === "added" ? "desc" : "asc",
    }));

  const [, setHandlesLoaded] = useState(0);
  useEffect(() => {
    loadUserHandles().then(() => setHandlesLoaded((n) => n + 1));
  }, []);

  /**
   * A car is owned when one of yours points at that catalogue entry.
   *
   * Its Catalog ID is the answer whenever it names an entry that exists, which
   * today is every row in the database. Matching on the description is the
   * fallback for a row whose ID names nothing — an import, or an entry that has
   * since been renumbered — and it is offered only those rows now. Run against
   * every car it marked a casting owned because some *other* car of yours looked
   * like it, which is how one white Supra reported three of them.
   */
  const owned = useMemo(() => {
    const known = new Set(catalog.map((c) => c.car_id.toUpperCase()));
    const set = new Set<string>();
    const unresolved: typeof mine = [];
    for (const c of mine) {
      const id = (c.catalogId || "").trim().toUpperCase();
      if (id && known.has(id)) set.add(id);
      else unresolved.push(c);
    }
    if (unresolved.length > 0) {
      for (const cat of catalog) {
        const id = cat.car_id.toUpperCase();
        if (set.has(id)) continue;
        if (unresolved.some((m) => isCarMatchingCatalog(m, cat))) set.add(id);
      }
    }
    return set;
  }, [mine, catalog]);

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
    if (hideInPacks) {
      result = result.filter((c) => !inSomePack.has(c.car_id.toUpperCase()));
    }
    return result.sort((a, b) => compareBy(a, b, sort, serials));
  }, [searched, filters, hideOwned, hideInPacks, inSomePack, owned, sort, serials]);

  /** Each filter's choices, narrowed by the other filters, with counts. */
  const options = useMemo(() => {
    const out = {} as Record<FilterKey, { value: string; count: number }[]>;
    for (const d of FILTERS) {
      const counts = new Map<string, number>();
      for (const c of searched) {
        if (hideOwned && owned.has(c.car_id.toUpperCase())) continue;
        if (hideInPacks && inSomePack.has(c.car_id.toUpperCase())) continue;
        if (!matches(c, filters, d.key)) continue;
        const v = d.get(c).trim();
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      out[d.key] = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));
    }
    return out;
  }, [searched, filters, hideOwned, hideInPacks, inSomePack, owned]);

  // Hide owned is a toolbar toggle of its own now, so it no longer counts
  // towards the badge on the Filters button. Hide cars in multipacks is on by
  // default, so it only counts when turned off.
  const activeCount =
    Object.values(filters).filter((v) => v !== "all").length + (hideInPacks ? 0 : 1);

  const openFilterModal = () => {
    setDraftFilters(filters);
    setDraftHideInPacks(hideInPacks);
    setFilterModalOpen(true);
  };

  const handleClearFilters = () => {
    setDraftFilters(NO_FILTERS);
    setDraftHideInPacks(true);
  };

  const handleApplyFilters = () => {
    setFilters(draftFilters);
    setHideInPacks(draftHideInPacks);
    setFilterModalOpen(false);
  };

  const draftActiveCount =
    Object.values(draftFilters).filter((v) => v !== "all").length + (draftHideInPacks ? 0 : 1);

  const draftOptions = useMemo(() => {
    const out = {} as Record<FilterKey, { value: string; count: number }[]>;
    for (const d of FILTERS) {
      const counts = new Map<string, number>();
      for (const c of searched) {
        if (hideOwned && owned.has(c.car_id.toUpperCase())) continue;
        if (draftHideInPacks && inSomePack.has(c.car_id.toUpperCase())) continue;
        if (!matches(c, draftFilters, d.key)) continue;
        const v = d.get(c).trim();
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      out[d.key] = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));
    }
    return out;
  }, [searched, draftFilters, hideOwned, draftHideInPacks, inSomePack, owned]);

  // Reordering is as much a new list as refiltering is: sixty rows into a
  // different order are sixty different rows.
  useEffect(
    () => setVisible(LOAD_BATCH),
    [segment, filters, hideOwned, hideInPacks, query, sort, group],
  );

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

  /**
   * The loaded rows broken into their groups.
   *
   * Grouped after the slice, not before: the page loads sixty at a time and a
   * group has to be built from what is actually on screen, or scrolling would
   * keep reopening sections above you. They come out in sort order, because
   * that is the order their first member appeared in.
   */
  const sections = useMemo(() => {
    if (group === "none") return [{ label: "", rows: shown }];
    const out: { label: string; rows: CatalogCar[] }[] = [];
    const seen = new Map<string, number>();
    for (const c of shown) {
      const label = groupLabel(c, group);
      const at = seen.get(label);
      if (at === undefined) {
        seen.set(label, out.length);
        out.push({ label, rows: [c] });
      } else {
        out[at].rows.push(c);
      }
    }
    return out;
  }, [shown, group]);

  const renderRows = (list: CatalogCar[]) =>
    view === "compact" ? (
      // Three across on a phone rather than the shared two.
      <div className={cn(COMPACT_GRID_COLS, "max-sm:grid-cols-3")}>
        {list.map((c) => (
          <CompactCarCard
            key={c.car_id}
            car={asCar(c)}
            onOpen={() => setViewing(c)}
            caption={owned.has(c.car_id.toUpperCase()) ? "Owned" : isPreOrder(c) ? "PO" : undefined}
          />
        ))}
      </div>
    ) : view === "table" ? (
      <CatalogTable
        rows={list}
        serials={serials}
        owned={owned}
        onOpen={setViewing}
        onAdd={setAdding}
        onEdit={isAdmin ? setEditing : undefined}
      />
    ) : (
      // Two across on a phone rather than one full-width card per row.
      <div className={cn(GRID_COLS, "max-sm:grid-cols-2 max-sm:gap-2")}>
        {list.map((c) => (
          <CatalogCard
            key={c.car_id}
            c={c}
            owned={owned.has(c.car_id.toUpperCase())}
            onOpen={() => setViewing(c)}
            onAdd={() => setAdding(c)}
          />
        ))}
      </div>
    );

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-3 md:p-6">
      {/* Sticky header section: keeps title, count, actions, toolbar pinned to top while scrolling */}
      <div className="sticky top-14 z-30 -mx-3 -mt-3 border-b border-border/70 bg-background/95 px-3 py-3 backdrop-blur-xl md:-mx-6 md:-mt-6 md:px-6 shadow-xs space-y-2.5">
        <PageHeading
          title="Catalog"
          subtitle={`${rows.length.toLocaleString()} casting${rows.length === 1 ? "" : "s"} · tap one to add it to your collection`}
        >
          {isAdmin && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setMerging(true)}
              >
                <Merge className="size-4" />
                <span className="max-sm:sr-only">Duplicates</span>
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => setEditing("new")}>
                <Plus className="size-4" />
                New casting
              </Button>
            </>
          )}
        </PageHeading>

        <PageToolbar
          sticky={true}
          oneLine
          left={
            <SegmentControl
              value={segment}
              onChange={setSegment}
              className="h-8 w-auto max-sm:text-[11px] max-sm:[&>button]:px-2"
              options={[
                { value: "all", label: "All" },
                { value: "released", label: "Released" },
                { value: "preorder", label: "PO" },
              ]}
            />
          }
          right={
            <>
              {/* Hide owned sits outside the filter sheet: it is the one you
                  flip while browsing, not something you set and forget. */}
              <label
                title="Hide cars you already own"
                className={cn(
                  "flex h-8 shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-md border px-2 text-xs font-medium",
                  hideOwned
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-input text-muted-foreground hover:text-foreground",
                )}
              >
                <input
                  type="checkbox"
                  checked={hideOwned}
                  onChange={(e) => setHideOwned(e.target.checked)}
                  className="size-3.5 rounded border-input accent-primary"
                />
                <span className="max-sm:sr-only">Hide owned</span>
              </label>

              {/* Sort, group and filter read as icons at every width, the way
                  they do on the other pages. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-8 shrink-0"
                    aria-label={`Sort by ${SORTS.find((s) => s.value === sort.key)?.label}, ${
                      sort.dir === "asc" ? "ascending" : "descending"
                    }`}
                    title="Sort"
                  >
                    <ArrowUpDown className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-xs">Sort by</DropdownMenuLabel>
                  {SORTS.map((s) => (
                    <DropdownMenuItem
                      key={s.value}
                      onSelect={() => sortBy(s.value)}
                      className="justify-between text-xs"
                    >
                      {s.label}
                      {sort.key === s.value && <span>{sort.dir === "asc" ? "↑" : "↓"}</span>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant={group === "none" ? "outline" : "default"}
                    className="size-8 shrink-0"
                    aria-label={GROUPS.find((g) => g.value === group)?.label}
                    title="Group"
                  >
                    <Layers className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-xs">Group by</DropdownMenuLabel>
                  {GROUPS.map((g) => (
                    <DropdownMenuItem
                      key={g.value}
                      onSelect={() => setGroup(g.value)}
                      className="justify-between text-xs"
                    >
                      {g.label.replace(/^Group by /, "").replace(/^No grouping$/, "None")}
                      {group === g.value && <Check className="size-3.5" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                type="button"
                size="icon"
                variant={activeCount > 0 ? "default" : "outline"}
                onClick={openFilterModal}
                className="relative size-8 shrink-0"
                title="Filter castings"
                aria-label={activeCount > 0 ? `Filters, ${activeCount} active` : "Filters"}
              >
                <Filter className="size-4" />
                {activeCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-background text-[10px] font-bold text-foreground ring-1 ring-border">
                    {activeCount}
                  </span>
                )}
              </Button>
              <ViewToggle value={view} onChange={setView} modes={["grid", "compact", "table"]} />
            </>
          }
        />
      </div>

      {isLoading && catalog.length === 0 ? (
        <div className="grid place-items-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="card-elevated p-8 text-center text-sm text-muted-foreground">
          {segment === "preorder" ? "Nothing open to pre-order matches." : "No castings match."}
        </div>
      ) : (
        <div className="space-y-5">
          {sections.map((s) => (
            <section key={s.label || "all"} className="min-w-0 space-y-2">
              {group !== "none" && (
                <div className="flex items-baseline gap-2 border-b border-border/60 pb-1">
                  <h2 className="truncate text-sm font-semibold">{s.label}</h2>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {s.rows.length}
                  </span>
                </div>
              )}
              {renderRows(s.rows)}
            </section>
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
        canEdit={!isGuest}
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

      <DeleteCastingDialog
        entry={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async (carId) => {
          const res = await deleteCatalogCar(carId);
          if (res.deleted) {
            toast.success("Casting removed from the catalogue");
            setDeleting(null);
          }
          return res;
        }}
      />
      <CarFormDialog
        open={adding !== null}
        onOpenChange={(v) => !v && setAdding(null)}
        mode="add"
        prefill={adding ? catalogCarToCatalogueCar(adding) : null}
        prefillStatus={adding && isPreOrder(adding) ? "PO" : "Ordered"}
      />
      {isAdmin && (
        <MergeDuplicatesDialog
          open={merging}
          onClose={() => setMerging(false)}
          catalog={catalog}
          onMerged={refreshCatalog}
        />
      )}

      {!isGuest && (
        <CatalogFormDialog
          open={editing !== null}
          entry={editing}
          catalog={catalog}
          onClose={() => setEditing(null)}
          onAddExistingCar={(car) => {
            setEditing(null);
            setAdding(car);
          }}
          canDelete={isOwner && !isGuest}
          onDelete={() => {
            if (editing && editing !== "new") {
              const target = editing;
              setEditing(null);
              setDeleting(target);
            }
          }}
          onSave={async (car) => {
            if (editing === "new") {
              return await addCatalogCar(car);
            } else {
              return await updateCatalogCar(car);
            }
          }}
        />
      )}

      {/* Filter Bottom Sheet Modal */}
      <Dialog open={filterModalOpen} onOpenChange={setFilterModalOpen}>
        <DialogContent
          hideDragHandle={false}
          className="max-sm:top-auto max-sm:bottom-0 max-sm:inset-x-0 max-sm:h-auto max-sm:max-h-[85dvh] max-sm:rounded-t-3xl max-sm:rounded-b-none max-sm:p-0 flex flex-col overflow-hidden sm:max-w-lg p-0 border-border bg-background"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/80 px-4 py-3.5 shrink-0">
            <div className="flex items-center gap-2">
              <Filter className="size-4 text-primary" />
              <DialogTitle className="text-base font-bold text-foreground">Filters</DialogTitle>
              {draftActiveCount > 0 && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                  {draftActiveCount} active
                </span>
              )}
            </div>
            <DialogDescription className="sr-only">Filter catalog cars</DialogDescription>
          </div>

          {/* Scrollable Filter List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[60dvh]">
            {/* On by default. Once a box is in the catalogue its cars appear
                twice — as the box and as themselves — and the box is the thing
                on the shelf. Turning it off shows the castings individually. */}
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/30 p-3 transition-colors hover:bg-muted/50">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  Hide cars in multipacks
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  Show the box, not the five cars inside it.
                </span>
              </span>
              <input
                type="checkbox"
                checked={draftHideInPacks}
                onChange={(e) => setDraftHideInPacks(e.target.checked)}
                className="size-4 shrink-0 cursor-pointer rounded border-input accent-primary"
              />
            </label>

            {/* All filter dropdowns arranged in 2 columns */}
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {FILTERS.map((d) => {
                const isSelected = draftFilters[d.key] !== "all";
                const filterOpts = draftOptions[d.key] || [];
                return (
                  <div key={d.key} className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block truncate">
                      {d.label}
                    </label>
                    <select
                      value={draftFilters[d.key]}
                      onChange={(e) => setDraftFilters((f) => ({ ...f, [d.key]: e.target.value }))}
                      aria-label={d.label}
                      className={cn(
                        "w-full h-9 rounded-lg border bg-background px-2.5 text-xs transition-colors cursor-pointer truncate",
                        isSelected
                          ? "border-primary font-medium text-foreground ring-1 ring-primary/20"
                          : "border-input text-muted-foreground",
                      )}
                    >
                      <option value="all">All {d.label}s</option>
                      {filterOpts.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.value} ({o.count})
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sticky footer: Clear on left, Apply on right */}
          <div className="sticky bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur-md p-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-3 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleClearFilters}
              disabled={draftActiveCount === 0}
              className="h-10 px-4 text-sm font-semibold cursor-pointer"
            >
              Clear
            </Button>
            <Button
              type="button"
              onClick={handleApplyFilters}
              className="h-10 flex-1 sm:flex-initial px-6 text-sm font-semibold cursor-pointer"
            >
              Apply
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CatalogCard({
  c,
  owned,
  onOpen,
  onAdd,
}: {
  c: CatalogCar;
  owned: boolean;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const car = asCar(c);

  return (
    <article className="card-elevated flex flex-col overflow-hidden">
      <button type="button" onClick={onOpen} className="relative block w-full">
        <CarThumb car={car} className="aspect-[16/10] w-full" />
        {isPreOrder(c) && (
          <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-amber-400 backdrop-blur-sm">
            PO
          </span>
        )}
        {owned && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 backdrop-blur-sm">
            <Check className="size-3" /> Owned
          </span>
        )}
        {/* A box, not a casting. It earns the primary colour because it changes
            what the card means: one of these is several cars. */}
        {c.is_multipack && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow-sm">
            <Package className="size-3" />
            {packLabel(c)}
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

/**
 * The catalogue as a list.
 *
 * The one view that answers questions about the entries themselves rather than
 * about the cars — which is where the serial number, and who filed and last
 * corrected each one, belong. The grids are for finding a casting by looking at
 * it; this is for reading the catalogue.
 */
function CatalogTable({
  rows,
  serials,
  owned,
  onOpen,
  onAdd,
  onEdit,
}: {
  rows: CatalogCar[];
  serials: Map<string, number>;
  owned: Set<string>;
  onOpen: (c: CatalogCar) => void;
  onAdd: (c: CatalogCar) => void;
  onEdit?: (c: CatalogCar) => void;
}) {
  return (
    <>
      {/* Phones get the same rows as cards: copying the design of list view from inventory */}
      <div className="space-y-2 md:hidden">
        {rows.map((c) => {
          const car = asCar(c);
          return (
            <article key={c.car_id} className="card-elevated overflow-hidden">
              <button
                type="button"
                onClick={() => onOpen(c)}
                className="block w-full space-y-1 p-2.5 text-left transition-colors hover:bg-muted/30"
              >
                {/* NAME AND MRP */}
                <div className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{car.name || "—"}</span>
                    {isPreOrder(c) && (
                      <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.2 text-[10px] font-semibold text-amber-500">
                        PO
                      </span>
                    )}
                    {owned.has(c.car_id.toUpperCase()) && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-500">
                        <Check className="size-3" />
                        <span>Owned</span>
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {c.mrp ? inr(c.mrp) : "—"}
                  </span>
                </div>

                {/* WHAT KIND OF CAR */}
                <div className="truncate text-xs text-muted-foreground">{carSubLine(car)}</div>

                {/* BRAND, ASSORTMENT AND S.NO / SERIES */}
                <div className="flex items-end justify-between gap-3 text-xs text-muted-foreground">
                  <span className="min-w-0 truncate">
                    {[c.brand, c.assortment].filter(Boolean).join(" · ") || "—"}
                  </span>
                  <span className="shrink-0 truncate text-[11px]">
                    {c.series ? `Series: ${c.series}` : c.car_id}
                  </span>
                </div>
              </button>
            </article>
          );
        })}
        {rows.length === 0 && (
          <p className="card-elevated p-8 text-center text-sm text-muted-foreground">
            No castings match those filters.
          </p>
        )}
      </div>

      {/* Desktop: clean table matching inventory */}
      <div className="card-elevated hidden overflow-x-auto md:block max-h-[calc(100vh-10.5rem)] overflow-y-auto">
        <table className="w-full min-w-[54rem] table-fixed text-sm">
          <colgroup>
            <col className="w-[4rem]" />
            <col />
            <col className="w-[10rem]" />
            <col className="w-[10rem]" />
            <col className="w-[6rem]" />
            <col className="w-[7.5rem]" />
            <col className="w-[7.5rem]" />
            <col className="w-[7rem]" />
          </colgroup>
          <thead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-xs text-left text-xs uppercase tracking-wide text-muted-foreground shadow-xs">
            <tr>
              <th className="px-3 py-2.5 text-right font-medium">S.No</th>
              <th className="px-3 py-2.5 font-medium">Casting</th>
              <th className="px-3 py-2.5 font-medium">Brand / Assortment</th>
              <th className="px-3 py-2.5 font-medium">Series</th>
              <th className="px-3 py-2.5 text-right font-medium">MRP</th>
              <th className="px-3 py-2.5 font-medium">Added by</th>
              <th className="px-3 py-2.5 font-medium">Updated by</th>
              <th className="px-3 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const car = asCar(c);
              return (
                <tr
                  key={c.car_id}
                  className="border-t border-border align-middle hover:bg-muted/40"
                >
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {serials.get(c.car_id) ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onOpen(c)}
                      className="flex w-full min-w-0 items-center gap-2 text-left"
                    >
                      <CarThumb car={car} className="size-9 shrink-0 rounded-md" />
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-medium">{car.name}</span>
                          {isPreOrder(c) && (
                            <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-500">
                              PO
                            </span>
                          )}
                          {c.is_multipack && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary">
                              <Package className="size-3" />
                              {packLabel(c)}
                            </span>
                          )}
                          {owned.has(c.car_id.toUpperCase()) && (
                            <Check className="size-3 shrink-0 text-emerald-500" />
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {carSubLine(car)}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="truncate px-3 py-2">
                    <span className="block truncate">{c.brand || "—"}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.assortment || "—"}
                    </span>
                  </td>
                  <td className="truncate px-3 py-2 text-muted-foreground">
                    <span className="block truncate">{c.series || "—"}</span>
                    <span className="block truncate text-xs">{c.sub_series || ""}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.mrp ? inr(c.mrp) : "—"}</td>
                  <td className="truncate px-3 py-2 text-xs text-muted-foreground">
                    {resolveCatalogUserFirstName(c.created_by)}
                  </td>
                  {/* Blank rather than "system": an entry nobody has corrected
                      has no editor, and naming one would invent an edit. */}
                  <td className="truncate px-3 py-2 text-xs text-muted-foreground">
                    {c.updated_by ? resolveCatalogUserFirstName(c.updated_by) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      {onEdit && (
                        <Button
                          size="icon"
                          variant="outline"
                          className="size-7 cursor-pointer"
                          onClick={() => onEdit(c)}
                          aria-label={`Edit ${car.name} in the catalogue`}
                          title="Edit catalogue entry"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="h-7 gap-1 px-2 cursor-pointer shadow-xs"
                        onClick={() => onAdd(c)}
                      >
                        <Plus className="size-3.5" />
                        Add
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * Removing a casting from the shared catalogue.
 *
 * Stricter than deleting one of your own cars, because it is not one of your
 * own: the entry is what every collection that has this casting reads its
 * details from. So the dialog counts the cars linked to it first — across every
 * account, which is why the count comes from the database rather than from what
 * this browser can see — and offers nothing to press unless the answer is none.
 *
 * The count is also checked again inside the delete itself. This is the warning;
 * the database is the rule.
 */
function DeleteCastingDialog({
  entry,
  onClose,
  onConfirm,
}: {
  entry: CatalogCar | null;
  onClose: () => void;
  onConfirm: (carId: string) => Promise<{ deleted: boolean; uses: number }>;
}) {
  /** null while counting, -1 when the count could not be had. */
  const [uses, setUses] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTyped("");
    setBusy(false);
    setUses(null);
    if (!entry) return;
    let cancelled = false;
    void (async () => {
      const n = await catalogEntryUsage(entry.car_id);
      if (!cancelled) setUses(n ?? -1);
    })();
    return () => {
      cancelled = true;
    };
  }, [entry]);

  if (!entry) return null;

  const name = entry.name || `${entry.make} ${entry.model}`.trim() || "casting";
  const phrase = `remove ${name}`.toLowerCase();
  const counting = uses === null;
  const unknown = uses === -1;
  const inUse = typeof uses === "number" && uses > 0;
  const removable = uses === 0 && typed.trim().toLowerCase() === phrase;

  const confirm = async () => {
    if (!removable || busy) return;
    setBusy(true);
    const res = await onConfirm(entry.car_id);
    setBusy(false);
    // The count moved under us between the check and the press.
    if (!res.deleted && res.uses > 0) setUses(res.uses);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="text-lg font-semibold">Remove this casting?</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{name}</span> would be gone from the shared
          catalogue for everyone. This cannot be undone.
        </DialogDescription>

        {counting ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Checking whether any cars use it…
          </p>
        ) : unknown ? (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            The catalogue could not be asked how many cars are linked to this entry, so it will not
            be removed. Only the owner can run that check.
          </p>
        ) : inUse ? (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
            <b className="tabular-nums">{uses}</b> {uses === 1 ? "car is" : "cars are"} linked to
            this entry, so it stays. Those cars read their details from it, and removing it would
            leave them pointing at nothing. Correct the entry instead, or remove the cars first.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              No cars are linked to it. Type{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">{phrase}</code> to
              confirm.
            </p>
            <Input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void confirm();
              }}
              placeholder={phrase}
              aria-label="Type the confirmation phrase"
            />
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {inUse || unknown ? "Close" : "Cancel"}
          </Button>
          {!inUse && !unknown && (
            <Button
              type="button"
              disabled={!removable || busy}
              onClick={() => void confirm()}
              className="gap-1.5 bg-rose-600 text-white hover:bg-rose-500"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Remove
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
