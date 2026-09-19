import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Calendar,
  ChevronDown,
  CircleCheck,
  Clock,
  IndianRupee,
  Plus,
  Store,
  Truck,
} from "lucide-react";

import { useCars } from "@/lib/cars-store";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import { useCarDrawer } from "@/components/car-details-drawer";
import { formatDayMonthYear, inrFull, parseDMY } from "@/lib/format";
import { isPreOrder } from "@/lib/status-order";
import { Button } from "@/components/ui/button";
import { CarFormDialog } from "@/components/car-form-dialog";
import { PayBalanceDialog } from "@/components/pay-balance-dialog";
import { StatusUpdateDialog } from "@/components/status-update-dialog";
import { ShippingBatchDialog } from "@/components/shipping-batch-dialog";
import { KpiBand, KpiTile } from "@/components/kpi";
import { UpdateStatusButton } from "@/components/update-status-button";
import { PageHeading, PageToolbar } from "@/components/page-header";
import { FilterSelect, SortSelect, type SortDir } from "@/components/filter-select";
import { ExportButton } from "@/components/export-button";
import { SegmentControl } from "@/components/segment-control";

export const Route = createFileRoute("/preorders")({
  head: () => ({
    meta: [
      { title: "Pre-orders | Tesoro" },
      {
        name: "description",
        content:
          "Track diecast pre-orders with seller, order date, ETA, payment status, cost, advance paid and remaining balance.",
      },
      { property: "og:title", content: "Pre-orders | Tesoro" },
      {
        property: "og:description",
        content:
          "Track diecast pre-orders with seller, order date, ETA, payment status, cost, advance paid and remaining balance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PreOrdersPage,
});

/** Remaining balance for a pre-order row: car cost minus amount paid. */
const balanceOf = (r: Diecast) => Math.max((r.spent || 0) - (r.paid || 0), 0);

/** Date when the pre-order is scheduled/arriving, falling back to order date or creation date. */
function getPreorderDate(car: Diecast): Date | null {
  const raw = (car.expectedDate || car.orderDate || car.date || "").trim();
  if (!raw) return null;
  const d = parseDMY(raw);
  if (d) return d;
  const ymMatch = raw.match(/^(\d{4})[/-](\d{1,2})$/);
  if (ymMatch) {
    return new Date(Number(ymMatch[1]), Number(ymMatch[2]) - 1, 1);
  }
  const myMatch = raw.match(/^(\d{1,2})[/-](\d{4})$/);
  if (myMatch) {
    return new Date(Number(myMatch[2]), Number(myMatch[1]) - 1, 1);
  }
  const fallback = new Date(raw);
  return isNaN(fallback.getTime()) ? null : fallback;
}

type SortMode = "balance" | "expectedDate" | "orderDate" | "seller" | "cost";
type Grouping = "car" | "order";

function uniqueSorted(items: Diecast[], key: (r: Diecast) => string) {
  const s = new Set<string>();
  for (const it of items) {
    const v = key(it);
    if (v) s.add(v);
  }
  return [...s].sort((a, b) => a.localeCompare(b));
}

/**
 * The line under a car's name: what it is and where it came from, in the order
 * you would say it. Deliberately not the car ID — an eight-character key is the
 * least useful thing on a card about a car you can see.
 */
function preOrderSubLine(car: Diecast) {
  return [car.brand, car.assortment, car.carNumber, car.seller].filter(Boolean).join(" · ") || "—";
}

/** A label and value in the pre-order card's grid. */
function PreOrderFact({
  label,
  value,
  className = "text-foreground",
  align = "left",
}: {
  label: string;
  value: string;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : ""}`}>
      <dt className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-0.5 truncate text-xs font-semibold tabular-nums ${className}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

/** One pre-ordered car. */
function PreOrderCard({
  car,
  onOpen,
  onPay,
  onUpdateStatus,
  showSeller = true,
}: {
  car: Diecast;
  onOpen: () => void;
  onPay: () => void;
  onUpdateStatus: () => void;
  /** Off inside a group, where the heading already names the seller. */
  showSeller?: boolean;
}) {
  const due = balanceOf(car);
  const settled = due === 0;

  const sub = showSeller
    ? preOrderSubLine(car)
    : [car.brand, car.assortment, car.carNumber].filter(Boolean).join(" · ") || "—";

  return (
    <article className="card-elevated flex flex-col overflow-hidden">
      {/* NAME FIRST */}
      <button type="button" onClick={onOpen} className="px-4 pb-2 pt-3 text-left">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 truncate text-base font-bold tracking-tight hover:text-primary">
            {car.name || `${car.make} ${car.model}`.trim() || "Unnamed car"}
          </span>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              settled
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-amber-500/40 bg-amber-500/10 text-amber-400"
            }`}
          >
            {settled ? "Fully Paid" : "Pre-booked"}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
      </button>

      {/* One 3-column grid for both rows, so the columns line up:
            Ordered on   ·            ·   Expected by
            Cost         Deposit paid     Balance
          Everything reads left except the last column, which is right-aligned.
          A settled car keeps the same shape — its balance just says so. */}
      <dl className="mt-auto grid grid-cols-3 gap-x-3 gap-y-2.5 border-t border-border px-4 py-3">
        <PreOrderFact
          label="Ordered on"
          value={formatDayMonthYear(car.orderDate) || car.orderDate || "—"}
        />
        <div aria-hidden />
        <PreOrderFact
          label="Expected by"
          value={formatDayMonthYear(car.expectedDate) || car.transitInfo.trim() || "—"}
          className="text-primary"
          align="right"
        />
        <PreOrderFact label="Cost" value={inrFull(car.spent || 0)} />
        <PreOrderFact label="Deposit paid" value={inrFull(car.paid || 0)} />
        <PreOrderFact
          label="Balance"
          value={settled ? "Fully paid" : inrFull(due)}
          className={settled ? "text-emerald-500" : "text-amber-500"}
          align="right"
        />
      </dl>

      {/* The same footer as a shipment on My Orders: Export as an icon, then
          the labelled actions sharing the rest of the row on a phone. */}
      <footer className="flex items-center gap-2 border-t border-border px-4 py-3 sm:justify-end">
        <ExportButton
          rows={[car]}
          name={`preorder-${car.name || car.model || car.id}`
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")}
          label={car.name || "Pre-order"}
          iconOnly
          size="icon"
          className="size-8 shrink-0"
        />
        {!settled && (
          <Button
            size="sm"
            variant="outline"
            onClick={onPay}
            className="min-w-0 flex-1 gap-1.5 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400 sm:flex-none"
          >
            <IndianRupee className="size-3.5" />
            Pay balance
          </Button>
        )}
        <UpdateStatusButton onClick={onUpdateStatus} className="min-w-0 flex-1 sm:flex-none" />
      </footer>
    </article>
  );
}

type OrderGroup = {
  key: string;
  orderId: string;
  seller: string;
  orderDate: string;
  items: Diecast[];
  value: number;
  paid: number;
  due: number;
};

/**
 * One order, in the shape My Orders uses for a shipment: the ID as the heading,
 * the seller and date beneath it, the money on the right, then the cars closed
 * in an accordion by default.
 */
function OrderGroupCard({
  g,
  onOpenCar,
  onPay,
  onUpdateStatus,
  onUpdateOrder,
}: {
  g: OrderGroup;
  onOpenCar: (car: Diecast) => void;
  onPay: (car: Diecast) => void;
  onUpdateStatus: (car: Diecast) => void;
  onUpdateOrder: () => void;
}) {
  const [carsOpen, setCarsOpen] = useState(false);
  const settled = g.due === 0;

  return (
    <article className="card-elevated overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="font-mono text-base font-bold tracking-tight">
            {g.orderId || "Unassigned"}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm">
            <span className="font-semibold">{g.seller}</span>
            {g.orderDate ? (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">Ordered {g.orderDate}</span>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex shrink-0 items-start gap-6 text-right">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Deposit paid
            </div>
            <div className="text-sm font-semibold tabular-nums">{inrFull(g.paid)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Balance due
            </div>
            <div
              className={`text-sm font-bold tabular-nums ${
                settled ? "text-emerald-500" : "text-amber-500"
              }`}
            >
              {settled ? "Fully paid" : inrFull(g.due)}
            </div>
          </div>
        </div>
      </header>

      {/* Accordion toggle matching orders screen */}
      <div className="border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setCarsOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={carsOpen}
        >
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {g.items.length} casting{g.items.length === 1 ? "" : "s"} · {inrFull(g.value)} committed
          </div>
          <div className="flex items-center gap-1 text-xs font-medium text-primary">
            <span>{carsOpen ? "Hide cars" : "View cars"}</span>
            <ChevronDown
              className={`size-3.5 transition-transform duration-200 ${
                carsOpen ? "rotate-180" : ""
              }`}
            />
          </div>
        </button>

        {carsOpen && (
          <div className="mt-3 grid gap-2 xl:grid-cols-2">
            {g.items.map((c) => (
              <PreOrderCard
                key={c.id}
                car={c}
                showSeller={false}
                onOpen={() => onOpenCar(c)}
                onPay={() => onPay(c)}
                onUpdateStatus={() => onUpdateStatus(c)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer: everything this order can be done to, on the right. */}
      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
        {settled && (
          <span className="mr-auto text-xs font-medium text-emerald-500">Fully paid</span>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ExportButton
            rows={g.items}
            name={`preorder-${g.orderId || g.seller}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
            label={g.orderId ? `Pre-order ${g.orderId}` : `${g.seller} pre-order`}
            iconOnly
            className="size-8 p-0"
          />
          {!settled && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const firstUnpaid = g.items.find((c) => balanceOf(c) > 0);
                if (firstUnpaid) onPay(firstUnpaid);
              }}
              className="gap-1.5 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400 h-8 text-xs"
            >
              <IndianRupee className="size-3.5" />
              Pay balance
            </Button>
          )}
          {/* Grouped by order ID, so the whole order can be updated at once. */}
          <Button
            size="sm"
            variant="outline"
            onClick={onUpdateOrder}
            className="h-8 gap-1.5 text-xs"
            title="Update this order"
          >
            <Truck className="size-3.5" />
            Update order
          </Button>
        </div>
      </footer>
    </article>
  );
}

function PreOrdersPage() {
  const { query } = useApp();
  const cars = useCars();
  const { open } = useCarDrawer();
  const [seller, setSeller] = useState("all");
  const [sort, setSort] = useState<SortMode>("balance");
  const [dir, setDir] = useState<SortDir>("desc");
  const [grouping, setGrouping] = useState<Grouping>("car");
  const [payFor, setPayFor] = useState<Diecast | null>(null);
  const [statusFor, setStatusFor] = useState<Diecast | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  /** The order the Update order dialog is pointed at, when grouped by order. */
  const [batchOrderId, setBatchOrderId] = useState("");
  const [batchOpen, setBatchOpen] = useState(false);

  const base = useMemo(
    () => filterRows(cars, query).filter((r) => isPreOrder(r.status)),
    [cars, query],
  );
  const sellerOpts = useMemo(() => uniqueSorted(base, (r) => r.seller), [base]);

  const rows = useMemo(() => {
    const list = base.filter((r) => seller === "all" || r.seller === seller);
    const t = (v: string) => parseDMY(v)?.getTime() ?? 0;
    // Each comparison is written ascending and flipped for descending.
    const sign = dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sort) {
        case "expectedDate": {
          const ta = t(a.expectedDate);
          const tb = t(b.expectedDate);
          // Undated cars stay last whichever way the dates run.
          if (!ta && !tb) return 0;
          if (!ta) return 1;
          if (!tb) return -1;
          return (ta - tb) * sign;
        }
        case "orderDate":
          return (t(a.orderDate) - t(b.orderDate)) * sign;
        case "seller":
          return (a.seller || "").localeCompare(b.seller || "") * sign;
        case "cost":
          return ((a.spent || 0) - (b.spent || 0)) * sign;
        default:
          return (balanceOf(a) - balanceOf(b)) * sign;
      }
    });
  }, [base, seller, sort, dir]);

  /**
   * The same rows, gathered into the orders they were bought in.
   *
   * Cars with no order ID — no seller, or no order date recorded — fall back to
   * one group each rather than being swept into a single "Unassigned" pile that
   * would claim a dozen unrelated cars were one purchase.
   */
  const groups = useMemo<OrderGroup[]>(() => {
    const map = new Map<string, Diecast[]>();
    for (const r of rows) {
      const oid = (r.orderId || "").trim();
      const key = oid || `car:${r.id}`;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    const t = (v: string) => parseDMY(v)?.getTime() ?? 0;
    const out: OrderGroup[] = [];
    for (const [key, items] of map) {
      const first = items[0];
      out.push({
        key,
        orderId: (first.orderId || "").trim(),
        seller: first.seller || "Unknown seller",
        orderDate: first.orderDate || "",
        items,
        value: items.reduce((s, r) => s + (r.spent || 0), 0),
        paid: items.reduce((s, r) => s + (r.paid || 0), 0),
        due: items.reduce((s, r) => s + balanceOf(r), 0),
      });
    }
    // Newest order first, which is the one most likely to still be moving.
    return out.sort(
      (a, b) => t(b.orderDate) - t(a.orderDate) || a.orderId.localeCompare(b.orderId),
    );
  }, [rows]);

  const totalValue = rows.reduce((s, r) => s + (r.spent || 0), 0);
  const totalPaid = rows.reduce((s, r) => s + (r.paid || 0), 0);
  const totalDue = rows.reduce((s, r) => s + balanceOf(r), 0);
  const uniqueModels = new Set(rows.map((r) => `${r.make}|${r.model}`)).size;

  // "PO for this month" metric:
  // Current month is till 15th of every month. From 16th, show the PO balance for next month.
  const now = new Date();
  const isNextMonth = now.getDate() > 15;
  const targetDate = new Date(now.getFullYear(), now.getMonth() + (isNextMonth ? 1 : 0), 1);
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth();
  const targetMonthLabel = targetDate.toLocaleDateString("en-US", { month: "short" });

  const monthCars = useMemo(() => {
    return rows.filter((r) => {
      const dt = getPreorderDate(r);
      if (!dt) return false;
      return dt.getFullYear() === targetYear && dt.getMonth() === targetMonth;
    });
  }, [rows, targetYear, targetMonth]);

  const monthBalance = useMemo(() => {
    return monthCars.reduce((s, r) => s + balanceOf(r), 0);
  }, [monthCars]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-3 md:p-6">
      <PageHeading
        title="Pre-booked allocations"
        subtitle={
          <>
            Future batches, manufacturing timelines, and remaining balances — {rows.length} casting
            {rows.length === 1 ? "" : "s"}
            {grouping === "order"
              ? ` across ${groups.length} order${groups.length === 1 ? "" : "s"}`
              : ""}
            .
          </>
        }
      />

      <KpiBand>
        <KpiTile
          label="Committed value"
          value={inrFull(totalValue)}
          sub={`${rows.length} pre-booked casting${rows.length === 1 ? "" : "s"}`}
          icon={<IndianRupee className="size-4" />}
          tone="violet"
        />
        <KpiTile
          label="Deposits paid"
          value={inrFull(totalPaid)}
          sub={`${uniqueModels} secured allocation${uniqueModels === 1 ? "" : "s"}`}
          icon={<CircleCheck className="size-4" />}
          tone="emerald"
          valueTone="emerald"
        />
        <KpiTile
          label="Balance due"
          value={inrFull(totalDue)}
          sub="Outstanding upon arrival"
          icon={<Clock className="size-4" />}
          tone="amber"
          valueTone="amber"
        />
        <KpiTile
          label={isNextMonth ? "PO for next month" : "PO for this month"}
          value={inrFull(monthBalance)}
          sub={`${targetMonthLabel} ${targetYear} · ${monthCars.length} casting${monthCars.length === 1 ? "" : "s"}`}
          icon={<Calendar className="size-4" />}
          tone="sky"
          valueTone="sky"
        />
      </KpiBand>

      <PageToolbar
        sticky
        // One line on a phone: the grouping shrinks beside the controls.
        oneLine
        left={
          <SegmentControl
            value={grouping}
            onChange={setGrouping}
            className="w-auto max-sm:text-[11px] max-sm:[&>button]:px-2"
            options={[
              { value: "car", label: "By car" },
              { value: "order", label: "By order ID" },
            ]}
          />
        }
        right={
          <>
            <FilterSelect
              value={seller}
              onChange={setSeller}
              icon={<Store className="size-3.5" />}
              label="Seller"
              iconOnlyOnMobile
              options={[
                { value: "all", label: "All sellers" },
                ...sellerOpts.map((s) => ({ value: s, label: s })),
              ]}
            />
            <SortSelect
              value={sort}
              dir={dir}
              onChange={(v, d) => {
                setSort(v);
                setDir(d);
              }}
              neutral="balance"
              options={[
                { value: "balance", label: "Balance", dir: "desc" },
                { value: "expectedDate", label: "Expected date", dir: "asc" },
                { value: "orderDate", label: "Order date", dir: "desc" },
                { value: "seller", label: "Seller", dir: "asc" },
                { value: "cost", label: "Cost", dir: "desc" },
              ]}
            />
            {/* Every pre-order on the page, filtered as it stands. */}
            <ExportButton rows={rows} name="preorders" label="Pre-orders" iconOnlyOnMobile />
            <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              <span className="hidden sm:inline">New pre-order</span>
            </Button>
          </>
        }
      />

      {rows.length === 0 ? (
        <div className="card-elevated p-8 text-center text-sm text-muted-foreground">
          No pre-orders.
        </div>
      ) : grouping === "order" ? (
        <div className="space-y-3">
          {groups.map((g) => (
            <OrderGroupCard
              key={g.key}
              g={g}
              onOpenCar={(c) => open(c)}
              onPay={(c) => setPayFor(c)}
              onUpdateStatus={(c) => setStatusFor(c)}
              onUpdateOrder={() => {
                setBatchOrderId(g.orderId);
                setBatchOpen(true);
              }}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((r, i) => (
            <PreOrderCard
              key={(r.id || "") + i}
              car={r}
              onOpen={() => open(r)}
              onPay={() => setPayFor(r)}
              onUpdateStatus={() => setStatusFor(r)}
            />
          ))}
        </div>
      )}

      <PayBalanceDialog car={payFor} onClose={() => setPayFor(null)} />
      <StatusUpdateDialog car={statusFor} onClose={() => setStatusFor(null)} />
      {/* Grouped by order ID only: the whole order at once. */}
      <ShippingBatchDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        initialShippingId={batchOrderId}
        idField="orderId"
      />
      <CarFormDialog open={addOpen} onOpenChange={setAddOpen} mode="add" />
    </div>
  );
}
