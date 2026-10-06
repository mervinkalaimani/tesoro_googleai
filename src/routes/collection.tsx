import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { useCars } from "@/lib/cars-store";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import { MrpNote } from "@/components/cars-table";
import { CarSubRow, GroupRow, GroupTable, StatusCell, Th } from "@/components/group-table";
import { useCarDrawer } from "@/components/car-details-drawer";
import { useRegisterExportScope } from "@/lib/export-scope";
import { SegmentControl } from "@/components/segment-control";
import { PageHeading, PageToolbar } from "@/components/page-header";
import { FilterSelect, SortSelect, type SortDir } from "@/components/filter-select";
import { ExportButton } from "@/components/export-button";
import { inr } from "@/lib/format";
import { ProGate } from "@/components/pro-gate";

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

function CollectionPage() {
  const { query } = useApp();
  const [group, setGroup] = useState<GroupBy>("series");
  const [selected, setSelected] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("count");
  const [dir, setDir] = useState<SortDir>("desc");
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
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

  const toggle = (name: string) =>
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-3 md:p-6">
      <PageHeading
        title="Collection"
        subtitle={`${groups.length} ${group} · ${filtered.length.toLocaleString()} cars`}
      />

      <PageToolbar
        sticky
        // One line on a phone too: the control narrows and scrolls sideways
        // instead of taking a row of its own above the buttons.
        oneLine
        left={
          <SegmentControl
            className="w-auto md:w-auto"
            value={group}
            onChange={(v) => {
              setGroup(v);
              setSelected("all");
              setOpenRows(new Set());
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
        }
        right={
          <>
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
            <ExportButton rows={visibleCars} name="collection" label="Collection" iconOnly />
          </>
        }
      />

      <GroupTable
        head={
          <>
            <Th className="capitalize">{group}</Th>
            <Th>Cars</Th>
            <Th align="right">Spent</Th>
          </>
        }
      >
        {visible.map((g) => {
          const isOpen = openRows.has(g.name);
          return [
            <GroupRow
              key={g.name}
              open={isOpen}
              onToggle={() => toggle(g.name)}
              title={g.label}
              sub={g.brands.join(" · ") || undefined}
            >
              <td className="px-3 py-2.5 text-muted-foreground">
                {g.items.length} {g.items.length === 1 ? "car" : "cars"}
              </td>
              <td className="px-3 py-2.5 text-right font-medium tabular-nums">{inr(g.value)}</td>
            </GroupRow>,
            ...(isOpen
              ? g.items.map((r, i) => (
                  <CarSubRow key={(r.id || "") + i} car={r} onOpen={() => open(r)}>
                    <StatusCell car={r} />
                    <td className="px-3 py-2 text-right text-xs tabular-nums">
                      {r.spent ? inr(r.spent) : "—"}
                      {r.mrp ? (
                        <span className="block text-[11px] font-normal text-muted-foreground">
                          <MrpNote spent={r.spent || 0} mrp={r.mrp} />
                        </span>
                      ) : null}
                    </td>
                  </CarSubRow>
                ))
              : []),
          ];
        })}
        {visible.length === 0 && (
          <tr>
            <td colSpan={3} className="p-8 text-center text-sm text-muted-foreground">
              No groups.
            </td>
          </tr>
        )}
      </GroupTable>
    </div>
  );
}
