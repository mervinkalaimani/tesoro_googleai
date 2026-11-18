import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useCars, useCarsRefresh } from "@/lib/cars-store";
import { RowListSkeleton, TileGridSkeleton } from "@/components/dashboard-skeletons";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import { CarsTable } from "@/components/cars-table";
import { rarityOf } from "@/lib/rarity";
import { InventoryCard } from "@/routes/inventory";
import { BLISTER_GRID_COLS, GRID_COLS, ViewToggle, type ViewMode } from "@/components/view-toggle";
import { BlisterTile } from "@/components/blister-tile";
import { SegmentControl } from "@/components/segment-control";
import { PageHeading } from "@/components/page-header";
import { useCarDrawer } from "@/components/car-details-drawer";
import { useRegisterExportScope } from "@/lib/export-scope";
import { ProGate } from "@/components/pro-gate";

type Mode = "favourite" | "chase" | "th" | "sth";

/** Which cars each segment holds. Chase, TH and STH are separate rarities. */
const IN_MODE: Record<Mode, (car: Diecast) => boolean> = {
  favourite: (c) => Boolean(c.favourite),
  chase: (c) => rarityOf(c) === "Chase",
  th: (c) => rarityOf(c) === "TH",
  sth: (c) => rarityOf(c) === "STH",
};

const MODE_TEXT: Record<Mode, { title: string; subtitle: string; empty: string; sub: string }> = {
  favourite: {
    title: "Favourites",
    subtitle: "The ones worth keeping an eye on, and what they are worth.",
    empty: "No favourites yet.",
    sub: "Marked favourite",
  },
  chase: {
    title: "Chase cars",
    subtitle: "The rare pulls, and what they are worth.",
    empty: "No chase cars yet.",
    sub: "Chase pulls",
  },
  th: {
    title: "Treasure Hunts",
    subtitle: "Hot Wheels Treasure Hunts, and what they are worth.",
    empty: "No Treasure Hunts yet.",
    sub: "Treasure Hunts",
  },
  sth: {
    title: "Super Treasure Hunts",
    subtitle: "Hot Wheels Super Treasure Hunts, and what they are worth.",
    empty: "No Super Treasure Hunts yet.",
    sub: "Super Treasure Hunts",
  },
};

export const Route = createFileRoute("/favourites")({
  // The home page's Prized possessions links here on the shelf it was showing.
  validateSearch: (s: Record<string, unknown>): { mode?: Mode } => ({
    mode:
      s.mode === "chase" || s.mode === "th" || s.mode === "sth" || s.mode === "favourite"
        ? s.mode
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Favourites | VIIV" },
      {
        name: "description",
        content:
          "View diecast cars marked as favourites or chase pieces with model, brand, seller, colour, and status details.",
      },
      { property: "og:title", content: "Favourites | VIIV" },
      {
        property: "og:description",
        content:
          "View diecast cars marked as favourites or chase pieces with model, brand, seller, colour, and status details.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProGate title="Favourites">
      <FavouritesPage />
    </ProGate>
  ),
});

function FavouritesPage() {
  const { query } = useApp();
  const cars = useCars();
  const loading = useCarsRefresh().refreshing && cars.length === 0;
  const { open } = useCarDrawer();
  const { mode: startMode } = Route.useSearch();
  const [mode, setMode] = useState<Mode>(startMode ?? "favourite");
  const [view, setView] = useState<ViewMode>("blister");

  // TH and STH only get a segment when the collection has one. Judged on the
  // whole collection, not the search, so the control does not jump while typing.
  const hasTh = useMemo(() => cars.some(IN_MODE.th), [cars]);
  const hasSth = useMemo(() => cars.some(IN_MODE.sth), [cars]);
  useEffect(() => {
    if ((mode === "th" && !hasTh) || (mode === "sth" && !hasSth)) setMode("favourite");
  }, [mode, hasTh, hasSth]);

  const rows = useMemo(() => filterRows(cars, query).filter(IN_MODE[mode]), [cars, query, mode]);
  const text = MODE_TEXT[mode];

  useRegisterExportScope(mode === "favourite" ? "favourites" : mode, text.title, rows);

  return (
    <div className="mx-auto max-w-[1600px] space-y-3 p-3 md:p-6">
      <PageHeading
        title={text.title}
        subtitle={`${rows.length} ${rows.length === 1 ? "car" : "cars"}`}
      >
        {/* The model count is a KPI tile now, so the segments and the view
            control sit beside the title instead of on a row of their own. */}
        <SegmentControl
          value={mode}
          onChange={setMode}
          options={[
            { value: "favourite", label: "Favourites" },
            { value: "chase", label: "Chase" },
            ...(hasTh ? [{ value: "th" as const, label: "TH" }] : []),
            ...(hasSth ? [{ value: "sth" as const, label: "STH" }] : []),
          ]}
        />
        <ViewToggle value={view} onChange={setView} />
      </PageHeading>

      {loading ? (
        view === "table" ? (
          <RowListSkeleton rows={8} />
        ) : (
          <TileGridSkeleton className={view === "blister" ? BLISTER_GRID_COLS : GRID_COLS} />
        )
      ) : rows.length === 0 ? (
        <div className="card-elevated p-8 text-center text-sm text-muted-foreground">
          {text.empty}
        </div>
      ) : view !== "table" ? (
        <div className={view === "blister" ? BLISTER_GRID_COLS : GRID_COLS}>
          {rows.map((r, i) =>
            view === "blister" ? (
              <BlisterTile
                key={(r.id || "") + i}
                car={r}
                onOpen={() => open(r)}
                showStatus={false}
              />
            ) : (
              <InventoryCard
                key={(r.id || "") + i}
                car={r}
                onOpen={() => open(r)}
                showStatus={false}
              />
            ),
          )}
        </div>
      ) : (
        // No frame on a phone: display:contents drops the card's box while
        // keeping it round the table on a desktop. The table draws its own
        // phone cards — the same rows as My Cars — and one design for every
        // segment, without the money: the price and the seller are not what
        // this page is for.
        <div className="card-elevated overflow-hidden max-md:contents">
          <CarsTable
            rows={rows}
            bare
            showMrp={false}
            showMoney={false}
            showStatus={false}
            badgesAtEnd
            showImage
          />
        </div>
      )}
    </div>
  );
}
