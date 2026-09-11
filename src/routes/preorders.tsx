import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CircleCheck, Clock, IndianRupee, Plus, Wallet } from "lucide-react";

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
import { SummaryCard } from "@/components/summary-card";
import { UpdateStatusButton } from "@/components/update-status-button";
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

function PreOrderCard({
  car,
  onOpen,
  onPay,
  onUpdateStatus,
}: {
  car: Diecast;
  onOpen: () => void;
  onPay: () => void;
  onUpdateStatus: () => void;
}) {
  const due = balanceOf(car);
  const settled = due === 0;

  return (
    <article className="card-elevated flex flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-4 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {car.id}
          </span>
          <span className="truncate text-sm text-muted-foreground">{car.brand || "—"}</span>
        </div>
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

      <button
        type="button"
        onClick={onOpen}
        className="px-4 pb-1 text-left text-base font-bold tracking-tight hover:text-primary"
      >
        {car.name || `${car.make} ${car.model}`.trim() || "Unnamed car"}
      </button>

      <p className="flex flex-wrap items-center gap-x-2 px-4 pb-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Wallet className="size-3" />
          {car.seller || "—"}
        </span>
        {car.orderDate ? (
          <>
            <span>·</span>
            <span className="font-mono">Pre-booked: {car.orderDate}</span>
          </>
        ) : null}
      </p>

      {/* The ETA note used to be quoted here. It held the release month — "Mar
          2027" — which is now parsed into the expected date below, so showing
          the raw string as well said the same thing twice, less clearly. */}

      <div className="mt-auto grid grid-cols-3 gap-2 border-t border-border px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Target release
          </div>
          <div className="mt-0.5 text-sm font-semibold text-primary">
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
        {/* Was "Mark shipped", which could only ever mean one move. The same
            button and the same dialog as everywhere else now: a pre-order that
            slipped, or arrived early, is one choice rather than none. */}
        <UpdateStatusButton onClick={onUpdateStatus} />
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

  const totalValue = rows.reduce((s, r) => s + (r.spent || 0), 0);
  const totalPaid = rows.reduce((s, r) => s + (r.paid || 0), 0);
  const totalDue = rows.reduce((s, r) => s + balanceOf(r), 0);
  const uniqueModels = new Set(rows.map((r) => `${r.make}|${r.model}`)).size;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-3 md:p-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Committed value"
          value={inrFull(totalValue)}
          sub={`${rows.length} pre-booked casting${rows.length === 1 ? "" : "s"}`}
          icon={<IndianRupee className="size-4" />}
        />
        <SummaryCard
          label="Deposits paid"
          value={inrFull(totalPaid)}
          sub={`${uniqueModels} secured allocation${uniqueModels === 1 ? "" : "s"}`}
          icon={<CircleCheck className="size-4" />}
          tone="emerald"
        />
        <SummaryCard
          label="Balance due"
          value={inrFull(totalDue)}
          sub="Outstanding upon arrival"
          icon={<Clock className="size-4" />}
          tone="amber"
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-display text-xl font-semibold">Pre-booked allocations</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Track future batches, manufacturing timelines, and remaining balances.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            New pre-order
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card-elevated p-8 text-center text-sm text-muted-foreground">
          No pre-orders.
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
