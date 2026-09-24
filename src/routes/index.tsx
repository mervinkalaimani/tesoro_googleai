import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Truck,
  Clock3,
  ShoppingBag,
  Sparkles,
  Info,
  ChevronRight,
  AlertTriangle,
  PauseCircle,
  Plus,
  CalendarClock,
  PackageCheck,
} from "lucide-react";
import { KpiBand, KpiTile } from "@/components/kpi";
import { TrackingLink } from "@/components/tracking-link";
import { trackingPageFor } from "@/lib/tracking";

import { useCars, useCarsRefresh } from "@/lib/cars-store";
import { isInHand, isOpenOrder, normaliseStatus, type Status } from "@/lib/status";
import { isLate, arrivingWithin } from "@/lib/delivery-watch";
import type { Diecast } from "@/lib/types";
import { useApp, type ReleasedPreference } from "@/lib/store";
import { filterRows } from "@/lib/search";
import {
  inr,
  inrFull,
  parseDMY,
  daysBetween,
  addDays,
  formatDMY,
  formatDayMonthYear,
  relativeDay,
} from "@/lib/format";
import { Button } from "@/components/ui/button";
import { SegmentControl } from "@/components/segment-control";
import { PageHeading } from "@/components/page-header";
import { useAuth } from "@/lib/auth-store";
import { CarFormDialog } from "@/components/car-form-dialog";
import { CatalogFormDialog } from "@/components/catalog-form-dialog";
import { CompactCarCard } from "@/components/compact-car-card";
import { ShippingBatchDialog } from "@/components/shipping-batch-dialog";
import { CatalogCarDetails, useCarDrawer } from "@/components/car-details-drawer";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TopListSkeleton, TransitTrackerSkeleton } from "@/components/dashboard-skeletons";
import { catalogueKey, useRecentPreorders, type RecentPreorder } from "@/lib/catalogue-search";
import { isPreOrder } from "@/lib/status-order";
import { carSubLine } from "@/lib/car-subline";
import { useCatalog } from "@/lib/catalog-store";
import {
  isCarMatchingCatalog,
  catalogCarToCatalogueCar,
  catalogCarToDiecast as asCar,
  type CatalogCar,
} from "@/lib/catalog";
import { recentReleases, releasedLabel } from "@/lib/released";
import { catalogIdFor } from "@/lib/car-id";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home | Tesoro" },
      {
        name: "description",
        content:
          "Track diecast KPIs, transit shipments, recent arrivals, monthly spending, peak purchase periods, and top collection stats.",
      },
      { property: "og:title", content: "Home | Tesoro" },
      {
        property: "og:description",
        content:
          "Track diecast KPIs, transit shipments, recent arrivals, monthly spending, peak purchase periods, and top collection stats.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

/** Shown to an account whose collection is still empty. */
function EmptyDashboard() {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Boxes className="size-7" />
        </div>
        <h1 className="text-display mt-5 text-2xl font-semibold tracking-tight">
          Your collection is empty
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add your first car and the dashboard fills in — spending, brands, transit and buying
          habits all follow from what you log here.
        </p>
        <Button size="lg" className="mt-6 gap-2" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Add a car
        </Button>
      </div>
      <CarFormDialog open={addOpen} onOpenChange={setAddOpen} mode="add" />
    </div>
  );
}

type Shipment = {
  key: string;
  seller: string;
  shippingId: string;
  count: number;
  spent: number;
  brands: string[];
  ordered: Date;
  expected: Date | null;
  status: string;
  transitInfo: string;
  deliveryPartner: string;
  trackingId: string;
};

/**
 * The earliest parsable date in a list, ignoring blanks. One order's cars can
 * disagree about their dates; the shipment takes the first of them.
 */
function earliestDate(values: (string | undefined | null)[]): Date | null {
  let best: Date | null = null;
  for (const v of values) {
    const d = parseDMY(v ?? "");
    if (d && (!best || d < best)) best = d;
  }
  return best;
}

/**
 * The courier for a shipment, linked when there is somewhere to send you.
 *
 * The consignment number is not shown. It was printed next to the courier in
 * every row — twenty characters of nothing anyone reads, crowding out the one
 * word that says who has the parcel. Clicking still copies it.
 */
function TransitCell({ s }: { s: Shipment }) {
  if (trackingPageFor(s.deliveryPartner, s.trackingId)) {
    return <TrackingLink compact partner={s.deliveryPartner} trackingId={s.trackingId} />;
  }
  const partner = (s.deliveryPartner || "").trim();
  return <span className="text-xs text-muted-foreground">{partner || s.transitInfo || "—"}</span>;
}

/** "Today", "Tomorrow", otherwise "18 Sep 2026" — when a parcel is due. */
function expectedLabel(eta: Date, now: Date): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(eta) - day(now)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return formatDayMonthYear(eta);
}

function DashboardPage() {
  const {
    query,
    transitEtaDays,
    arrivingSoon,
    arrivingDays,
    releasedShelf,
    showRecentlyAdded,
    showNewPreorders,
  } = useApp();
  const cars = useCars();
  const { profile, isGuest } = useAuth();
  const { refreshing } = useCarsRefresh();
  const loading = refreshing && cars.length === 0;
  const data = useMemo(() => filterRows(cars, query), [cars, query]);

  // Both shelves are worked out here rather than inside themselves, because
  // "Arriving soon" only appears when both came up empty — and a section
  // cannot see whether its siblings rendered anything.
  const now = useMemo(() => new Date(), []);
  const recent = useMemo(() => recentlyAdded(data, now), [data, now]);

  const { cars: sharedPreorders, loading: preordersLoading } = useRecentPreorders(!isGuest);
  const newPreorders = useMemo(() => {
    // Castings already on your own pre-order list are not news to you — your
    // own recent pre-orders are in the shared list too.
    const onMyList = new Set(cars.filter((c) => isPreOrder(c.status)).map(catalogueKey));
    return sharedPreorders.filter((c) => !onMyList.has(catalogueKey(c)));
  }, [sharedPreorders, cars]);

  // Auto and Always look a month ahead; Custom looks however far you said.
  const windowDays = arrivingSoon === "custom" ? arrivingDays : ARRIVING_DAYS;
  const arriving = useMemo(() => arrivingWithin(data, windowDays), [data, windowDays]);
  // A shelf you have switched off counts as empty here. "Auto" means "stand in
  // for the other two when they have nothing to say", and a hidden shelf has
  // nothing to say by definition.
  const quiet =
    (!showRecentlyAdded || recent.length === 0) &&
    (!showNewPreorders || (newPreorders.length === 0 && !preordersLoading));
  const showArriving =
    arriving.length > 0 &&
    (arrivingSoon === "always" || arrivingSoon === "custom" || (arrivingSoon === "auto" && quiet));

  // The first name only. "Hello Mervin Kalaimani" is how a bank addresses you;
  // the app already knows which of the two it is.
  const first = (profile?.first_name || "").trim().split(/\s+/)[0] || "";
  const greeting = first ? `Hello ${first}` : "Hello";

  // What the page is actually reporting on, rather than a slogan. The counts
  // are the same ones the tiles below carry, said as a sentence.
  const subNote = useMemo(() => {
    const open = data.filter((r) => isOpenOrder(r.status)).length;
    if (data.length === 0) return "Nothing in the collection yet.";
    return open === 0
      ? `${data.length.toLocaleString()} cars, and nothing on its way.`
      : `${data.length.toLocaleString()} cars · ${open} still on the way.`;
  }, [data]);

  const kpis = useMemo(() => {
    const countOf = (s: Status) => data.filter((r) => normaliseStatus(r.status) === s).length;

    /**
     * One tile per status, plus Late — which is not a status but is the one
     * thing on this page you might have to act on today, so it sits with them.
     *
     * `status` is the value the My Cars filter expects, so a tile deep-links to
     * its own rows. Empty tiles are dropped below, which is why there is no
     * harm in listing all six.
     */
    const defs: {
      key: string;
      label: string;
      tone: string;
      icon: React.ReactNode;
      value: number | string;
      status?: string;
    }[] = [
      {
        key: "inhand",
        label: "In hand",
        tone: "emerald",
        icon: <Boxes className="size-4" />,
        value: countOf("In Hand"),
        status: "In Hand",
      },
      {
        key: "transit",
        label: "In transit",
        tone: "blue",
        icon: <Truck className="size-4" />,
        value: countOf("In Transit"),
        status: "In Transit",
      },
      {
        key: "ordered",
        label: "Ordered",
        tone: "orange",
        icon: <Clock3 className="size-4" />,
        value: countOf("Ordered"),
        status: "Ordered",
      },
      {
        key: "onhold",
        label: "On hold",
        tone: "zinc",
        icon: <PauseCircle className="size-4" />,
        value: countOf("On Hold"),
        status: "On Hold",
      },
      {
        key: "po",
        label: "Pre-ordered",
        tone: "violet",
        icon: <ShoppingBag className="size-4" />,
        value: countOf("PO"),
        status: "PO",
      },
      {
        key: "iso",
        label: "ISO",
        tone: "sky",
        icon: <Sparkles className="size-4" />,
        value: countOf("ISO"),
        status: "ISO",
      },
      {
        key: "late",
        label: "Late",
        tone: "rose",
        icon: <AlertTriangle className="size-4" />,
        value: data.filter((r) => isLate(r)).length,
      },
    ];
    return defs.filter((d) => (typeof d.value === "number" ? d.value > 0 : true));
  }, [data]);

  // A brand-new account has nothing to chart. Guarded on the unfiltered list and
  // on loading, so a search that matches nothing still shows the real dashboard.
  if (!loading && !refreshing && cars.length === 0) {
    return <EmptyDashboard />;
  }

  return (
    <div className="mx-auto min-w-0 max-w-[1600px] space-y-2.5 overflow-x-hidden p-2.5 md:space-y-4 md:p-6">
      <PageHeading title={greeting} subtitle={subNote} />

      {/* A release landing this week now lives behind the bell in the top bar,
          with the rest of what expires — it followed you off the dashboard
          rather than waiting there to be noticed. */}
      {kpis.length > 0 && (
        <KpiBand>
          {kpis.map((k) => (
            <KpiTile
              key={k.key}
              icon={k.icon}
              label={k.label}
              value={typeof k.value === "number" ? k.value.toLocaleString() : k.value}
              tone={k.tone}
              status={k.status}
            />
          ))}
        </KpiBand>
      )}

      {/* Above the tracker. It is the shortest-lived thing on the page — three
          days and a car drops out of it for good — and it renders nothing at
          all on a quiet week, so it costs the tracker no room when there is
          nothing to show. */}
      {!loading && showRecentlyAdded && <RecentlyAdded recent={recent} now={now} />}

      <DashboardMiddle rows={data} etaDays={transitEtaDays} loading={loading} />

      {/* Stands in for the two shelves above on a week when neither has
          anything: nothing landed, nobody pre-ordered, but there is still a
          month of deliveries worth knowing about. */}
      {!loading && showArriving && <ArrivingSoon arriving={arriving} now={now} days={windowDays} />}

      {/* Monthly spending moved to the Habits page. */}
      <TopTenGrid rows={data} mode="count" loading={loading} />

      {/* Pre-orders anyone has placed in the last three days, ready to add. */}
      {!loading && showNewPreorders && (
        <RecentPreorders cars={newPreorders} loading={preordersLoading} />
      )}

      {/* And the other end of it: pre-orders that have started arriving. Below
          the new ones deliberately — what is coming out is news for everyone,
          but what is newly up for pre-order is the thing you can act on. */}
      {!loading && releasedShelf !== "none" && <RecentlyReleased scope={releasedShelf} />}
    </div>
  );
}

/** A parcel that is moving: in the post, or on the van today. */
const isTransit = (s: string) => {
  const v = (s || "").trim().toLowerCase();
  return v === "transit" || /^out\s*for\s*delivery$/.test(v);
};

/** Today, yesterday, and the day before — the window "Recently added" covers. */
const RECENT_DAYS = 3;

/** How far ahead "Arriving soon" looks. A month of deliveries is a month worth planning. */
const ARRIVING_DAYS = 30;

function TransitTracker({
  rows,
  etaDays,
  wide = true,
}: {
  rows: Diecast[];
  etaDays: number;
  wide?: boolean;
}) {
  const [batchOpen, setBatchOpen] = useState(false);
  const [selectedShippingId, setSelectedShippingId] = useState("");

  // Parcels that are actually moving: Transit and Out for delivery. Waiting
  // stays out — a seller sitting on an order is a thing to chase, not a thing
  // to track, and it made up most of the rows.
  const src = useMemo(() => rows.filter((r) => normaliseStatus(r.status) === "In Transit"), [rows]);

  // Active shipping IDs present strictly in this transit list (excluding Available)
  const activeShippingIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of src) {
      const sid = (r.shippingId || "").trim();
      if (sid && !isInHand(r.status)) {
        set.add(sid);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [src]);

  const shipments = useMemo<Shipment[]>(() => {
    const groups = new Map<string, Diecast[]>();
    for (const r of src) {
      const od = r.orderDate || r.date || "—";
      const ship = (r.transitInfo || "").trim();
      const sid = (r.shippingId || "").trim();
      // Always by shipping ID, which is what an order *is* — the checkbox that
      // used to make this optional offered a view where one parcel appeared as
      // four rows, and nobody wants to chase a parcel four times. Cars with no
      // ID still fall back to the seller and date that would have produced one.
      const k = sid ? `shipid:${sid.toLowerCase()}` : `${r.seller || "Unknown"}|${od}|${ship}`;
      const arr = groups.get(k) ?? [];
      arr.push(r);
      groups.set(k, arr);
    }

    const out: Shipment[] = [];
    for (const [k, arr] of groups) {
      const first = arr[0];
      // The earliest real order date in the group, not whichever car happened to
      // be first — and never the arrival date standing in for it, which made
      // "days since" count from a delivery that has not happened.
      const ordered = earliestDate(arr.map((r) => r.orderDate));
      if (!ordered) continue;
      // The soonest thing due in this order: if that date has passed, something
      // in here is late, which is what the column is for.
      const expected = earliestDate(arr.map((r) => r.expectedDate));
      const brands = [...new Set(arr.map((r) => r.brand).filter(Boolean))];
      const sellers = [...new Set(arr.map((r) => r.seller).filter(Boolean))];
      const shippingIds = [...new Set(arr.map((r) => (r.shippingId || "").trim()).filter(Boolean))];
      const shippingId = shippingIds.join(", ");

      out.push({
        key: k,
        seller:
          sellers.length > 1 ? `${sellers[0]} +${sellers.length - 1}` : sellers[0] || "Unknown",
        shippingId,
        count: arr.length,
        spent: arr.reduce((s, r) => s + (r.spent || 0), 0),
        brands,
        ordered,
        expected,
        status: first.status,
        transitInfo: first.transitInfo || "",
        deliveryPartner: arr.find((r) => r.deliveryPartner)?.deliveryPartner || "",
        trackingId: arr.find((r) => r.trackingId)?.trackingId || "",
      });
    }
    // Closest expected arrival date first (today/tomorrow/soonest at the top)
    return out.sort((a, b) => {
      if (a.expected && b.expected) {
        return a.expected.getTime() - b.expected.getTime();
      }
      if (a.expected && !b.expected) return -1;
      if (!a.expected && b.expected) return 1;
      return a.ordered.getTime() - b.ordered.getTime();
    });
  }, [src]);

  const now = new Date();

  // Nothing on its way, nothing to show. An empty tracker is a heading and a
  // blank panel taking the top of the dashboard to say so.
  if (shipments.length === 0) return null;

  return (
    <div className="card-elevated flex min-w-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <h2 className="text-display truncate text-lg font-semibold">Transit tracker</h2>
          <p className="text-xs text-muted-foreground">
            {shipments.length} active shipment{shipments.length === 1 ? "" : "s"}
          </p>
        </div>
        {/* No controls up here any more. "Include waiting" hid orders worth
            chasing, and the Update Order button opened a dialog to pick an order
            from a list of the orders already on screen — every row's own
            shipping ID is that button, for that order. */}
      </div>

      {/* The panel is as tall as it needs to be, up to three shipments, and
          scrolls past that. It used to be pinned to a fixed height whether it
          held one order or nine — a lot of empty card for one parcel. */}
      <>
        <>
          {/* Mobile: stacked cards */}
          <div className="max-h-[21rem] overflow-y-auto md:hidden">
            <ul className="divide-y divide-border/60">
              {shipments.map((s) => {
                const eta = s.expected ?? addDays(s.ordered, etaDays);
                const late = eta < now;
                const open = () => {
                  if (!s.shippingId) return;
                  setSelectedShippingId(s.shippingId);
                  setBatchOpen(true);
                };
                // Seller · chevron, then status and cost against the shipping
                // ID, then how it is travelling against when it lands.
                return (
                  <li key={s.key} className="min-w-0">
                    <div
                      role={s.shippingId ? "button" : undefined}
                      tabIndex={s.shippingId ? 0 : undefined}
                      onClick={open}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          open();
                        }
                      }}
                      className={`space-y-1 p-3 ${s.shippingId ? "cursor-pointer active:bg-muted/40" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium">{s.seller}</span>
                        {s.shippingId && (
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                        <span className="min-w-0 truncate">
                          {s.status} · {s.count} car{s.count === 1 ? "" : "s"}
                          {s.spent > 0 ? ` · ${inr(s.spent)}` : ""}
                        </span>
                        {s.shippingId && <span className="shrink-0 font-mono">{s.shippingId}</span>}
                      </div>
                      <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                        <span
                          className="min-w-0 truncate"
                          // The courier link inside must not also open the order.
                          onClick={(e) => e.stopPropagation()}
                        >
                          <TransitCell s={s} />
                        </span>
                        <span
                          className={`shrink-0 tabular-nums ${late ? "text-rose-500" : "text-foreground"}`}
                        >
                          {expectedLabel(eta, now)}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Desktop: table. 13rem is a header plus three rows and the top of a
              fourth, which is what tells you there is more below. */}
          <div className="hidden max-h-[13rem] min-h-0 overflow-auto md:block">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {/* Widest column in the table: seller names are people and
                      shops ("The Diecast Store, Chennai"), and at the old width
                      most of them wrapped onto three lines. */}
                  <th className="w-[22%] min-w-[13rem] px-4 py-2.5 font-medium">Seller</th>
                  <th className="px-4 py-2.5 font-medium">Shipping ID</th>
                  <th className="px-4 py-2.5 font-medium">Cars</th>
                  <th className="px-4 py-2.5 font-medium text-right">Cost</th>
                  <th className="px-4 py-2.5 font-medium">Brands</th>
                  <th className="px-4 py-2.5 font-medium">Transit info</th>
                  <th className="px-4 py-2.5 font-medium">Ordered</th>
                  <th className="px-4 py-2.5 font-medium">Expected</th>
                  <th className="px-4 py-2.5 font-medium text-right">Days since</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s) => {
                  const eta = s.expected ?? addDays(s.ordered, etaDays);
                  const days = daysBetween(s.ordered, now);
                  const late = eta < now;
                  return (
                    <tr key={s.key} className="border-t border-border/60 hover:bg-muted/30">
                      <td className="min-w-[13rem] px-4 py-2.5">
                        <div className="font-medium">{s.seller}</div>
                        <div className="text-xs text-muted-foreground">{s.status}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        {s.shippingId ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedShippingId(s.shippingId);
                              setBatchOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 transition-colors"
                            title={`View order ${s.shippingId}`}
                          >
                            <Truck className="size-3 shrink-0" />
                            <span>{s.shippingId}</span>
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{s.count}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {s.spent > 0 ? inr(s.spent) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {s.brands.slice(0, 4).map((b) => (
                            <span
                              key={b}
                              className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]"
                            >
                              {b}
                            </span>
                          ))}
                          {s.brands.length > 4 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{s.brands.length - 4}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="max-w-[14rem] px-4 py-2.5">
                        <TransitCell s={s} />
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                        {formatDMY(s.ordered)}
                      </td>
                      <td
                        className={`px-4 py-2.5 tabular-nums ${late ? "text-rose-500" : "text-muted-foreground"}`}
                      >
                        {formatDMY(eta)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{days}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      </>

      <ShippingBatchDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        initialShippingId={selectedShippingId}
        allowedShippingIds={activeShippingIds}
        excludeAvailable={true}
      />
    </div>
  );
}

/**
 * In hand within the last three days, newest first.
 *
 * Lifted out of the component so the dashboard can ask whether this week is
 * quiet without a second copy of what "recent" means — the one thing this page
 * has already been caught doing once.
 */
function recentlyAdded(rows: Diecast[], now: Date): { r: Diecast; dt: Date }[] {
  return rows
    .filter((r) => isInHand(r.status))
    .map((r) => ({ r, dt: parseDMY(r.date) }))
    .filter((x): x is { r: Diecast; dt: Date } => {
      if (!x.dt) return false;
      const days = daysBetween(x.dt, now);
      // Today, yesterday, the day before. Three days means three, and the
      // window was counting four — a car from Monday was still "recently
      // added" on Thursday, under a heading that said last 3 days.
      return days >= 0 && days <= RECENT_DAYS - 1;
    })
    .sort((a, b) => b.dt.getTime() - a.dt.getTime());
}

function RecentlyAdded({ recent, now }: { recent: { r: Diecast; dt: Date }[]; now: Date }) {
  const { open: openDrawer } = useCarDrawer();

  if (recent.length === 0) return null;

  return (
    <div className="card-elevated flex min-w-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="min-w-0">
          <h2 className="text-display text-lg font-semibold">Recently added</h2>
          <p className="text-xs text-muted-foreground">
            Last 3 days · {recent.length} car{recent.length === 1 ? "" : "s"}
          </p>
        </div>
        <Sparkles className="size-4 text-accent" />
      </div>
      {/* One row, running left to right, in the inventory's compact card — the
          small one that leads with the photograph.

          A wrapping grid grew the panel a row at a time as cars landed, until
          the last three days of a good week filled the bottom of the dashboard.
          A single row is a fixed height whatever arrives, and the cars that ran
          off the end are the older ones, which is the right thing to have to
          reach for. */}
      {/* The width is on the card itself rather than on a wrapper around it: a
          sized div holding an auto-width button is two elements arguing about
          one number, and the first card won that argument.

          One gap value does all the spacing, inside and out, so the distance
          between two cards is the distance between a card and the frame — p-2.5
          against gap-2.5. The bottom was 4px, which made the row sit low in its
          own panel.

          scroll-px matters as much as the padding here. Padding scrolls away
          with the content, so a snapped card came to rest flush against the
          frame the moment you moved the row at all — the gap was there only
          until it was needed. Scroll padding is what the snap positions are
          measured from, so the card stops 10px in, wherever you are in the row.

          The caption is what each card is doing in here — it landed today, or
          two days ago — which is the only thing separating one from the next. */}
      <div className="flex snap-x scroll-px-2.5 items-stretch gap-2.5 overflow-x-auto p-2.5">
        {recent.map(({ r, dt }, i) => (
          <CompactCarCard
            key={r.id + i}
            car={r}
            onOpen={() => openDrawer(r)}
            caption={relativeDay(dt, now)}
            className="w-36 shrink-0 snap-start sm:w-40"
          />
        ))}
      </div>
    </div>
  );
}

/**
 * What is due in your hands over the next month, soonest first.
 *
 * The same shelf as Recently added, pointed the other way down the calendar —
 * one row of the inventory's compact card, a fixed height however much is
 * coming, and the cars that scroll off the end are the furthest away.
 *
 * Only day-precise dates get in (see arrivingWithin), so a pre-order that says
 * "Mar 2027" stays out rather than claiming the 1st.
 */
function ArrivingSoon({
  arriving,
  now,
  days,
}: {
  arriving: { car: Diecast; day: string }[];
  now: Date;
  /** The window actually used, so the caption cannot drift from the list. */
  days: number;
}) {
  const { open: openDrawer } = useCarDrawer();

  return (
    <div className="card-elevated flex min-w-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="min-w-0">
          <h2 className="text-display text-lg font-semibold">Arriving soon</h2>
          <p className="text-xs text-muted-foreground">
            Next {days} days · {arriving.length} car{arriving.length === 1 ? "" : "s"}
          </p>
        </div>
        <CalendarClock className="size-4 text-accent" />
      </div>
      <div className="flex snap-x scroll-px-2.5 items-stretch gap-2.5 overflow-x-auto p-2.5">
        {arriving.map(({ car, day }, i) => (
          <CompactCarCard
            key={car.id + i}
            car={car}
            onOpen={() => openDrawer(car)}
            caption={relativeDay(parseDMY(day) ?? now, now)}
            className="w-36 shrink-0 snap-start sm:w-40"
          />
        ))}
      </div>
    </div>
  );
}

/** The shared pre-order shaped as a car, for the card and the details view. */
const preorderAsCar = (c: RecentPreorder, key: string) =>
  ({ ...c, id: key, spent: c.mrp || 0 }) as unknown as Diecast;

/**
 * Pre-orders placed by anyone in the last three days, as a shelf like Recently
 * added.
 *
 * Tapping one opens what the casting is, the same catalogue view the Catalog
 * page opens — looking at a car somebody else has ordered is the common move,
 * and it used to drop you straight into a form for buying it. The + adds it,
 * and because the casting has already been chosen the form opens on step two
 * with the details filled in, exactly as if it had been picked from the search.
 */
function RecentPreorders({ cars, loading }: { cars: RecentPreorder[]; loading: boolean }) {
  const { isAdmin, isOwner, isGuest } = useAuth();
  const { catalog, findMatchingInCatalog, getCatalogCarById, updateCatalogCar, addCatalogCar } =
    useCatalog();
  const [adding, setAdding] = useState<RecentPreorder | null>(null);
  /** Whether the add dialog was opened to file a wish rather than a purchase. */
  const [addingIso, setAddingIso] = useState(false);
  const [viewing, setViewing] = useState<RecentPreorder | null>(null);
  const [editingCatalog, setEditingCatalog] = useState<CatalogCar | null>(null);
  const now = new Date();

  const resolveCatalogCar = useCallback(
    (p: RecentPreorder): CatalogCar | undefined => {
      const rawId = (p.catalogId ||
        (p as Record<string, unknown>).car_id ||
        (p as Record<string, unknown>).carId ||
        "") as string;
      if (rawId) {
        const found = getCatalogCarById(rawId);
        if (found) return found;
      }
      const matched = findMatchingInCatalog({
        make: p.make,
        model: p.model,
        brand: p.brand,
        series: p.series,
        year: p.year,
        colour: p.colour,
        tampo: p.tampo,
        castingNumber: p.castingNumber,
        carNumber: p.carNumber,
      });
      if (matched) return matched;

      const dummy = { ...p, id: rawId || "temp", spent: p.mrp || 0 } as unknown as Diecast;
      return catalog.find((cat) => isCarMatchingCatalog(dummy, cat));
    },
    [catalog, findMatchingInCatalog, getCatalogCarById],
  );

  const toCarWithCatalogId = useCallback(
    (c: RecentPreorder, fallbackKey: string): Diecast => {
      const cat = resolveCatalogCar(c);
      const rawId = (c.catalogId ||
        (c as Record<string, unknown>).car_id ||
        (c as Record<string, unknown>).carId ||
        "") as string;
      let actualId = cat?.car_id || rawId;
      if (!actualId) {
        try {
          actualId = catalogIdFor(c as unknown as Parameters<typeof catalogIdFor>[0]);
        } catch {
          actualId = fallbackKey;
        }
      }
      return {
        ...c,
        id: actualId,
        carId: actualId,
        catalogId: actualId,
        spent: c.mrp || 0,
      } as unknown as Diecast;
    },
    [resolveCatalogCar],
  );

  const viewingCatalogCar = useMemo(() => {
    return viewing ? resolveCatalogCar(viewing) : undefined;
  }, [viewing, resolveCatalogCar]);

  const viewingCar = useMemo(() => {
    return viewing ? toCarWithCatalogId(viewing, "preorder-car") : null;
  }, [viewing, toCarWithCatalogId]);

  if (loading || cars.length === 0) return null;

  return (
    <div className="card-elevated flex min-w-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="min-w-0">
          <h2 className="text-display text-lg font-semibold">New Pre Orders</h2>
          <p className="text-xs text-muted-foreground">
            The newest castings other collectors have pre-ordered
          </p>
        </div>
        <ShoppingBag className="size-4 text-accent" />
      </div>
      <div className="flex snap-x scroll-px-2.5 items-stretch gap-2.5 overflow-x-auto p-2.5">
        {cars.map((c, i) => {
          // Shaped as a car for the card pointing to the actual car in the catalogue
          const asCar = toCarWithCatalogId(c, `preorder-${i}`);
          const ordered = parseDMY(c.lastOrdered);
          return (
            <div key={asCar.id ?? i} className="relative w-36 shrink-0 snap-start sm:w-40">
              <CompactCarCard
                car={asCar}
                onOpen={() => {
                  if (isAdmin) {
                    const cat = resolveCatalogCar(c);
                    if (cat) {
                      setEditingCatalog(cat);
                    } else {
                      const fallbackEntry: CatalogCar = {
                        car_id: asCar.id || asCar.catalogId || "temp",
                        name: c.name,
                        make: c.make,
                        model: c.model,
                        brand: c.brand,
                        series: c.series,
                        sub_series: c.subSeries,
                        year: c.year ? String(c.year) : undefined,
                        colour: c.colour,
                        tampo: c.tampo,
                        casting_number: c.castingNumber,
                        car_number: c.carNumber,
                        type: c.type,
                        size: c.size,
                        photo_url: c.photoUrl,
                        mrp: c.mrp,
                      };
                      setEditingCatalog(fallbackEntry);
                    }
                  } else {
                    setViewing(c);
                  }
                }}
                caption={
                  c.inMyCollection
                    ? "In your collection"
                    : ordered
                      ? relativeDay(ordered, now)
                      : undefined
                }
                marksOffset
                className="w-full"
              />
              {/* A sibling over the card, not inside it: the card is a button. */}
              <button
                type="button"
                onClick={() => setAdding(c)}
                aria-label={`${c.inMyCollection ? "Add another" : "Add to collection"}: ${c.name}`}
                title={c.inMyCollection ? "Add another" : "Add to collection"}
                className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform active:scale-90"
              >
                <Plus className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
      {/* What the casting is, pointing to the actual car in the catalogue */}
      <CatalogCarDetails
        car={viewingCar}
        catalogCar={viewingCatalogCar}
        preOrder
        owned={Boolean(viewing?.inMyCollection)}
        onClose={() => setViewing(null)}
        canEdit={isAdmin}
        onEdit={() => {
          if (viewingCatalogCar) {
            setEditingCatalog(viewingCatalogCar);
          } else if (viewing) {
            const cat = resolveCatalogCar(viewing);
            if (cat) setEditingCatalog(cat);
          }
          setViewing(null);
        }}
        onAdd={() => {
          const target = viewing;
          setViewing(null);
          setAddingIso(false);
          setAdding(target);
        }}
        onAddIso={
          isGuest
            ? undefined
            : () => {
                const target = viewing;
                setViewing(null);
                setAddingIso(true);
                setAdding(target);
              }
        }
      />
      <CarFormDialog
        open={adding !== null}
        onOpenChange={(v) => {
          if (!v) {
            setAdding(null);
            setAddingIso(false);
          }
        }}
        mode="add"
        prefill={adding}
        prefillStatus={addingIso ? "ISO" : "PO"}
      />
      {isAdmin && (
        <CatalogFormDialog
          open={editingCatalog !== null}
          entry={editingCatalog}
          catalog={catalog}
          onClose={() => setEditingCatalog(null)}
          canDelete={isOwner && !isGuest}
          onSave={async (car) => {
            const exists = catalog.some((item) => item.car_id === car.car_id);
            if (exists) {
              return await updateCatalogCar(car);
            } else {
              return await addCatalogCar(car);
            }
          }}
        />
      )}
    </div>
  );
}

function DashboardMiddle({
  rows,
  etaDays,
  loading = false,
}: {
  rows: Diecast[];
  etaDays: number;
  loading?: boolean;
}) {
  // hasRecent was computed here and never read — a second copy of the recency
  // window, left behind when Recently added moved out of this section. Two
  // definitions of "recent" is one more than the app can keep in step.
  const hasTransit = rows.some((r) => isTransit(r.status));

  if (loading) {
    return (
      <section className="grid min-w-0 items-stretch gap-4 lg:grid-cols-3">
        <TransitTrackerSkeleton wide={false} />
      </section>
    );
  }

  if (!hasTransit) return null;

  // The tracker takes the full width on its own. It was sharing the row with
  // Recently added, which squeezed nine columns of shipment into two thirds of
  // the page; the cars that have already landed are the least urgent thing on
  // the dashboard and have gone to the bottom of it.
  // No wrapper: the tracker hides itself when none of those cars has an order
  // date to group by, and an empty <section> left behind still took a gap in
  // the page's spacing — the blank strip under Recently added.
  return <TransitTracker rows={rows} etaDays={etaDays} />;
}

type TopKey = "make" | "model" | "series" | "manufacturer" | "assortment" | "seller";

const TOP_OPTIONS: { value: TopKey; label: string }[] = [
  { value: "make", label: "Make" },
  { value: "model", label: "Model" },
  { value: "series", label: "Series" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "assortment", label: "Assortment" },
  { value: "seller", label: "Seller" },
];

/**
 * One colour per place in the Top 5 bar, leader first: the accent colour alone,
 * stepped from dark to light, so the bar changes with the theme instead of
 * carrying five colours of its own.
 */
const TOP_COLOURS = [
  "color-mix(in oklab, var(--primary) 78%, #000)",
  "var(--primary)",
  "color-mix(in oklab, var(--primary) 76%, #fff)",
  "color-mix(in oklab, var(--primary) 54%, #fff)",
  "color-mix(in oklab, var(--primary) 34%, #fff)",
];

function pickTopValue(r: Diecast, key: TopKey) {
  switch (key) {
    case "make":
      return r.make;
    case "model":
      return r.model;
    case "series":
      return r.series;
    case "manufacturer":
      return r.brand;
    case "assortment":
      return [r.brand, r.assortment].filter(Boolean).join(" · ");
    case "seller":
      return r.seller;
  }
}

function TopTenGrid({
  rows,
  mode,
  loading = false,
}: {
  rows: Diecast[];
  mode: "count" | "cost";
  loading?: boolean;
}) {
  const [key, setKey] = useState<TopKey>("make");
  const [selected, setSelected] = useState<string | null>(null);
  /** The part of the bar whose value is showing. */
  const [active, setActive] = useState<number | null>(null);

  const items = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = pickTopValue(r, key);
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + (mode === "count" ? 1 : r.spent || 0));
    }
    return [...m.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [rows, key, mode]);

  // A different five: the value label would point at the wrong part.
  useEffect(() => setActive(null), [key, mode]);

  const selectedRows = useMemo(
    () => (selected ? rows.filter((r) => pickTopValue(r, key) === selected) : []),
    [rows, key, selected],
  );

  const label = TOP_OPTIONS.find((o) => o.value === key)!.label;
  // The bar is the five alone, filled edge to edge: each part is its share of
  // the top five, not of the whole collection.
  const topSum = items.reduce((s, it) => s + it.value, 0);
  const fmt = (v: number) => (mode === "count" ? v.toLocaleString() : inr(v));
  const share = (v: number) => (topSum ? (v / topSum) * 100 : 0);

  if (loading) {
    return <TopListSkeleton />;
  }

  return (
    <div className="card-elevated flex min-w-0 flex-col overflow-hidden p-4">
      {/* Title and control share the line at every width: the control is
          capped and scrolls sideways rather than dropping underneath. */}
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="min-w-0 shrink-0">
          <h2 className="text-display text-lg font-semibold">Top 5</h2>
          <p className="truncate text-xs text-muted-foreground">Leading {label.toLowerCase()}</p>
        </div>
        <SegmentControl
          value={key}
          onChange={setKey}
          options={TOP_OPTIONS}
          className="max-w-[62%] sm:max-w-none"
        />
      </div>

      {/* Laid out like iPhone storage: one bar split by share of the whole,
          then a legend with each value underneath. Tap a row for its cars. */}
      {items.length > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {/* Values appear on hover, or on a tap for touch screens, in a small
              label over the part of the bar being pointed at. */}
          <div className="relative pt-6">
            {active !== null && items[active] && (
              <div
                className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-0.5 text-[11px] font-medium shadow-md"
                style={{
                  left: `clamp(3rem, ${
                    items.slice(0, active).reduce((s, it) => s + share(it.value), 0) +
                    share(items[active].value) / 2
                  }%, calc(100% - 3rem))`,
                }}
              >
                {items[active].name} ·{" "}
                <span className="tabular-nums">{fmt(items[active].value)}</span>
              </div>
            )}
            <div
              className="flex h-6 w-full gap-[2px] overflow-hidden rounded-md"
              role="img"
              aria-label={items.map((it) => `${it.name} ${fmt(it.value)}`).join(", ")}
              onMouseLeave={() => setActive(null)}
            >
              {items.map((it, i) => (
                <button
                  key={it.name}
                  type="button"
                  aria-label={`${it.name}: ${fmt(it.value)}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => setActive((cur) => (cur === i ? null : i))}
                  className={`h-full min-w-[3px] transition-opacity ${
                    active !== null && active !== i ? "opacity-50" : ""
                  }`}
                  style={{ width: `${share(it.value)}%`, background: TOP_COLOURS[i] }}
                />
              ))}
            </div>
          </div>

          {/* Names only, small, two rows. Tapping one opens its cars. */}
          <ul className="grid grid-cols-3 gap-x-3 gap-y-1.5">
            {items.map((it, i) => (
              <li key={it.name} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setSelected(it.name)}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  className="flex w-full min-w-0 items-center gap-1.5 text-left text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: TOP_COLOURS[i] }}
                  />
                  <span className="truncate">{it.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">No data.</div>
      )}

      <TopDetailDialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ?? ""}
        groupLabel={label}
        rows={selectedRows}
      />
    </div>
  );
}

function TopDetailDialog({
  open,
  onClose,
  title,
  groupLabel,
  rows,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  groupLabel: string;
  rows: Diecast[];
}) {
  const drawer = useCarDrawer();
  const total = rows.reduce((s, r) => s + (r.spent || 0), 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-display">{title || "Details"}</DialogTitle>
          <DialogDescription>
            {groupLabel} · {rows.length} car{rows.length === 1 ? "" : "s"} · {inrFull(total)} spent
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[60vh] divide-y divide-border/60 overflow-y-auto">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  drawer.open(r);
                }}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-1 py-2.5 text-left hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.name || "Unnamed car"}</div>
                  <div className="truncate text-xs text-muted-foreground">{carSubLine(r)}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm tabular-nums">{r.spent ? inr(r.spent) : "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.status || "—"}</div>
                </div>
              </button>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="py-4 text-sm text-muted-foreground">No matching cars.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Castings that have just come out.
 *
 * The other shelf on this page is "New Pre Orders" — what people have started
 * waiting for. This is the other end of that: what the waiting was for. It
 * fills itself in, because the database marks a casting released the first time
 * anybody's copy of it arrives, so the first person to receive one tells
 * everybody else without doing anything.
 *
 * Your own pre-order of one of these is a stronger piece of news than a shelf
 * can carry — there is a seller to contact and usually a balance to settle — so
 * that lives in the bell, not here. This shelf is for everyone.
 */
function RecentlyReleased({ scope }: { scope: ReleasedPreference }) {
  const { catalog, isLoading } = useCatalog();
  const { isAdmin } = useAuth();
  const cars = useCars();
  const [viewing, setViewing] = useState<CatalogCar | null>(null);
  const [adding, setAdding] = useState<CatalogCar | null>(null);

  /** Castings you are waiting on, so "My PO" has something to narrow against. */
  const myPreorderIds = useMemo(() => {
    const out = new Set<string>();
    for (const c of cars) {
      if (!isPreOrder(c.status)) continue;
      const id = (c.catalogId || "").trim().toUpperCase();
      if (id) out.add(id);
    }
    return out;
  }, [cars]);

  const releases = useMemo(() => {
    const all = recentReleases(catalog);
    const kept =
      scope === "mine"
        ? all.filter((r) => myPreorderIds.has(r.entry.car_id.trim().toUpperCase()))
        : all;
    return kept.slice(0, 20);
  }, [catalog, scope, myPreorderIds]);

  /** Castings you already have a row for, so the card can say so. */
  const ownedIds = useMemo(() => {
    const out = new Set<string>();
    for (const c of cars) {
      const id = (c.catalogId || "").trim().toUpperCase();
      if (id) out.add(id);
    }
    return out;
  }, [cars]);

  if (isLoading || releases.length === 0) return null;

  return (
    <div className="card-elevated flex min-w-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="min-w-0">
          <h2 className="text-display text-lg font-semibold">Recently Released</h2>
          <p className="text-xs text-muted-foreground">
            {scope === "mine"
              ? "Your pre-orders that have started arriving"
              : "Pre-orders that have started arriving"}
          </p>
        </div>
        <PackageCheck className="size-4 text-emerald-500" />
      </div>
      <div className="flex snap-x scroll-px-2.5 items-stretch gap-2.5 overflow-x-auto p-2.5">
        {releases.map((r) => {
          const owned = ownedIds.has(r.entry.car_id.trim().toUpperCase());
          return (
            <div key={r.entry.car_id} className="relative w-36 shrink-0 snap-start sm:w-40">
              <CompactCarCard
                car={asCar(r.entry)}
                onOpen={() => setViewing(r.entry)}
                caption={releasedLabel(r.daysAgo)}
                marksOffset
                className="w-full"
              />
              <button
                type="button"
                onClick={() => setAdding(r.entry)}
                aria-label={`${owned ? "Add another" : "Add to collection"}: ${r.entry.name}`}
                title={owned ? "Add another" : "Add to collection"}
                className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform active:scale-90"
              >
                <Plus className="size-4" />
              </button>
            </div>
          );
        })}
      </div>

      <CatalogCarDetails
        car={viewing ? asCar(viewing) : null}
        catalogCar={viewing}
        preOrder={false}
        owned={Boolean(viewing && ownedIds.has(viewing.car_id.trim().toUpperCase()))}
        onClose={() => setViewing(null)}
        canEdit={isAdmin}
        onAdd={() => {
          const target = viewing;
          setViewing(null);
          setAdding(target);
        }}
      />
      <CarFormDialog
        open={adding !== null}
        onOpenChange={(v) => !v && setAdding(null)}
        mode="add"
        prefill={adding ? catalogCarToCatalogueCar(adding) : null}
        prefillStatus="Ordered"
      />
    </div>
  );
}
