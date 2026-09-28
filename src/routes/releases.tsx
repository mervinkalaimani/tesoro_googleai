/**
 * What is coming, by the month it is due.
 *
 * /preorders answers "what have I put money on". This answers the other
 * question, the one a collector asks weekly and currently asks somewhere else:
 * what drops next. It is built from the catalogue's pre-order entries —
 * 89 of them carry a date today — so it is the same shared list the whole app
 * files against rather than a calendar somebody has to maintain by hand.
 *
 * Public, like a casting page, and for the same reason: "Mini GT October 2026"
 * is a thing people type into a search box, and a page that answers it is a
 * reason to come back on a schedule rather than only when a parcel moves.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useCars } from "@/lib/cars-store";
import { useCarDrawer } from "@/components/car-details-drawer";
import type { Diecast } from "@/lib/types";
import { isIso } from "@/lib/status";
import { PageHeading } from "@/components/page-header";
import { castingName } from "@/lib/casting-page";
import type { CatalogCar } from "@/lib/catalog";

type Upcoming = Pick<
  CatalogCar,
  | "car_id"
  | "brand"
  | "name"
  | "make"
  | "model"
  | "variant"
  | "assortment"
  | "series"
  | "sub_series"
  | "car_number"
  | "colour"
  | "expected_date"
>;

const FIELDS =
  "car_id, brand, name, make, model, variant, assortment, series, sub_series, car_number, colour, expected_date";

/** make · assortment · series · sub series · car number · colour, empties dropped. */
function subtitleOf(row: Upcoming): string {
  return [row.make, row.assortment, row.series, row.sub_series, row.car_number, row.colour]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

/** "2026-10-15" → "October 2026". Anything unparseable is filtered out before here. */
function monthLabel(iso: string): string {
  const [y, m] = iso.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/** "2026-10-15" → "15 Oct". A day, when there is one worth printing. */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!d) return "";
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export const Route = createFileRoute("/releases")({
  loader: async (): Promise<{ upcoming: Upcoming[] }> => {
    const { data } = await supabase
      .from("tesoro_car_catalog")
      .select(FIELDS)
      .eq("release_status", "Pre Order")
      // A pre-order with no date is a rumour, and a calendar of rumours is not
      // a calendar. 76 of the 165 sit out for this reason.
      .not("expected_date", "is", null)
      .gte("expected_date", "1000-01-01")
      .order("expected_date", { ascending: true })
      .limit(500);

    return { upcoming: (data ?? []) as Upcoming[] };
  },

  headers: () => ({
    "cache-control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=86400",
  }),

  head: () => {
    const title = "Pre Order Calendar — upcoming diecast releases | Tesoro";
    const description =
      "Upcoming die-cast releases by month: Mini GT, Kaido House, Greenlight, Hot Wheels and more, with the date each is expected.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },

  component: ReleasesPage,
});

function ReleasesPage() {
  const { upcoming } = Route.useLoaderData();
  const cars = useCars();
  const drawer = useCarDrawer();

  /**
   * The castings this visitor is hunting. Signed out it is empty and nothing is
   * marked, which is the whole cost of the feature: no request, no table, and
   * it starts working the day somebody's want turns up on this page.
   */
  const wanted = useMemo(() => {
    const ids = new Set<string>();
    for (const c of cars) {
      if (isIso(c.status) && c.catalogId) ids.add(c.catalogId.toUpperCase());
    }
    return ids;
  }, [cars]);

  /**
   * Your own copy of each casting on the page, if you have one.
   *
   * A pre-order you placed is a car in your collection, so the row should open
   * that car rather than send you to the shared catalogue entry — the catalogue
   * says what the casting is, your row says what you paid and when it is due.
   * Only when you own none of it does the row fall back to the casting page.
   */
  const ownedByCasting = useMemo(() => {
    const byId = new Map<string, Diecast>();
    for (const c of cars) {
      if (!c.catalogId || isIso(c.status)) continue;
      const key = c.catalogId.toUpperCase();
      if (!byId.has(key)) byId.set(key, c);
    }
    return byId;
  }, [cars]);

  const months = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const out = new Map<string, Upcoming[]>();
    for (const row of upcoming) {
      const date = String(row.expected_date || "");
      // Yesterday's "coming soon" is nobody's calendar. It stays in the
      // catalogue; it just stops being news.
      if (date < today) continue;
      const key = date.slice(0, 7);
      const list = out.get(key);
      if (list) list.push(row);
      else out.set(key, [row]);
    }
    return [...out.entries()];
  }, [upcoming]);

  const total = months.reduce((n, [, list]) => n + list.length, 0);
  const mine = months.reduce(
    (n, [, list]) => n + list.filter((r) => wanted.has(r.car_id.toUpperCase())).length,
    0,
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-3 md:p-6">
      <PageHeading
        title="Pre Order Calendar"
        subtitle={
          <>
            {total === 0
              ? "Nothing in the catalogue is dated further ahead than today."
              : `${total} castings with a release date, soonest first.`}
            {mine > 0 ? ` ${mine} of them are on your list.` : ""}
          </>
        }
      />

      {/* One card a month, the same card every other page in the app is made
          of — a month is the unit a collector plans in. */}
      {months.map(([key, list]) => (
        <section key={key} className="card-elevated overflow-hidden">
          <header className="flex items-baseline justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="text-display text-base font-semibold tracking-tight">
              {monthLabel(`${key}-01`)}
            </h2>
            <span className="text-[11px] text-muted-foreground">
              {list.length} {list.length === 1 ? "casting" : "castings"}
            </span>
          </header>
          <ul className="divide-y divide-border">
            {list.map((row) => {
              const isWanted = wanted.has(row.car_id.toUpperCase());
              const owned = ownedByCasting.get(row.car_id.toUpperCase());
              const inside = (
                <>
                  <span className="w-14 shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                    {dayLabel(String(row.expected_date))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {castingName(row as CatalogCar)}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {subtitleOf(row)}
                    </span>
                  </span>
                  {owned ? (
                    <span className="shrink-0 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-400">
                      Yours
                    </span>
                  ) : null}
                  {isWanted ? (
                    <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                      On your list
                    </span>
                  ) : null}
                </>
              );
              const rowClass =
                "flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40";

              return (
                <li key={row.car_id}>
                  {owned ? (
                    <button type="button" className={rowClass} onClick={() => drawer.open(owned)}>
                      {inside}
                    </button>
                  ) : (
                    <Link to="/catalog/$carId" params={{ carId: row.car_id }} className={rowClass}>
                      {inside}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
