import { createFileRoute, Link } from "@tanstack/react-router";
import { carNumberOf } from "@/lib/car-subline";
import { CarThumb } from "@/components/car-thumb";
import { useMemo, useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock,
  IndianRupee,
  Plus,
  Store,
  Truck,
  Filter,
  Layers,
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
import { compareCarNumbers } from "@/lib/car-number";
import { ExportButton } from "@/components/export-button";
import { SegmentControl } from "@/components/segment-control";
import { ProGate } from "@/components/pro-gate";

export const Route = createFileRoute("/preorders")({
  head: () => ({
    meta: [
      { title: "Pre-orders | VIIV" },
      {
        name: "description",
        content:
          "Track diecast pre-orders with seller, order date, ETA, payment status, cost, advance paid and remaining balance.",
      },
      { property: "og:title", content: "Pre-orders | VIIV" },
      {
        property: "og:description",
        content:
          "Track diecast pre-orders with seller, order date, ETA, payment status, cost, advance paid and remaining balance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProGate title="Pre-orders">
      <PreOrdersPage />
    </ProGate>
  ),
});

/** Red is for a date that has passed. */
const lateClass = (raw: string) => {
  const d = parseDMY(raw || "");
  return d && d.getTime() < Date.now() - 864e5 ? "text-destructive" : "text-foreground";
};

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

type SortMode = "balance" | "expectedDate" | "orderDate" | "seller" | "cost" | "carNumber";
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
  return [car.brand, car.carNumber, car.assortment, car.seller].filter(Boolean).join(" · ") || "—";
}

/** A flush half of a card's bottom edge on a phone, as on the For you cards and My Orders. */
const HALF =
  "glass-btn !flex h-10 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 !rounded-none !border-0 !shadow-none px-1.5 !text-[13px] !font-medium [&_svg]:!size-4";
const HALF_DIVIDED = `${HALF} !border-l !border-solid !border-border/60`;

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
      <dt className="truncate text-[10px] uppercase leading-tight tracking-wider text-muted-foreground">
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

/** One pre-ordered car: a slim row from the small breakpoint up, the stacked card on a phone. */
function PreOrderCard(props: React.ComponentProps<typeof PreOrderCardImpl>) {
  if (!props.row) return <PreOrderCardImpl {...props} />;
  return (
    <>
      <div className="sm:hidden">
        <PreOrderCardImpl {...props} row={false} />
      </div>
      <div className="hidden sm:block">
        <PreOrderCardImpl {...props} />
      </div>
    </>
  );
}

function PreOrderCardImpl({
  car,
  onOpen,
  onPay,
  onUpdateStatus,
  showSeller = true,
  row = false,
}: {
  car: Diecast;
  onOpen: () => void;
  onPay: () => void;
  onUpdateStatus: () => void;
  /** One slim line: photo, name, the money, the actions. For inside an order. */
  row?: boolean;
  /** Off inside a group, where the heading already names the seller. */
  showSeller?: boolean;
}) {
  const due = balanceOf(car);
  const settled = due === 0;

  // On a slim row the seller has a column of its own.
  const sub =
    showSeller && !row
      ? preOrderSubLine(car)
      : [car.brand, car.carNumber, car.assortment].filter(Boolean).join(" · ") || "—";

  if (row)
    return (
      <article className="card-elevated flex flex-wrap items-center gap-x-4 gap-y-2 p-2.5">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 basis-56 items-center gap-3 text-left"
        >
          <CarThumb
            car={car}
            className="size-12 shrink-0 rounded-lg border border-border/60 bg-white object-contain"
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold tracking-tight hover:text-primary">
              {car.name || `${car.make} ${car.model}`.trim() || "Unnamed car"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{sub}</span>
          </span>
        </button>
        <dl className="flex items-center gap-5">
          {/* Same widths as the order row, so the columns line up. */}
          {showSeller ? (
            <PreOrderFact
              label="Seller"
              value={car.seller || "—"}
              className="w-28 text-foreground"
            />
          ) : (
            <div className="w-28" aria-hidden />
          )}
          <PreOrderFact
            label="Expected"
            value={formatDayMonthYear(car.expectedDate) || car.expectedDate || "—"}
            className={`w-24 ${car.expectedDate ? lateClass(car.expectedDate) : "text-foreground"}`}
          />
          <PreOrderFact
            label="Cost"
            value={inrFull(car.spent || 0)}
            className="w-24 text-foreground"
          />
          <PreOrderFact
            label="Deposit"
            value={inrFull(car.paid || 0)}
            className="w-24 text-foreground"
          />
          <PreOrderFact
            label="Balance"
            value={settled ? "Fully paid" : inrFull(due)}
            className={`w-24 ${settled ? "text-emerald-500" : "text-amber-500"}`}
          />
        </dl>
        <div className="flex items-center justify-end gap-2 sm:w-[15rem]">
          {!settled && (
            <Button
              size="sm"
              variant="outline"
              onClick={onPay}
              className="h-8 gap-1.5 border-emerald-500/40 text-xs text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
            >
              <IndianRupee className="size-3.5" />
              Pay
            </Button>
          )}
          <UpdateStatusButton onClick={onUpdateStatus} />
        </div>
      </article>
    );

  const exportName = `preorder-${car.name || car.model || car.id}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  return (
    <article className="card-elevated flex flex-col overflow-hidden">
      {/* NAME FIRST */}
      <button
        type="button"
        onClick={onOpen}
        className="flex items-start gap-3 px-3 pb-2 pt-3 text-left"
      >
        <CarThumb
          car={car}
          className="size-12 shrink-0 rounded-lg border border-border/60 bg-white object-contain"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-bold tracking-tight hover:text-primary">
              {car.name || `${car.make} ${car.model}`.trim() || "Unnamed car"}
            </span>
            <span
              className={`shrink-0 rounded-full border px-2 py-px text-[11px] font-medium ${
                settled
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-400"
              }`}
            >
              {settled ? "Fully Paid" : "Pre-booked"}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
        </div>
      </button>

      {/* The facts in one wrapping row, the label above each value. */}
      <dl className="mt-auto flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border px-3 py-2">
        <PreOrderFact
          label="Ordered"
          value={formatDayMonthYear(car.orderDate) || car.orderDate || "—"}
        />
        <PreOrderFact
          label="Expected"
          value={formatDayMonthYear(car.expectedDate) || car.transitInfo.trim() || "—"}
          className={lateClass(car.expectedDate)}
        />
        <PreOrderFact label="Cost" value={inrFull(car.spent || 0)} />
        <PreOrderFact label="Deposit" value={inrFull(car.paid || 0)} />
        <PreOrderFact
          label="Balance"
          value={settled ? "Fully paid" : inrFull(due)}
          className={settled ? "text-emerald-500" : "text-amber-500"}
        />
      </dl>

      {/* From sm up: Export as an icon, then the labelled actions on the right. */}
      <footer className="hidden items-center gap-2 border-t border-border px-3 py-2 sm:flex sm:justify-end">
        <ExportButton
          rows={[car]}
          name={exportName}
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
            className="gap-1.5 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
          >
            <IndianRupee className="size-3.5" />
            Pay balance
          </Button>
        )}
        <UpdateStatusButton onClick={onUpdateStatus} />
      </footer>

      {/* On a phone: flush halves along the bottom edge. */}
      <footer className="flex w-full border-t border-border sm:hidden">
        <ExportButton
          rows={[car]}
          name={exportName}
          label={car.name || "Pre-order"}
          iconOnly
          variant="ghost"
          size="sm"
          className={`${HALF} !h-10 !w-1/5 !min-w-0 !flex-none !grow-0 text-foreground`}
        />
        {!settled && (
          <Button
            type="button"
            variant="ghost"
            onClick={onPay}
            className={`${HALF_DIVIDED} text-emerald-500 hover:text-emerald-400`}
          >
            <IndianRupee className="size-4" />
            Pay balance
          </Button>
        )}
        <UpdateStatusButton
          onClick={onUpdateStatus}
          label="Update status"
          className={`${HALF_DIVIDED} text-primary`}
        />
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
  const expectedRaw = soonestExpected(g.items);
  const expected = expectedRaw ? formatDayMonthYear(expectedRaw) || expectedRaw : "";
  const settled = g.due === 0;

  const exportProps = {
    rows: g.items,
    name: `preorder-${g.orderId || g.seller}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label: g.orderId ? `Pre-order ${g.orderId}` : `${g.seller} pre-order`,
  };
  const payFirst = () => {
    const firstUnpaid = g.items.find((c) => balanceOf(c) > 0);
    if (firstUnpaid) onPay(firstUnpaid);
  };
  return (
    <article className="card-elevated overflow-hidden">
      {/* The whole top of the card opens and closes the cars. */}
      <header onClick={() => setCarsOpen((v) => !v)} className="cursor-pointer space-y-1.5 p-3">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <h2 className="truncate font-mono text-sm font-bold tracking-tight">
            {g.orderId || "Unassigned"}
          </h2>
          <p className="min-w-0 truncate text-xs font-semibold text-muted-foreground">{g.seller}</p>
          <span
            className={`shrink-0 rounded-full border px-2 py-px text-[11px] font-medium ${
              settled
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-amber-500/40 bg-amber-500/10 text-amber-400"
            }`}
          >
            {settled ? "Fully Paid" : "Pre-booked"}
          </span>
          {/* From sm up the actions sit in this row; on a phone they are the footer. */}
          <div
            className="ml-auto hidden items-center gap-1.5 sm:flex"
            onClick={(e) => e.stopPropagation()}
          >
            <ExportButton
              {...exportProps}
              iconOnly={false}
              text="Share"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2"
            />
            {!settled && (
              <Button
                size="sm"
                variant="outline"
                onClick={payFirst}
                className="h-7 gap-1.5 border-emerald-500/40 px-2.5 text-xs text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
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
              className="h-7 gap-1.5 px-2.5 text-xs"
              title="Update this order"
            >
              <Truck className="size-3.5" />
              Update order
            </Button>
          </div>
          <ChevronRight
            aria-hidden
            className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 max-sm:ml-auto ${carsOpen ? "rotate-90" : ""}`}
          />
        </div>

        <dl className="grid grid-cols-3 gap-x-4 gap-y-2 tabular-nums sm:flex sm:flex-wrap sm:gap-x-5 sm:gap-y-1.5">
          <PreOrderFact label="Cars" value={String(g.items.length)} />
          {g.orderDate ? (
            <PreOrderFact label="Ordered" value={formatDayMonthYear(g.orderDate) || g.orderDate} />
          ) : null}
          {expected ? (
            <PreOrderFact label="Expected" value={expected} className={lateClass(expectedRaw)} />
          ) : null}
          <PreOrderFact label="Committed" value={inrFull(g.value)} />
          <PreOrderFact label="Deposit paid" value={inrFull(g.paid)} />
          <PreOrderFact
            label="Balance due"
            value={settled ? "Fully paid" : inrFull(g.due)}
            className={settled ? "text-emerald-500" : "text-amber-500"}
          />
        </dl>
      </header>

      {carsOpen && (
        <div className="grid gap-2 border-t border-border p-3">
          {g.items.map((c) => (
            <PreOrderCard
              key={c.id}
              car={c}
              showSeller={false}
              row
              onOpen={() => onOpenCar(c)}
              onPay={() => onPay(c)}
              onUpdateStatus={() => onUpdateStatus(c)}
            />
          ))}
        </div>
      )}

      {/* On a phone: flush halves along the bottom edge. */}
      <footer className="flex w-full border-t border-border sm:hidden">
        <ExportButton
          {...exportProps}
          iconOnly
          variant="ghost"
          size="sm"
          className={`${HALF} !h-10 !w-1/5 !min-w-0 !flex-none !grow-0 text-foreground`}
        />
        {!settled && (
          <Button
            type="button"
            variant="ghost"
            onClick={payFirst}
            className={`${HALF_DIVIDED} text-emerald-500 hover:text-emerald-400`}
          >
            <IndianRupee className="size-4" />
            Pay
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={onUpdateOrder}
          className={`${HALF_DIVIDED} text-primary hover:text-primary`}
        >
          <Truck className="size-4" />
          Update order
        </Button>
      </footer>
    </article>
  );
}

/** The soonest date any car in a list is due. */
function soonestExpected(items: Diecast[]): string {
  const dated = items
    .map((c) => ({ c, t: parseDMY(c.expectedDate)?.getTime() ?? 0 }))
    .filter((x) => x.t)
    .sort((x, y) => x.t - y.t)[0];
  const c = dated?.c ?? items.find((x) => (x.expectedDate || "").trim());
  return c ? c.expectedDate : "";
}

/** The money and dates columns, shared by the car table and the order table. */
const TABLE_COLS = (
  <colgroup>
    <col />
    <col className="w-[7rem]" />
    <col className="w-[8rem]" />
    <col className="w-[8rem]" />
    <col className="w-[6rem]" />
    <col className="w-[6rem]" />
    <col className="w-[6.5rem]" />
    <col className="w-[15rem]" />
  </colgroup>
);

const OUTLINE_BTN = "h-8 border border-input bg-transparent text-xs text-foreground hover:bg-muted";
const PAY_BTN =
  "h-8 gap-1.5 border-emerald-500/40 text-xs text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400";

/**
 * The orders as a table, one row per order ID. Tap a row and the cars in it
 * open underneath, in the same columns, so the money still adds up down the page.
 */
function PreOrderOrdersTable({
  groups,
  onOpenCar,
  onPay,
  onUpdateStatus,
  onUpdateOrder,
}: {
  groups: OrderGroup[];
  onOpenCar: (car: Diecast) => void;
  onPay: (car: Diecast) => void;
  onUpdateStatus: (car: Diecast) => void;
  onUpdateOrder: (g: OrderGroup) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (!n.delete(k)) n.add(k);
      return n;
    });
  const th = "px-3 py-1.5 font-medium";
  const cell = "truncate px-3 py-1.5 align-middle";
  return (
    <div className="card-elevated overflow-x-auto">
      <table className="w-full min-w-[940px] table-fixed text-sm">
        {TABLE_COLS}
        <thead className="bg-muted/95 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className={`${th} px-4`}>Order ID</th>
            <th className={th}>Seller</th>
            <th className={th}>Order date</th>
            <th className={th}>Expected</th>
            <th className={`${th} text-right`}>Cost</th>
            <th className={`${th} text-right`}>Deposit</th>
            <th className={`${th} text-right`}>Balance</th>
            <th className={th} />
          </tr>
        </thead>
        {groups.map((g) => {
          const isOpen = open.has(g.key);
          const settled = g.due === 0;
          const exp = soonestExpected(g.items);
          return (
            <tbody
              key={g.key}
              className="border-t border-border/60 odd:bg-transparent even:bg-muted/30"
            >
              <tr onClick={() => toggle(g.key)} className="cursor-pointer hover:bg-primary/[0.06]">
                <td className="px-4 py-1.5 align-middle">
                  <div className="flex items-center gap-2">
                    <ChevronDown
                      className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-mono font-semibold">
                        {g.orderId || "Unassigned"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {g.items.length} casting{g.items.length === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                </td>
                <td className={cell}>{g.seller || "—"}</td>
                <td className={`${cell} text-muted-foreground`}>
                  {formatDayMonthYear(g.orderDate) || g.orderDate || "—"}
                </td>
                <td className={`${cell} ${exp ? lateClass(exp) : ""}`}>
                  {exp ? formatDayMonthYear(exp) || exp : "—"}
                </td>
                <td className={`${cell} text-right tabular-nums`}>{inrFull(g.value)}</td>
                <td className={`${cell} text-right tabular-nums`}>{inrFull(g.paid)}</td>
                <td
                  className={`${cell} text-right font-semibold tabular-nums ${
                    settled ? "text-emerald-500" : "text-amber-500"
                  }`}
                >
                  {settled ? "Fully paid" : inrFull(g.due)}
                </td>
                <td className="px-3 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                    <ExportButton
                      rows={g.items}
                      name={`preorder-${g.orderId || g.seller}`
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")}
                      label={g.orderId ? `Pre-order ${g.orderId}` : `${g.seller} pre-order`}
                      iconOnly
                      className="size-8 p-0"
                    />
                    {!settled && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const first = g.items.find((c) => balanceOf(c) > 0);
                          if (first) onPay(first);
                        }}
                        className={PAY_BTN}
                      >
                        Pay
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateOrder(g)}
                      className="h-8 gap-1.5 text-xs"
                      title="Update this order"
                    >
                      Update order
                    </Button>
                  </div>
                </td>
              </tr>
              {isOpen &&
                g.items.map((c) => {
                  const due = balanceOf(c);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => onOpenCar(c)}
                      className="cursor-pointer border-t border-border/40 bg-background/40 hover:bg-muted/50"
                    >
                      <td className="py-1.5 pl-11 pr-3 align-middle">
                        <div className="truncate font-semibold">
                          {c.name || `${c.make} ${c.model}`.trim() || "Unnamed car"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {[c.brand, carNumberOf(c), c.assortment].filter(Boolean).join(" · ") ||
                            "—"}
                        </div>
                      </td>
                      <td className={cell} />
                      <td className={cell} />
                      <td className={`${cell} ${c.expectedDate ? lateClass(c.expectedDate) : ""}`}>
                        {formatDayMonthYear(c.expectedDate) || c.expectedDate || "—"}
                      </td>
                      <td className={`${cell} text-right tabular-nums`}>{inrFull(c.spent || 0)}</td>
                      <td className={`${cell} text-right tabular-nums`}>{inrFull(c.paid || 0)}</td>
                      <td
                        className={`${cell} text-right font-semibold tabular-nums ${
                          due > 0 ? "text-amber-500" : "text-emerald-500"
                        }`}
                      >
                        {due > 0 ? inrFull(due) : "Fully paid"}
                      </td>
                      <td className="px-3 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          {due > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onPay(c)}
                              className={PAY_BTN}
                            >
                              Pay
                            </Button>
                          )}
                          <UpdateStatusButton
                            onClick={() => onUpdateStatus(c)}
                            className={OUTLINE_BTN}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

/** The pre-orders as a table, the same look as the My Cars table. */
function PreOrderTable({
  rows,
  onOpen,
  onPay,
  onUpdateStatus,
}: {
  rows: Diecast[];
  onOpen: (car: Diecast) => void;
  onPay: (car: Diecast) => void;
  onUpdateStatus: (car: Diecast) => void;
}) {
  const th = "px-3 py-1.5 font-medium";
  return (
    <div className="card-elevated overflow-x-auto">
      <table className="w-full min-w-[940px] table-fixed text-sm">
        <colgroup>
          <col />
          <col className="w-[7rem]" />
          <col className="w-[8rem]" />
          <col className="w-[8rem]" />
          <col className="w-[6rem]" />
          <col className="w-[6rem]" />
          <col className="w-[6.5rem]" />
          <col className="w-[15rem]" />
        </colgroup>
        <thead className="bg-muted/95 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className={`${th} px-4`}>Model</th>
            <th className={th}>Seller</th>
            <th className={th}>Order date</th>
            <th className={th}>Expected</th>
            <th className={`${th} text-right`}>Cost</th>
            <th className={`${th} text-right`}>Deposit</th>
            <th className={`${th} text-right`}>Balance</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((r, i) => {
            const due = balanceOf(r);
            const cell = "truncate px-3 py-1.5 align-middle";
            return (
              <tr
                key={(r.id || "") + i}
                onClick={() => onOpen(r)}
                className="cursor-pointer odd:bg-transparent even:bg-muted/30 hover:bg-muted/50"
              >
                <td className="px-4 py-1.5 align-middle">
                  <div className="truncate font-semibold">
                    {r.name || `${r.make} ${r.model}`.trim() || "Unnamed car"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[r.brand, carNumberOf(r), r.assortment].filter(Boolean).join(" · ") || "—"}
                  </div>
                </td>
                <td className={cell}>{r.seller || "—"}</td>
                <td className={`${cell} text-muted-foreground`}>
                  {formatDayMonthYear(r.orderDate) || r.orderDate || "—"}
                </td>
                <td className={`${cell} ${r.expectedDate ? lateClass(r.expectedDate) : ""}`}>
                  {formatDayMonthYear(r.expectedDate) || r.expectedDate || "—"}
                </td>
                <td className={`${cell} text-right tabular-nums`}>{inrFull(r.spent || 0)}</td>
                <td className={`${cell} text-right tabular-nums`}>{inrFull(r.paid || 0)}</td>
                <td
                  className={`${cell} text-right font-semibold tabular-nums ${
                    due > 0 ? "text-amber-500" : "text-emerald-500"
                  }`}
                >
                  {due > 0 ? inrFull(due) : "Fully paid"}
                </td>
                <td className="px-3 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                    {due > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onPay(r)}
                        className="h-8 gap-1.5 border-emerald-500/40 text-xs text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                      >
                        Pay
                      </Button>
                    )}
                    <UpdateStatusButton
                      onClick={() => onUpdateStatus(r)}
                      className="h-8 border border-input bg-transparent text-xs text-foreground hover:bg-muted"
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Items under headings, in the order each heading first appears. */
function sectioned<T>(items: T[], key: ((x: T) => string) | null) {
  if (!key) return [{ title: "", items }];
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it).trim() || "Unknown";
    map.set(k, [...(map.get(k) ?? []), it]);
  }
  return [...map].map(([title, list]) => ({ title, items: list }));
}

const carKey = (by: string): ((c: Diecast) => string) | null =>
  by === "make"
    ? (c) => c.make
    : by === "brand"
      ? (c) => c.brand
      : by === "seller"
        ? (c) => c.seller
        : null;

function SectionHeading({
  title,
  count,
  cost,
  paid,
  due,
}: {
  title: string;
  count: number;
  cost: number;
  paid: number;
  due: number;
}) {
  return (
    <h2 className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
      <span className="flex items-center gap-2 text-sm font-bold">
        {title}
        <span className="text-xs font-medium text-muted-foreground">{count}</span>
      </span>
      <span className="flex items-center gap-5 text-xs font-medium text-muted-foreground">
        <span>
          Cost <span className="font-semibold tabular-nums text-foreground">{inrFull(cost)}</span>
        </span>
        <span>
          Deposit{" "}
          <span className="font-semibold tabular-nums text-foreground">{inrFull(paid)}</span>
        </span>
        <span>
          Balance{" "}
          <span
            className={`font-semibold tabular-nums ${due > 0 ? "text-amber-500" : "text-emerald-500"}`}
          >
            {due > 0 ? inrFull(due) : "Fully paid"}
          </span>
        </span>
      </span>
    </h2>
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
  /** Headings the list is sectioned under; "none" is no headings. */
  const [groupBy, setGroupBy] = useState("none");
  const groupOpts =
    grouping === "order"
      ? [
          { value: "none", label: "No grouping" },
          { value: "seller", label: "Seller" },
        ]
      : [
          { value: "none", label: "No grouping" },
          { value: "make", label: "Make" },
          { value: "brand", label: "Brand" },
          { value: "seller", label: "Seller" },
        ];
  const activeGroupBy = groupOpts.some((o) => o.value === groupBy) ? groupBy : "none";
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
        case "carNumber":
          return compareCarNumbers(a.carNumber, b.carNumber, sign);
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
    // A sort the person chose is kept: the groups come out in the order their
    // first car sits in `rows`. Untouched, newest order first, which is the one
    // most likely to still be moving.
    if (sort !== "balance") return out;
    return out.sort(
      (a, b) => t(b.orderDate) - t(a.orderDate) || a.orderId.localeCompare(b.orderId),
    );
  }, [rows, sort]);

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
    <div className="mx-auto max-w-[1600px] space-y-3 p-3 md:p-6">
      <PageHeading
        title="Pre-orders"
        subtitle={`${rows.length} ${rows.length === 1 ? "car" : "cars"} on pre-order`}
      >
        <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">New pre-order</span>
        </Button>
      </PageHeading>

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
            className="w-auto max-sm:text-xs max-sm:[&>button]:px-2"
            options={[
              { value: "car", label: "By car" },
              { value: "order", label: "By order ID" },
            ]}
          />
        }
        right={
          <>
            {/* The other half of the question this page answers. Here is what
                you have put money on; through here is what is still to drop. */}
            <Button asChild size="sm" variant="outline" className="gap-1.5" title="Coming soon">
              <Link to="/releases">
                <Calendar className="size-4" />
                <span className="sr-only">Release calendar</span>
              </Link>
            </Button>
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
            <FilterSelect
              value={activeGroupBy}
              onChange={setGroupBy}
              icon={<Layers className="size-3.5" />}
              label="Group by"
              neutral="none"
              iconOnly
              options={groupOpts}
            />
            <SortSelect
              value={sort}
              dir={dir}
              onChange={(v, d) => {
                setSort(v);
                setDir(d);
              }}
              iconOnly
              neutral="balance"
              options={[
                { value: "balance", label: "Balance", dir: "desc" },
                { value: "expectedDate", label: "Expected date", dir: "asc" },
                { value: "orderDate", label: "Order date", dir: "desc" },
                { value: "seller", label: "Seller", dir: "asc" },
                { value: "cost", label: "Cost", dir: "desc" },
                { value: "carNumber", label: "Car number", dir: "asc" },
              ]}
            />
            {/* Every pre-order on the page, filtered as it stands. */}
            <ExportButton rows={rows} name="preorders" label="Pre-orders" iconOnlyOnMobile />
          </>
        }
      />

      {rows.length === 0 ? (
        <div className="card-elevated p-8 text-center text-sm text-muted-foreground">
          No pre-orders.
        </div>
      ) : grouping === "order" ? (
        <div className="space-y-5">
          {sectioned(groups, activeGroupBy === "seller" ? (g) => g.seller : null).map((sec) => (
            <section key={sec.title} className="space-y-3">
              {sec.title && (
                <SectionHeading
                  title={sec.title}
                  count={sec.items.length}
                  cost={sec.items.reduce((t, g) => t + g.value, 0)}
                  paid={sec.items.reduce((t, g) => t + g.paid, 0)}
                  due={sec.items.reduce((t, g) => t + g.due, 0)}
                />
              )}
              <div className="space-y-3 sm:hidden">
                {sec.items.map((g) => (
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
              <div className="hidden sm:block">
                <PreOrderOrdersTable
                  groups={sec.items}
                  onOpenCar={(c) => open(c)}
                  onPay={(c) => setPayFor(c)}
                  onUpdateStatus={(c) => setStatusFor(c)}
                  onUpdateOrder={(g) => {
                    setBatchOrderId(g.orderId);
                    setBatchOpen(true);
                  }}
                />
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {sectioned(rows, carKey(activeGroupBy)).map((sec) => (
            <section key={sec.title} className="space-y-3">
              {sec.title && (
                <SectionHeading
                  title={sec.title}
                  count={sec.items.length}
                  cost={sec.items.reduce((t, r) => t + (r.spent || 0), 0)}
                  paid={sec.items.reduce((t, r) => t + (r.paid || 0), 0)}
                  due={sec.items.reduce((t, r) => t + balanceOf(r), 0)}
                />
              )}
              <div className="grid gap-2 sm:hidden">
                {sec.items.map((r, i) => (
                  <PreOrderCard
                    key={(r.id || "") + i}
                    car={r}
                    onOpen={() => open(r)}
                    onPay={() => setPayFor(r)}
                    onUpdateStatus={() => setStatusFor(r)}
                  />
                ))}
              </div>
              <div className="hidden sm:block">
                <PreOrderTable
                  rows={sec.items}
                  onOpen={(r) => open(r)}
                  onPay={(r) => setPayFor(r)}
                  onUpdateStatus={(r) => setStatusFor(r)}
                />
              </div>
            </section>
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
