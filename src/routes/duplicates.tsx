import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronDown, Copy, Share2, X } from "lucide-react";
import { useCars } from "@/lib/cars-store";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import { ExportDialog } from "@/components/export-dialog";
import { CAR_CSV_COLUMNS } from "@/lib/car-columns";
import { inrFull } from "@/lib/format";
import { useCarDrawer } from "@/components/car-details-drawer";
import { CarMarks } from "@/components/car-marks";
import { PageHeading, PageToolbar } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

function DuplicateGroup({ rows, onOpen }: { rows: Diecast[]; onOpen: (car: Diecast) => void }) {
  const first = rows[0];
  const valuation = rows.reduce((s, r) => s + (r.mrp || r.spent || 0), 0);
  const surplus = rows.length - 1;
  // Closed by default: the page is a list of groups to scan, and the copies
  // inside one are only worth the room once it is the group you are after.
  const [open, setOpen] = useState(false);

  return (
    <article className="card-elevated overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 p-4 text-left"
      >
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
        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Group valuation
            </div>
            <div className="text-sm font-bold tabular-nums">{inrFull(valuation)}</div>
          </div>
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {/* Three across. These are copies of one casting, so what you are doing
          here is comparing them — which cost more, which came from where — and
          that is a great deal easier side by side than stacked one per row down
          a page.

          Loose / Carded has gone: it was the widest thing on every row and it
          read as the heading, when the question on this page is which duplicate
          to keep. The car ID takes its place, because with three near-identical
          cards in a row it is the only thing that tells them apart. */}
      {open && (
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
      )}
    </article>
  );
}

function DuplicatesPage() {
  const { query } = useApp();
  const cars = useCars();
  const { open } = useCarDrawer();
  const [active, setActive] = useState<AttrKey[]>(DEFAULT_ATTRS);
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

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-3 md:p-6">
      <PageHeading
        title="Duplicates"
        subtitle={`${surplusCount} ${surplusCount === 1 ? "casting" : "castings"} across ${groups.length} ${groups.length === 1 ? "model" : "models"}`}
      />

      <PageToolbar
        sticky
        oneLine
        left={
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 max-w-full">
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
        right={
          <Button
            size="icon"
            variant="outline"
            onClick={() => setExportOpen(true)}
            title="Export the duplicates"
            aria-label="Export the duplicates"
            className="size-8 shrink-0 justify-center p-0"
          >
            <Share2 className="size-3.5" />
          </Button>
        }
      />

      {active.length === 0 && (
        <p className="text-xs text-destructive">Select at least one attribute to match on.</p>
      )}

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
