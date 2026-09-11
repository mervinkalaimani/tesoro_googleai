import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { Bell, ChevronDown, ChevronUp, IndianRupee, PartyPopper, Wallet, X } from "lucide-react";

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

/** Both lists are per account, so two people sharing a browser differ. */
const collapseKey = (uid: string) => `dg.notifyCollapsed.${uid}`;
const dismissKey = (uid: string) => `dg.notifyDismissed.${uid}`;

function readList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeList(key: string, value: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A browser refusing storage just means the notice returns next visit.
  }
}

type Launch = { car: Diecast; due: Date; days: number };

/**
 * Dismissals are keyed by car *and* date: moving a pre-order's date makes it a
 * different piece of news, and one that was cleared as "yes, I know" should say
 * so again when the promise changes.
 */
const keyOf = (l: Launch) => `${l.car.id}@${l.due.toISOString().slice(0, 10)}`;

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
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [payFor, setPayFor] = useState<Diecast | null>(null);
  const [statusFor, setStatusFor] = useState<Diecast | null>(null);

  // Read after mount rather than in initial state: this renders on the server
  // too, and a first client render that already knew would not match.
  useEffect(() => {
    setCollapsed(readList(collapseKey(uid)));
    setDismissed(readList(dismissKey(uid)));
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

  const visible = useMemo(
    () => launches.filter((l) => !dismissed.includes(keyOf(l))),
    [launches, dismissed],
  );

  const launchesCollapsed = collapsed.includes(LAUNCH_SECTION);
  const count = visible.length;

  const toggleSection = (id: string) => {
    const next = collapsed.includes(id) ? collapsed.filter((s) => s !== id) : [...collapsed, id];
    setCollapsed(next);
    writeList(collapseKey(uid), next);
  };

  /**
   * Cleared notices are remembered, but only while the thing they were about is
   * still live — the stored list is trimmed to the current set on every write,
   * so it cannot grow without bound as pre-orders come and go.
   */
  const clear = (keys: string[]) => {
    const live = new Set(launches.map(keyOf));
    const next = [...new Set([...dismissed, ...keys])].filter((k) => live.has(k));
    setDismissed(next);
    writeList(dismissKey(uid), next);
  };

  /** Every action opens something of its own, so the panel gets out of the way. */
  const act = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  // No bell at all when there is nothing behind it. A permanently present icon
  // that opens onto "nothing needs you right now" is a thing you learn not to
  // press, and then miss the day it has something — the badge is the signal, so
  // the button may as well be the badge. It stays while the panel is open (so
  // clearing the last notice does not yank it out from under the cursor) and
  // while a dialog it raised is still on screen.
  if (count === 0 && !open && !payFor && !statusFor) return null;

  return (
    <>
      {/* The page dims behind the panel. A popover floating over a busy page at
          full brightness reads as part of it; this says the panel is the thing
          you are looking at, and tapping the dimmed page closes it.

          Portalled to the body on purpose: the top bar sets a backdrop-filter,
          which makes it the containing block for anything fixed inside it — the
          overlay would cover the header and nothing else. */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/50 animate-in fade-in"
          />,
          document.body,
        )}
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
            <div className="flex items-center gap-1">
              {count > 0 && (
                <button
                  type="button"
                  onClick={() => clear(visible.map(keyOf))}
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Clear every notification"
                >
                  Clear all
                </button>
              )}
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
                  {visible.map((l) => {
                    const balance = Math.max((l.car.spent || 0) - (l.car.paid || 0), 0);
                    const when = whenLabel(l.days);
                    return (
                      <ShipmentItem
                        key={keyOf(l)}
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
                            {/* Clearing one notice is not the same as dealing
                                with the car — it stays a pre-order, it just
                                stops asking. It stays cleared until its date
                                moves. */}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => clear([keyOf(l)])}
                              aria-label={`Clear the notice for ${l.car.name || l.car.model}`}
                              title="Clear this notification"
                              className="size-8 text-muted-foreground"
                            >
                              <X className="size-4" />
                            </Button>
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
