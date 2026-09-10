import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Truck, PackageCheck, Plus, Pencil } from "lucide-react";
import { useCars } from "@/lib/cars-store";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import { SegmentControl } from "@/components/segment-control";
import { parseDMY, inr, inrFull } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ShippingBatchDialog } from "@/components/shipping-batch-dialog";
import {
  ReconcileDeliveryDialog,
  type ReconcileTarget,
} from "@/components/reconcile-delivery-dialog";
import { BulkAddCarsDialog } from "@/components/bulk-add-cars-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
type Tab = "all" | "transit" | "delivered";

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
  onReconcile,
}: {
  s: Shipment;
  onEdit: () => void;
  onReconcile: () => void;
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
            <div
              key={c.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate font-mono text-[11px] text-muted-foreground">
                  <span>{c.carNumber || c.id}</span>
                  {c.series ? (
                    <>
                      <span>·</span>
                      <span className="truncate">{c.series}</span>
                    </>
                  ) : null}
                </div>
                <div className="truncate text-sm font-semibold">{c.name}</div>
              </div>
              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                {inr(c.spent || 0)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
        <p className="min-w-0 text-xs text-muted-foreground">
          {s.eta && !s.delivered ? `Expected ${s.eta}. ` : ""}
          {s.items.length} car{s.items.length === 1 ? "" : "s"} from {s.seller}.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {s.shippingId ? (
            <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
              <Pencil className="size-3.5" />
              Update batch
            </Button>
          ) : null}
          {!s.delivered && s.shippingId ? (
            <Button size="sm" onClick={onReconcile} className="gap-1.5">
              <PackageCheck className="size-4" />
              Reconcile delivery
            </Button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}

function OrdersPage() {
  const { query } = useApp();
  const cars = useCars();
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

  const filtered = useMemo(
    () =>
      orderRows.filter((r) => {
        if (seller !== "all" && r.seller !== seller) return false;
        const delivered = r.status === "Available";
        if (tab === "transit" && delivered) return false;
        if (tab === "delivered" && !delivered) return false;
        return true;
      }),
    [orderRows, seller, tab],
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
      <div className="card-elevated p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-display flex items-center gap-2 text-xl font-semibold">
              <Truck className="size-5 text-primary" />
              Shipments &amp; order batches
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Track carrier references, delivery timelines, and reconcile incoming castings directly
              into your collection. {shipments.length} shipment
              {shipments.length === 1 ? "" : "s"} · {totalCars} car{totalCars === 1 ? "" : "s"}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentControl
              value={tab}
              onChange={setTab}
              options={[
                { value: "all", label: "All" },
                { value: "transit", label: "In transit" },
                { value: "delivered", label: "Delivered" },
              ]}
            />
            <Select value={seller} onValueChange={setSeller}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Seller" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All sellers</SelectItem>
                {sellerOpts.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={mode} onValueChange={(v) => setMode(v as SortMode)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="status">Sort: Status</SelectItem>
                <SelectItem value="seller">Sort: Seller</SelectItem>
                <SelectItem value="orderDate">Sort: Order date</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedShippingId("");
                setBatchOpen(true);
              }}
              className="gap-1.5"
            >
              <Pencil className="size-3.5" />
              Update by ID
            </Button>
            <BulkAddCarsDialog
              trigger={
                <Button size="sm" className="gap-1.5">
                  <Plus className="size-4" />
                  New shipment
                </Button>
              }
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {shipments.map((s) => (
          <ShipmentCard
            key={s.key}
            s={s}
            onEdit={() => {
              setSelectedShippingId(s.shippingId);
              setBatchOpen(true);
            }}
            onReconcile={() =>
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
