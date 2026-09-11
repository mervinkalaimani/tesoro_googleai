import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
} from "lucide-react";
import { KpiBand, KpiTile } from "@/components/kpi";
import { TrackingLink } from "@/components/tracking-link";
import { trackingPageFor } from "@/lib/tracking";

import { useCars, useCarsRefresh } from "@/lib/cars-store";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import {
  inr,
  inrFull,
  parseDMY,
  daysBetween,
  addDays,
  formatDMY,
  monthKey,
  monthLabel,
  relativeDay,
  shortMonthLabel,
} from "@/lib/format";
import { Button } from "@/components/ui/button";
import { SegmentControl } from "@/components/segment-control";
import { CarFormDialog } from "@/components/car-form-dialog";
import { CompactCarCard } from "@/components/compact-car-card";
import { ShippingBatchDialog } from "@/components/shipping-batch-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCarDrawer } from "@/components/car-details-drawer";
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
import {
  PeakPurchaseSkeleton,
  TopListSkeleton,
  TransitTrackerSkeleton,
} from "@/components/dashboard-skeletons";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard | Tesoro" },
      {
        name: "description",
        content:
          "Track diecast KPIs, transit shipments, recent arrivals, monthly spending, peak purchase periods, and top collection stats.",
      },
      { property: "og:title", content: "Dashboard | Tesoro" },
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

function DashboardPage() {
  const { query, transitEtaDays } = useApp();
  const cars = useCars();
  const { refreshing } = useCarsRefresh();
  const loading = refreshing && cars.length === 0;
  const data = useMemo(() => filterRows(cars, query), [cars, query]);
  const [metric, setMetric] = useState<"count" | "cost">("count");

  const kpis = useMemo(() => {
    const norm = (s: string) => (s || "").trim().toLowerCase();
    const countOf = (match: (s: string) => boolean) =>
      data.filter((r) => match(norm(r.status))).length;

    // `status` is the exact tesoro_raw value the inventory filter expects, so a
    // tile can deep-link to its own rows.
    const defs: {
      key: string;
      label: string;
      tone: string;
      icon: React.ReactNode;
      value: number | string;
      status?: string;
    }[] = [
      {
        key: "available",
        label: "Available",
        tone: "emerald",
        icon: <Boxes className="size-4" />,
        value: countOf((s) => s === "available"),
        status: "Available",
      },
      {
        key: "transit",
        label: "In transit",
        tone: "blue",
        icon: <Truck className="size-4" />,
        value: countOf((s) => s === "transit" || /out\s*for\s*delivery/.test(s)),
        status: "Transit",
      },
      {
        key: "waiting",
        label: "Waiting",
        tone: "orange",
        icon: <Clock3 className="size-4" />,
        value: countOf((s) => s === "waiting"),
        status: "Waiting",
      },
      {
        key: "preorder",
        label: "Pre-ordered",
        tone: "violet",
        icon: <ShoppingBag className="size-4" />,
        value: countOf((s) => s === "pre order" || s === "preorder"),
        status: "Pre Order",
      },
      {
        key: "delayed",
        label: "Delayed",
        tone: "rose",
        icon: <AlertTriangle className="size-4" />,
        value: countOf((s) => s === "delayed"),
        status: "Delayed",
      },
      {
        key: "onhold",
        label: "On hold",
        tone: "zinc",
        icon: <PauseCircle className="size-4" />,
        value: countOf((s) => s === "on hold" || s === "onhold"),
        status: "On Hold",
      },
      {
        key: "iso",
        label: "ISO",
        tone: "sky",
        icon: <Sparkles className="size-4" />,
        value: countOf((s) => s === "iso"),
        status: "ISO",
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

      <DashboardMiddle rows={data} etaDays={transitEtaDays} loading={loading} />

      <section className="grid min-w-0 items-stretch gap-4 lg:h-[min(360px,calc(100svh-7rem))] lg:grid-cols-3 lg:[&>*]:h-full">
        <MonthlySpending rows={data} mode={metric} />
        <TopTenGrid rows={data} mode={metric} onModeChange={setMetric} loading={loading} />
        {loading ? (
          <PeakPurchaseSkeleton />
        ) : (
          <PeakPurchase rows={data} mode={metric} onModeChange={setMetric} />
        )}
      </section>

      {/* Last on the page: what has already arrived is the one thing here that
          needs nothing done about it. */}
      {!loading && <RecentlyAdded rows={data} />}
    </div>
  );
}

const isTransit = (s: string) => (s || "").trim().toLowerCase() === "transit";

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

  // Transit, and only Transit: parcels that are actually moving.
  //
  // Waiting and Out for delivery used to be in here too. Waiting is a seller
  // sitting on an order — a thing to chase, but not a thing to track, and it
  // made up most of the rows. Out for delivery is a parcel arriving today, which
  // needs no tracking either. What is left is the list this panel is for: things
  // in the post, with a courier and a date.
  const src = useMemo(() => rows.filter((r) => isTransit(r.status)), [rows]);

  // Active shipping IDs present strictly in this transit list (excluding Available)
  const activeShippingIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of src) {
      const sid = (r.shippingId || "").trim();
      if (sid && (r.status || "").trim().toLowerCase() !== "available") {
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
    // Oldest order first: the one that has been waited on longest. The segment
    // control that used to switch this to "Expected" is gone — two orderings of
    // the same nine rows is a setting to fiddle with, not information.
    return out.sort((a, b) => a.ordered.getTime() - b.ordered.getTime());
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
                const days = daysBetween(s.ordered, now);
                const late = eta < now;
                return (
                  <li key={s.key} className="min-w-0 p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                          <span>{s.seller}</span>
                          {s.shippingId && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedShippingId(s.shippingId);
                                setBatchOpen(true);
                              }}
                              className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-400"
                            >
                              <Truck className="size-2.5" />
                              <span>{s.shippingId}</span>
                            </button>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {s.status} · {s.count} car{s.count === 1 ? "" : "s"}
                          {s.spent > 0 ? ` · ${inr(s.spent)}` : ""}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                        {days}d
                      </span>
                    </div>
                    {s.brands.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {s.brands.slice(0, 4).map((b) => (
                          <span key={b} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                            {b}
                          </span>
                        ))}
                        {s.brands.length > 4 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{s.brands.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-1.5 break-words text-xs text-muted-foreground">
                      <TransitCell s={s} />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums text-muted-foreground">
                      <span>Ordered {formatDMY(s.ordered)}</span>
                      <span className={late ? "text-rose-500" : ""}>Expected {formatDMY(eta)}</span>
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

function RecentlyAdded({ rows }: { rows: Diecast[] }) {
  const { open: openDrawer } = useCarDrawer();
  const now = new Date();
  const recent = useMemo(() => {
    const list = rows
      .filter((r) => r.status === "Available")
      .map((r) => ({ r, dt: parseDMY(r.date) }))
      .filter((x): x is { r: Diecast; dt: Date } => {
        if (!x.dt) return false;
        const days = daysBetween(x.dt, now);
        return days >= 0 && days <= 3;
      })
      .sort((a, b) => b.dt.getTime() - a.dt.getTime());
    return list;
  }, [rows, now]);

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
      {/* items-stretch, and every cell the same fixed width: one shelf of
          identical cards rather than a row of differently sized ones. The
          caption is what each card is doing in here — it landed today, or it
          landed two days ago — which is the only thing separating them. */}
      <div className="flex snap-x items-stretch gap-2 overflow-x-auto p-2">
        {recent.map(({ r, dt }, i) => (
          <div key={r.id + i} className="w-36 shrink-0 snap-start sm:w-40">
            <CompactCarCard car={r} onOpen={() => openDrawer(r)} caption={relativeDay(dt, now)} />
          </div>
        ))}
      </div>
    </div>
  );
}

type Window = "6m" | "12m" | "all";

function resolveCarMonthKey(r: Diecast): number | null {
  return monthKey(r.month) ?? monthKey(r.orderMonth) ?? monthKey(r.date) ?? monthKey(r.orderDate);
}

/**
 * The month a car counts in, for spending: the month it was *received*.
 *
 * This used to fall back through month -> orderMonth -> date -> orderDate,
 * which meant a car still on its way was booked to the month it was ordered and
 * a pre-order due in 2027 put money into a month two years out. Money follows
 * the car: a shipment counts when it lands, and anything that has not landed
 * counts nowhere yet. `month` is the sheet's own arrival month, so it is still
 * tried first — but only backed by the arrival date, never the order date.
 */
function receivedMonthKey(r: Diecast): number | null {
  if (!(r.date || "").trim()) return null;
  return monthKey(r.month) ?? monthKey(r.date);
}

function MonthlySpending({ rows, mode }: { rows: Diecast[]; mode: "count" | "cost" }) {
  const [win, setWin] = useState<Window>("6m");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const series = useMemo(() => {
    const map = new Map<number, { spent: number; count: number }>();
    for (const r of rows) {
      const k = receivedMonthKey(r);
      if (k === null) continue;
      const cur = map.get(k) ?? { spent: 0, count: 0 };
      cur.spent += r.spent || 0;
      cur.count += 1;
      map.set(k, cur);
    }
    const now = new Date();
    const curKey = now.getFullYear() * 12 + now.getMonth();
    const all = [...map.entries()].sort((a, b) => a[0] - b[0]);
    let filtered = all;
    if (win === "6m") {
      filtered = filtered.filter(([k]) => k <= curKey && k > curKey - 6);
      if (filtered.length === 0 && all.length > 0) {
        filtered = all.slice(-6);
      }
    } else if (win === "12m") {
      filtered = filtered.filter(([k]) => k <= curKey && k > curKey - 12);
      if (filtered.length === 0 && all.length > 0) {
        filtered = all.slice(-12);
      }
    }
    // "All" means all of it, future months included — that is why there is no
    // longer a separate toggle for them.
    return filtered.map(([k, v]) => ({
      month: monthLabel(k),
      spent: Math.round(v.spent),
      count: v.count,
    }));
  }, [rows, win]);

  // Which number the bars are. It follows the Count/Cost control shared with
  // Top 5 and Peak purchase rather than carrying a third one of its own: three
  // panels answering the same question should be answering it about the same
  // thing at the same time.
  const metricKey = mode === "count" ? "count" : "spent";
  const fmt = (v: number) => (mode === "count" ? v.toLocaleString() : inr(v));

  const average = useMemo(() => {
    if (series.length === 0) return 0;
    const total = series.reduce((s, d) => s + (mode === "count" ? d.count : d.spent), 0);
    return Math.round(total / series.length);
  }, [series, mode]);

  return (
    <div className="card-elevated flex min-w-0 flex-col overflow-hidden p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-display text-lg font-semibold">Monthly spending</h2>
          <p className="text-xs text-muted-foreground">
            {mode === "count" ? "Cars received by month" : "Spent on cars received, by month"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SegmentControl
            value={win}
            onChange={setWin}
            options={[
              { value: "6m", label: "6M" },
              { value: "12m", label: "12M" },
              { value: "all", label: "All" },
            ]}
          />
        </div>
      </div>

      {/* No fixed height: flex-1 lets the plot grow to the bottom of the card
          instead of leaving dead space under the axis. */}
      <div className="min-h-[260px] w-full flex-1">
        {!mounted ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : series.length === 0 ? (
          <div className="flex h-full w-full flex-col items-center justify-center rounded-lg border border-dashed border-border/60 p-6 text-center text-muted-foreground">
            <Clock3 className="mb-2 size-8 stroke-[1.5] text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No monthly records in this window</p>
            <p className="mt-1 max-w-[240px] text-xs text-muted-foreground">
              Try switching to &quot;12M&quot; or &quot;All&quot; to view spending across all
              recorded months.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={240}>
            <BarChart data={series} margin={{ top: 12, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                // Ticks read "Apr 25"; the tooltip still shows the full "Apr 2025".
                tickFormatter={shortMonthLabel}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                interval={series.length > 18 ? Math.floor(series.length / 12) : 0}
                angle={-25}
                textAnchor="end"
                height={44}
              />
              <YAxis
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickFormatter={(v) => fmt(Number(v))}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as { spent?: number; count?: number };
                  return (
                    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
                      <div className="font-medium">{label}</div>
                      <div className="font-semibold text-primary">
                        {mode === "count"
                          ? `${row.count ?? 0} car${row.count === 1 ? "" : "s"}`
                          : inrFull(row.spent ?? 0)}
                      </div>
                      {/* The other half of the story, whichever half is on the
                          axis — a month is worth reading both ways. */}
                      <div className="text-muted-foreground">
                        {mode === "count"
                          ? inrFull(row.spent ?? 0)
                          : `${row.count ?? 0} car${row.count === 1 ? "" : "s"}`}
                      </div>
                    </div>
                  );
                }}
                cursor={{ fill: "color-mix(in srgb, var(--primary) 12%, transparent)" }}
              />
              {average > 0 && (
                <ReferenceLine
                  y={average}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: `Avg ${fmt(average)}`,
                    position: "insideTopRight",
                    fill: "var(--muted-foreground)",
                    fontSize: 10,
                  }}
                />
              )}
              <Bar dataKey={metricKey} fill="var(--primary)" radius={[6, 6, 0, 0]}>
                {/* The bar's own value, on the bar. It used to carry the car
                    count above a bar measuring money, so the two numbers on
                    screen were never the same number. */}
                <LabelList
                  dataKey={metricKey}
                  position="top"
                  formatter={(v: number) => fmt(Number(v))}
                  fill="var(--muted-foreground)"
                  fontSize={9}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function PeakPurchase({
  rows,
  mode,
  onModeChange,
}: {
  rows: Diecast[];
  mode: "count" | "cost";
  onModeChange: (m: "count" | "cost") => void;
}) {
  const setMode = onModeChange;

  const top = useMemo(() => {
    const map = new Map<number, { count: number; cost: number }>();
    for (const r of rows) {
      const k = resolveCarMonthKey(r);
      if (k === null) continue;
      const v = map.get(k) ?? { count: 0, cost: 0 };
      v.count += 1;
      v.cost += r.spent || 0;
      map.set(k, v);
    }
    const arr = [...map.entries()].map(([k, v]) => ({ key: k, label: monthLabel(k), ...v }));
    arr.sort((a, b) => (mode === "count" ? b.count - a.count : b.cost - a.cost));
    return arr.slice(0, 5);
  }, [rows, mode]);

  const max = top.reduce((m, t) => Math.max(m, mode === "count" ? t.count : t.cost), 0) || 1;

  return (
    <div className="card-elevated flex min-w-0 flex-col overflow-hidden p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-display text-lg font-semibold">Peak purchase</h2>
          <p className="text-xs text-muted-foreground">Best buying period</p>
        </div>
        <SegmentControl
          value={mode}
          onChange={setMode}
          options={[
            { value: "count", label: "Count" },
            { value: "cost", label: "Cost" },
          ]}
        />
      </div>
      {top.length > 0 ? (
        <ul className="flex min-h-0 flex-1 flex-col justify-between gap-2">
          {top.map((t, i) => {
            const v = mode === "count" ? t.count : t.cost;
            const pct = (v / max) * 100;
            return (
              <li key={t.key} className="flex flex-1 flex-col justify-center gap-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className={i === 0 ? "font-semibold" : "text-muted-foreground"}>
                    {t.label}
                  </span>
                  <span className={`tabular-nums ${i === 0 ? "font-semibold" : ""}`}>
                    {mode === "count" ? v : inr(v)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${i === 0 ? "bg-primary" : "bg-primary/50"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="text-sm text-muted-foreground">No data.</div>
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
  const now = new Date();
  const hasTransit = rows.some((r) => isTransit(r.status));
  const hasRecent = rows.some((r) => {
    if (r.status !== "Available") return false;
    const dt = parseDMY(r.date);
    if (!dt) return false;
    const days = daysBetween(dt, now);
    return days >= 0 && days <= 3;
  });

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
  return (
    <section className="min-w-0">
      <TransitTracker rows={rows} etaDays={etaDays} />
    </section>
  );
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
  onModeChange,
  loading = false,
}: {
  rows: Diecast[];
  mode: "count" | "cost";
  onModeChange: (m: "count" | "cost") => void;
  loading?: boolean;
}) {
  const [key, setKey] = useState<TopKey>("make");
  const [selected, setSelected] = useState<string | null>(null);

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

  const selectedRows = useMemo(
    () => (selected ? rows.filter((r) => pickTopValue(r, key) === selected) : []),
    [rows, key, selected],
  );

  const label = TOP_OPTIONS.find((o) => o.value === key)!.label;
  const max = items[0]?.value || 1;

  if (loading) {
    return <TopListSkeleton />;
  }

  return (
    <div className="card-elevated flex min-w-0 flex-col overflow-hidden p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-display text-lg font-semibold">Top 5</h2>
          <p className="text-xs text-muted-foreground">Leading {label.toLowerCase()}</p>
        </div>

        <div className="flex items-center gap-1.5">
          <Select value={key} onValueChange={(v) => setKey(v as TopKey)}>
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOP_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SegmentControl
            value={mode}
            onChange={onModeChange}
            options={[
              { value: "count", label: "Count" },
              { value: "cost", label: "Cost" },
            ]}
          />
        </div>
      </div>

      {items.length > 0 ? (
        <ul className="flex min-h-0 flex-1 flex-col justify-between gap-2">
          {items.map((it, i) => {
            const pct = (it.value / max) * 100;
            return (
              <li key={it.name} className="flex flex-1 flex-col justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelected(it.name)}
                  className="group flex flex-1 flex-col justify-center gap-1.5 text-left transition-colors"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span
                      className={`flex min-w-0 items-center ${
                        i === 0
                          ? "font-semibold"
                          : "text-muted-foreground group-hover:text-foreground"
                      }`}
                    >
                      <span className="truncate">{it.name}</span>
                      <ChevronRight className="ml-1 size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground" />
                    </span>
                    <span className={`shrink-0 tabular-nums ${i === 0 ? "font-semibold" : ""}`}>
                      {mode === "count" ? it.value : inr(it.value)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${i === 0 ? "bg-primary" : "bg-primary/50"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
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
                  <div className="truncate text-xs text-muted-foreground">
                    {[r.brand, r.series, r.subSeries].filter(Boolean).join(" · ") ||
                      "Brand detail not recorded"}
                  </div>
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
