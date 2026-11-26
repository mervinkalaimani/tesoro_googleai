import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { normaliseStatus } from "@/lib/status";
import { X } from "lucide-react";
import { useCars } from "@/lib/cars-store";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import { inrFull } from "@/lib/format";
import { useCarDrawer } from "@/components/car-details-drawer";
import { CarMarks } from "@/components/car-marks";
import { CarSubRow, GroupRow, GroupTable, StatusCell, Th } from "@/components/group-table";
import { PageHeading, PageToolbar } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { BlisterTile, CarOverlay } from "@/components/blister-tile";
import { InventoryCard } from "@/routes/inventory";
import { BLISTER_GRID_COLS, GRID_COLS, ViewToggle, type ViewMode } from "@/components/view-toggle";
import { cn } from "@/lib/utils";
import { ProGate } from "@/components/pro-gate";

export const Route = createFileRoute("/duplicates")({
  head: () => ({
    meta: [
      { title: "Duplicates | VIIV" },
      {
        name: "description",
        content:
          "Find repeated diecast cars using your own matching attributes such as make, model, variant, year, brand, and colour.",
      },
      { property: "og:title", content: "Duplicates | VIIV" },
      {
        property: "og:description",
        content:
          "Find repeated diecast cars using your own matching attributes such as make, model, variant, year, brand, and colour.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProGate title="Duplicates">
      <DuplicatesPage />
    </ProGate>
  ),
});

const ATTRS = [
  { key: "make", label: "Make", get: (r: Diecast) => r.make },
  { key: "model", label: "Model", get: (r: Diecast) => r.model },
  { key: "variant", label: "Variant", get: (r: Diecast) => r.variant },
  { key: "year", label: "Year", get: (r: Diecast) => r.year },
  { key: "brand", label: "Brand", get: (r: Diecast) => r.brand },
  { key: "colour", label: "Colour", get: (r: Diecast) => r.colour },
  { key: "assortment", label: "Assortment", get: (r: Diecast) => r.assortment },
  { key: "series", label: "Series", get: (r: Diecast) => r.series },
  { key: "subSeries", label: "Sub-series", get: (r: Diecast) => r.subSeries },
] as const;

type AttrKey = (typeof ATTRS)[number]["key"];

const DEFAULT_ATTRS: AttrKey[] = ["make", "model", "variant", "year", "brand"];

function DuplicatesPage() {
  const { query } = useApp();
  const cars = useCars();
  const { open } = useCarDrawer();
  const [view, setView] = useState<ViewMode>("blister");
  const [active, setActive] = useState<AttrKey[]>(DEFAULT_ATTRS);
  // Closed by default: the page is a list of groups to scan, and the copies
  // inside one are only worth the room once it is the group you are after.
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) =>
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggle = (key: AttrKey) =>
    setActive((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const groups = useMemo(() => {
    const attrs = ATTRS.filter((a) => active.includes(a.key));
    if (!attrs.length) return [];
    // A duplicate is a copy you own, or have on the way, of something you also own. A wish
    // (ISO: you are looking for it) is not a copy, and neither is the box a pack of cars came in:
    // the cars inside it are the castings, and counting the box beside them reads as a repeat.
    const boxIds = new Set(cars.map((c) => c.packOf).filter(Boolean));
    const held = cars.filter((r) => normaliseStatus(r.status) !== "ISO" && !boxIds.has(r.id));
    const filtered = filterRows(held, query);
    const map = new Map<string, Diecast[]>();
    for (const r of filtered) {
      const parts = attrs.map((a) => (a.get(r) || "").trim().toLowerCase());
      if (parts.every((p) => !p)) continue;
      const key = parts.join("|");
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return [...map.values()].filter((arr) => arr.length >= 2).sort((a, b) => b.length - a.length);
  }, [cars, query, active]);

  // "Surplus" is every copy beyond the first in each group.
  const surplusCount = groups.reduce((s, g) => s + (g.length - 1), 0);

  return (
    <div className="mx-auto max-w-[1600px] space-y-3 p-3 md:p-6">
      <PageHeading
        title="Duplicates"
        subtitle={`${surplusCount} ${surplusCount === 1 ? "casting" : "castings"} across ${groups.length} ${groups.length === 1 ? "model" : "models"}`}
      >
        <ViewToggle value={view} onChange={setView} modes={["blister", "grid", "table"]} />
      </PageHeading>

      <PageToolbar
        sticky
        oneLine
        left={
          <div className="flex max-w-full flex-wrap items-center gap-1.5 py-0.5">
            {ATTRS.map((a) => {
              const isSelected = active.includes(a.key);
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => toggle(a.key)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors shrink-0 whitespace-nowrap",
                    isSelected
                      ? "border border-primary/40 bg-primary/15 text-primary hover:bg-primary/25"
                      : "border border-border/70 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span>{a.label}</span>
                  {isSelected && <X className="size-3 shrink-0 ml-0.5" />}
                </button>
              );
            })}
          </div>
        }
      />

      {active.length === 0 && (
        <p className="text-xs text-destructive">Select at least one attribute to match on.</p>
      )}

      {view !== "table" ? (
        // The glass view: one tile per casting, with how many copies you hold.
        <div className={view === "blister" ? BLISTER_GRID_COLS : GRID_COLS}>
          {groups.map((arr, i) =>
            view === "blister" ? (
              <BlisterTile
                key={(arr[0].id || "") + i}
                car={arr[0]}
                copies={arr.length}
                onOpen={() => open(arr[0])}
                overlay={<CarOverlay car={arr[0]} brandOnly />}
                showStatus={false}
                foot={false}
              />
            ) : (
              <InventoryCard
                key={(arr[0].id || "") + i}
                car={arr[0]}
                copies={arr.length}
                onOpen={() => open(arr[0])}
                showStatus={false}
              />
            ),
          )}
        </div>
      ) : (
        <GroupTable
          head={
            <>
              <Th>Casting</Th>
              <Th>Copies</Th>
              <Th className="hidden sm:table-cell">Seller</Th>
              <Th align="right">Spent</Th>
              <Th align="right">Valuation</Th>
            </>
          }
        >
          {groups.map((arr, i) => {
            const key = (arr[0].id || "") + i;
            const isOpen = openRows.has(key);
            const first = arr[0];
            const spent = arr.reduce((t, r) => t + (r.spent || 0), 0);
            const valuation = arr.reduce((t, r) => t + (r.mrp || r.spent || 0), 0);
            const surplus = arr.length - 1;
            const sellers = [...new Set(arr.map((r) => (r.seller || "").trim()).filter(Boolean))];
            return [
              <GroupRow
                key={key}
                open={isOpen}
                onToggle={() => toggleGroup(key)}
                title={
                  <>
                    {first.name || `${first.make} ${first.model}`.trim() || "—"}
                    {first.brand ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        ({first.brand})
                      </span>
                    ) : null}
                  </>
                }
                sub={`${surplus} surplus unit${surplus === 1 ? "" : "s"}`}
              >
                <td className="px-3 py-2.5">
                  <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-xs font-bold tabular-nums text-amber-600 dark:text-amber-400">
                    {arr.length}x
                  </span>
                </td>
                <td className="hidden px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
                  {sellers.length === 1
                    ? sellers[0]
                    : sellers.length
                      ? `${sellers.length} sellers`
                      : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{inrFull(spent)}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                  {inrFull(valuation)}
                </td>
              </GroupRow>,
              // The copies, as rows rather than as a card each: what you are doing
              // here is comparing them, and the only things that tell them apart
              // are their IDs, where they came from, and what they cost.
              ...(isOpen
                ? arr.map((r, n) => (
                    <CarSubRow
                      key={(r.id || "") + n}
                      car={r}
                      onOpen={() => open(r)}
                      lead={
                        <span className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                          #{n + 1}
                        </span>
                      }
                      sub={
                        <span className="font-mono">
                          {r.id || "—"}
                          {r.date ? ` · ${r.date}` : ""}
                        </span>
                      }
                    >
                      <StatusCell car={r} />
                      <td className="hidden px-3 py-2 text-xs text-muted-foreground sm:table-cell">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate">{r.seller || "—"}</span>
                          <CarMarks car={r} primary="chase" iconClassName="size-3.5" />
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums">
                        {inrFull(r.spent || 0)}
                      </td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                        {inrFull(r.mrp || r.spent || 0)}
                      </td>
                    </CarSubRow>
                  ))
                : []),
            ];
          })}
          {groups.length === 0 && (
            <tr>
              <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                No duplicates found.
              </td>
            </tr>
          )}
        </GroupTable>
      )}
    </div>
  );
}
