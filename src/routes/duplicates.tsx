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
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              SKU: {first.id || "—"} · {surplus} surplus unit{surplus === 1 ? "" : "s"}
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

      <div className="space-y-2 border-t border-border p-3">
        {rows.map((r, i) => (
          <div
            key={(r.id || "") + i}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 shrink-0 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                #{i + 1}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      r.open
                        ? "border-zinc-500/40 bg-zinc-500/10 text-zinc-300"
                        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    }`}
                  >
                    {r.open ? "Loose / Display" : "Carded / Mint"}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {r.status || "—"}
                    {r.seller ? ` · ${r.seller}` : ""}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                  Cost: {inrFull(r.spent || 0)}
                  {r.date ? ` · Acquired: ${r.date}` : ""}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-semibold tabular-nums">
                {inrFull(r.mrp || r.spent || 0)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Open details"
                onClick={() => onOpen(r)}
              >
                <Copy className="size-3.5" />
              </Button>
              {/* Editing is on the car now, behind the button beside this
                  one — a pencil in a list of near-identical rows is the
                  easiest place in the app to edit the wrong copy. */}
            </div>
          </div>
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

  const AttrGrid = (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-display text-xl font-semibold">Automated duplicate detection</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Identifies surplus castings, loose display versus sealed doubles, and trade
              opportunities.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {groups.length} group{groups.length === 1 ? "" : "s"} identified
            </span>
            <Button size="sm" variant="outline" onClick={() => setExportOpen(true)}>
              <Download className="size-4" />
              Export
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="md:hidden"
              onClick={() => setModifyOpen(true)}
            >
              <SlidersHorizontal className="size-4" />
              Modify
            </Button>
          </div>
        </div>
        <div className="hidden md:block">{AttrGrid}</div>
        {active.length === 0 && (
          <p className="text-xs text-destructive">Select at least one attribute to match on.</p>
        )}
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
