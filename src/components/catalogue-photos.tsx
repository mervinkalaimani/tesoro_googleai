import { useMemo, useState } from "react";
import { Check, Loader2, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { useCatalog } from "@/lib/catalog-store";
import { catalogCarToDiecast, type CatalogCar } from "@/lib/catalog";
import { carSubLine } from "@/lib/car-subline";
import { CarThumb } from "@/components/car-thumb";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SegmentControl } from "@/components/segment-control";
import { cn } from "@/lib/utils";

/** How many rows are drawn at once; the rest arrive on Show more. */
const PAGE = 40;

type Filter = "missing" | "all" | "shared";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "missing", label: "No photo" },
  { value: "shared", label: "Shared" },
  { value: "all", label: "All" },
];

const clean = (v: string | null | undefined) => (v || "").trim();

/**
 * Every casting with a box for its photo, so a hundred of them can be filled
 * in during one sitting.
 *
 * This exists because catalogue photos have been wrong in bulk twice: once
 * from a shared image_url that put one Mini GT shot on 63 castings, and once
 * from /api/sync-images writing a photo to every row sharing a make and a
 * model. Both are fixed, but a list of empty entries is left behind and there
 * was no way to work through it except opening each casting's edit dialog in
 * turn.
 *
 * Nothing is bulk-applied. Each row saves on its own the moment you leave the
 * box, because a mistake should cost one casting rather than a screenful.
 */
export function CataloguePhotos() {
  const { catalog, updateCatalogCar } = useCatalog();
  const [filter, setFilter] = useState<Filter>("missing");
  const [q, setQ] = useState("");
  const [visible, setVisible] = useState(PAGE);
  /** What is typed but not yet saved, keyed by car_id. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  /**
   * Photos used by more than one casting. Two entries wearing one picture is
   * the fault this page exists to clear, so they get their own filter and a
   * mark on the row.
   */
  const sharedPhotos = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of catalog) {
      const u = clean(c.image_url);
      if (u) counts.set(u, (counts.get(u) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([u]) => u));
  }, [catalog]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = catalog.filter((c) => {
      const url = clean(c.image_url);
      if (filter === "missing" && url) return false;
      if (filter === "shared" && !sharedPhotos.has(url)) return false;
      if (!needle) return true;
      return [
        c.name,
        c.make,
        c.model,
        c.variant,
        c.colour,
        c.brand,
        c.assortment,
        c.series,
        c.car_id,
      ]
        .map((v) => (v || "").toLowerCase())
        .some((v) => v.includes(needle));
    });
    // Alphabetical by what you would search for, so the list is stable while
    // you work down it and a saved row does not jump.
    return out.sort((a, b) =>
      `${a.brand} ${a.make} ${a.model}`.localeCompare(
        `${b.brand} ${b.make} ${b.model}`,
        undefined,
        {
          numeric: true,
          sensitivity: "base",
        },
      ),
    );
  }, [catalog, filter, q, sharedPhotos]);

  const missingCount = useMemo(() => catalog.filter((c) => !clean(c.image_url)).length, [catalog]);

  const save = async (c: CatalogCar) => {
    const next = clean(drafts[c.car_id]);
    if (next === clean(c.image_url)) return;
    setBusy((b) => ({ ...b, [c.car_id]: true }));
    const ok = await updateCatalogCar({ ...c, image_url: next || undefined });
    setBusy((b) => ({ ...b, [c.car_id]: false }));
    if (!ok) {
      toast.error("Could not save that photo");
      return;
    }
    setSaved((s) => ({ ...s, [c.car_id]: true }));
    setDrafts((d) => {
      const { [c.car_id]: _drop, ...rest } = d;
      return rest;
    });
    window.setTimeout(() => setSaved((s) => ({ ...s, [c.car_id]: false })), 1600);
  };

  const shown = rows.slice(0, visible);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
        <p className="text-xs text-muted-foreground">
          {missingCount.toLocaleString()} of {catalog.length.toLocaleString()} castings have no
          photo. Paste a link and it saves when you leave the box — the preview on the left is what
          everyone will see.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setVisible(PAGE);
            }}
            placeholder="Search casting, brand, series or ID"
            className="pl-9"
            aria-label="Search castings"
          />
        </div>
        <SegmentControl
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setVisible(PAGE);
          }}
          options={FILTERS}
          className="h-9 text-sm"
        />
      </div>

      <p className="px-1 text-[11px] text-muted-foreground">{rows.length.toLocaleString()} shown</p>

      <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
        {shown.map((c) => {
          const url = clean(c.image_url);
          const draft = drafts[c.car_id];
          const value = draft === undefined ? url : draft;
          const isShared = Boolean(url) && sharedPhotos.has(url);
          return (
            <div key={c.car_id} className="flex items-start gap-3 p-3">
              {/* The preview reads the typed value, not the saved one, so a
                  bad link shows itself before it is committed. */}
              <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted/30">
                <CarThumb
                  car={{ ...catalogCarToDiecast(c), imageUrl: value || undefined }}
                  className="size-full"
                />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-foreground">
                      {c.name || `${c.make} ${c.model}`.trim()}
                    </span>
                    {/* Colour rides beside the name rather than in the sub-line,
                        because it is what tells two otherwise identical castings
                        apart — and picking the right photo is the whole job
                        here. A casting with none says so, since that is a gap
                        worth noticing while you are already looking. */}
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
                        clean(c.colour)
                          ? "border-border bg-muted/50 text-foreground"
                          : "border-dashed border-border/70 text-muted-foreground/70",
                      )}
                    >
                      {clean(c.colour) || "no colour"}
                    </span>
                    {isShared && (
                      <span
                        title="Another casting uses this same photo"
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500"
                      >
                        <TriangleAlert className="size-2.5" />
                        shared
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {carSubLine(catalogCarToDiecast(c))}
                  </p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground/70">
                    {c.car_id}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    value={value}
                    onChange={(e) => setDrafts((d) => ({ ...d, [c.car_id]: e.target.value }))}
                    onBlur={() => void save(c)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    placeholder="https://…"
                    aria-label={`Photo link for ${c.name || c.car_id}`}
                    className={cn(
                      "h-8 font-mono text-[11px]",
                      draft !== undefined && draft !== url && "border-primary/60",
                    )}
                  />
                  <span className="w-4 shrink-0">
                    {busy[c.car_id] ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : saved[c.car_id] ? (
                      <Check className="size-4 text-emerald-500" />
                    ) : null}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {shown.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Nothing here — try another filter.
          </p>
        )}
      </div>

      {visible < rows.length && (
        <Button variant="outline" className="w-full" onClick={() => setVisible((v) => v + PAGE)}>
          Show {Math.min(PAGE, rows.length - visible)} more
        </Button>
      )}
    </div>
  );
}
