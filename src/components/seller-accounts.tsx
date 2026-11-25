import { useEffect, useMemo, useState } from "react";
import { useCarDrawer } from "@/components/car-details-drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { SegmentControl } from "@/components/segment-control";
import { inrFull } from "@/lib/format";
import { toDateInputValue } from "@/lib/date-utils";
import { normaliseStatus, styleFor } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { Diecast } from "@/lib/types";

type View = "seller" | "order" | "car";
const VIEW_KEY = "viiv.accounts.view";
const TOTAL_KEY = "viiv.accounts.total";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** The cars this frame is about: not yet here, and not a wish. In the order they are shown. */
const STATUS_ORDER = ["Ordered", "In Transit", "On Hold", "PO"];

const remembered = <T extends string>(key: string, ok: readonly T[], fallback: T): T => {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && ok.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

/** The expected date as [year, month 1-12, day], or null when the car has none. */
const etaOf = (c: Diecast): [number, number, number] | null => {
  const iso = toDateInputValue(c.expectedDate);
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
};
const monthIndex = (e: [number, number, number]) => e[0] * 12 + (e[1] - 1);
const sortKey = (c: Diecast) => {
  const e = etaOf(c);
  return e ? e[0] * 10000 + e[1] * 100 + e[2] : 0;
};
const dayMonth = (e: [number, number, number]) => `${e[2]} ${MONTHS[e[1] - 1]}`;
const dayOf = (c: Diecast) => {
  const e = etaOf(c);
  return e ? dayMonth(e) : "—";
};

/** "3 Dec", or "3–10 Dec" when the cars do not all arrive on the same day. */
const range = (list: Diecast[]) => {
  const dates = list.map(etaOf).filter((e): e is [number, number, number] => e !== null);
  if (!dates.length) return "—";
  dates.sort((a, b) => a[0] * 10000 + a[1] * 100 + a[2] - (b[0] * 10000 + b[1] * 100 + b[2]));
  const [first, last] = [dates[0], dates[dates.length - 1]];
  if (first[2] === last[2] && first[1] === last[1]) return dayMonth(first);
  return first[1] === last[1]
    ? `${first[2]}–${last[2]} ${MONTHS[first[1] - 1]}`
    : `${dayMonth(first)} – ${dayMonth(last)}`;
};

const cost = (c: Diecast) => c.spent || 0;
const paid = (c: Diecast) => Math.min(c.paid || 0, cost(c) || c.paid || 0);
const balance = (c: Diecast) => Math.max(c.balance ?? cost(c) - (c.paid || 0), 0);
const sum = (list: Diecast[], f: (c: Diecast) => number) => list.reduce((s, c) => s + f(c), 0);

/**
 * The cars due this month, by seller, by order, or one by one: what each is, what it cost, what
 * has been paid (an advance on a pre-order included) and what is left. When nothing is due this
 * month, next month's. Cars on hold are always here; any other car with no expected date is not.
 */
export function SellerAccounts({ cars }: { cars: Diecast[] }) {
  const { open: openCar, openBatch, openSeller } = useCarDrawer();
  const [view, setView] = useState<View>("seller");
  const [total, setTotal] = useState(false);
  /** Cars due in months that have gone, loaded on request. */
  const [showPrev, setShowPrev] = useState(false);
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
    const now = new Date();
    const thisMonth = now.getFullYear() * 12 + now.getMonth();
    // The month is worked out from the cars on their way; a car on hold is here whatever its date.
    const due = cars.filter(
      (c) => STATUS_ORDER.includes(normaliseStatus(c.status)) && etaOf(c) !== null,
    );
    const inThis = due.filter((c) => monthIndex(etaOf(c)!) === thisMonth);
    const month = inThis.length ? thisMonth : thisMonth + 1;
    const held = (c: Diecast) => normaliseStatus(c.status) === "On Hold";
    const previous = due.filter((c) => monthIndex(etaOf(c)!) < thisMonth && !held(c));
    const list = [
      ...(inThis.length ? inThis : due.filter((c) => monthIndex(etaOf(c)!) === month)).filter(
        (c) => !held(c),
      ),
      ...(showPrev ? previous : []),
      ...cars.filter(held),
    ].sort((a, b) => Number(held(a)) - Number(held(b)) || sortKey(a) - sortKey(b));
    return {
      list,
      previous: previous.length,
      label: MONTHS[month % 12],
      thisMonth: inThis.length > 0,
    };
  }, [cars, showPrev]);

  const keyOf = (c: Diecast) =>
    view === "order" ? c.shippingId || "No order ID" : c.seller || "No seller";
  const groups = useMemo(() => {
    const map = new Map<string, Diecast[]>();
    for (const c of m.list) map.set(keyOf(c), [...(map.get(keyOf(c)) ?? []), c]);
    return [...map.entries()].map(([key, list]) => ({
      key,
      list,
      seller: list[0].seller,
      statuses: STATUS_ORDER.filter((st) => list.some((c) => normaliseStatus(c.status) === st)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyOf follows view
  }, [m, view]);

  if (!m.list.length && !m.previous) return null;

  const open = (g: { key: string; seller: string }) => {
    if (view === "order") {
      if (g.key !== "No order ID") openBatch(g.key, "shippingId");
    } else if (g.seller) openSeller(g.seller);
  };

  const th = "px-2 py-1.5 font-normal text-muted-foreground";
  const td = "px-2 py-2.5";
  const num = "text-right tabular-nums";
  const foot = "border-t border-border font-medium";
  const pills = (statuses: string[]) => (
    <div className="flex flex-wrap gap-1">
      {statuses.map((st) => (
        <span key={st} className={cn("rounded-full px-2 py-0.5", styleFor(st))}>
          {st}
        </span>
      ))}
    </div>
  );
  const row = "cursor-pointer border-b border-border/50 hover:bg-muted/40";
  const link = "max-w-full cursor-pointer truncate text-left";

  return (
    <section aria-label="Sellers" className="card-elevated space-y-2 p-3 [--frame-gap:0.75rem]">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <h2 className="text-display text-lg font-semibold">Sellers</h2>
          <p className="text-xs text-muted-foreground">
            {m.thisMonth
              ? `Cars due this month (${m.label})`
              : `Nothing due this month, so cars due in ${m.label}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {m.previous > 0 && (
            <button
              type="button"
              onClick={() => setShowPrev((v) => !v)}
              className="glass-btn cursor-pointer rounded-full px-3 py-1 text-xs font-medium text-foreground"
            >
              {showPrev ? "Hide previous cars" : `Show previous cars (${m.previous})`}
            </button>
          )}
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
        <table className="w-full min-w-[44rem] text-xs">
          {view === "car" ? (
            <>
              <thead>
                <tr className="border-b border-border text-left">
                  <th className={th}>Car</th>
                  <th className={th}>Status</th>
                  <th className={th}>Seller</th>
                  <th className={th}>Order ID</th>
                  <th className={cn(th, num)}>Cost</th>
                  <th className={cn(th, num)}>Paid</th>
                  <th className={cn(th, num)}>Balance</th>
                  <th className={cn(th, num)}>Expected</th>
                </tr>
              </thead>
              <tbody>
                {m.list.map((c, i) => (
                  <tr key={c.id ?? i} onClick={() => openCar(c)} className={row}>
                    <td className={cn(td, "max-w-[14rem] font-medium")}>
                      <button type="button" className={link}>
                        {c.name}
                      </button>
                    </td>
                    <td className={td}>{pills([normaliseStatus(c.status)])}</td>
                    <td className={cn(td, "text-muted-foreground")}>{c.seller || "—"}</td>
                    <td className={cn(td, "text-muted-foreground")}>{c.shippingId || "—"}</td>
                    <td className={cn(td, num)}>{inrFull(cost(c))}</td>
                    <td className={cn(td, num)}>{inrFull(paid(c))}</td>
                    <td className={cn(td, num)}>{inrFull(balance(c))}</td>
                    <td className={cn(td, num)}>{dayOf(c)}</td>
                  </tr>
                ))}
              </tbody>
              {total && (
                <tfoot>
                  <tr>
                    <td className={cn(td, foot)} colSpan={4}>
                      Total · {m.list.length} car{m.list.length === 1 ? "" : "s"}
                    </td>
                    <td className={cn(td, foot, num)}>{inrFull(sum(m.list, cost))}</td>
                    <td className={cn(td, foot, num)}>{inrFull(sum(m.list, paid))}</td>
                    <td className={cn(td, foot, num)}>{inrFull(sum(m.list, balance))}</td>
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
                  <th className={cn(th, num)}>Cars</th>
                  <th className={th}>Status</th>
                  <th className={cn(th, num)}>Cost</th>
                  <th className={cn(th, num)}>Paid</th>
                  <th className={cn(th, num)}>Balance</th>
                  <th className={cn(th, num)}>Arrival</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.key} onClick={() => open(g)} className={row}>
                    <td className={cn(td, "font-medium")}>
                      <button type="button" className={link}>
                        {g.key}
                      </button>
                    </td>
                    {view === "order" && (
                      <td className={cn(td, "text-muted-foreground")}>{g.seller || "—"}</td>
                    )}
                    <td className={cn(td, num)}>{g.list.length}</td>
                    <td className={td}>{pills(g.statuses)}</td>
                    <td className={cn(td, num)}>{inrFull(sum(g.list, cost))}</td>
                    <td className={cn(td, num)}>{inrFull(sum(g.list, paid))}</td>
                    <td className={cn(td, num)}>{inrFull(sum(g.list, balance))}</td>
                    <td className={cn(td, num, "whitespace-nowrap")}>{range(g.list)}</td>
                  </tr>
                ))}
              </tbody>
              {total && (
                <tfoot>
                  <tr>
                    <td className={cn(td, foot)} colSpan={view === "order" ? 2 : 1}>
                      Total
                    </td>
                    <td className={cn(td, foot, num)}>{m.list.length}</td>
                    <td className={cn(td, foot)} />
                    <td className={cn(td, foot, num)}>{inrFull(sum(m.list, cost))}</td>
                    <td className={cn(td, foot, num)}>{inrFull(sum(m.list, paid))}</td>
                    <td className={cn(td, foot, num)}>{inrFull(sum(m.list, balance))}</td>
                    <td className={cn(td, foot, num, "whitespace-nowrap")}>{range(m.list)}</td>
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
