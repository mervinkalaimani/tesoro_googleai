import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCars } from "@/lib/cars-store";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import { CarsTable } from "@/components/cars-table";
import { SegmentControl } from "@/components/segment-control";
import { inr } from "@/lib/format";
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

const GROUP_KEY: Record<GroupBy, (r: Diecast) => string> = {
  series: (r) => r.series || "—",
  set: (r) => [r.brand, r.series, r.subSeries].filter(Boolean).join(" · ") || "—",
  brand: (r) => r.brand || "—",
  assortment: (r) => [r.brand, r.assortment].filter(Boolean).join(" · ") || "—",
  maker: (r) => r.make || "—",
  seller: (r) => r.seller || "—",
  size: (r) => r.size || "—",
};

function CollectionPage() {
  const { query } = useApp();
  const [group, setGroup] = useState<GroupBy>("series");
  const [selected, setSelected] = useState<string>("all");

  const cars = useCars();
  const filtered = useMemo(() => filterRows(cars, query), [cars, query]);

  const groups = useMemo(() => {
    const map = new Map<string, Diecast[]>();
    for (const r of filtered) {
      if (group === "set" && !(r.series || "").trim()) continue;
      const k = GROUP_KEY[group](r);
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    }

    return [...map.entries()]
      .map(([name, items]) => {
        const value = items.reduce((s, r) => s + (r.spent || 0), 0);
        const statusCount = new Map<string, number>();
        for (const it of items) statusCount.set(it.status, (statusCount.get(it.status) ?? 0) + 1);
        const dominant = [...statusCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
        const brands = [...new Set(items.map((r) => r.brand).filter(Boolean))].slice(0, 3);
        return { name, items, value, dominant, brands };
      })
      .sort((a, b) => b.items.length - a.items.length);
  }, [filtered, group]);

  const visible = selected === "all" ? groups : groups.filter((g) => g.name === selected);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-3 md:p-6">
      <div className="card-elevated p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-display text-xl font-semibold">Collection</h1>
            <p className="text-xs text-muted-foreground">
              {groups.length} {group} · {filtered.length.toLocaleString()} cars
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentControl
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
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All {group}s</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.name} value={g.name}>
                    {g.name} ({g.items.length})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                  <div className="truncate font-medium">{g.name}</div>
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
              <CarsTable rows={g.items} />
            </AccordionContent>
          </AccordionItem>
        ))}
        {visible.length === 0 && (
          <div className="card-elevated p-8 text-center text-sm text-muted-foreground">
            No groups.
          </div>
        )}
      </Accordion>
    </div>
  );
}
