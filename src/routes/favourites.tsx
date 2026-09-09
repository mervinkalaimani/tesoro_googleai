import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCars } from "@/lib/cars-store";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import { CarsTable } from "@/components/cars-table";
import { SegmentControl } from "@/components/segment-control";
import { inr } from "@/lib/format";

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

function FavouritesPage() {
  const { query } = useApp();
  const cars = useCars();
  const [mode, setMode] = useState<"favourite" | "chase">("favourite");

  const rows = useMemo(() => {
    const filtered = filterRows(cars, query);
    return filtered.filter((r) => (mode === "favourite" ? r.favourite : r.chase));
  }, [cars, query, mode]);

  const totalCost = useMemo(() => rows.reduce((s, r) => s + (r.spent || 0), 0), [rows]);

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col p-3 md:p-6">
      <div className="card-elevated mx-auto flex w-full max-w-[1600px] min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h1 className="text-display text-xl font-semibold">
              {mode === "favourite" ? "Favourites" : "Chase cars"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {rows.length.toLocaleString()} car{rows.length === 1 ? "" : "s"} · Total cost:{" "}
              {inr(totalCost)}
            </p>
          </div>
          <SegmentControl
            value={mode}
            onChange={setMode}
            options={[
              { value: "favourite", label: "Favourites" },
              { value: "chase", label: "Chase" },
            ]}
          />
        </div>
        <div className="min-h-0 flex-1">
          <CarsTable rows={rows} badgePrimary={mode} />
        </div>
      </div>
    </div>
  );
}
