import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Truck, Clock, IndianRupee, Plus, Pencil, Store, ArrowUpDown } from "lucide-react";
import { useCars } from "@/lib/cars-store";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import { SegmentControl } from "@/components/segment-control";
import { parseDMY, inrFull } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ShippingBatchDialog } from "@/components/shipping-batch-dialog";
import {
  ReconcileDeliveryDialog,
  type ReconcileTarget,
} from "@/components/reconcile-delivery-dialog";
import { BulkAddCarsDialog } from "@/components/bulk-add-cars-dialog";
import { KpiBand, KpiTile } from "@/components/kpi";
import { ShipmentItem } from "@/components/shipment-item";
import { UpdateStatusButton } from "@/components/update-status-button";
import { useCarDrawer } from "@/components/car-details-drawer";
import { PageHeading, PageToolbar } from "@/components/page-header";
import { FilterSelect } from "@/components/filter-select";
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
  component: OrdersPage,
});

const OPEN_STATUSES = new Set(["Transit", "Waiting", "Out for Delivery", "Delayed", "Pre Order"]);
const STATUS_RANK: Record<string, number> = {
  "Out for Delivery": 0,
  Transit: 1,
  Delayed: 2,
  Waiting: 3,
  "Pre Order": 4,
};

/** Delivered batches are unbounded, so only recent ones are worth listing. */
const DELIVERED_WINDOW_DAYS = 90;

type SortMode = "status" | "seller" | "orderDate";

/**
 * One segment per status, which is what was missing: "In transit" used to mean
 * everything that was not waiting, so a parcel out for delivery and a pre-order
 * six months out were two clicks apart with no way to see either on its own.
 *
 * Delayed rides with Transit rather than taking a seventh segment. A delayed
 * parcel has shipped and is late — it is in transit, with a problem — and
 * giving it a tab of its own would mean a segment that is empty most weeks.
 */
type Tab = "all" | "outForDelivery" | "transit" | "waiting" | "preOrder" | "delivered";

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "outForDelivery", label: "Out for Delivery" },
  { value: "transit", label: "Transit" },
  { value: "waiting", label: "Waiting" },
  { value: "preOrder", label: "Pre Order" },
  { value: "delivered", label: "Delivered" },
];

const TAB_MATCH: Record<Exclude<Tab, "all" | "delivered">, (status: string) => boolean> = {
  outForDelivery: (s) => s === "out for delivery",
  transit: (s) => s === "transit" || s === "delayed",
  waiting: (s) => s === "waiting",
  preOrder: (s) => s === "pre order" || s === "preorder",
};

/**
 * Nothing has left the seller yet. Pre-orders belong here rather than with the
 * shipments: an allocation waiting on a factory and a parcel waiting on a
 * courier are the same thing to anyone reading this page — not yet moving.
 */
const WAITING_STATUSES = new Set(["Waiting", "Pre Order"]);
const isWaitingSide = (status: string) => WAITING_STATUSES.has((status || "").trim());

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
  const s = status.toLowerCase();
  if (s === "transit" || s === "out for delivery")
    return "border-cyan-500/40 bg-cyan-500/10 text-cyan-400";
  if (s === "delayed") return "border-destructive/40 bg-destructive/10 text-destructive";
  return "border-amber-500/40 bg-amber-500/10 text-amber-400";
}

function statusLabel(status: string, delivered: boolean): string {
  if (delivered) return "Delivered";
  if (status === "Transit") return "Shipped / In Transit";
  return status;
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
  return (
    <article className="card-elevated overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-base font-bold tracking-tight">
              {s.shippingId || "Unassigned"}
            </h2>
            <span
              className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${statusTone(
                s.status,
                s.delivered,
              )}`}
            >
              {statusLabel(s.status, s.delivered)}
            </span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span className="font-semibold">{s.seller}</span>
            {s.reference ? (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="font-mono text-xs text-muted-foreground">Ref: {s.reference}</span>
              </>
            ) : null}
            {s.orderDate ? (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">Ordered {s.orderDate}</span>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex shrink-0 items-start gap-6 text-right">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {s.delivered ? "Delivered on" : "Expected arrival"}
            </div>
            <div className="font-mono text-sm font-semibold text-amber-400">{s.eta || "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Total cost
            </div>
            <div className="text-sm font-bold tabular-nums">{inrFull(s.value)}</div>
          </div>
        </div>
      </header>

      <div className="border-t border-border px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Shipment contents ({s.items.length} casting{s.items.length === 1 ? "" : "s"})
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {s.items.map((c) => (
            <ShipmentItem key={c.id} car={c} onOpen={() => onOpenCar(c)} />
          ))}
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
        <p className="min-w-0 text-xs text-muted-foreground">
          {s.eta && !s.delivered ? `Expected ${s.eta}. ` : ""}
          {s.items.length} car{s.items.length === 1 ? "" : "s"} from {s.seller}.
        </p>
        {/* Wraps rather than holding its ground. Three buttons do not fit
            across 375px, and shrink-0 meant the last one ran off the edge of
            the card instead of dropping to the next line. */}
        <div className="flex flex-wrap items-center gap-2">
          {/* This parcel, not the page it is on. */}
          <ExportButton
            rows={s.items}
            name={`order-${s.shippingId || s.seller}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
            label={s.shippingId ? `Order ${s.shippingId}` : `${s.seller} order`}
          />
          {s.shippingId ? (
            <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
              <Pencil className="size-3.5" />
              Update Order
            </Button>
          ) : null}
          {!s.delivered && s.shippingId ? (
            <UpdateStatusButton
              onClick={onUpdateStatus}
              title={`Update status for the ${s.items.length} car${
                s.items.length === 1 ? "" : "s"
              } in ${s.shippingId}`}
            />
          ) : null}
        </div>
      </footer>
    </article>
  );
}

function OrdersPage() {
  const { query } = useApp();
  const cars = useCars();
  const drawer = useCarDrawer();
  const [mode, setMode] = useState<SortMode>("status");
  const [tab, setTab] = useState<Tab>("all");
  const [seller, setSeller] = useState("all");
  const [batchOpen, setBatchOpen] = useState(false);
  const [selectedShippingId, setSelectedShippingId] = useState("");
  const [reconcileFor, setReconcileFor] = useState<ReconcileTarget | null>(null);

  const scoped = useMemo(() => filterRows(cars, query), [cars, query]);

  const orderRows = useMemo(() => {
    const cutoff = Date.now() - DELIVERED_WINDOW_DAYS * 86_400_000;
    return scoped.filter((r) => {
      if (OPEN_STATUSES.has(r.status)) return true;
      // Recently delivered batches stay visible so they can be reviewed.
      if (r.status === "Available" && (r.shippingId || "").trim()) {
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
      if (r.status === "Available") continue;
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

  const filtered = useMemo(
    () =>
      bySeller.filter((r) => {
        const delivered = r.status === "Available";
        if (tab === "delivered") return delivered;
        // "All" means all of it, delivered included. It used to quietly exclude
        // them, which made the count under the heading disagree with the tabs.
        if (tab === "all") return true;
        if (delivered) return false;
        return TAB_MATCH[tab](
          (r.status || "")
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, " "),
        );
      }),
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
      const delivered = first.status === "Available";
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

    const rank = (s: Shipment) => (s.delivered ? 90 : (STATUS_RANK[s.status] ?? 89));
    const t = (v: string) => parseDMY(v)?.getTime() ?? 0;
    return out.sort((a, b) => {
      if (mode === "seller") {
        const s = a.seller.localeCompare(b.seller);
        if (s !== 0) return s;
      } else if (mode === "orderDate") {
        const d = t(b.orderDate) - t(a.orderDate);
        if (d !== 0) return d;
      }
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return t(b.orderDate) - t(a.orderDate);
    });
  }, [filtered, mode]);

  const totalCars = shipments.reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-3 md:p-6">
      {/* Heading, tiles, controls, body — the order every page follows. */}
      <PageHeading
        title="Shipments &amp; orders"
        subtitle={
          <>
            Carrier references, delivery timelines, and incoming castings — {shipments.length}{" "}
            shipment
            {shipments.length === 1 ? "" : "s"} · {totalCars} car{totalCars === 1 ? "" : "s"}.
          </>
        }
      />

      <KpiBand>
        <KpiTile
          label="In transit"
          value={inrFull(totals.transitValue)}
          sub={`${totals.transitCount} casting${totals.transitCount === 1 ? "" : "s"} on the move`}
          icon={<Truck className="size-4" />}
          tone="sky"
        />
        <KpiTile
          label="Waiting"
          value={inrFull(totals.waitingValue)}
          sub={`${totals.waitingCount} not dispatched yet`}
          icon={<Clock className="size-4" />}
          tone="amber"
          valueTone="amber"
        />
        <KpiTile
          label="Balance due"
          value={inrFull(totals.due)}
          sub="Outstanding across open orders"
          icon={<IndianRupee className="size-4" />}
          tone="emerald"
          valueTone="emerald"
        />
      </KpiBand>

      <PageToolbar
        sticky
        left={<SegmentControl value={tab} onChange={setTab} options={TABS} />}
        right={
          <>
            <FilterSelect
              value={seller}
              onChange={setSeller}
              icon={<Store className="size-3.5" />}
              label="Seller"
              options={[
                { value: "all", label: "All sellers" },
                ...sellerOpts.map((s) => ({ value: s, label: s })),
              ]}
            />
            <FilterSelect
              value={mode}
              onChange={(v) => setMode(v as SortMode)}
              icon={<ArrowUpDown className="size-3.5" />}
              label="Sort"
              neutral="status"
              options={[
                { value: "status", label: "Status" },
                { value: "seller", label: "Seller" },
                { value: "orderDate", label: "Order date" },
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

      <ReconcileDeliveryDialog target={reconcileFor} onClose={() => setReconcileFor(null)} />
    </div>
  );
}
