/**
 * Everything bought from one seller.
 *
 * Reached by tapping the seller's name on a car. A seller is the one thing on a
 * car that is about more than that car: 137 of them across the collection, and
 * "what else came from Karz and Dolls" had no answer short of filtering My Cars
 * by hand.
 *
 * Grouped by order or by shipment, because those are the two ways a purchase is
 * actually bundled — an order is what you agreed to buy, a shipment is what
 * turned up in one parcel, and they are rarely the same set. One table, one row
 * per bundle, opening in place to the cars inside it; not a card each, which is
 * what the duplicates screen does and what makes fifteen orders a page of
 * scrolling.
 */
import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SegmentControl } from "@/components/segment-control";
import { StatusPill } from "@/components/status-pill";
import { useCars } from "@/lib/cars-store";
import { carSubLine } from "@/lib/car-subline";
import { formatDayMonthYear, inrFull, parseDMY } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Diecast } from "@/lib/types";

type GroupBy = "orderId" | "shippingId";

type Bundle = {
  id: string;
  /** The earliest date any car in it carries, which is when it was placed. */
  day: string;
  cars: Diecast[];
  spent: number;
  shipping: number;
  paid: number;
};

const clean = (v: string | null | undefined) => (v || "").trim();

/** Cars from this seller, whatever case or spacing the name was typed in. */
function bySeller(cars: Diecast[], seller: string): Diecast[] {
  const want = clean(seller).toLowerCase();
  if (!want) return [];
  return cars.filter((c) => clean(c.seller).toLowerCase() === want);
}

/**
 * One row per order, or per shipment. Cars with neither collect under a single
 * "Not recorded" row rather than one row each, which is what a blank key would
 * otherwise produce.
 */
function bundle(cars: Diecast[], by: GroupBy): Bundle[] {
  const map = new Map<string, Bundle>();
  for (const car of cars) {
    const id = clean(car[by]) || "—";
    const day = clean(car.orderDate) || clean(car.date);
    const at = map.get(id);
    if (at) {
      at.cars.push(car);
      at.spent += Number(car.spent) || 0;
      at.shipping += Number(car.shippingCost) || 0;
      at.paid += Number(car.paid) || 0;
      if (day && (!at.day || day < at.day)) at.day = day;
    } else {
      map.set(id, {
        id,
        day,
        cars: [car],
        spent: Number(car.spent) || 0,
        shipping: Number(car.shippingCost) || 0,
        paid: Number(car.paid) || 0,
      });
    }
  }
  // Newest first: what you bought last is what you are most likely looking for.
  return [...map.values()].sort((a, b) => {
    const x = parseDMY(a.day)?.getTime() ?? 0;
    const y = parseDMY(b.day)?.getTime() ?? 0;
    return y - x || b.cars.length - a.cars.length;
  });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function SellerOrdersDialog({
  open,
  onOpenChange,
  seller,
  onSelectCar,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  seller: string;
  /** Opening a car from here replaces what the drawer is showing. */
  onSelectCar?: (car: Diecast) => void;
}) {
  const cars = useCars();
  const [by, setBy] = useState<GroupBy>("orderId");
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());

  const mine = useMemo(() => bySeller(cars, seller), [cars, seller]);
  const bundles = useMemo(() => bundle(mine, by), [mine, by]);

  const totals = useMemo(() => {
    const spent = mine.reduce((s, c) => s + (Number(c.spent) || 0), 0);
    const shipping = mine.reduce((s, c) => s + (Number(c.shippingCost) || 0), 0);
    const paid = mine.reduce((s, c) => s + (Number(c.paid) || 0), 0);
    const days = mine
      .map((c) => parseDMY(clean(c.orderDate) || clean(c.date)))
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => a.getTime() - b.getTime());
    return {
      spent,
      shipping,
      paid,
      owed: Math.max(spent - paid, 0),
      orders: new Set(mine.map((c) => clean(c.orderId)).filter(Boolean)).size,
      shipments: new Set(mine.map((c) => clean(c.shippingId)).filter(Boolean)).size,
      first: days[0],
      last: days[days.length - 1],
    };
  }, [mine]);

  const toggle = (id: string) =>
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const idLabel = by === "orderId" ? "Order ID" : "Shipping ID";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-3rem)] w-full max-w-full flex-col overflow-hidden sm:max-w-4xl max-sm:fixed max-sm:inset-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none">
        <DialogHeader className="shrink-0">
          <DialogTitle>{seller || "No seller"}</DialogTitle>
          <DialogDescription>
            Everything bought from them, by order or by shipment.
          </DialogDescription>
        </DialogHeader>

        {/* What the seller is worth to the collection, before the list of what
            made it up. */}
        <div className="grid shrink-0 grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border border-border sm:grid-cols-4">
          <Stat label="Cars" value={String(mine.length)} />
          <Stat label="Orders" value={String(totals.orders)} />
          <Stat label="Shipments" value={String(totals.shipments)} />
          <Stat label="Spent" value={inrFull(totals.spent)} />
          <Stat label="Shipping" value={inrFull(totals.shipping)} />
          <Stat label="Paid" value={inrFull(totals.paid)} />
          <Stat label="Balance" value={inrFull(totals.owed)} />
          <Stat
            label="Bought between"
            value={
              totals.first && totals.last
                ? `${formatDayMonthYear(totals.first)} – ${formatDayMonthYear(totals.last)}`
                : "—"
            }
          />
        </div>

        <div className="shrink-0 pt-3">
          <SegmentControl<GroupBy>
            fill
            value={by}
            onChange={(v) => {
              setBy(v);
              setOpenRows(new Set());
            }}
            className="h-9 w-full sm:w-72"
            options={[
              { value: "orderId", label: "Order ID" },
              { value: "shippingId", label: "Shipping ID" },
            ]}
          />
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-xl border border-border">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[11rem]" />
              <col className="hidden w-[7rem] sm:table-column" />
              <col />
              <col className="w-[6rem]" />
              <col className="hidden w-[6rem] sm:table-column" />
            </colgroup>
            <thead className="sticky top-0 z-[1] bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{idLabel}</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Order date</th>
                <th className="px-3 py-2 font-medium">Cars</th>
                <th className="px-3 py-2 text-right font-medium">Spent</th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Shipping</th>
              </tr>
            </thead>
            <tbody>
              {bundles.map((b) => {
                const isOpen = openRows.has(b.id);
                return [
                  <tr
                    key={b.id}
                    onClick={() => toggle(b.id)}
                    className="cursor-pointer border-t border-border/60 hover:bg-muted/30"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <ChevronRight
                          className={cn(
                            "size-3.5 shrink-0 text-muted-foreground transition-transform",
                            isOpen && "rotate-90",
                          )}
                        />
                        <span className="truncate font-mono text-xs">{b.id}</span>
                      </div>
                    </td>
                    <td className="hidden px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
                      {formatDayMonthYear(b.day) || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {b.cars.length} {b.cars.length === 1 ? "car" : "cars"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{inrFull(b.spent)}</td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums text-muted-foreground sm:table-cell">
                      {b.shipping ? inrFull(b.shipping) : "—"}
                    </td>
                  </tr>,
                  // The cars inside, as rows of the same table rather than as
                  // cards: a bundle of twelve should read as twelve lines.
                  ...(isOpen
                    ? b.cars.map((car, i) => (
                        <tr
                          key={`${b.id}|${car.id || i}`}
                          onClick={() => onSelectCar?.(car)}
                          className={cn(
                            "border-t border-border/40 bg-muted/20",
                            onSelectCar && "cursor-pointer hover:bg-muted/40",
                          )}
                        >
                          <td className="py-2 pl-8 pr-3" colSpan={2}>
                            <div className="truncate text-xs font-medium">{car.name || "—"}</div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              {carSubLine(car)}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <StatusPill status={car.status} />
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">
                            {inrFull(Number(car.spent) || 0)}
                          </td>
                          <td className="hidden px-3 py-2 text-right text-xs tabular-nums text-muted-foreground sm:table-cell">
                            {Number(car.shippingCost) ? inrFull(Number(car.shippingCost)) : "—"}
                          </td>
                        </tr>
                      ))
                    : []),
                ];
              })}
              {bundles.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    Nothing from this seller yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
