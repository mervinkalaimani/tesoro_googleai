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
import { useMemo, useState } from "react";
import { CalendarDays, List } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useCars } from "@/lib/cars-store";
import { SITE_NAME, siteUrl } from "@/lib/site";
import { useCarDrawer } from "@/components/car-details-drawer";
import type { Diecast } from "@/lib/types";
import { isIso } from "@/lib/status";
import { PageHeading } from "@/components/page-header";
import { castingName } from "@/lib/casting-page";
import { inrFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
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
  | "mrp"
  | "expected_date"
>;

const FIELDS =
  "car_id, brand, name, make, model, variant, assortment, series, sub_series, car_number, colour, mrp, expected_date";

/** make · assortment · series · sub series · car number · colour, empties dropped. */
function subtitleOf(row: Upcoming): string {
  return [row.make, row.assortment, row.series, row.sub_series, row.car_number, row.colour]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

/**
 * The money on the right of a row.
 *
 * Four figures and a seller, the same five a pre-order card carries, because
 * this is the same question asked by date instead of by seller. A casting
 * nobody here has ordered has only the MRP; the rest belong to a copy, and
 * without a copy there is nothing honest to put in them.
 */
/** A month read as a list of dates, or as the shape of a month. */
type View = "list" | "calendar";

/**
 * The two ways to read the same month.
 *
 * Its own control rather than `ViewToggle`, whose ViewMode is table / grid /
 * compact and is shared by six pages — widening that type for one page here
 * would be six files touched to add a word. Same container styling, so it
 * reads as the same control.
 */
function ViewSwitch({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const modes: { value: View; label: string; icon: typeof List }[] = [
    { value: "list", label: "List view", icon: List },
    { value: "calendar", label: "Calendar view", icon: CalendarDays },
  ];
  return (
    <div className="inline-flex h-8 shrink-0 items-center rounded-md border border-border bg-muted/40 p-0.5">
      {modes.map((m) => {
        const Icon = m.icon;
        const active = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => onChange(m.value)}
            aria-pressed={active}
            aria-label={m.label}
            title={m.label}
            className={cn(
              "grid size-7 place-items-center rounded-[6px] transition-all",
              active
                ? "bg-background text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * A month as a month: seven columns, a number in each cell that has anything
 * due, and the list itself on hover.
 *
 * The list view answers "what is coming"; this answers "how busy is the 10th",
 * which is the question you ask when deciding whether to hold money back.
 */
function MonthGrid({
  month,
  list,
  ownedByCasting,
  onOpen,
}: {
  month: string;
  list: Upcoming[];
  ownedByCasting: Map<string, Diecast>;
  onOpen: (car: Diecast) => void;
}) {
  const [year, mon] = month.split("-").map(Number);
  const first = new Date(year, mon - 1, 1);
  const days = new Date(year, mon, 0).getDate();
  // Monday-first, the way a diary is laid out: getDay() is Sunday-first.
  const lead = (first.getDay() + 6) % 7;

  const byDay = new Map<number, Upcoming[]>();
  for (const row of list) {
    const d = Number(String(row.expected_date).slice(8, 10));
    const at = byDay.get(d);
    if (at) at.push(row);
    else byDay.set(d, [row]);
  }

  return (
    <section className="card-elevated overflow-hidden">
      <header className="flex items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-display text-base font-semibold tracking-tight">
          {monthLabel(`${month}-01`)}
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {list.length} {list.length === 1 ? "casting" : "castings"}
        </span>
      </header>

      <div className="grid grid-cols-7 gap-px border-b border-border bg-border/60 text-center">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span
            key={d}
            className="bg-card py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground"
          >
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-border/60">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} className="min-h-14 bg-muted/20" />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const day = i + 1;
          const due = byDay.get(day);
          if (!due) {
            return (
              <span key={day} className="min-h-14 bg-card p-1.5 text-[11px] text-muted-foreground">
                {day}
              </span>
            );
          }
          const yours = due.filter((r) => ownedByCasting.has(r.car_id.toUpperCase())).length;
          return (
            <HoverCard key={day} openDelay={80} closeDelay={80}>
              <HoverCardTrigger asChild>
                <span className="min-h-14 cursor-default bg-card p-1.5 text-[11px] font-medium text-foreground ring-inset hover:ring-1 hover:ring-primary/40">
                  {day}
                  <span className="mt-1 flex items-center gap-1">
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      {due.length}
                    </span>
                    {yours > 0 ? (
                      <span className="rounded bg-sky-500/15 px-1 py-0.5 text-[9px] font-semibold text-sky-700 dark:text-sky-400">
                        {yours} yours
                      </span>
                    ) : null}
                  </span>
                </span>
              </HoverCardTrigger>
              <HoverCardContent align="start" className="w-80 p-0">
                <p className="border-b border-border px-3 py-2 text-[11px] font-semibold text-foreground">
                  {dayLabel(`${month}-${String(day).padStart(2, "0")}`)} · {due.length}{" "}
                  {due.length === 1 ? "casting" : "castings"}
                </p>
                <ul className="max-h-64 divide-y divide-border overflow-auto">
                  {due.map((row) => {
                    const owned = ownedByCasting.get(row.car_id.toUpperCase());
                    const body = (
                      <>
                        <span className="block truncate text-xs font-medium text-foreground">
                          {castingName(row as CatalogCar)}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {subtitleOf(row)}
                        </span>
                        {owned ? (
                          <span className="mt-0.5 block text-[10px] text-muted-foreground">
                            {owned.seller || "No seller"} · paid {inrFull(owned.paid || 0)} ·
                            balance {inrFull(balanceOf(owned))}
                          </span>
                        ) : null}
                      </>
                    );
                    return (
                      <li key={row.car_id}>
                        {owned ? (
                          <button
                            type="button"
                            className="block w-full px-3 py-2 text-left hover:bg-muted/40"
                            onClick={() => onOpen(owned)}
                          >
                            {body}
                          </button>
                        ) : (
                          <Link
                            to="/catalog/$carId"
                            params={{ carId: row.car_id }}
                            className="block px-3 py-2 hover:bg-muted/40"
                          >
                            {body}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </HoverCardContent>
            </HoverCard>
          );
        })}
      </div>
    </section>
  );
}

/** What is still owed on a copy: what it cost, less what has been handed over. */
function balanceOf(car: Diecast): number {
  return Math.max((car.spent || 0) - (car.paid || 0), 0);
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <span className="min-w-0 text-right">
      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={`block truncate text-[11px] font-semibold tabular-nums ${tone}`}>
        {value}
      </span>
    </span>
  );
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
    const title = "Pre Order Calendar — upcoming diecast releases | VIIV";
    const description =
      "Upcoming die-cast releases by month: Mini GT, Kaido House, Greenlight, Hot Wheels and more, with the date each is expected.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: siteUrl("/releases") },
        { property: "og:site_name", content: SITE_NAME },
        { name: "twitter:card", content: "summary" },
      ],
      // The other page a stranger can land on, and the other one that is
      // served from two hosts.
      links: [{ rel: "canonical", href: siteUrl("/releases") }],
    };
  },

  component: ReleasesPage,
});

function ReleasesPage() {
  const { upcoming } = Route.useLoaderData();
  const cars = useCars();
  const drawer = useCarDrawer();
  const [view, setView] = useState<View>("list");

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
      >
        <ViewSwitch value={view} onChange={setView} />
      </PageHeading>

      {view === "calendar" ? (
        // Three months abreast once there is room for them: a release date is
        // only useful next to the ones around it, and a full-width column of
        // one month at a time is a year of scrolling.
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {months.map(([key, list]) => (
            <MonthGrid
              key={key}
              month={key}
              list={list}
              ownedByCasting={ownedByCasting}
              onOpen={(car) => drawer.open(car)}
            />
          ))}
        </div>
      ) : null}

      {/* One card a month, the same card every other page in the app is made
          of — a month is the unit a collector plans in. */}
      {view === "list" &&
        months.map(([key, list]) => (
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
                    {/* Wide screens only: on a phone the name and the date are
                      the whole point, and five more columns would crush them. */}
                    <span className="hidden shrink-0 items-baseline gap-4 lg:flex">
                      <Stat label="Seller" value={owned?.seller || "—"} />
                      <Stat label="MRP" value={row.mrp > 0 ? inrFull(row.mrp) : "—"} />
                      <Stat label="Spent" value={owned?.spent ? inrFull(owned.spent) : "—"} />
                      <Stat label="Paid" value={owned?.paid ? inrFull(owned.paid) : "—"} />
                      <Stat
                        label="Balance"
                        value={owned ? inrFull(balanceOf(owned)) : "—"}
                        tone={
                          owned && balanceOf(owned) > 0 ? "text-amber-600 dark:text-amber-400" : ""
                        }
                      />
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
                      <Link
                        to="/catalog/$carId"
                        params={{ carId: row.car_id }}
                        className={rowClass}
                      >
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
