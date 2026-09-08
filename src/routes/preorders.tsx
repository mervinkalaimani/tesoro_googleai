import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { useCars } from "@/lib/cars-store";
import type { Diecast } from "@/lib/types";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import { carSubLine } from "@/components/cars-table";
import { useCarDrawer } from "@/components/car-details-drawer";
import { inr, parseDMY } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

export const isPreOrder = (s: string) =>
  (s || "").trim().toLowerCase().replace(/\s+/g, " ").replace("-", " ") === "pre order";

/** Remaining balance for a pre-order row: car cost minus amount paid. */
const balanceOf = (r: Diecast) => Math.max((r.spent || 0) - (r.paid || 0), 0);

type SortMode = "balance" | "orderDate" | "seller" | "cost";

function uniqueSorted(items: Diecast[], key: (r: Diecast) => string) {
  const s = new Set<string>();
  for (const it of items) {
    const v = key(it);
    if (v) s.add(v);
  }
  return [...s].sort((a, b) => a.localeCompare(b));
}

function PreOrdersPage() {
  const { query } = useApp();
  const cars = useCars();
  const { open } = useCarDrawer();
  const [seller, setSeller] = useState("all");
  const [sort, setSort] = useState<SortMode>("balance");

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

  const totalValue = rows.reduce((s, r) => s + (r.spent || 0), 0);
  const totalPaid = rows.reduce((s, r) => s + (r.paid || 0), 0);
  const totalDue = rows.reduce((s, r) => s + balanceOf(r), 0);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-3 md:p-6">
      <div className="card-elevated flex min-w-0 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h1 className="text-display text-xl font-semibold">Pre-orders</h1>
            <p className="text-xs text-muted-foreground">
              {rows.length} pre-order{rows.length === 1 ? "" : "s"} · {inr(totalValue)} committed
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-4 pr-2 text-xs tabular-nums">
              <span className="text-muted-foreground">
                Paid <b className="text-emerald-600 dark:text-emerald-400">{inr(totalPaid)}</b>
              </span>
              <span className="text-muted-foreground">
                Balance <b className="text-amber-600 dark:text-amber-400">{inr(totalDue)}</b>
              </span>
            </div>
            <Select value={seller} onValueChange={setSeller}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Seller" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All sellers</SelectItem>
                {sellerOpts.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="balance">Sort: Balance</SelectItem>
                <SelectItem value="orderDate">Sort: Order date</SelectItem>
                <SelectItem value="seller">Sort: Seller</SelectItem>
                <SelectItem value="cost">Sort: Cost</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="max-h-[calc(100svh-11rem)] overflow-auto">
          <table className="w-full min-w-[56rem] table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-[10rem]" />
              <col className="w-[7rem]" />
              <col className="w-[10rem]" />
              <col className="w-[8rem]" />
              <col className="w-[7rem]" />
              <col className="w-[7rem]" />
              <col className="w-[7rem]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium md:px-4">Model</th>
                <th className="px-3 py-2.5 font-medium md:px-4">Seller</th>
                <th className="px-3 py-2.5 font-medium md:px-4">Order date</th>
                <th className="px-3 py-2.5 font-medium md:px-4">ETA</th>
                <th className="px-3 py-2.5 font-medium md:px-4">Payment</th>
                <th className="px-3 py-2.5 text-right font-medium md:px-4">Cost</th>
                <th className="px-3 py-2.5 text-right font-medium md:px-4">Adv paid</th>
                <th className="px-3 py-2.5 text-right font-medium md:px-4">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const paid = r.paid || 0;
                const due = balanceOf(r);
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
                    <td className="truncate px-3 py-2.5 md:px-4">{r.seller || "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums md:px-4">{r.orderDate || "—"}</td>
                    <td className="truncate px-3 py-2.5 md:px-4" title={r.transitInfo || ""}>
                      {(r.transitInfo || "").trim() || "—"}
                    </td>
                    <td className="truncate px-3 py-2.5 md:px-4">{r.payment || "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums md:px-4">
                      {r.spent ? inr(r.spent) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums md:px-4">
                      {paid ? inr(paid) : "—"}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right tabular-nums md:px-4 ${due > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
                    >
                      {due > 0 ? inr(due) : "Settled"}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">
                    No pre-orders.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
