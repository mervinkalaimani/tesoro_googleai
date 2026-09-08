import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, SlidersHorizontal } from "lucide-react";
import { useCars } from "@/lib/cars-store";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import { CarsTable, carSubLine } from "@/components/cars-table";
import { ExportDialog } from "@/components/export-dialog";
import { CAR_CSV_COLUMNS } from "@/lib/car-columns";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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

function DuplicatesPage() {
  const { query } = useApp();
  const cars = useCars();
  const isMobile = useIsMobile();
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

  const totalDupes = groups.reduce((s, g) => s + g.length, 0);
  const flatRows = useMemo(() => groups.flat(), [groups]);

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
      <div className="card-elevated space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-display text-xl font-semibold">Duplicates</h1>
            <p className="text-xs text-muted-foreground">
              {groups.length} duplicate group{groups.length === 1 ? "" : "s"} · {totalDupes} cars
            </p>
          </div>
          <div className="flex items-center gap-2">
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

      <Accordion type="multiple" className="space-y-2">
        {groups.map((arr, i) => {
          const first = arr[0];
          return (
            <AccordionItem
              key={i}
              value={String(i)}
              className="card-elevated border-0 px-3 md:px-4"
            >
              <AccordionTrigger className="py-3 hover:no-underline">
                <div className="flex w-full items-center justify-between gap-4 pr-3">
                  <div className="min-w-0 text-left">
                    <div className="truncate font-medium">
                      {first.name || `${first.make} ${first.model}`.trim() || "—"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {carSubLine(first)}
                    </div>
                  </div>
                  <div className="shrink-0 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    ×{arr.length}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <CarsTable rows={arr} />
              </AccordionContent>
            </AccordionItem>
          );
        })}
        {groups.length === 0 && (
          <div className="card-elevated p-8 text-center text-sm text-muted-foreground">
            No duplicates found.
          </div>
        )}
      </Accordion>

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
