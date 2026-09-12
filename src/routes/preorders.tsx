import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowUpDown, CircleCheck, Clock, IndianRupee, Plus, Store } from "lucide-react";

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
import { KpiBand, KpiTile } from "@/components/kpi";
import { UpdateStatusButton } from "@/components/update-status-button";
import { PageHeading, PageToolbar } from "@/components/page-header";
import { FilterSelect } from "@/components/filter-select";
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

type SortMode = "balance" | "orderDate" | "seller" | "cost";
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
      {/* NAME FIRST. The card ID used to take this line, so the first thing you
          read on a card about a car was a database key. */}
      <button type="button" onClick={onOpen} className="px-4 pb-1 pt-3 text-left">
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
            {settled ? "Balance Paid" : "Pre-booked"}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
      </button>

      <div className="mt-auto grid grid-cols-3 gap-2 border-t border-border px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Target release
          </div>
          {/* Truncated, because the fallback is a free-text note. It is meant
              to hold a release month — "Mar 2027" — but rows carried over from
              the sheet keep whole sentences in there ("Waiting for arrival to
              Ankush"), and three wrapped lines under a one-line label made the
              card twice as tall as its neighbour. */}
          <div
            className="mt-0.5 truncate text-sm font-semibold text-primary"
            title={formatDayMonthYear(car.expectedDate) || car.transitInfo.trim() || undefined}
          >
            {formatDayMonthYear(car.expectedDate) || car.transitInfo.trim() || "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Deposit paid
          </div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums">{inrFull(car.paid || 0)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Balance due
          </div>
          <div
            className={`mt-0.5 text-sm font-semibold tabular-nums ${
              settled ? "text-emerald-500" : "text-amber-500"
            }`}
          >
            {inrFull(due)}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
        {!settled && (
          <Button
            size="sm"
            variant="outline"
            onClick={onPay}
            className="gap-1.5 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
          >
            <IndianRupee className="size-3.5" />
            Pay balance
          </Button>
        )}
        <UpdateStatusButton onClick={onUpdateStatus} />
      </div>
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
 * the seller and date beneath it, the money on the right, then the cars.
 *
 * The two pages are showing the same kind of thing — a set of cars bought
 * together from one person — so they should look like it. Before this, an order
 * was a card on one page and a loose grid of cars on the other.
 */
function OrderGroupCard({
  g,
  onOpenCar,
  onPay,
  onUpdateStatus,
}: {
  g: OrderGroup;
  onOpenCar: (car: Diecast) => void;
  onPay: (car: Diecast) => void;
  onUpdateStatus: (car: Diecast) => void;
}) {
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
                g.due === 0 ? "text-emerald-500" : "text-amber-500"
              }`}
            >
              {inrFull(g.due)}
            </div>
          </div>
        </div>
      </header>

      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {g.items.length} casting{g.items.length === 1 ? "" : "s"} · {inrFull(g.value)} committed
          </div>
          <ExportButton
            rows={g.items}
            name={`preorder-${g.orderId || g.seller}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
            label={g.orderId ? `Pre-order ${g.orderId}` : `${g.seller} pre-order`}
          />
        </div>
        <div className="mt-2 grid gap-2 xl:grid-cols-2">
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
      </div>
    </article>
  );
}

function PreOrdersPage() {
  const { query } = useApp();
  const cars = useCars();
  const { open } = useCarDrawer();
  const [seller, setSeller] = useState("all");
  const [sort, setSort] = useState<SortMode>("balance");
  const [grouping, setGrouping] = useState<Grouping>("car");
  const [payFor, setPayFor] = useState<Diecast | null>(null);
  const [statusFor, setStatusFor] = useState<Diecast | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const base = useMemo(
    () => filterRows(cars, query).filter((r) => isPreOrder(r.status)),
    [cars, query],
  );
  const sellerOpts = useMemo(() => uniqueSorted(base, (r) => r.seller), [base]);

  const rows = useMemo(() => {
    const list = base.filter((r) => seller === "all" || r.seller === seller);
    const t = (v: string) => parseDMY(v)?.getTime() ?? 0;
    return [...list].sort((a, b) => {
      switch (sort) {
        case "orderDate":
          return t(b.orderDate) - t(a.orderDate);
        case "seller":
          return (a.seller || "").localeCompare(b.seller || "");
        case "cost":
          return (b.spent || 0) - (a.spent || 0);
        default:
          return balanceOf(b) - balanceOf(a);
      }
    });
  }, [base, seller, sort]);

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
      </KpiBand>

      <PageToolbar
        left={
          <SegmentControl
            value={grouping}
            onChange={setGrouping}
            options={[
              { value: "car", label: "By car" },
              { value: "order", label: "Group by Order ID" },
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
              options={[
                { value: "all", label: "All sellers" },
                ...sellerOpts.map((s) => ({ value: s, label: s })),
              ]}
            />
            <FilterSelect
              value={sort}
              onChange={(v) => setSort(v as SortMode)}
              icon={<ArrowUpDown className="size-3.5" />}
              label="Sort"
              neutral="balance"
              options={[
                { value: "balance", label: "Balance" },
                { value: "orderDate", label: "Order date" },
                { value: "seller", label: "Seller" },
                { value: "cost", label: "Cost" },
              ]}
            />
            {/* Every pre-order on the page, filtered as it stands. */}
            <ExportButton rows={rows} name="preorders" label="Pre-orders" />
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
      <CarFormDialog open={addOpen} onOpenChange={setAddOpen} mode="add" />
    </div>
  );
}
