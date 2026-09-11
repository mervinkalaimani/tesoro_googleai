import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, ChevronDown, ChevronUp, IndianRupee, PartyPopper, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ShipmentItem } from "@/components/shipment-item";
import { UpdateStatusButton } from "@/components/update-status-button";
import { PayBalanceDialog } from "@/components/pay-balance-dialog";
import { StatusUpdateDialog } from "@/components/status-update-dialog";
import { useCarDrawer } from "@/components/car-details-drawer";
import { useCars } from "@/lib/cars-store";
import { useAuth } from "@/lib/auth-store";
import { daysBetween, formatDayMonthYear, inrFull, parseDMY } from "@/lib/format";
import { isPreOrder } from "@/lib/status-order";
import type { Diecast } from "@/lib/types";

/** How far ahead a release has to be before it stops being news. */
const LEAD_DAYS = 10;
/**
 * How far past its date a release keeps nagging. Without a floor the panel silts
 * up with pre-orders whose promised month came and went a year ago, and a notice
 * that is always there stops being read.
 */
const OVERDUE_DAYS = 30;

const LAUNCH_SECTION = "preorder-launch";

/** Collapsed sections are per account, so two people sharing a browser differ. */
const collapseKey = (uid: string) => `dg.notifyCollapsed.${uid}`;

function readCollapsed(uid: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(collapseKey(uid));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

type Launch = { car: Diecast; due: Date; days: number };

/** "in 3 days" / "tomorrow" / "8 days late" — the reason it is on screen. */
function whenLabel(days: number): { text: string; overdue: boolean } {
  if (days < 0) return { text: `${Math.abs(days)} days past due`, overdue: true };
  if (days === 0) return { text: "due today", overdue: false };
  if (days === 1) return { text: "due tomorrow", overdue: false };
  return { text: `due in ${days} days`, overdue: false };
}

/**
 * Everything the app wants to tell you, behind one bell.
 *
 * Pre-orders about to land used to sit on the dashboard as a banner with a close
 * button per car — so the only way to quiet it was to dismiss each one, which
 * also hid the two things that needed doing. Here the whole section folds away
 * under its chevron instead, and it stays folded on the next sign-in: closing a
 * notice is a preference, not a decision to forget the car.
 */
export function NotificationCenter() {
  const cars = useCars();
  const { user, isGuest } = useAuth();
  const uid = isGuest ? "guest" : (user?.id ?? "anon");
  const drawer = useCarDrawer();

  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [payFor, setPayFor] = useState<Diecast | null>(null);
  const [statusFor, setStatusFor] = useState<Diecast | null>(null);

  // Read after mount rather than in initial state: this renders on the server
  // too, and a first client render that already knew would not match.
  useEffect(() => {
    setCollapsed(readCollapsed(uid));
  }, [uid]);

  const launches = useMemo<Launch[]>(() => {
    const now = new Date();
    const out: Launch[] = [];
    for (const car of cars) {
      if (!isPreOrder(car.status)) continue;
      const due = parseDMY(car.expectedDate);
      if (!due) continue;
      const days = daysBetween(now, due);
      if (days > LEAD_DAYS || days < -OVERDUE_DAYS) continue;
      out.push({ car, due, days });
    }
    return out.sort((a, b) => a.due.getTime() - b.due.getTime());
  }, [cars]);

  const launchesCollapsed = collapsed.includes(LAUNCH_SECTION);
  const count = launches.length;

  const toggleSection = (id: string) => {
    const next = collapsed.includes(id) ? collapsed.filter((s) => s !== id) : [...collapsed, id];
    setCollapsed(next);
    try {
      window.localStorage.setItem(collapseKey(uid), JSON.stringify(next));
    } catch {
      // A browser refusing storage just means it unfolds again next visit.
    }
  };

  /** Every action opens something of its own, so the panel gets out of the way. */
  const act = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={
              count ? `Notifications — ${count} waiting` : "Notifications — nothing waiting"
            }
            title={count ? `${count} notification${count === 1 ? "" : "s"}` : "Notifications"}
          >
            <Bell className="size-4" />
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full border-2 border-background bg-violet-500 px-1 text-[9px] font-bold leading-4 text-white">
                {count > 9 ? "9+" : count}
              </span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          className="w-[min(26rem,calc(100vw-1.5rem))] max-h-[min(32rem,calc(100svh-5rem))] overflow-y-auto p-0"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
            <h2 className="text-sm font-semibold">Notifications</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close notifications"
              title="Close notifications"
              className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronUp className="size-4" />
            </button>
          </div>

          {count === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              Nothing needs you right now. Pre-orders show up here as their release date comes
              within {LEAD_DAYS} days.
            </p>
          ) : (
            <section>
              <div className="flex items-center justify-between gap-2 border-b border-border bg-violet-500/[0.06] px-3 py-2">
                <h3 className="flex min-w-0 items-center gap-2 text-xs font-semibold">
                  <span className="grid size-5 shrink-0 place-items-center rounded bg-violet-500/15 text-violet-500">
                    <PartyPopper className="size-3" />
                  </span>
                  <span className="truncate">
                    Get ready — {count === 1 ? "your pre-order is" : `${count} pre-orders are`}{" "}
                    launching
                  </span>
                </h3>
                <div className="flex shrink-0 items-center gap-1">
                  <Link
                    to="/preorders"
                    onClick={() => setOpen(false)}
                    className="text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    All
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggleSection(LAUNCH_SECTION)}
                    aria-expanded={!launchesCollapsed}
                    aria-label={
                      launchesCollapsed
                        ? "Show launching pre-orders"
                        : "Hide launching pre-orders — stays hidden next time you sign in"
                    }
                    title={launchesCollapsed ? "Show this section" : "Hide this section"}
                    className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {launchesCollapsed ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronUp className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              {!launchesCollapsed && (
                <div className="space-y-2 p-3">
                  {launches.map((l) => {
                    const balance = Math.max((l.car.spent || 0) - (l.car.paid || 0), 0);
                    const when = whenLabel(l.days);
                    return (
                      <ShipmentItem
                        key={`${l.car.id}@${l.due.toISOString().slice(0, 10)}`}
                        car={l.car}
                        thumb
                        onOpen={() => act(() => drawer.open(l.car))}
                        meta={
                          <>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <Wallet className="size-3" />
                                {l.car.seller || "Seller not recorded"}
                              </span>
                              {balance > 0 && (
                                <>
                                  <span>·</span>
                                  <span className="tabular-nums text-amber-500">
                                    {inrFull(balance)} due
                                  </span>
                                </>
                              )}
                            </div>
                            <div
                              className={`mt-0.5 text-[11px] tabular-nums ${
                                when.overdue ? "text-rose-500" : "text-violet-500"
                              }`}
                            >
                              {formatDayMonthYear(l.due)} · {when.text}
                            </div>
                          </>
                        }
                        actions={
                          <>
                            {balance > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => act(() => setPayFor(l.car))}
                                className="gap-1.5 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                              >
                                <IndianRupee className="size-3.5" />
                                Pay balance
                              </Button>
                            )}
                            <UpdateStatusButton onClick={() => act(() => setStatusFor(l.car))} />
                          </>
                        }
                      />
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </PopoverContent>
      </Popover>

      <PayBalanceDialog car={payFor} onClose={() => setPayFor(null)} />
      <StatusUpdateDialog car={statusFor} onClose={() => setStatusFor(null)} />
    </>
  );
}
