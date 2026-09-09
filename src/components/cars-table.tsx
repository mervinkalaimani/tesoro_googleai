import type { Diecast } from "@/lib/types";
import { inr } from "@/lib/format";
import { Flame, Star } from "lucide-react";

import { useCarDrawer } from "@/components/car-details-drawer";

const STATUS_STYLES: Record<string, string> = {
  available: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
  transit: "bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30",
  "out for delivery": "bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30",
  waiting: "bg-orange-500/15 text-orange-600 dark:text-orange-300 border-orange-500/30",
  delayed: "bg-red-500/15 text-red-600 dark:text-red-300 border-red-500/30",
  "pre order": "bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30",
  preorder: "bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30",
  iso: "bg-zinc-500/20 text-zinc-600 dark:text-zinc-300 border-zinc-500/30",
};

export function StatusPill({ status }: { status: string }) {
  const key = (status || "").trim().toLowerCase();
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs ${
        STATUS_STYLES[key] ?? "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      {status || "—"}
    </span>
  );
}

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
    <div className="h-full w-full overflow-auto">
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
                  <div className="truncate text-xs text-muted-foreground">{r.assortment || ""}</div>
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
              <td colSpan={showBadgeCol ? 7 : 6} className="p-8 text-center text-muted-foreground">
                No cars to show.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
