import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pencil, Truck } from "lucide-react";
import { useCars } from "@/lib/cars-store";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import { SegmentControl } from "@/components/segment-control";
import { CarsTable, StatusPill } from "@/components/cars-table";
import { parseDMY, inr } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ShippingBatchDialog } from "@/components/shipping-batch-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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

const ORDER_STATUSES = new Set(["Transit", "Waiting", "Out for Delivery", "Delayed"]);
const STATUS_RANK: Record<string, number> = {
  "Out for Delivery": 0,
  Transit: 1,
  Delayed: 2,
  Waiting: 3,
};

type SortMode = "status" | "seller" | "orderDate";
type StatusFilter = "all" | "Out for Delivery" | "Transit" | "Waiting" | "Delayed";

type Shipment = {
  key: string;
  seller: string;
  status: string;
  shippingId?: string;
  items: Diecast[];
  value: number;
  brands: string[];
  orderDate: string;
  eta: string;
};

function uniqueSorted(items: Diecast[], key: (r: Diecast) => string) {
  const s = new Set<string>();
  for (const it of items) {
    const v = key(it);
    if (v) s.add(v);
  }
  return [...s].sort((a, b) => a.localeCompare(b));
}

function OrdersPage() {
  const { query } = useApp();
  const cars = useCars();
  const [mode, setMode] = useState<SortMode>("status");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [seller, setSeller] = useState("all");
  const [batchOpen, setBatchOpen] = useState(false);
  const [selectedShippingId, setSelectedShippingId] = useState("");

  const orderRows = useMemo(
    () => filterRows(cars, query).filter((r) => ORDER_STATUSES.has(r.status)),
    [cars, query],
  );

  const sellerOpts = useMemo(() => uniqueSorted(orderRows, (r) => r.seller), [orderRows]);

  const statusOpts = useMemo<{ value: StatusFilter; label: string }[]>(() => {
    const present = new Set(orderRows.map((r) => r.status));
    const order: StatusFilter[] = ["Out for Delivery", "Transit", "Delayed", "Waiting"];
    return [
      { value: "all" as StatusFilter, label: "All" },
      ...order.filter((s) => present.has(s)).map((s) => ({ value: s, label: s })),
    ];
  }, [orderRows]);

  const filtered = useMemo(
    () =>
      orderRows.filter((r) => {
        if (seller !== "all" && r.seller !== seller) return false;
        if (statusFilter !== "all" && r.status !== statusFilter) return false;
        return true;
      }),
    [orderRows, seller, statusFilter],
  );

  const shipments = useMemo<Shipment[]>(() => {
    const map = new Map<string, Diecast[]>();
    for (const r of filtered) {
      // Group by shipping ID when present, otherwise by seller + order date + status
      const shipId = (r.shippingId || "").trim();
      const key = shipId || `${r.seller || "Unknown"}|${r.orderDate || "—"}|${r.status}`;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }

    const out: Shipment[] = [];
    for (const [key, items] of map) {
      const first = items[0];
      out.push({
        key,
        seller: first.seller || "Unknown seller",
        status: first.status,
        shippingId: first.shippingId || "",
        items,
        value: items.reduce((s, r) => s + (r.spent || 0), 0),
        brands: [...new Set(items.map((r) => r.brand).filter(Boolean))].slice(0, 3),
        orderDate: first.orderDate || "",
        // ETA comes from the Transit info / ETA column, falling back to the expected date
        eta: (first.transitInfo || "").trim() || first.expectedDate || first.date || "",
      });
    }

    const rank = (s: Shipment) => STATUS_RANK[s.status] ?? 99;
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-display text-xl font-semibold">My orders</h1>
            <p className="text-xs text-muted-foreground">
              {shipments.length} shipment{shipments.length === 1 ? "" : "s"} · {totalCars} car
              {totalCars === 1 ? "" : "s"} in flight
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedShippingId("");
                setBatchOpen(true);
              }}
              className="gap-1.5 shrink-0 border-amber-500/40 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 font-medium"
            >
              <Truck className="size-3.5" />
              <span>Update by Shipping ID</span>
            </Button>
            <SegmentControl value={statusFilter} onChange={setStatusFilter} options={statusOpts} />
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
          </div>
        </div>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {shipments.map((g) => (
          <AccordionItem key={g.key} value={g.key} className="card-elevated border-0 px-3 md:px-4">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex w-full items-center justify-between gap-4 pr-3">
                <div className="min-w-0 text-left">
                  <div className="flex items-center gap-2 truncate font-medium">
                    <span>{g.seller}</span>
                    {g.shippingId && (
                      <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber-400">
                        {g.shippingId}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 pt-1">
                    <StatusPill status={g.status} />
                    {g.brands.map((b) => (
                      <span
                        key={b}
                        className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 md:gap-4 text-xs">
                  {g.shippingId && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedShippingId(g.shippingId || "");
                        setBatchOpen(true);
                      }}
                      className="hidden sm:inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 transition-colors"
                      title={`Update all cars in ${g.shippingId}`}
                    >
                      <Pencil className="size-3" />
                      <span>Update Batch</span>
                    </button>
                  )}
                  <span className="tabular-nums">
                    <b className="text-foreground">{g.items.length}</b>{" "}
                    <span className="text-muted-foreground">cars</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">{inr(g.value)}</span>
                  <span className="hidden tabular-nums text-muted-foreground sm:inline">
                    {g.orderDate ? `Ordered ${g.orderDate}` : "—"}
                  </span>
                  <span className="hidden max-w-[14rem] truncate text-muted-foreground md:inline">
                    {g.eta ? `ETA ${g.eta}` : ""}
                  </span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CarsTable rows={g.items} />
            </AccordionContent>
          </AccordionItem>
        ))}
        {shipments.length === 0 && (
          <div className="card-elevated p-8 text-center text-sm text-muted-foreground">
            No open orders.
          </div>
        )}
      </Accordion>

      <ShippingBatchDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        initialShippingId={selectedShippingId}
      />
    </div>
  );
}
