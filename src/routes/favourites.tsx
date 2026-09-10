import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Award,
  ChevronDown,
  ChevronUp,
  IndianRupee,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import { useCars, useCarsActions } from "@/lib/cars-store";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import { CarsTable } from "@/components/cars-table";
import { CarThumb } from "@/components/car-thumb";
import { CompactCarCard } from "@/components/compact-car-card";
import { COMPACT_GRID_COLS, GRID_COLS, ViewToggle, type ViewMode } from "@/components/view-toggle";
import { SegmentControl } from "@/components/segment-control";
import { useCarDrawer } from "@/components/car-details-drawer";
import { useRegisterExportScope } from "@/lib/export-scope";
import { inrFull, mrpRatio } from "@/lib/format";

export const Route = createFileRoute("/favourites")({
  head: () => ({
    meta: [
      { title: "Favourites | Tesoro" },
      {
        name: "description",
        content:
          "View diecast cars marked as favourites or chase pieces with model, brand, seller, colour, and status details.",
      },
      { property: "og:title", content: "Favourites | Tesoro" },
      {
        property: "og:description",
        content:
          "View diecast cars marked as favourites or chase pieces with model, brand, seller, colour, and status details.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FavouritesPage,
});

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
  tone?: "default" | "emerald" | "amber";
}) {
  const valueTone =
    tone === "emerald"
      ? "text-emerald-500"
      : tone === "amber"
        ? "text-amber-500"
        : "text-foreground";
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

function GalleryCard({
  car,
  onOpen,
  onToggleFavourite,
}: {
  car: Diecast;
  onOpen: () => void;
  onToggleFavourite: () => void;
}) {
  const cost = car.spent || 0;
  const market = car.mrp || cost;
  const ratio = mrpRatio(cost, car.mrp || 0);

  return (
    <article className="card-elevated flex flex-col overflow-hidden">
      <div className="relative">
        <button type="button" onClick={onOpen} className="block w-full">
          <CarThumb car={car} className="aspect-[16/10] w-full" />
        </button>

        {/* The car ID is catalogue plumbing, not something to read off a
            photograph — it sits in the details drawer and the table. */}
        {car.chase && (
          <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-black">
            <Sparkles className="size-3" />
            CHASE
          </span>
        )}

        <button
          type="button"
          onClick={onToggleFavourite}
          aria-pressed={car.favourite}
          title={car.favourite ? "Remove from favourites" : "Add to favourites"}
          className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/70 backdrop-blur-sm transition-colors hover:bg-black/90"
        >
          <Star
            className={`size-3.5 ${
              car.favourite ? "fill-amber-400 text-amber-400" : "text-white/70"
            }`}
          />
        </button>

        <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap items-center gap-1.5">
          {car.brand && (
            <span className="rounded-full border border-white/10 bg-black/80 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
              {car.brand}
            </span>
          )}
          <span className="rounded-full border border-white/10 bg-black/80 px-2 py-0.5 text-[10px] text-white/80 backdrop-blur-sm">
            {car.open ? "Loose" : "Carded"}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <button
          type="button"
          onClick={onOpen}
          className="text-left text-base font-bold tracking-tight hover:text-primary"
        >
          {car.name || `${car.make} ${car.model}`.trim() || "Unnamed car"}
        </button>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {[car.series, car.subSeries, car.assortment].filter(Boolean).join(" · ") || "—"}
        </p>

        <div className="mt-auto border-t border-border pt-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Market valuation
          </div>
          <div className="mt-0.5 flex items-baseline gap-1.5 text-sm font-semibold tabular-nums">
            <span>{inrFull(market)}</span>
            {ratio && (
              <span
                className={`inline-flex items-center text-xs font-medium ${
                  ratio.over ? "text-rose-400" : "text-emerald-500"
                }`}
              >
                (
                {ratio.over ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                {ratio.text})
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function FavouritesPage() {
  const { query } = useApp();
  const cars = useCars();
  const { open } = useCarDrawer();
  const { updateCar } = useCarsActions();
  const [mode, setMode] = useState<"favourite" | "chase">("favourite");
  const [view, setView] = useState<ViewMode>("table");

  const rows = useMemo(() => {
    const filtered = filterRows(cars, query);
    return filtered.filter((r) => (mode === "favourite" ? r.favourite : r.chase));
  }, [cars, query, mode]);

  const cost = rows.reduce((s, r) => s + (r.spent || 0), 0);
  const market = rows.reduce((s, r) => s + (r.mrp || r.spent || 0), 0);
  const gain = market - cost;
  const pct = cost > 0 ? (gain / cost) * 100 : 0;
  const avg = rows.length ? Math.round(market / rows.length) : 0;
  const chaseCount = rows.filter((r) => r.chase).length;

  useRegisterExportScope(
    mode === "favourite" ? "favourites" : "chase",
    mode === "favourite" ? "Favourites" : "Chase cars",
    rows,
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-3 md:p-6">
      <div className="card-elevated flex flex-wrap items-start justify-between gap-3 bg-gradient-to-r from-amber-500/10 to-transparent p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-500 text-black">
            <Star className="size-5 fill-black" />
          </span>
          <div className="min-w-0">
            <h1 className="text-display text-xl font-semibold">Crown jewel gallery</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Hand-picked pinnacle castings, chase variations, and the highest appreciating grails
              in your collection.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-muted/40 px-3 py-1 font-mono text-xs">
          {rows.length} standout model{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Portfolio value"
          value={inrFull(market)}
          sub={`Cost: ${inrFull(cost)}`}
          icon={<IndianRupee className="size-4" />}
        />
        <StatCard
          label="Unrealised gain"
          value={`${gain >= 0 ? "+" : "-"}${inrFull(Math.abs(gain))}`}
          sub={`${gain >= 0 ? "+" : ""}${pct.toFixed(1)}% return`}
          icon={<TrendingUp className="size-4" />}
          tone={gain >= 0 ? "emerald" : "default"}
        />
        <StatCard
          label="Average / piece"
          value={inrFull(avg)}
          sub="Standout castings"
          icon={<Award className="size-4" />}
        />
        <StatCard
          label="Chase editions"
          value={`${chaseCount}`}
          sub="Rare pulls"
          icon={<Sparkles className="size-4" />}
          tone="amber"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentControl
          value={mode}
          onChange={setMode}
          options={[
            { value: "favourite", label: "Favourites" },
            { value: "chase", label: "Chase" },
          ]}
        />
        <ViewToggle value={view} onChange={setView} />
      </div>

      {rows.length === 0 ? (
        <div className="card-elevated p-8 text-center text-sm text-muted-foreground">
          {mode === "favourite" ? "No favourites yet." : "No chase cars yet."}
        </div>
      ) : view !== "table" ? (
        <div className={view === "compact" ? COMPACT_GRID_COLS : GRID_COLS}>
          {rows.map((r, i) =>
            view === "compact" ? (
              <CompactCarCard key={(r.id || "") + i} car={r} onOpen={() => open(r)} />
            ) : (
              <GalleryCard
                key={(r.id || "") + i}
                car={r}
                onOpen={() => open(r)}
                onToggleFavourite={() => updateCar({ ...r, favourite: !r.favourite })}
              />
            ),
          )}
        </div>
      ) : (
        <div className="card-elevated overflow-hidden">
          <CarsTable rows={rows} badgePrimary={mode} />
        </div>
      )}
    </div>
  );
}
