import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { IndianRupee, PartyPopper, Truck, Wallet, X } from "lucide-react";

import type { Diecast } from "@/lib/types";
import { CarThumb } from "@/components/car-thumb";
import { Button } from "@/components/ui/button";
import { PayBalanceDialog } from "@/components/pay-balance-dialog";
import { MarkShippedDialog } from "@/components/mark-shipped-dialog";
import { daysBetween, formatDayMonthYear, inrFull, parseDMY } from "@/lib/format";
import { isPreOrder } from "@/lib/status-order";

/** How far ahead a release has to be before it stops being news. */
const LEAD_DAYS = 10;
/**
 * How far past its date a release keeps nagging. Without a floor the dashboard
 * silts up with pre-orders whose promised month came and went a year ago, and a
 * banner that is always there stops being read.
 */
const OVERDUE_DAYS = 30;

const DISMISS_KEY = "dg.dismissedLaunches";

type Launch = { car: Diecast; due: Date; days: number };

/** Dismissals are keyed by car *and* date, so moving the date brings it back. */
const keyOf = (l: Launch) => `${l.car.id}@${l.due.toISOString().slice(0, 10)}`;

function readDismissed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * The dashboard's heads-up that a pre-order is about to land.
 *
 * A pre-order placed a year ago is invisible until someone thinks to open the
 * pre-orders tab, which is exactly the wrong moment to remember a balance is
 * still outstanding. When the promised date comes within reach the car surfaces
 * on the dashboard with the two things that need doing — settle the balance, and
 * record the shipment — rather than a link to go and find it.
 */
export function PreOrderLaunchAlert({ rows }: { rows: Diecast[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [payFor, setPayFor] = useState<Diecast | null>(null);
  const [shipFor, setShipFor] = useState<Diecast | null>(null);

  // Read on mount rather than in initial state: this renders on the server too,
  // and a first client render that already knows the dismissals would not match.
  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  const launches = useMemo<Launch[]>(() => {
    const now = new Date();
    const out: Launch[] = [];
    for (const car of rows) {
      if (!isPreOrder(car.status)) continue;
      const due = parseDMY(car.expectedDate);
      if (!due) continue;
      const days = daysBetween(now, due);
      if (days > LEAD_DAYS || days < -OVERDUE_DAYS) continue;
      out.push({ car, due, days });
    }
    return out.sort((a, b) => a.due.getTime() - b.due.getTime());
  }, [rows]);

  const visible = launches.filter((l) => !dismissed.includes(keyOf(l)));

  const dismiss = (l: Launch) => {
    const next = [...dismissed, keyOf(l)];
    setDismissed(next);
    try {
      // Trim to the live set so the list cannot grow without bound as
      // pre-orders come and go.
      const live = new Set(launches.map(keyOf));
      window.localStorage.setItem(DISMISS_KEY, JSON.stringify(next.filter((k) => live.has(k))));
    } catch {
      // A browser refusing storage just means it reappears next visit.
    }
  };

  if (visible.length === 0) return null;

  return (
    <>
      <section className="card-elevated overflow-hidden border-violet-500/40 bg-violet-500/[0.06]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-500/25 px-4 py-2.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <span className="grid size-6 place-items-center rounded-md bg-violet-500/15 text-violet-500">
              <PartyPopper className="size-3.5" />
            </span>
            Get ready — {visible.length === 1 ? "your pre-order is" : "these pre-orders are"}{" "}
            launching
          </h2>
          <Link
            to="/preorders"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            All pre-orders
          </Link>
        </div>

        <ul className="divide-y divide-violet-500/15">
          {visible.map((l) => (
            <LaunchRow
              key={keyOf(l)}
              launch={l}
              onPay={() => setPayFor(l.car)}
              onShip={() => setShipFor(l.car)}
              onDismiss={() => dismiss(l)}
            />
          ))}
        </ul>
      </section>

      <PayBalanceDialog car={payFor} onClose={() => setPayFor(null)} />
      <MarkShippedDialog car={shipFor} onClose={() => setShipFor(null)} />
    </>
  );
}

/** "in 3 days" / "tomorrow" / "8 days late" — the reason it is on screen. */
function whenLabel(days: number): { text: string; overdue: boolean } {
  if (days < 0) return { text: `${Math.abs(days)} days past due`, overdue: true };
  if (days === 0) return { text: "due today", overdue: false };
  if (days === 1) return { text: "due tomorrow", overdue: false };
  return { text: `due in ${days} days`, overdue: false };
}

function LaunchRow({
  launch,
  onPay,
  onShip,
  onDismiss,
}: {
  launch: Launch;
  onPay: () => void;
  onShip: () => void;
  onDismiss: () => void;
}) {
  const { car, due, days } = launch;
  const balance = Math.max((car.spent || 0) - (car.paid || 0), 0);
  const when = whenLabel(days);

  return (
    <li className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
      <CarThumb car={car} className="size-14 shrink-0 overflow-hidden rounded-lg" />

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">
          {car.name || `${car.make} ${car.model}`.trim() || "Unnamed car"}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Wallet className="size-3" />
            {car.seller || "Seller not recorded"}
          </span>
          <span>·</span>
          <span className="tabular-nums">{inrFull(car.spent || 0)}</span>
          {balance > 0 && (
            <>
              <span>·</span>
              <span className="tabular-nums text-amber-500">{inrFull(balance)} due</span>
            </>
          )}
        </div>
        <div
          className={`mt-0.5 text-xs tabular-nums ${when.overdue ? "text-rose-500" : "text-violet-500"}`}
        >
          {formatDayMonthYear(due)} · {when.text}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {balance > 0 && (
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
        <Button
          size="sm"
          variant="outline"
          onClick={onShip}
          className="gap-1.5 border-sky-500/40 text-sky-400 hover:bg-sky-500/10"
        >
          <Truck className="size-3.5" />
          Mark shipped
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onDismiss}
          aria-label={`Dismiss the launch notice for ${car.name || car.model}`}
          title="Dismiss until the date changes"
          className="size-8 text-muted-foreground"
        >
          <X className="size-4" />
        </Button>
      </div>
    </li>
  );
}
