import { useEffect, useMemo, useState } from "react";
import { useCarDrawer } from "@/components/car-details-drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { SegmentControl } from "@/components/segment-control";
import { inrFull } from "@/lib/format";
import { toDateInputValue } from "@/lib/date-utils";
import { isOnHold, isPreOrder, normaliseStatus, styleFor } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { Diecast } from "@/lib/types";

type View = "seller" | "order" | "car";
const VIEW_KEY = "viiv.accounts.view";
const TOTAL_KEY = "viiv.accounts.total";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const remembered = <T extends string>(key: string, ok: readonly T[], fallback: T): T => {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && ok.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

/** The month an expected date falls in, as year * 12 + month, or null when it has none. */
const monthOf = (c: Diecast): number | null => {
  const iso = toDateInputValue(c.expectedDate);
  if (!iso) return null;
  const [y, m] = iso.split("-").map(Number);
  return y * 12 + (m - 1);
};

/** "3 Dec" from an expected date; "—" when there is none. */
const shortDay = (d: string) => {
  const iso = toDateInputValue(d);
  if (!iso) return "—";
  const [, m, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[m - 1]}`;
};

/** The statuses this frame is about, in the order they are shown. */
const STATUS_ORDER = ["Ordered", "In Transit", "On Hold", "PO"];

const inFlight = (c: Diecast) => ["Ordered", "In Transit"].includes(normaliseStatus(c.status));
const unpaid = (c: Diecast) => Math.max(c.balance ?? (c.spent || 0) - (c.paid || 0), 0);

/**
 * Who you owe and what is coming from them: the cars on hold, what is left to pay, what has gone
 * into pre-orders, and the cars arriving this month: or next month, when nothing is arriving
 * this month. By seller, by order, or car by car.
 */
export function SellerAccounts({ cars }: { cars: Diecast[] }) {
  const { open: openCar, openBatch, openSeller } = useCarDrawer();
  const [view, setView] = useState<View>("seller");
  const [total, setTotal] = useState(false);
  useEffect(() => {
    setView(remembered<View>(VIEW_KEY, ["seller", "order", "car"], "seller"));
    setTotal(remembered(TOTAL_KEY, ["1", "0"], "0") === "1");
  }, []);
  const pick = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* a remembered view is a convenience */
    }
  };
  const pickTotal = (on: boolean) => {
    setTotal(on);
    try {
      localStorage.setItem(TOTAL_KEY, on ? "1" : "0");
    } catch {
      /* as above */
    }
  };

  const m = useMemo(() => {
    const mine = cars.filter((c) => (c.seller || "").trim());
    const now = new Date();
    const thisMonth = now.getFullYear() * 12 + now.getMonth();
    const flying = mine.filter(inFlight);
    // Only this month's cars; when there are none, next month's.
    const dueNow = flying.filter((c) => monthOf(c) === thisMonth);
    const month = dueNow.length ? thisMonth : thisMonth + 1;
    const arriving = dueNow.length ? dueNow : flying.filter((c) => monthOf(c) === month);
    return {
      mine,
      arriving: new Set(arriving),
      label: MONTHS[((month % 12) + 12) % 12],
      thisMonth: dueNow.length > 0,
    };
  }, [cars]);

  const hold = useMemo(() => m.mine.filter((c) => isOnHold(c.status)), [m]);
  const keyOf = (c: Diecast) => (view === "order" ? c.shippingId || "No order ID" : c.seller);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; seller: string; list: Diecast[] }>();
    for (const c of m.mine) {
      const k = keyOf(c);
      const g = map.get(k) ?? { key: k, seller: c.seller, list: [] };
      g.list.push(c);
      map.set(k, g);
    }
    return [...map.values()]
      .map((g) => ({
        ...g,
        statuses: STATUS_ORDER.filter((st) => g.list.some((c) => normaliseStatus(c.status) === st)),
        hold: g.list.filter((c) => isOnHold(c.status)).length,
        arriving: g.list.filter((c) => m.arriving.has(c)).length,
        // What is still to pay on what is on its way or held: delivered cars are not this frame's business.
        owe: g.list
          .filter((c) => inFlight(c) || isOnHold(c.status))
          .reduce((s, c) => s + unpaid(c), 0),
        poPaid: g.list.filter((c) => isPreOrder(c.status)).reduce((s, c) => s + (c.paid || 0), 0),
      }))
      .filter((g) => g.hold || g.arriving || g.owe || g.poPaid)
      .sort((a, b) => b.owe - a.owe || a.key.localeCompare(b.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyOf follows view
  }, [m, view]);

  const rows = useMemo(
    () =>
      // A car with no expected date has nothing to say about when it comes: it is left out here.
      [...hold, ...m.arriving]
        .filter((c) => monthOf(c) !== null)
        .sort((a, b) => Number(isOnHold(a.status)) - Number(isOnHold(b.status))),
    [hold, m],
  );

  if (!groups.length && !rows.length) return null;

  /** A seller's row opens that seller's orders; an order's row opens the order. */
  const open = (g: { key: string; seller: string }) => {
    if (view === "order") {
      if (g.key !== "No order ID") openBatch(g.key, "shippingId");
    } else openSeller(g.seller);
  };

  const th = "px-2 py-1.5 font-normal text-muted-foreground";
  const td = "px-2 py-2.5";
  const num = "text-right tabular-nums";
  const sum = (f: (g: (typeof groups)[number]) => number) => groups.reduce((s, g) => s + f(g), 0);
  const foot = "border-t border-border font-medium";

  return (
    <section aria-label="Sellers" className="card-elevated space-y-2 p-3 [--frame-gap:0.75rem]">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <h2 className="text-display text-lg font-semibold">Sellers</h2>
          <p className="text-xs text-muted-foreground">
            {m.thisMonth
              ? `Arriving this month (${m.label})`
              : `Nothing arriving this month, so expected in ${m.label}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs">
            <Checkbox checked={total} onCheckedChange={(v) => pickTotal(v === true)} />
            Total
          </label>
          <SegmentControl<View>
            row
            value={view}
            onChange={pick}
            options={[
              { value: "seller", label: "Seller" },
              { value: "order", label: "Order ID" },
              { value: "car", label: "Car" },
            ]}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] table-fixed text-xs">
          {view === "car" ? (
            <>
              <thead>
                <tr className="border-b border-border text-left">
                  <th className={cn(th, "w-[34%]")}>Car</th>
                  <th className={cn(th, "w-[14%]")}>Status</th>
                  <th className={cn(th, "w-[24%]")}>Seller · order</th>
                  <th className={cn(th, "w-[14%]", num)}>Cost</th>
                  <th className={cn(th, "w-[14%]", num)}>Expected</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr
                    key={c.id ?? i}
                    onClick={() => openCar(c)}
                    className="cursor-pointer border-b border-border/50 hover:bg-muted/40"
                  >
                    <td className={cn(td, "truncate")}>
                      <button
                        type="button"
                        className="max-w-full cursor-pointer truncate text-left"
                      >
                        {c.name}
                      </button>
                    </td>
                    <td className={td}>
                      <span className={cn("rounded-full px-2 py-0.5", styleFor(c.status))}>
                        {normaliseStatus(c.status) || "—"}
                      </span>
                    </td>
                    <td className={cn(td, "truncate text-muted-foreground")}>
                      {[c.seller, c.shippingId].filter(Boolean).join(" · ")}
                    </td>
                    <td className={cn(td, num)}>{inrFull(c.spent || 0)}</td>
                    <td className={cn(td, num, !c.expectedDate && "text-muted-foreground")}>
                      {shortDay(c.expectedDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {total && (
                <tfoot>
                  <tr>
                    <td className={cn(td, foot)} colSpan={3}>
                      Total · {rows.length} car{rows.length === 1 ? "" : "s"}
                    </td>
                    <td className={cn(td, foot, num)}>
                      {inrFull(rows.reduce((s, c) => s + (c.spent || 0), 0))}
                    </td>
                    <td className={cn(td, foot)} />
                  </tr>
                </tfoot>
              )}
            </>
          ) : (
            <>
              <thead>
                <tr className="border-b border-border text-left">
                  <th className={th}>{view === "order" ? "Order ID" : "Seller"}</th>
                  {view === "order" && <th className={th}>Seller</th>}
                  <th className={th}>Status</th>
                  <th className={cn(th, num)}>On hold</th>
                  <th className={cn(th, num)}>Arriving {m.label}</th>
                  <th className={cn(th, num)}>You owe</th>
                  <th className={cn(th, num)}>PO paid</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr
                    key={g.key}
                    onClick={() => open(g)}
                    className="cursor-pointer border-b border-border/50 hover:bg-muted/40"
                  >
                    <td className={cn(td, "truncate font-medium")}>
                      <button
                        type="button"
                        className="max-w-full cursor-pointer truncate text-left"
                      >
                        {g.key}
                      </button>
                    </td>
                    {view === "order" && (
                      <td className={cn(td, "truncate text-muted-foreground")}>{g.seller}</td>
                    )}
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        {g.statuses.map((st) => (
                          <span key={st} className={cn("rounded-full px-2 py-0.5", styleFor(st))}>
                            {st}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className={cn(td, num)}>{g.hold}</td>
                    <td className={cn(td, num)}>{g.arriving}</td>
                    <td className={cn(td, num)}>{inrFull(g.owe)}</td>
                    <td className={cn(td, num)}>{inrFull(g.poPaid)}</td>
                  </tr>
                ))}
              </tbody>
              {total && (
                <tfoot>
                  <tr>
                    <td className={cn(td, foot)} colSpan={view === "order" ? 3 : 2}>
                      Total
                    </td>
                    <td className={cn(td, foot, num)}>{sum((g) => g.hold)}</td>
                    <td className={cn(td, foot, num)}>{sum((g) => g.arriving)}</td>
                    <td className={cn(td, foot, num)}>{inrFull(sum((g) => g.owe))}</td>
                    <td className={cn(td, foot, num)}>{inrFull(sum((g) => g.poPaid))}</td>
                  </tr>
                </tfoot>
              )}
            </>
          )}
        </table>
      </div>
    </section>
  );
}
