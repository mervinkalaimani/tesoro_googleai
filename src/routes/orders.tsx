import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Truck, Plus, Pencil, Store, ChevronDown, Filter } from "lucide-react";
import { useCars } from "@/lib/cars-store";
import { isInHand, isOpenOrder, normaliseStatus, statusRank, type Status } from "@/lib/status";
import { isLate } from "@/lib/delivery-watch";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import { SegmentControl } from "@/components/segment-control";
import { formatDayMonthYear, inr, inrFull, parseDMY } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ShippingBatchDialog } from "@/components/shipping-batch-dialog";
import { StatusUpdateDialog, type StatusBatch } from "@/components/status-update-dialog";

import { BulkAddCarsDialog } from "@/components/bulk-add-cars-dialog";
import { UpdateStatusButton } from "@/components/update-status-button";
import { useCarDrawer } from "@/components/car-details-drawer";
import { PageHeading, PageToolbar } from "@/components/page-header";
import { FilterSelect, SortSelect, type SortDir } from "@/components/filter-select";
import { ExportButton } from "@/components/export-button";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "My Orders | Tesoro" },
      {
        name: "description",
        content:
          "Track diecast shipments in transit and pre-order payments with advance paid, balance due, and expected delivery.",
      },
      { property: "og:title", content: "My Orders | Tesoro" },
      {
        property: "og:description",
        content:
          "Track diecast shipments in transit and pre-order payments with advance paid, balance due, and expected delivery.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // Lets the dashboard open this page on one segment — Late above all, which is
  // not a status and so has nowhere in the inventory to deep-link to.
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => {
    const tab = search.tab;
    return typeof tab === "string" && TABS.some((t) => t.value === tab) ? { tab: tab as Tab } : {};
  },
  component: OrdersPage,
});

const isOpenStatus = (s: string | null | undefined) => isOpenOrder(s);

/** Delivered batches are unbounded, so only recent ones are worth listing. */
const DELIVERED_WINDOW_DAYS = 90;

type SortMode = "expected" | "status" | "seller" | "orderDate";

/**
 * One segment per open status, plus Late and Delivered.
 *
 * There were seven, two of which no longer exist: Out for Delivery is part of
 * In Transit, and Delayed is not a status at all — a car is late when its day
 * has gone by, which is now worked out rather than set, so it gets a segment
 * that cuts across the others instead of sitting beside them.
 */
type Tab = "all" | "transit" | "ordered" | "onHold" | "preOrder" | "late" | "delivered";

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All Active" },
  { value: "transit", label: "In Transit" },
  { value: "ordered", label: "Ordered" },
  { value: "onHold", label: "On Hold" },
  { value: "preOrder", label: "PO" },
  { value: "late", label: "Late" },
  { value: "delivered", label: "Delivered" },
];

const TAB_STATUS: Record<"transit" | "ordered" | "onHold" | "preOrder", Status> = {
  transit: "In Transit",
  ordered: "Ordered",
  onHold: "On Hold",
  preOrder: "PO",
};

function inTab(r: Diecast, tab: Tab): boolean {
  const delivered = isInHand(r.status);
  if (tab === "delivered") return delivered;
  // All Active: everything still owed to you. A delivered order is finished
  // business and has a tab of its own — mixing the two meant the first screen
  // of this page was mostly parcels that had already arrived.
  if (delivered) return false;
  if (tab === "all") return true;
  // Late is a fact about a car, not a status, so it crosses the other tabs
  // rather than excluding them: a late parcel is still In Transit.
  if (tab === "late") return isLate(r);
  return normaliseStatus(r.status) === TAB_STATUS[tab];
}

/**
 * Nothing has left the seller yet. Pre-orders and held cars belong here rather
 * than with the shipments: an allocation waiting on a factory, a car the seller
 * is keeping for you, and a parcel waiting on a courier are the same thing to
 * anyone reading this page — not yet moving.
 */
const isWaitingSide = (status: string) => {
  const n = normaliseStatus(status);
  return n === "Ordered" || n === "PO" || n === "On Hold";
};

type Shipment = {
  key: string;
  seller: string;
  status: string;
  shippingId: string;
  items: Diecast[];
  value: number;
  orderDate: string;
  eta: string;
  reference: string;
  delivered: boolean;
};

function uniqueSorted(items: Diecast[], key: (r: Diecast) => string) {
  const s = new Set<string>();
  for (const it of items) {
    const v = key(it);
    if (v) s.add(v);
  }
  return [...s].sort((a, b) => a.localeCompare(b));
}

/** Colour the status pill by what the shipment is actually doing. */
function statusTone(status: string, delivered: boolean): string {
  if (delivered) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-400";
  if (normaliseStatus(status) === "In Transit")
    return "border-blue-500/40 bg-blue-500/10 text-blue-400";
  return "border-amber-500/40 bg-amber-500/10 text-amber-400";
}

function statusLabel(status: string, delivered: boolean): string {
  if (delivered) return "Delivered";
  return normaliseStatus(status) || status;
}

function ShipmentCard({
  s,
  onEdit,
  onUpdateStatus,
  onOpenCar,
}: {
  s: Shipment;
  onEdit: () => void;
  onUpdateStatus: () => void;
  onOpenCar: (car: Diecast) => void;
}) {
  const [mobileCarsOpen, setMobileCarsOpen] = useState(false);

  return (
    <article className="card-elevated overflow-hidden">
      <header className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-mono text-base font-bold tracking-tight">
              {s.shippingId || "Unassigned"}
            </h2>
            <p className="truncate text-sm font-semibold text-muted-foreground">{s.seller}</p>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[11px] ${statusTone(
              s.status,
              s.delivered,
            )}`}
          >
            {statusLabel(s.status, s.delivered)}
          </span>
        </div>

        {/* The one place each date is said. The footer used to repeat the
            expected date in a sentence underneath the cars. */}
        <dl className="grid grid-cols-3 gap-3">
          <HeaderFact label="Ordered" value={shortDate(s.orderDate)} />
          <HeaderFact
            label={s.delivered ? "Delivered" : "Expected"}
            value={shortDate(s.eta)}
            className="text-amber-500"
          />
          <HeaderFact label="Total cost" value={inrFull(s.value)} align="right" />
        </dl>
      </header>

      <div className="border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setMobileCarsOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left sm:cursor-default"
          aria-expanded={mobileCarsOpen}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Shipment contents ({s.items.length} casting{s.items.length === 1 ? "" : "s"})
          </div>
          <div className="flex items-center gap-1 text-xs font-medium text-primary sm:hidden">
            <span>{mobileCarsOpen ? "Hide cars" : "View cars"}</span>
            <ChevronDown
              className={`size-3.5 transition-transform duration-200 ${
                mobileCarsOpen ? "rotate-180" : ""
              }`}
            />
          </div>
        </button>
        <div
          className={`${mobileCarsOpen ? "block" : "hidden sm:grid"} mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3`}
        >
          {s.items.map((c) => (
            <ContentsItem key={c.id} car={c} onOpen={() => onOpenCar(c)} />
          ))}
        </div>
      </div>

      {/* One row, phone included: Export is an icon, and the two labelled
          buttons share what is left between them. */}
      <footer className="flex items-center gap-2 border-t border-border px-4 py-3 sm:justify-end">
        {/* This parcel, not the page it is on. */}
        <ExportButton
          rows={s.items}
          name={`order-${s.shippingId || s.seller}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
          label={s.shippingId ? `Order ${s.shippingId}` : `${s.seller} order`}
          iconOnly
          size="icon"
          className="size-8 shrink-0"
        />
        {s.shippingId ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="min-w-0 flex-1 gap-1.5 sm:flex-none"
          >
            <Pencil className="size-3.5" />
            Update Order
          </Button>
        ) : null}
        {!s.delivered && s.shippingId ? (
          <UpdateStatusButton
            onClick={onUpdateStatus}
            className="min-w-0 flex-1 sm:flex-none"
            title={`Update status for the ${s.items.length} car${
              s.items.length === 1 ? "" : "s"
            } in ${s.shippingId}`}
          />
        ) : null}
      </footer>
    </article>
  );
}

/** "2026-09-18" -> "18 Sept 2026"; anything unparseable is shown as written. */
function shortDate(value: string): string {
  if (!value) return "—";
  return formatDayMonthYear(value) || value;
}

function HeaderFact({
  label,
  value,
  className = "",
  align = "left",
}: {
  label: string;
  value: string;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : ""}`}>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`truncate text-sm font-semibold tabular-nums ${className}`}>{value}</dd>
    </div>
  );
}

/**
 * A car inside a shipment: its name, then what it is on the left and what it
 * cost against its retail price on the right.
 */
function ContentsItem({ car, onOpen }: { car: Diecast; onOpen: () => void }) {
  const title = car.name || `${car.make} ${car.model}`.trim() || "Unnamed car";
  const kind = [
    car.brand,
    car.assortment,
    car.series,
    car.subSeries,
    car.carNumber ? `#${car.carNumber.replace(/^#/, "")}` : "",
  ]
    .map((v) => (v || "").trim())
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <button
        type="button"
        onClick={onOpen}
        className="block max-w-full truncate text-left text-sm font-semibold hover:text-primary"
      >
        {title}
      </button>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{kind || "—"}</span>
        <span className="shrink-0 tabular-nums">
          <span className="font-medium text-foreground">{inr(car.spent || 0)}</span>
          {" / "}
          {car.mrp ? inr(car.mrp) : "—"}
        </span>
      </div>
    </div>
  );
}

function OrdersPage() {
  const { query } = useApp();
  const cars = useCars();
  const drawer = useCarDrawer();
  const search = Route.useSearch();
  const [mode, setMode] = useState<SortMode>("expected");
  const [dir, setDir] = useState<SortDir>("asc");
  // Seeded from ?tab= so a dashboard tile lands on the right segment; the
  // segments stay free to change it afterwards.
  const [tab, setTab] = useState<Tab>(search.tab ?? "all");
  const [seller, setSeller] = useState("all");
  const [batchOpen, setBatchOpen] = useState(false);
  const [selectedShippingId, setSelectedShippingId] = useState("");
  const [reconcileFor, setReconcileFor] = useState<StatusBatch | null>(null);

  // Arriving from the dashboard a second time, with the page already mounted.
  useEffect(() => {
    if (search.tab) setTab(search.tab);
  }, [search.tab]);

  const scoped = useMemo(() => filterRows(cars, query), [cars, query]);

  const orderRows = useMemo(() => {
    const cutoff = Date.now() - DELIVERED_WINDOW_DAYS * 86_400_000;
    return scoped.filter((r) => {
      if (isOpenStatus(r.status)) return true;
      // Recently delivered batches stay visible so they can be reviewed.
      if (isInHand(r.status) && (r.shippingId || "").trim()) {
        const d = parseDMY(r.date);
        return d ? d.getTime() >= cutoff : false;
      }
      return false;
    });
  }, [scoped]);

  const sellerOpts = useMemo(() => uniqueSorted(orderRows, (r) => r.seller), [orderRows]);

  // Seller alone, so the tiles keep reporting on waiting orders while the
  // in-transit tab is open — a KPI that empties when you filter past it is
  // measuring the tab, not the orders.
  const bySeller = useMemo(
    () => orderRows.filter((r) => seller === "all" || r.seller === seller),
    [orderRows, seller],
  );

  const totals = useMemo(() => {
    let transitCount = 0;
    let transitValue = 0;
    let waitingCount = 0;
    let waitingValue = 0;
    let due = 0;
    for (const r of bySeller) {
      if (isInHand(r.status)) continue;
      due += Math.max((r.spent || 0) - (r.paid || 0), 0);
      if (isWaitingSide(r.status)) {
        waitingCount += 1;
        waitingValue += r.spent || 0;
      } else {
        transitCount += 1;
        transitValue += r.spent || 0;
      }
    }
    return { transitCount, transitValue, waitingCount, waitingValue, due };
  }, [bySeller]);

  const filtered = useMemo(() => bySeller.filter((r) => inTab(r, tab)), [bySeller, tab]);

  // A segment with nothing behind it is hidden — the same rule Inventory's
  // status segments follow. The one you are on stays, even if its last order
  // was just delivered, so the control does not jump out from under you.
  const visibleTabs = useMemo(
    () =>
      TABS.filter(
        (t) => t.value === "all" || t.value === tab || bySeller.some((r) => inTab(r, t.value)),
      ),
    [bySeller, tab],
  );

  const shipments = useMemo<Shipment[]>(() => {
    const map = new Map<string, Diecast[]>();
    for (const r of filtered) {
      const shipId = (r.shippingId || "").trim();
      const key = shipId || `${r.seller || "Unknown"}|${r.orderDate || "—"}|${r.status}`;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }

    const out: Shipment[] = [];
    for (const [key, items] of map) {
      const first = items[0];
      const delivered = isInHand(first.status);
      out.push({
        key,
        seller: first.seller || "Unknown seller",
        status: first.status,
        shippingId: (first.shippingId || "").trim(),
        items,
        value: items.reduce((s, r) => s + (r.spent || 0), 0),
        orderDate: first.orderDate || "",
        eta: delivered
          ? first.date || ""
          : first.expectedDate || first.date || (first.transitInfo || "").trim(),
        reference: (first.transitInfo || "").trim(),
        delivered,
      });
    }

    const rank = (s: Shipment) => (s.delivered ? 90 : statusRank(s.status));
    const t = (v: string) => parseDMY(v)?.getTime() ?? 0;
    // Each comparison is written ascending; descending flips only that one,
    // so ties still fall back the same way.
    const sign = dir === "asc" ? 1 : -1;
    return out.sort((a, b) => {
      // What is closest to your hands leads, whatever the dates say: In
      // Transit, then Ordered, then On Hold, then PO. A pre-order with an
      // earlier expected date is not more urgent than a parcel that is out
      // for delivery — it is a guess at a release, months out, against a
      // courier who has your box today.
      //
      // Sorting by seller or by order date is an explicit ask for a different
      // shape, so those two are left to do what they say.
      if (mode === "expected" || mode === "status") {
        const byStatus = (rank(a) - rank(b)) * (mode === "status" ? sign : 1);
        if (byStatus !== 0) return byStatus;
      }

      if (mode === "expected") {
        // Delivered orders, and ones with no date to go by, stay at the bottom
        // whichever way the dates run.
        const group = (s: Shipment) => (s.delivered ? 2 : parseDMY(s.eta) ? 0 : 1);
        const g = group(a) - group(b);
        if (g !== 0) return g;
        if (group(a) === 0) {
          const d = (t(a.eta) - t(b.eta)) * sign;
          if (d !== 0) return d;
        }
      } else if (mode === "seller") {
        const s = a.seller.localeCompare(b.seller) * sign;
        if (s !== 0) return s;
      } else if (mode === "orderDate") {
        const d = (t(a.orderDate) - t(b.orderDate)) * sign;
        if (d !== 0) return d;
      }
      const r = (rank(a) - rank(b)) * (mode === "status" ? sign : 1);
      if (r !== 0) return r;
      return t(b.orderDate) - t(a.orderDate);
    });
  }, [filtered, mode, dir]);

  const inShipmentOrders = useMemo(() => {
    return shipments.filter(
      (s) =>
        !s.delivered &&
        (normaliseStatus(s.status) === "In Transit" || normaliseStatus(s.status) === "Ordered"),
    );
  }, [shipments]);

  const inShipmentCarCount = useMemo(() => {
    return inShipmentOrders.reduce((sum, s) => sum + s.items.length, 0);
  }, [inShipmentOrders]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-3 md:p-6">
      <PageHeading
        title="My Orders"
        subtitle={`${inShipmentOrders.length} ${inShipmentOrders.length === 1 ? "order" : "orders"} in shipment · ${inShipmentCarCount} ${inShipmentCarCount === 1 ? "car" : "cars"}`}
      />

      <PageToolbar
        sticky
        // One line on a phone: the tabs shrink and scroll beside the controls.
        oneLine
        left={
          <SegmentControl
            value={tab}
            onChange={setTab}
            options={visibleTabs}
            className="w-auto max-sm:text-[11px] max-sm:[&>button]:px-2"
          />
        }
        right={
          <>
            <FilterSelect
              value={seller}
              onChange={setSeller}
              icon={<Filter className="size-3.5" />}
              label="Seller"
              iconOnly
              options={[
                { value: "all", label: "All sellers" },
                ...sellerOpts.map((s) => ({ value: s, label: s })),
              ]}
            />
            <SortSelect
              value={mode}
              dir={dir}
              onChange={(v, d) => {
                setMode(v);
                setDir(d);
              }}
              iconOnly
              neutral="expected"
              options={[
                { value: "expected", label: "Expected", dir: "asc" },
                { value: "status", label: "Status", dir: "asc" },
                { value: "seller", label: "Seller", dir: "asc" },
                { value: "orderDate", label: "Order date", dir: "desc" },
              ]}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedShippingId("");
                setBatchOpen(true);
              }}
              title="Update an order by its shipping ID"
              aria-label="Update an order by its shipping ID"
            >
              <Pencil className="size-3.5" />
            </Button>
            <BulkAddCarsDialog
              trigger={
                <Button size="sm" className="gap-1.5">
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">New shipment</span>
                </Button>
              }
            />
          </>
        }
      />

      <div className="space-y-3">
        {shipments.map((s) => (
          <ShipmentCard
            key={s.key}
            s={s}
            onOpenCar={(car) => drawer.open(car)}
            onEdit={() => {
              setSelectedShippingId(s.shippingId);
              setBatchOpen(true);
            }}
            onUpdateStatus={() =>
              setReconcileFor({ shippingId: s.shippingId, seller: s.seller, items: s.items })
            }
          />
        ))}
        {shipments.length === 0 && (
          <div className="card-elevated p-8 text-center text-sm text-muted-foreground">
            {tab === "delivered"
              ? `No deliveries in the last ${DELIVERED_WINDOW_DAYS} days.`
              : "No open orders."}
          </div>
        )}
      </div>

      <ShippingBatchDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        initialShippingId={selectedShippingId}
      />

      <StatusUpdateDialog batch={reconcileFor} onClose={() => setReconcileFor(null)} />
    </div>
  );
}
