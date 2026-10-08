/**
 * Everything bought from one seller.
 *
 * Reached by tapping the seller's name on a car, or a row on Sellers. A seller
 * is the one thing on a car that is about more than that car: 137 of them
 * across the collection, and "what else came from Karz and Dolls" had no answer
 * short of filtering My Cars by hand.
 *
 * Laid out as a page rather than a form: the shop across the top with its name
 * at headline size, the ten numbers in one band under it, and the orders filling
 * everything below. The facts used to sit in a column down the left, which cost
 * the table a third of its width to say four short things.
 *
 * Grouped by order or by shipment, because those are the two ways a purchase is
 * actually bundled — an order is what you agreed to buy, a shipment is what
 * turned up in one parcel, and they are rarely the same set. One row per bundle
 * on a desktop and one card each on a phone, opening in place to the cars
 * inside.
 */
import { useMemo, useState } from "react";
import { ChevronRight, MapPin, Phone, Store } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SegmentControl } from "@/components/segment-control";
import { StatusPill } from "@/components/status-pill";
import { useCars } from "@/lib/cars-store";
import { carSubLine } from "@/lib/car-subline";
import { formatDayMonthYear, inrFull, parseDMY } from "@/lib/format";
import { transformImageUrl } from "@/lib/image-transform";
import { cn } from "@/lib/utils";
import type { Diecast } from "@/lib/types";
import { sellerKey, sellerLabel, useSellerDetails, whatsappHref } from "@/lib/seller-details";
import { isPreOrder, canBeLate, normaliseStatus, statusRank, styleFor } from "@/lib/status";

type GroupBy = "orderId" | "shippingId";

type Bundle = {
  id: string;
  /** The earliest date any car in it carries, which is when it was placed. */
  day: string;
  cars: Diecast[];
  spent: number;
  shipping: number;
  paid: number;
  /** What the order as a whole is still waiting on. */
  status: string;
};

const clean = (v: string | null | undefined) => (v || "").trim();

/** Cars from this seller, whatever case or spacing the name was typed in. */
function bySeller(cars: Diecast[], seller: string): Diecast[] {
  const want = clean(seller).toLowerCase();
  if (!want) return [];
  return cars.filter((c) => clean(c.seller).toLowerCase() === want);
}

/**
 * One status for a bundle of cars that may not share one.
 *
 * The furthest from your hands, not the commonest: an order of five where four
 * arrived and one is still on a boat is an order that is not finished, and
 * calling it In Hand because four fifths of it is would be the wrong half of
 * the truth.
 */
function bundleStatus(cars: Diecast[]): string {
  let worst = "";
  for (const car of cars) {
    const s = normaliseStatus(car.status);
    if (!s) continue;
    if (!worst || statusRank(s) > statusRank(worst)) worst = s;
  }
  return worst;
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
        status: "",
      });
    }
  }
  for (const b of map.values()) b.status = bundleStatus(b.cars);
  // Newest first: what you bought last is what you are most likely looking for.
  return [...map.values()].sort((a, b) => {
    const x = parseDMY(a.day)?.getTime() ?? 0;
    const y = parseDMY(b.day)?.getTime() ?? 0;
    return y - x || b.cars.length - a.cars.length;
  });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-base font-bold tracking-tight tabular-nums">{value}</div>
    </div>
  );
}

/** A round action beside the name: a call, a message. */
function Action({
  href,
  label,
  external,
  children,
}: {
  href: string;
  label: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
      className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </a>
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
  const shops = useSellerDetails();
  const shop = shops.get(sellerKey(seller)) || null;
  const [by, setBy] = useState<GroupBy>("orderId");
  const [only, setOnly] = useState<string>("");
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());

  const mine = useMemo(() => bySeller(cars, seller), [cars, seller]);
  const all = useMemo(() => bundle(mine, by), [mine, by]);

  /**
   * The statuses actually present, each with its count, newest state first.
   * Built from the orders rather than written down: a filter offering Ordered
   * when nothing is ordered is a filter that returns an empty table.
   */
  const marks = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of all) counts.set(b.status, (counts.get(b.status) ?? 0) + 1);
    return [...counts.entries()]
      .filter(([s]) => s)
      .sort((a, b) => statusRank(a[0]) - statusRank(b[0]));
  }, [all]);

  const bundles = useMemo(() => (only ? all.filter((b) => b.status === only) : all), [all, only]);

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
      po: mine.filter((c) => isPreOrder(c.status)).length,
      pending: mine.filter((c) => canBeLate(c.status)).length,
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
  const name = sellerLabel(seller, shop) || "No seller";
  const wa = whatsappHref(shop);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-3rem)] w-full max-w-full flex-col gap-4 overflow-hidden sm:max-w-5xl max-sm:fixed max-sm:inset-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none">
        {/* THE SHOP, at the size of a title. The picture is a tile rather than a
            circle: a shop is a place, and the round frame is what accounts
            wear everywhere else in the app. */}
        <div className="flex shrink-0 items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-primary/12 text-sm font-bold uppercase text-primary sm:size-14">
            {shop?.image_url ? (
              <img
                src={transformImageUrl(shop.image_url, "thumb")}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              name.slice(0, 2)
            )}
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
              {name}
            </DialogTitle>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
              {shop?.store_name && (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <Store className="size-3.5 shrink-0" />
                  <span className="truncate">{shop.store_name}</span>
                </span>
              )}
              {shop?.location && (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <MapPin className="size-3.5 shrink-0" />
                  <span className="truncate">{shop.location}</span>
                </span>
              )}
              <DialogDescription className="sr-only">
                Everything bought from them, by order or by shipment.
              </DialogDescription>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {shop?.phone && (
              <Action href={`tel:${shop.phone.replace(/\s+/g, "")}`} label={`Call ${name}`}>
                <Phone className="size-4" />
              </Action>
            )}
            {wa && (
              <Action href={wa} external label={`WhatsApp ${name}`}>
                <WhatsAppMark />
              </Action>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {/* THE BAND. Ten numbers in one block, two abreast on a phone and
              five across a desktop, so the money reads as one set of facts
              about the shop rather than ten little cards. */}
          <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-2xl border border-border bg-muted/20 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Cars" value={String(mine.length)} />
            <Stat label="Orders" value={String(totals.orders)} />
            <Stat label="Shipments" value={String(totals.shipments)} />
            <Stat label="Pre-orders" value={String(totals.po)} />
            <Stat label="Pending" value={String(totals.pending)} />
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

          {/* WHAT IS BEING LISTED, then which of it. Two different questions,
              so two controls: the segment says how the cars are bundled and
              the pills say which bundles to show. */}
          <div className="flex flex-wrap items-center gap-2">
            <SegmentControl<GroupBy>
              fill
              value={by}
              onChange={(v) => {
                setBy(v);
                setOpenRows(new Set());
                setOnly("");
              }}
              className="h-9 w-full sm:w-64"
              options={[
                { value: "orderId", label: "Order ID" },
                { value: "shippingId", label: "Shipping ID" },
              ]}
            />

            {marks.length > 1 && (
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <Mark on={only === ""} onClick={() => setOnly("")} label="All" n={all.length} />
                {marks.map(([status, n]) => (
                  <Mark
                    key={status}
                    on={only === status}
                    onClick={() => setOnly(only === status ? "" : status)}
                    label={status}
                    n={n}
                    tone={styleFor(status)}
                  />
                ))}
              </div>
            )}

            {only && (
              <span className="shrink-0 text-xs text-muted-foreground">
                showing {bundles.length} of {all.length}
              </span>
            )}
          </div>

          {/* THE ORDERS, as a table where there is width for one and as cards
              where there is not. Same rows either way. */}
          <div className="hidden overflow-hidden rounded-2xl border border-border sm:block">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[13rem]" />
                <col className="w-[7rem]" />
                <col />
                <col className="w-[7rem]" />
                <col className="w-[6rem]" />
                <col className="w-[7rem]" />
              </colgroup>
              <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-medium">{idLabel}</th>
                  <th className="px-3 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium">Cars</th>
                  <th className="px-3 py-2.5 text-right font-medium">Spent</th>
                  <th className="px-3 py-2.5 text-right font-medium">Shipping</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
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
                      <td className="px-3 py-3">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <ChevronRight
                            className={cn(
                              "size-3.5 shrink-0 text-muted-foreground transition-transform",
                              isOpen && "rotate-90",
                            )}
                          />
                          <span className="truncate font-mono text-xs font-semibold">{b.id}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {formatDayMonthYear(b.day) || "—"}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {b.cars.length} {b.cars.length === 1 ? "car" : "cars"}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">
                        {inrFull(b.spent)}
                      </td>
                      <td className="px-3 py-3 text-right text-xs tabular-nums text-muted-foreground">
                        {b.shipping ? inrFull(b.shipping) : "—"}
                      </td>
                      <td className="px-3 py-3">
                        {b.status ? <StatusPill status={b.status} /> : "—"}
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
                            <td className="px-3 py-2" colSpan={2}>
                              <span className="tabular-nums text-xs">
                                {inrFull(Number(car.spent) || 0)}
                              </span>
                            </td>
                            {/* Shipping is charged on the parcel, not on the
                                car. Printing a share of it against each one
                                read as though every car had paid it. */}
                            <td />
                            <td className="px-3 py-2">
                              <StatusPill status={car.status} />
                            </td>
                          </tr>
                        ))
                      : []),
                  ];
                })}
                {bundles.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      {only ? "Nothing in that state." : "Nothing from this seller yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 sm:hidden">
            {bundles.map((b) => {
              const isOpen = openRows.has(b.id);
              return (
                <div key={b.id} className="overflow-hidden rounded-2xl border border-border">
                  <button
                    type="button"
                    onClick={() => toggle(b.id)}
                    className="w-full px-3 py-2.5 text-left"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold">
                        {b.id}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {inrFull(b.spent)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatDayMonthYear(b.day) || "—"} · {b.cars.length}{" "}
                      {b.cars.length === 1 ? "car" : "cars"}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        Shipping {b.shipping ? inrFull(b.shipping) : "—"}
                      </span>
                      {b.status && <StatusPill status={b.status} />}
                    </div>
                  </button>
                  {isOpen && (
                    <ul className="divide-y divide-border/60 border-t border-border/60 bg-muted/20">
                      {b.cars.map((car, i) => (
                        <li key={`${b.id}|${car.id || i}`}>
                          <button
                            type="button"
                            onClick={() => onSelectCar?.(car)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium">
                                {car.name || "—"}
                              </span>
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {carSubLine(car)}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs tabular-nums">
                              {inrFull(Number(car.spent) || 0)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            {bundles.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                {only ? "Nothing in that state." : "Nothing from this seller yet."}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** One status filter: what it is, how many, and whether it is the one on. */
function Mark({
  on,
  onClick,
  label,
  n,
  tone,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  n: number;
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        on
          ? "border-foreground bg-foreground text-background"
          : cn("border-border hover:bg-muted", tone),
      )}
    >
      {label}
      <span className={cn("tabular-nums", on ? "opacity-70" : "text-muted-foreground")}>{n}</span>
    </button>
  );
}

/** Inlined: lucide carries no trademarked marks. */
function WhatsAppMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
      <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.39a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.44 9.9-9.9S17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.24 8.24 0 0 1-1.26-4.39c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.41a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24zm4.52-6.17c-.25-.13-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.87.85-.87 2.07s.89 2.4 1.02 2.57c.12.16 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.3z" />
    </svg>
  );
}
