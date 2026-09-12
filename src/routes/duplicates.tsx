import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Copy,
  Download,
  IndianRupee,
  SlidersHorizontal,
  TrendingUp,
  ArrowLeftRight,
} from "lucide-react";
import { useCars } from "@/lib/cars-store";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import { ExportDialog } from "@/components/export-dialog";
import { CAR_CSV_COLUMNS } from "@/lib/car-columns";
import { inrFull } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCarDrawer } from "@/components/car-details-drawer";
import { CarMarks } from "@/components/car-marks";
import { PageHeading, PageToolbar } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/duplicates")({
  head: () => ({
    meta: [
      { title: "Duplicates | Tesoro" },
      {
        name: "description",
        content:
          "Find repeated diecast cars using your own matching attributes such as make, model, variant, year, brand, and colour.",
      },
      { property: "og:title", content: "Duplicates | Tesoro" },
      {
        property: "og:description",
        content:
          "Find repeated diecast cars using your own matching attributes such as make, model, variant, year, brand, and colour.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DuplicatesPage,
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

function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tone?: "default" | "emerald" | "sky";
}) {
  const valueTone =
    tone === "emerald" ? "text-emerald-500" : tone === "sky" ? "text-sky-400" : "text-foreground";
  return (
    <div className="card-elevated p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className={`text-display mt-1 text-2xl font-bold tabular-nums ${valueTone}`}>
        {value}
      </div>
      <div className="mt-1 font-mono text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function DuplicateGroup({ rows, onOpen }: { rows: Diecast[]; onOpen: (car: Diecast) => void }) {
  const first = rows[0];
  const valuation = rows.reduce((s, r) => s + (r.mrp || r.spent || 0), 0);
  const surplus = rows.length - 1;

  return (
    <article className="card-elevated overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-amber-500/15 text-sm font-bold text-amber-400">
            {rows.length}x
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold tracking-tight">
              {first.name || `${first.make} ${first.model}`.trim() || "—"}
              {first.brand ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({first.brand})
                </span>
              ) : null}
            </h2>
            {/* No SKU. It was the first car's own ID standing in for the whole
                group, which is the one thing here that is not shared — every
                copy below carries its own, and they are all different. */}
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {surplus} surplus unit{surplus === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Group valuation
          </div>
          <div className="text-sm font-bold tabular-nums">{inrFull(valuation)}</div>
        </div>
      </header>

      {/* Three across. These are copies of one casting, so what you are doing
          here is comparing them — which cost more, which came from where — and
          that is a great deal easier side by side than stacked one per row down
          a page.

          Loose / Carded has gone: it was the widest thing on every row and it
          read as the heading, when the question on this page is which duplicate
          to keep. The car ID takes its place, because with three near-identical
          cards in a row it is the only thing that tells them apart. */}
      <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r, i) => (
          <button
            key={(r.id || "") + i}
            type="button"
            onClick={() => onOpen(r)}
            className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-muted/20 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                #{i + 1}
              </span>
              <span className="min-w-0 truncate font-mono text-xs text-foreground">
                {r.id || "—"}
              </span>
              <CarMarks car={r} primary="chase" iconClassName="size-3.5" className="ml-auto" />
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {inrFull(r.mrp || r.spent || 0)}
              </span>
            </div>

            <div className="truncate font-mono text-xs text-muted-foreground">
              {r.status || "—"}
              {r.seller ? ` · ${r.seller}` : ""}
            </div>

            <div className="truncate font-mono text-xs text-muted-foreground">
              Cost: {inrFull(r.spent || 0)}
              {r.date ? ` · ${r.date}` : ""}
            </div>
          </button>
        ))}
      </div>
    </article>
  );
}

function DuplicatesPage() {
  const { query } = useApp();
  const cars = useCars();
  const isMobile = useIsMobile();
  const { open } = useCarDrawer();
  const [active, setActive] = useState<AttrKey[]>(DEFAULT_ATTRS);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const toggle = (key: AttrKey) =>
    setActive((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const groups = useMemo(() => {
    const attrs = ATTRS.filter((a) => active.includes(a.key));
    if (!attrs.length) return [];
    const filtered = filterRows(cars, query);
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

  const flatRows = useMemo(() => groups.flat(), [groups]);
  // "Surplus" is every copy beyond the first in each group.
  const surplusCount = groups.reduce((s, g) => s + (g.length - 1), 0);
  const tiedUp = flatRows.reduce((s, r) => s + (r.spent || 0), 0);
  const liquidation = flatRows.reduce((s, r) => s + (r.mrp || r.spent || 0), 0);
  const gain = liquidation - tiedUp;

  // Nine attributes across five columns is two tidy rows. At four it was three
  // rows with three empty cells trailing off the end.
  const AttrGrid = (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 md:grid-cols-5">
      {ATTRS.map((a) => (
        <label key={a.key} className="flex cursor-pointer items-center gap-2 text-xs">
          <Checkbox checked={active.includes(a.key)} onCheckedChange={() => toggle(a.key)} />
          <span className="truncate">{a.label}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-3 md:p-6">
      <PageHeading
        title="Duplicates"
        subtitle="Surplus castings, what they cost, and what they are worth trading."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Surplus castings"
          value={`${surplusCount}`}
          sub={`Across ${groups.length} unique model${groups.length === 1 ? "" : "s"}`}
          icon={<Copy className="size-4" />}
        />
        <StatCard
          label="Tied-up capital"
          value={inrFull(tiedUp)}
          sub="Purchase cost of duplicates"
          icon={<IndianRupee className="size-4" />}
        />
        <StatCard
          label="Liquidation value"
          value={inrFull(liquidation)}
          sub="Est. market liquidation"
          icon={<TrendingUp className="size-4" />}
          tone="emerald"
        />
        <StatCard
          label="Potential gain"
          value={`${gain >= 0 ? "+" : "-"}${inrFull(Math.abs(gain))}`}
          sub="Trade & liquidation delta"
          icon={<ArrowLeftRight className="size-4" />}
          tone="sky"
        />
      </div>

      <div className="card-elevated space-y-3 p-4">
        <PageToolbar
          left={<span className="text-xs text-muted-foreground">Match on</span>}
          right={
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setExportOpen(true)}
                title="Export the duplicates"
                aria-label="Export the duplicates"
              >
                <Download className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="md:hidden"
                onClick={() => setModifyOpen(true)}
                title="Change what counts as a duplicate"
                aria-label="Change what counts as a duplicate"
              >
                <SlidersHorizontal className="size-4" />
              </Button>
            </>
          }
        />
        <div className="hidden md:block">{AttrGrid}</div>
        {active.length === 0 && (
          <p className="text-xs text-destructive">Select at least one attribute to match on.</p>
        )}
        {/* The count is the result of the checkboxes above, so it reads after
            them rather than before. At the top it was a number that changed
            for reasons you had not read yet. */}
        <p className="border-t border-border pt-2.5 font-mono text-xs text-muted-foreground">
          {groups.length} group{groups.length === 1 ? "" : "s"} identified
        </p>
      </div>

      <div className="space-y-3">
        {groups.map((arr, i) => (
          <DuplicateGroup key={i} rows={arr} onOpen={open} />
        ))}
        {groups.length === 0 && (
          <div className="card-elevated p-8 text-center text-sm text-muted-foreground">
            No duplicates found.
          </div>
        )}
      </div>

      <Sheet open={modifyOpen && isMobile} onOpenChange={setModifyOpen}>
        <SheetContent side="bottom" className="gap-0 rounded-t-2xl p-0">
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted-foreground/30" />
          <SheetHeader className="border-b border-border p-4">
            <SheetTitle>Match on</SheetTitle>
          </SheetHeader>
          <div className="p-4">{AttrGrid}</div>
          <div className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button className="w-full" onClick={() => setModifyOpen(false)}>
              Done
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        name="duplicates"
        rows={flatRows}
        columns={CAR_CSV_COLUMNS}
        title="Export duplicates"
      />
    </div>
  );
}
