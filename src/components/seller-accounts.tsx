import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { useCarDrawer } from "@/components/car-details-drawer";
import { useApp } from "@/lib/store";
import { SegmentControl } from "@/components/segment-control";
import { inrFull } from "@/lib/format";
import { toDateInputValue } from "@/lib/date-utils";
import { normaliseStatus, styleFor } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { Diecast } from "@/lib/types";

type View = "seller" | "order" | "car";
const VIEW_KEY = "viiv.accounts.view";
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

type Sort = { key: string; dir: 1 | -1 } | null;
type Val = string | number;
const stIndex = (c: Diecast) => STATUS_ORDER.indexOf(normaliseStatus(c.status));
const compare = (a: Val, b: Val) =>
  typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
/** What each column of the car view sorts by. A car with nothing in a text column goes last. */
const CAR_SORT: Record<string, (c: Diecast) => Val> = {
  car: (c) => c.name || "",
  status: stIndex,
  seller: (c) => c.seller || "\uffff",
  order: (c) => c.shippingId || "\uffff",
  cost,
  paid,
  balance,
  due: sortKey,
};
type Group = { key: string; list: Diecast[]; seller: string; statuses: string[] };
/** The same for a seller or an order: a column of numbers sorts on the group's total. */
const GROUP_SORT: Record<string, (g: Group) => Val> = {
  name: (g) => g.key,
  seller: (g) => g.seller || "\uffff",
  cars: (g) => g.list.length,
  status: (g) => Math.min(...g.list.map(stIndex)),
  cost: (g) => sum(g.list, cost),
  paid: (g) => sum(g.list, paid),
  balance: (g) => sum(g.list, balance),
  due: (g) => Math.min(...g.list.map(sortKey).filter(Boolean)),
};
const sorted = <T,>(rows: T[], sort: Sort, by: Record<string, (r: T) => Val>) =>
  sort && by[sort.key]
    ? [...rows].sort((a, b) => sort.dir * compare(by[sort.key](a), by[sort.key](b)))
    : rows;

/**
 * The cars due this month, by seller, by order, or one by one: what each is, what it cost, what
 * has been paid (an advance on a pre-order included) and what is left. When nothing is due this
 * month, next month's. A car with no expected date is not here.
 */
export function SellerAccounts({ cars }: { cars: Diecast[] }) {
  const { open: openCar } = useCarDrawer();
  const [view, setView] = useState<View>("seller");
  const { carsDueTotal: total } = useApp();
  /** Cars due in months that have gone, loaded on request. */
  const [showPrev, setShowPrev] = useState(false);
  useEffect(() => {
    setView(remembered<View>(VIEW_KEY, ["seller", "order", "car"], "seller"));
  }, []);
  /** Click a heading to sort by it, again to reverse, once more to go back to date order. */
  const [sort, setSort] = useState<Sort>(null);
  const toggle = (key: string) =>
    setSort((s) => (!s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
  /** The seller or order whose cars are showing: one at a time. */
  const [openKey, setOpenKey] = useState<string | null>(null);
  const pick = (v: View) => {
    setSort(null);
    setOpenKey(null);
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* a remembered view is a convenience */
    }
  };

  const m = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getFullYear() * 12 + now.getMonth();
    // A month runs from its 1st to its last day, not from today. Every status here follows the
    // same rule, a car on hold included: it is listed in the month its expected date falls in.
    const due = cars.filter(
      (c) => STATUS_ORDER.includes(normaliseStatus(c.status)) && etaOf(c) !== null,
    );
    const inThis = due.filter((c) => monthIndex(etaOf(c)!) === thisMonth);
    const month = inThis.length ? thisMonth : thisMonth + 1;
    const previous = due.filter((c) => monthIndex(etaOf(c)!) < month);
    const list = [
      ...(inThis.length ? inThis : due.filter((c) => monthIndex(etaOf(c)!) === month)),
      ...(showPrev ? previous : []),
    ].sort((a, b) => sortKey(a) - sortKey(b));
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

  const carRows = useMemo(() => sorted(m.list, sort, CAR_SORT), [m.list, sort]);
  const groupRows = useMemo(() => sorted(groups, sort, GROUP_SORT), [groups, sort]);

  if (!m.list.length && !m.previous) return null;

  const sortTh = (key: string, label: string, align?: string) => (
    <th
      className={cn(th, align)}
      aria-sort={sort?.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => toggle(key)}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 hover:text-foreground",
          sort?.key === key && "text-foreground",
        )}
      >
        {label}
        {sort?.key === key &&
          (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );
  const th = "sticky top-0 z-10 bg-background px-2 py-2.5 font-normal text-muted-foreground";
  const td = "px-2 py-2.5";
  const num = "text-right tabular-nums";
  const foot = "sticky bottom-0 z-10 border-t border-border bg-background font-medium";
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
    <section aria-label="Cars due" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <h2 className="text-display text-lg font-semibold">Cars Due</h2>
          <p className="text-xs text-muted-foreground">
            {m.thisMonth ? `This month (${m.label})` : `Next month (${m.label})`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {m.previous > 0 && (
            <button
              type="button"
              onClick={() => setShowPrev((v) => !v)}
              className="glass-btn h-8 cursor-pointer rounded-full px-3 text-xs font-medium text-foreground"
            >
              {showPrev ? "Hide previous cars" : `Show previous cars (${m.previous})`}
            </button>
          )}
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
      {/* Eight rows show; the rest scroll, under a header and a total that stay put. */}
      <div className="card-elevated max-h-[23rem] overflow-auto">
        <table className="w-full min-w-[44rem] text-xs [&_tr>:first-child]:pl-4 [&_tr>:last-child]:pr-4">
          {view === "car" ? (
            <>
              <thead>
                <tr className="border-b border-border text-left">
                  {sortTh("car", "Car")}
                  {sortTh("status", "Status")}
                  {sortTh("seller", "Seller")}
                  {sortTh("order", "Order ID")}
                  {sortTh("cost", "Cost", num)}
                  {sortTh("paid", "Paid", num)}
                  {sortTh("balance", "Balance", num)}
                  {sortTh("due", "Expected", num)}
                </tr>
              </thead>
              <tbody>
                {carRows.map((c, i) => (
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
                    <td className={cn(td, foot, num, "whitespace-nowrap")}>{range(m.list)}</td>
                  </tr>
                </tfoot>
              )}
            </>
          ) : (
            <>
              <thead>
                <tr className="border-b border-border text-left">
                  {sortTh("name", view === "order" ? "Order ID" : "Seller")}
                  {view === "order" && sortTh("seller", "Seller")}
                  {sortTh("cars", "Cars", num)}
                  {sortTh("status", "Status")}
                  {sortTh("cost", "Cost", num)}
                  {sortTh("paid", "Paid", num)}
                  {sortTh("balance", "Balance", num)}
                  {sortTh("due", "Arrival", num)}
                </tr>
              </thead>
              <tbody>
                {groupRows.map((g) => {
                  const isOpen = openKey === g.key;
                  return (
                    <Fragment key={g.key}>
                      <tr onClick={() => setOpenKey(isOpen ? null : g.key)} className={row}>
                        <td className={cn(td, "font-medium")}>
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            className={cn(link, "inline-flex items-center gap-1")}
                          >
                            <span className="truncate">{g.key}</span>
                            <ChevronRight
                              className={cn(
                                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                                isOpen && "rotate-90",
                              )}
                            />
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
                      {isOpen &&
                        g.list.map((c, i) => (
                          <tr
                            key={c.id ?? i}
                            onClick={() => openCar(c)}
                            className={cn(row, "bg-muted/30")}
                          >
                            <td className={cn(td, "max-w-[16rem] pl-7")}>
                              <div className="flex items-center gap-2.5">
                                <div className="size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                                  {c.imageUrl && (
                                    <img
                                      src={c.imageUrl}
                                      alt=""
                                      loading="lazy"
                                      className="size-full object-cover"
                                    />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate">{c.name}</div>
                                  <div className="truncate text-muted-foreground">
                                    {[c.brand, c.carNumber].filter(Boolean).join(" · ")}
                                  </div>
                                </div>
                              </div>
                            </td>
                            {view === "order" && (
                              <td className={cn(td, "text-muted-foreground")}>{c.seller || "—"}</td>
                            )}
                            <td className={td} />
                            <td className={td}>{pills([normaliseStatus(c.status)])}</td>
                            <td className={cn(td, num)}>{inrFull(cost(c))}</td>
                            <td className={cn(td, num)}>{inrFull(paid(c))}</td>
                            <td className={cn(td, num)}>{inrFull(balance(c))}</td>
                            <td className={cn(td, num)}>{dayOf(c)}</td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
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
