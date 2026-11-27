import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Filter, X } from "lucide-react";
import { useCars, useCarsRefresh } from "@/lib/cars-store";
import { TableRowsSkeleton } from "@/components/dashboard-skeletons";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import { MrpNote } from "@/components/cars-table";
import { BlisterTile } from "@/components/blister-tile";
import { CompactCarCard } from "@/components/compact-car-card";
import { CarThumb } from "@/components/car-thumb";
import { BLISTER_GRID_COLS, GRID_COLS, ViewToggle, type ViewMode } from "@/components/view-toggle";
import { CarSubRow, GroupRow, GroupTable, StatusCell, Th } from "@/components/group-table";
import { useCarDrawer } from "@/components/car-details-drawer";
import { useRegisterExportScope } from "@/lib/export-scope";
import { CyclePill, SegmentControl } from "@/components/segment-control";
import { PageHeading } from "@/components/page-header";
import { FilterSelect, SortSelect, type SortDir } from "@/components/filter-select";
import { inr } from "@/lib/format";
import { ProGate } from "@/components/pro-gate";

export const Route = createFileRoute("/collection")({
  head: () => ({
    meta: [
      { title: "Collection | VIIV" },
      {
        name: "description",
        content:
          "Explore diecast collection groups by series, set, brand, assortment, maker, seller, and size.",
      },
      { property: "og:title", content: "Collection | VIIV" },
      {
        property: "og:description",
        content:
          "Explore diecast collection groups by series, set, brand, assortment, maker, seller, and size.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProGate title="Collection">
      <CollectionPage />
    </ProGate>
  ),
});

type GroupBy = "series" | "set" | "brand" | "assortment" | "maker" | "seller" | "size";

type SortField = "name" | "count";

const SORT_LABELS: Record<SortField, string> = {
  count: "No. of cars",
  name: "Name",
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
 * dropped from the heading because it already appears under the name.
 */
const GROUP_LABEL: Partial<Record<GroupBy, (r: Diecast) => string>> = {
  set: (r) => [r.series, r.subSeries].filter(Boolean).join(" · ") || "—",
  assortment: (r) => r.assortment || "—",
};

/**
 * A group as a tile, for the blister and grid views: a cover photograph from one
 * of its cars, and the words on the picture the way the car tiles have them.
 */
function GroupTile({
  title,
  count,
  brands,
  cover,
  tall,
  onOpen,
}: {
  title: string;
  count: number;
  brands: string[];
  cover: Diecast;
  tall: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={title}
      className="card-elevated group relative flex h-full flex-col overflow-hidden text-left transition-colors hover:border-primary/40"
    >
      <CarThumb
        car={cover}
        className={tall ? "aspect-[534/658] w-full" : "aspect-[16/10] w-full"}
        fallback={
          <span className="flex size-full items-center justify-center bg-gradient-to-b from-muted/60 to-muted/20" />
        }
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3.5 pb-3 pt-14 text-white">
        <div className="line-clamp-2 text-[15px] font-semibold leading-tight">{title}</div>
        <div className="mt-1 truncate text-xs text-white/80">
          {count} {count === 1 ? "car" : "cars"}
        </div>
        {brands.length > 0 && (
          <div className="truncate text-xs text-white/60">{brands.join(" · ")}</div>
        )}
      </div>
    </button>
  );
}

function CollectionPage() {
  const { query } = useApp();
  const [group, setGroup] = useState<GroupBy>("series");
  const [selected, setSelected] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("count");
  const [dir, setDir] = useState<SortDir>("desc");
  // How the cars of the chosen group are laid out. The table is what this page
  // has always shown, so it is where it starts.
  const [view, setView] = useState<ViewMode>("table");
  const { open } = useCarDrawer();

  const cars = useCars();
  // Nothing to show yet because the first read is still on its way.
  const loading = useCarsRefresh().refreshing && cars.length === 0;
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
        const brands = [...new Set(items.map((r) => r.brand).filter(Boolean))].slice(0, 3);
        const label = GROUP_LABEL[group]?.(items[0]) ?? name;
        return { name, label, items, value, brands };
      })
      // Ties fall back to the name so the order stays stable between renders
      // instead of shuffling.
      .sort((a, b) => {
        let cmp: number;
        if (sortField === "name") cmp = a.label.localeCompare(b.label);
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

  // A drill-down, not an accordion: choosing a group replaces the list with that
  // group's cars, and the group's name stays in the toolbar to step to the next.
  const drilled = selected === "all" ? undefined : groups.find((g) => g.name === selected);

  return (
    <div className="mx-auto max-w-[1600px] space-y-3 p-3 md:p-6">
      <PageHeading
        title="Collection"
        subtitle={`${groups.length} ${group} · ${filtered.length.toLocaleString()} cars`}
      >
        <>
          {/* The drill-down pill beside the first one does this job on a phone. */}
          <div className="max-md:hidden">
            <FilterSelect
              value={selected}
              onChange={setSelected}
              icon={<Filter className="size-3.5" />}
              label={`Which ${group}`}
              iconOnly
              options={[
                { value: "all", label: `All ${group}s` },
                ...groups.map((g) => ({
                  value: g.name,
                  label: `${g.label} (${g.items.length})`,
                })),
              ]}
            />
          </div>
          {/* Picking the order already in use flips its direction, so the
                separate arrow button this used to have is folded in. */}
          <SortSelect
            value={sortField}
            dir={dir}
            onChange={(v, d) => {
              setSortField(v);
              setDir(d);
            }}
            iconOnly
            neutral="count"
            options={(Object.keys(SORT_LABELS) as SortField[]).map((f) => ({
              value: f,
              label: SORT_LABELS[f],
              dir: f === "name" ? ("asc" as const) : ("desc" as const),
            }))}
          />
          <ViewToggle value={view} onChange={setView} modes={["table", "blister", "grid"]} />
        </>
        <>
          <SegmentControl
            className="w-auto md:w-auto"
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
          {/* Once a group is chosen it sits beside the first pill and steps
                through the groups; the X closes it and returns to the list.
                Phone only — a row of every series would not fit anywhere else. */}
          {drilled && (
            <>
              <CyclePill
                phoneOnly
                value={selected}
                onChange={setSelected}
                options={groups.map((g) => ({ value: g.name, label: g.label }))}
              />
              <button
                type="button"
                onClick={() => setSelected("all")}
                aria-label={`Close ${drilled.label}`}
                className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-muted/40 text-muted-foreground sm:hidden"
              >
                <X className="size-4" />
              </button>
            </>
          )}
        </>
      </PageHeading>

      {drilled ? (
        <>
          {view === "table" ? (
            <GroupTable
              minWidth="md:min-w-[40rem]"
              headClassName="max-md:hidden"
              head={
                <>
                  <Th className="capitalize">Car</Th>
                  <Th className="hidden md:table-cell">Status</Th>
                  <Th align="right" className="hidden md:table-cell">
                    Spent
                  </Th>
                </>
              }
            >
              {drilled.items.map((r, i) => (
                <CarSubRow
                  key={(r.id || "") + i}
                  car={r}
                  onOpen={() => open(r)}
                  flush
                  showImage
                  centerName={!r.subSeries}
                  // The group already says which series; the brand sits at the
                  // right of the name, and the second line is the sub series
                  // followed by the assortment.
                  aside={r.brand}
                  // A phone has the assortment under the brand, at the right;
                  // wider screens keep it after the sub series.
                  sub={
                    <>
                      {r.subSeries}
                      {r.assortment && (
                        <span className="max-md:hidden">
                          {r.subSeries ? " · " : ""}
                          {r.assortment}
                        </span>
                      )}
                      {!r.subSeries && !r.assortment && "—"}
                    </>
                  }
                  asideSub={r.assortment && <span className="md:hidden">{r.assortment}</span>}
                >
                  <StatusCell car={r} className="hidden md:table-cell" />
                  <td className="hidden px-3 py-2 text-right text-xs tabular-nums md:table-cell">
                    {r.spent ? inr(r.spent) : "—"}
                    {r.mrp ? (
                      <span className="block text-xs font-normal text-muted-foreground">
                        <MrpNote spent={r.spent || 0} mrp={r.mrp} />
                      </span>
                    ) : null}
                  </td>
                </CarSubRow>
              ))}
            </GroupTable>
          ) : (
            <div className={view === "blister" ? BLISTER_GRID_COLS : GRID_COLS}>
              {drilled.items.map((r, i) =>
                view === "blister" ? (
                  <BlisterTile key={(r.id || "") + i} car={r} onOpen={() => open(r)} />
                ) : (
                  <CompactCarCard key={(r.id || "") + i} car={r} onOpen={() => open(r)} />
                ),
              )}
            </div>
          )}
        </>
      ) : view !== "table" ? (
        <div className={view === "blister" ? BLISTER_GRID_COLS : GRID_COLS}>
          {groups.map((g) => (
            <GroupTile
              key={g.name}
              title={g.label}
              count={g.items.length}
              brands={g.brands}
              cover={g.items.find((r) => r.imageUrl) ?? g.items[0]}
              tall={view === "blister"}
              onOpen={() => setSelected(g.name)}
            />
          ))}
          {!loading && groups.length === 0 && (
            <p className="col-span-full p-8 text-center text-sm text-muted-foreground">
              No groups.
            </p>
          )}
        </div>
      ) : (
        /* A phone gets one column — the name, with what it is under it — and no
           sideways scroll; the count and the money are for wider screens. */
        <GroupTable
          minWidth="md:min-w-[40rem]"
          headClassName="max-md:hidden"
          head={
            <>
              <Th className="capitalize">{group}</Th>
              <Th className="hidden md:table-cell">Cars</Th>
              <Th align="right" className="hidden md:table-cell">
                Spent
              </Th>
            </>
          }
        >
          {groups.map((g) => (
            <GroupRow
              key={g.name}
              open={false}
              onToggle={() => setSelected(g.name)}
              title={g.label}
              sub={
                <>
                  <span className="md:hidden">
                    {g.items.length} {g.items.length === 1 ? "car" : "cars"}
                    {g.brands.length > 0 ? " · " : ""}
                  </span>
                  {g.brands.join(" · ")}
                </>
              }
            >
              <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">
                {g.items.length} {g.items.length === 1 ? "car" : "cars"}
              </td>
              <td className="hidden px-3 py-2.5 text-right font-medium tabular-nums md:table-cell">
                {inr(g.value)}
              </td>
            </GroupRow>
          ))}
          {loading && <TableRowsSkeleton cols={3} rows={8} />}
          {!loading && groups.length === 0 && (
            <tr>
              <td colSpan={3} className="p-8 text-center text-sm text-muted-foreground">
                No groups.
              </td>
            </tr>
          )}
        </GroupTable>
      )}
    </div>
  );
}
