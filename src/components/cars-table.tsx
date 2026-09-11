import type { ReactNode } from "react";

import type { Diecast } from "@/lib/types";
import { inr } from "@/lib/format";
import { Flame, Star } from "lucide-react";

import { useCarDrawer } from "@/components/car-details-drawer";
// Lives in its own module: the details drawer shows one too, and it imports
// this file — reading it from here would close a cycle between them.
import { StatusPill } from "@/components/status-pill";

// Re-exported so the pages that import it from here still can.
export { StatusPill };

/** Consistent secondary line for a car, matching the Inventory first column. */
export function carSubLine(r: Diecast) {
  return (
    [r.brand, r.assortment, r.series, r.subSeries, r.carNumber].filter(Boolean).join(" · ") || "—"
  );
}

/** Payment status text — only meaningful for Pre Order rows. */
export function paymentStatusText(r: Diecast): string | null {
  if ((r.status || "").trim().toLowerCase().replace(/\s+/g, " ") !== "pre order") return null;
  const payment = (r.payment || "").trim();
  const paid = r.paid || 0;
  if (!payment && !paid) return null;
  const p = payment.toLowerCase();
  if (p === "paid") return "Fully paid";
  if (paid > 0) return `₹${paid.toLocaleString("en-IN")} advance paid`;
  return "Adv not paid";
}

/** Short advance-payment note for Pre Order cars, shown under the spent amount. */
export function advanceText(r: Diecast): string | null {
  if ((r.status || "").trim().toLowerCase().replace(/\s+/g, " ") !== "pre order") return null;
  const p = (r.payment || "").trim().toLowerCase();
  const paid = r.paid || 0;
  if (p === "paid") return "Fully paid";
  if (paid > 0) return `${inr(paid)} adv`;
  if (!p) return null;
  return "Adv not paid";
}

/** Single consolidated cost cell: spent, MRP comparison, and advance payment. */
export function CostCell({ car: r, align = "right" }: { car: Diecast; align?: "right" | "left" }) {
  const spent = r.spent || 0;
  const mrp = r.mrp || 0;
  const adv = advanceText(r);

  let mrpLine: string | null = null;
  let diffLine: string | null = null;
  if (mrp > 0 && spent > 0) {
    if (Math.round(mrp) === Math.round(spent)) {
      mrpLine = "At MRP";
    } else {
      mrpLine = `MRP ${inr(mrp)}`;
      const ratio = spent / mrp;
      diffLine =
        ratio > 1
          ? `${ratio.toFixed(1)}x higher than MRP`
          : `${(1 / ratio).toFixed(1)}x lower than MRP`;
    }
  } else if (mrp > 0) {
    mrpLine = `MRP ${inr(mrp)}`;
  }

  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : "text-left"}`}>
      <div className="truncate tabular-nums">{spent ? inr(spent) : "—"}</div>
      {adv && <div className="truncate text-[11px] text-muted-foreground">{adv}</div>}
      {mrpLine && <div className="truncate text-[11px] text-muted-foreground">{mrpLine}</div>}
      {diffLine && <div className="truncate text-[11px] text-muted-foreground">{diffLine}</div>}
    </div>
  );
}

export function CarBadges({
  car,
  primary = "favourite",
}: {
  car: Diecast;
  primary?: "favourite" | "chase";
}) {
  const chase = car.chase && (
    <span
      key="chase"
      className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-500 dark:text-rose-400"
    >
      <Flame className="size-3" /> CHASE
    </span>
  );
  const fav = car.favourite && (
    <Star key="fav" className="size-4 shrink-0 fill-amber-400 stroke-amber-500" />
  );
  const items = primary === "chase" ? [chase, fav] : [fav, chase];
  return <div className="flex items-center gap-1.5">{items}</div>;
}

/**
 * One car, for a phone: the name, what it is, who sold it, what it cost.
 *
 * Label-and-value rows were tried and dropped — nine of them per car turned a
 * list you scan into a list you read. Three lines instead, in the order you
 * would say them out loud: which car it is and where it is, what kind of car it
 * is, and who it came from for how much. Tapping it opens the car, which is
 * where the rest of the fields live.
 */
export function CarListCard({
  car,
  onOpen,
  actions,
  badgePrimary = "favourite",
}: {
  car: Diecast;
  onOpen: () => void;
  /** Icon buttons for this car, at the foot of the card. */
  actions?: ReactNode;
  badgePrimary?: "favourite" | "chase";
}) {
  const pay = paymentStatusText(car) ?? advanceText(car);
  const spent = car.spent || 0;
  const mrp = car.mrp || 0;
  // The MRP line only when it says something. "MRP ₹600" against a ₹600 car is
  // a row of type to tell you nothing happened.
  const mrpNote =
    mrp > 0 && spent > 0 && Math.round(mrp) !== Math.round(spent) ? `MRP ${inr(mrp)}` : null;

  return (
    <article className="card-elevated overflow-hidden">
      <button type="button" onClick={onOpen} className="block w-full p-3 text-left">
        {/* NAME AND PRICE. Two things you can read at arm's length, one at each
            end of the line — what it is, and what it cost. */}
        <div className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{car.name || "—"}</span>
            <CarBadges car={car} primary={badgePrimary} />
          </span>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {spent ? inr(spent) : "—"}
          </span>
        </div>

        {/* WHAT KIND OF CAR */}
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{carSubLine(car)}</div>

        {/* WHO IT CAME FROM, AND WHERE IT IS.
            The seller was not on this card at all, which made a phone the one
            place you could not answer "where did I get this". */}
        <div className="mt-2 flex items-end justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-xs text-muted-foreground">
              {car.seller || "—"}
            </span>
            {(pay || mrpNote) && (
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                {[pay, mrpNote].filter(Boolean).join(" · ")}
              </span>
            )}
          </span>
          <span className="shrink-0">
            <StatusPill status={car.status} />
          </span>
        </div>
      </button>

      {actions && (
        <div className="flex items-center justify-end gap-0.5 border-t border-border/60 px-3 py-2">
          {actions}
        </div>
      )}
    </article>
  );
}

/** Shared table used by Favourites / Collection expansion / Duplicates expansion. */
export function CarsTable({
  rows,
  showBadgeCol = true,
  badgePrimary = "favourite",
}: {
  rows: Diecast[];
  showBadgeCol?: boolean;
  badgePrimary?: "favourite" | "chase";
}) {
  const { open } = useCarDrawer();
  return (
    <>
      {/* Phones get cards rather than a table that has to be dragged sideways. */}
      <div className="space-y-2 p-2 md:hidden">
        {rows.map((r, i) => (
          <CarListCard
            key={(r.id || "") + i}
            car={r}
            onOpen={() => open(r)}
            badgePrimary={badgePrimary}
          />
        ))}
        {rows.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">No cars to show.</p>
        )}
      </div>

      <div className="hidden h-full w-full overflow-auto md:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            <col className="w-[9rem] md:w-[11rem]" />
            <col className="hidden w-[8rem] md:table-column" />
            <col className="hidden w-[9rem] md:table-column" />
            <col className="w-[7rem] md:w-[8rem]" />
            <col className="w-[7rem] md:w-[8rem]" />
            {showBadgeCol && <col className="w-[7.5rem]" />}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium md:px-4">Model</th>
              <th className="px-3 py-2.5 font-medium md:px-4">Brand / Assortment</th>
              <th className="hidden px-4 py-2.5 font-medium md:table-cell">Colour</th>
              <th className="hidden px-4 py-2.5 font-medium md:table-cell">Seller</th>
              <th className="px-3 py-2.5 text-right font-medium md:px-4">Cost</th>
              <th className="px-3 py-2.5 font-medium md:px-4">Status</th>
              {showBadgeCol && <th className="px-3 py-2.5 font-medium md:px-4"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const pay = paymentStatusText(r);
              return (
                <tr
                  key={(r.id || "") + i}
                  onClick={() => open(r)}
                  className="cursor-pointer border-t border-border/60 hover:bg-muted/30"
                >
                  <td className="px-3 py-2.5 md:px-4">
                    <div className="truncate font-medium">{r.name || "—"}</div>
                    <div className="truncate text-xs text-muted-foreground">{carSubLine(r)}</div>
                  </td>
                  <td className="px-3 py-2.5 md:px-4">
                    <div className="truncate">{r.brand || "—"}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.assortment || ""}
                    </div>
                  </td>
                  <td className="hidden truncate px-4 py-2.5 text-muted-foreground md:table-cell">
                    {r.colour || "—"}
                  </td>
                  <td className="hidden truncate px-4 py-2.5 text-muted-foreground md:table-cell">
                    {r.seller || "—"}
                  </td>
                  <td className="px-3 py-2.5 md:px-4">
                    <CostCell car={r} />
                  </td>
                  <td className="px-3 py-2.5 md:px-4">
                    <StatusPill status={r.status} />
                    {pay && (
                      <div className="mt-1 truncate text-[11px] text-muted-foreground">{pay}</div>
                    )}
                  </td>
                  {showBadgeCol && (
                    <td className="px-3 py-2.5 md:px-4">
                      <CarBadges car={r} primary={badgePrimary} />
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={showBadgeCol ? 7 : 6}
                  className="p-8 text-center text-muted-foreground"
                >
                  No cars to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
