import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import {
  AlarmClock,
  Bell,
  Check,
  ChevronDown,
  ChevronUp,
  IndianRupee,
  Loader2,
  PackageCheck,
  PartyPopper,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShipmentItem } from "@/components/shipment-item";
import { UpdateStatusButton } from "@/components/update-status-button";
import { PayBalanceDialog } from "@/components/pay-balance-dialog";
import { StatusUpdateDialog, type StatusBatch } from "@/components/status-update-dialog";
import { ShippingBatchDialog } from "@/components/shipping-batch-dialog";
import { useCarDrawer } from "@/components/car-details-drawer";
import { useCars, useCarsActions, useCarsRefresh } from "@/lib/cars-store";
import { useCatalog } from "@/lib/catalog-store";
import { releasedLabel, releasesYouAreWaitingOn, type WaitingRelease } from "@/lib/released";
import { useAuth } from "@/lib/auth-store";
import { supabase } from "@/integrations/supabase/client";
import { daysBetween, formatDayMonthYear, inrFull, parseDMY } from "@/lib/format";
import { isPreOrder, STATUSES } from "@/lib/status";
import {
  groupDeliveries,
  isDueToday,
  localDay,
  needsNewDate,
  type DeliveryGroup,
} from "@/lib/delivery-watch";
import type { Diecast } from "@/lib/types";

/** How far ahead a release has to be before it stops being news. */
const LEAD_DAYS = 10;
/**
 * How far past its date a release keeps nagging. Without a floor the panel silts
 * up with pre-orders whose promised month came and went a year ago, and a notice
 * that is always there stops being read.
 */
const OVERDUE_DAYS = 30;

/** How long a closed notice is remembered. Long past anything it could be about. */
const DISMISS_TTL_MS = 180 * 86_400_000;

const SECTION = {
  approvals: "approvals",
  today: "deliveries-today",
  delayed: "deliveries-delayed",
  launches: "preorder-launch",
  released: "preorder-released",
} as const;

/** The six, so the panel can never offer a status the rest of the app has dropped. */
const STATUS_OPTIONS = STATUSES;

/** Both are per account, so two people sharing a browser differ. */
const collapseKey = (uid: string) => `dg.notifyCollapsed.${uid}`;
const dismissKey = (uid: string) => `dg.notifyDismissed.${uid}`;
const toastKey = (uid: string) => `dg.deliveryToastDay.${uid}`;

function readJson(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A browser refusing storage just means the notice returns next visit.
  }
}

/**
 * Closed notices, each with when it was closed.
 *
 * These used to be trimmed to "notices that currently exist" on every write,
 * which forgot a closed notice whenever the list it was checked against was
 * momentarily incomplete — the collection still loading, say — and it came
 * back. Now a closed notice stays closed, and only ages out long after the
 * thing it was about is over.
 */
function readDismissed(uid: string): Record<string, number> {
  const raw = readJson(dismissKey(uid));
  const now = Date.now();
  const out: Record<string, number> = {};
  if (Array.isArray(raw)) {
    // The old format: a bare list of keys.
    for (const k of raw) if (typeof k === "string") out[k] = now;
  } else if (raw && typeof raw === "object") {
    for (const [k, at] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof at === "number" && now - at < DISMISS_TTL_MS) out[k] = at;
    }
  }
  return out;
}

/**
 * A launch: one pre-order, or a whole order of them landing on the same day.
 *
 * Six cars bought together on one order line used to be six notices saying the
 * same date, and closing them was six clicks. They travel as one thing, so they
 * are announced as one thing — and a car ordered on its own is still a car.
 */
type Launch = { key: string; cars: Diecast[]; orderId: string; due: Date; days: number };

/**
 * Keys carry the date the notice is about: moving a delivery or a release makes
 * it a different piece of news, and one closed as "yes, I know" should speak up
 * again when the promise changes.
 */
const launchKey = (l: Launch) => l.key;
/** Carries the casting, so a re-release after a correction speaks up again. */
const releasedKey = (w: WaitingRelease) => `released:${w.car.id}@${w.entry.car_id}`;
const todayKey = (g: DeliveryGroup) => `today:${g.key}@${g.day}`;
const delayedKey = (g: DeliveryGroup) => `delayed:${g.key}@${g.day ?? "none"}`;
const approvalKey = (u: PendingUser) => `approve:${u.sno}`;

/** "in 3 days" / "tomorrow" / "8 days late" — the reason it is on screen. */
function whenLabel(days: number): { text: string; overdue: boolean } {
  if (days < 0) return { text: `${Math.abs(days)} days past due`, overdue: true };
  if (days === 0) return { text: "due today", overdue: false };
  if (days === 1) return { text: "due tomorrow", overdue: false };
  return { text: `due in ${days} days`, overdue: false };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type PendingUser = {
  sno: number;
  first_name: string;
  last_name: string | null;
  email_id: string;
  created_at: string;
  is_approved: boolean;
  is_owner: boolean;
  rejected_at?: string | null;
};

/** New accounts waiting for an administrator, refreshed every couple of minutes. */
function usePendingApprovals(enabled: boolean) {
  const [users, setUsers] = useState<PendingUser[]>([]);

  const load = useCallback(async () => {
    if (!enabled) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("admin_list_users");
    if (error) return;
    setUsers(
      ((data ?? []) as PendingUser[]).filter(
        (u) => !u.is_approved && !u.is_owner && !u.rejected_at,
      ),
    );
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setUsers([]);
      return;
    }
    void load();
    const id = setInterval(() => {
      if (!document.hidden) void load();
    }, 120_000);
    // Approve / Reject tapped on a push notification: the service worker says
    // so, and the request leaves the bell straight away.
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "tesoro-approval-decided") void load();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      clearInterval(id);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [enabled, load]);

  const decide = useCallback(async (u: PendingUser, approve: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("tesoro_users")
      .update(
        approve
          ? { is_approved: true, rejected_at: null }
          : { is_approved: false, rejected_at: new Date().toISOString() },
      )
      .eq("sno", u.sno);
    if (error) {
      toast.error(`Could not ${approve ? "approve" : "reject"} ${u.email_id}`, {
        description: error.message,
      });
      return false;
    }
    setUsers((prev) => prev.filter((p) => p.sno !== u.sno));
    toast.success(approve ? "Access granted" : "Request rejected", { description: u.email_id });
    return true;
  }, []);

  return { users, decide, reload: load };
}

/**
 * Everything the app wants to tell you, behind one bell: accounts waiting for
 * approval, parcels arriving today, parcels that did not, and pre-orders about
 * to launch.
 */
export function NotificationCenter() {
  const cars = useCars();
  const { catalog } = useCatalog();
  const { bulkUpdateCars } = useCarsActions();
  const { user, isGuest, isAdmin } = useAuth();
  const uid = isGuest ? "guest" : (user?.id ?? "anon");
  const drawer = useCarDrawer();

  const approvals = usePendingApprovals(isAdmin && !isGuest);

  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<Record<string, number>>({});
  const [payFor, setPayFor] = useState<Diecast | null>(null);
  const [payForOrder, setPayForOrder] = useState<{ cars: Diecast[]; label: string } | null>(null);
  const [statusFor, setStatusFor] = useState<Diecast | null>(null);
  const [statusBatch, setStatusBatch] = useState<StatusBatch | null>(null);
  const [batchFor, setBatchFor] = useState<string | null>(null);
  const [newDates, setNewDates] = useState<Record<string, string>>({});
  const [newStatuses, setNewStatuses] = useState<Record<string, string>>({});
  const [approving, setApproving] = useState<{ sno: number; approve: boolean } | null>(null);

  // Read after mount rather than in initial state: this renders on the server
  // too, and a first client render that already knew would not match.
  useEffect(() => {
    const c = readJson(collapseKey(uid));
    setCollapsed(Array.isArray(c) ? c.filter((v): v is string => typeof v === "string") : []);
    setDismissed(readDismissed(uid));
  }, [uid]);

  useEffect(() => {
    if (open) void approvals.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const today = localDay();

  const launches = useMemo<Launch[]>(() => {
    const now = new Date();
    const groups = new Map<string, Launch>();
    for (const car of cars) {
      if (!isPreOrder(car.status)) continue;
      const due = parseDMY(car.expectedDate);
      if (!due) continue;
      const days = daysBetween(now, due);
      if (days > LEAD_DAYS || days < -OVERDUE_DAYS) continue;
      // Same order, same day, one notice. The day is part of the key because
      // two cars on one order can be promised for different weeks, and those
      // are two pieces of news.
      const day = localDay(due);
      const orderId = (car.orderId || "").trim();
      const key = orderId ? `order:${orderId.toLowerCase()}@${day}` : `car:${car.id}@${day}`;
      const g = groups.get(key);
      if (g) g.cars.push(car);
      else groups.set(key, { key, cars: [car], orderId, due, days });
    }
    return [...groups.values()].sort((a, b) => a.due.getTime() - b.due.getTime());
  }, [cars]);

  const arriving = useMemo(
    () => groupDeliveries(cars.filter((c) => isDueToday(c, today))),
    [cars, today],
  );
  const late = useMemo(
    () => groupDeliveries(cars.filter((c) => needsNewDate(c, today))),
    [cars, today],
  );

  const visibleApprovals = approvals.users.filter((u) => !dismissed[approvalKey(u)]);
  const visibleArriving = arriving.filter((g) => !dismissed[todayKey(g)]);
  const visibleLate = late.filter((g) => !dismissed[delayedKey(g)]);
  const visibleLaunches = launches.filter((l) => !dismissed[launchKey(l)]);

  /**
   * Pre-orders of yours whose casting somebody has now received.
   *
   * The strongest notice in this panel: the shop has the car, so the balance is
   * about to be asked for and the status is about to change. It is derived, not
   * delivered — see released.ts — so it cannot be missed by a failed send.
   */
  const released = useMemo(() => releasesYouAreWaitingOn(cars, catalog), [cars, catalog]);
  const visibleReleased = released.filter((w) => !dismissed[releasedKey(w)]);

  const count =
    visibleApprovals.length +
    visibleArriving.length +
    visibleLate.length +
    visibleReleased.length +
    visibleLaunches.length;

  const allKeys = [
    ...visibleApprovals.map(approvalKey),
    ...visibleArriving.map(todayKey),
    ...visibleLate.map(delayedKey),
    ...visibleReleased.map(releasedKey),
    ...visibleLaunches.map(launchKey),
  ];

  // A delivery due today announces itself once a day, not only as a badge.
  useEffect(() => {
    if (!visibleArriving.length) return;
    if (readJson(toastKey(uid)) === today) return;
    writeJson(toastKey(uid), today);
    const cars = visibleArriving.reduce((n, g) => n + g.cars.length, 0);
    toast.info(
      visibleArriving.length === 1
        ? `A delivery is due today — ${plural(cars, "car")}`
        : `${visibleArriving.length} deliveries are due today`,
      {
        description: "Update the status once it arrives.",
        action: { label: "View", onClick: () => setOpen(true) },
      },
    );
  }, [visibleArriving.length, uid, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSection = (id: string) => {
    const next = collapsed.includes(id) ? collapsed.filter((s) => s !== id) : [...collapsed, id];
    setCollapsed(next);
    writeJson(collapseKey(uid), next);
  };

  const clear = (keys: string[]) => {
    const now = Date.now();
    const next = { ...readDismissed(uid) };
    for (const k of keys) next[k] = now;
    setDismissed(next);
    writeJson(dismissKey(uid), next);
  };

  /** Every action opens something of its own, so the panel gets out of the way. */
  const act = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const updateGroup = (g: DeliveryGroup) =>
    act(() => (g.shippingId ? setBatchFor(g.shippingId) : setStatusFor(g.cars[0])));

  const saveNewDate = (g: DeliveryGroup) => {
    const day = newDates[g.key];
    if (!day || day < today) {
      toast.error("Pick a date from today onwards");
      return;
    }
    const status = newStatuses[g.key] ?? "Ordered";
    bulkUpdateCars(
      g.cars.map((c) => ({
        ...c,
        expectedDate: day,
        ...(status ? { status } : {}),
      })),
      `setting a new date for ${plural(g.cars.length, "car")}`,
    );
    setNewDates((prev) => {
      const { [g.key]: _drop, ...rest } = prev;
      return rest;
    });
    setNewStatuses((prev) => {
      const { [g.key]: _drop, ...rest } = prev;
      return rest;
    });
    toast.success(`Updated: ${formatDayMonthYear(day)} · ${status}`, {
      description: g.shippingId || g.cars[0]?.name,
    });
  };

  // No bell at all when there is nothing behind it. It stays while the panel is
  // open (so clearing the last notice does not yank it out from under the
  // cursor) and while a dialog it raised is still on screen.
  if (count === 0 && !open && !payFor && !payForOrder && !statusFor && !statusBatch && !batchFor)
    return null;

  return (
    <>
      {/* The page dims behind the panel. Portalled to the body on purpose: the
          top bar sets a backdrop-filter, which makes it the containing block for
          anything fixed inside it — the overlay would cover the header only. */}
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
            title={count ? plural(count, "notification") : "Notifications"}
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
          className="w-[min(26rem,calc(100vw-1.5rem))] max-h-[min(34rem,calc(100svh-5rem))] overflow-y-auto p-0"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-popover px-3 py-2.5">
            <h2 className="text-sm font-semibold">Notifications</h2>
            <div className="flex items-center gap-1">
              {count > 0 && (
                <button
                  type="button"
                  onClick={() => clear(allKeys)}
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Close every notification — they will not come back"
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

          {count === 0 && (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              Nothing needs you right now.
            </p>
          )}

          {/* ACCOUNTS WAITING FOR APPROVAL */}
          {visibleApprovals.length > 0 && (
            <Section
              id={SECTION.approvals}
              icon={<UserPlus className="size-3" />}
              tone="sky"
              title={`${plural(visibleApprovals.length, "account")} waiting for approval`}
              collapsed={collapsed.includes(SECTION.approvals)}
              onToggle={toggleSection}
              link={{ to: "/admin", onClick: () => setOpen(false) }}
            >
              {visibleApprovals.map((u) => {
                const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
                return (
                  <div
                    key={u.sno}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1 basis-40">
                      <div className="truncate text-sm font-semibold">{name || u.email_id}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {name ? `${u.email_id} · ` : ""}joined{" "}
                        {formatDayMonthYear(u.created_at.slice(0, 10))}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {([true, false] as const).map((yes) => {
                        const busy = approving?.sno === u.sno && approving.approve === yes;
                        return (
                          <Button
                            key={String(yes)}
                            size="sm"
                            variant={yes ? "default" : "outline"}
                            className={
                              yes
                                ? "gap-1.5"
                                : "gap-1.5 border-rose-500/40 text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                            }
                            disabled={approving?.sno === u.sno}
                            onClick={async () => {
                              setApproving({ sno: u.sno, approve: yes });
                              await approvals.decide(u, yes);
                              setApproving(null);
                            }}
                          >
                            {busy ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : yes ? (
                              <Check className="size-3.5" />
                            ) : (
                              <X className="size-3.5" />
                            )}
                            {yes ? "Approve" : "Reject"}
                          </Button>
                        );
                      })}
                      <DismissButton
                        label={name || u.email_id}
                        onClick={() => clear([approvalKey(u)])}
                      />
                    </div>
                  </div>
                );
              })}
            </Section>
          )}

          {/* ARRIVING TODAY */}
          {visibleArriving.length > 0 && (
            <Section
              id={SECTION.today}
              icon={<PackageCheck className="size-3" />}
              tone="emerald"
              title={
                visibleArriving.length === 1
                  ? "A delivery is due today"
                  : `${visibleArriving.length} deliveries are due today`
              }
              collapsed={collapsed.includes(SECTION.today)}
              onToggle={toggleSection}
              link={{ to: "/orders", onClick: () => setOpen(false) }}
            >
              {visibleArriving.map((g) => (
                <GroupNotice
                  key={g.key}
                  group={g}
                  onOpen={(car) => act(() => drawer.open(car))}
                  meta={
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Arriving today — has it come?
                    </span>
                  }
                  actions={
                    <>
                      <UpdateStatusButton onClick={() => updateGroup(g)} />
                      <DismissButton
                        label={g.shippingId || "delivery"}
                        onClick={() => clear([todayKey(g)])}
                      />
                    </>
                  }
                />
              ))}
            </Section>
          )}

          {/* DELAYED — NEEDS A NEW DATE */}
          {visibleLate.length > 0 && (
            <Section
              id={SECTION.delayed}
              icon={<AlarmClock className="size-3" />}
              tone="rose"
              title={`${plural(visibleLate.length, "delivery", "deliveries")} delayed — set a new date`}
              collapsed={collapsed.includes(SECTION.delayed)}
              onToggle={toggleSection}
              link={{ to: "/orders", onClick: () => setOpen(false) }}
            >
              {visibleLate.map((g) => (
                <GroupNotice
                  key={g.key}
                  group={g}
                  onOpen={(car) => act(() => drawer.open(car))}
                  meta={
                    <span className="text-rose-500">
                      {g.day ? `Was due ${formatDayMonthYear(g.day)}` : "No expected date"}
                    </span>
                  }
                  actions={
                    <>
                      <Input
                        type="date"
                        min={today}
                        value={newDates[g.key] ?? ""}
                        onChange={(e) =>
                          setNewDates((prev) => ({ ...prev, [g.key]: e.target.value }))
                        }
                        aria-label="New estimated date"
                        className="h-8 w-auto min-w-[125px] flex-1 text-xs"
                      />
                      <Select
                        value={newStatuses[g.key] ?? "Ordered"}
                        onValueChange={(val) =>
                          setNewStatuses((prev) => ({ ...prev, [g.key]: val }))
                        }
                      >
                        <SelectTrigger
                          className="h-8 w-[95px] shrink-0 text-xs bg-background"
                          aria-label="Status"
                        >
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" disabled={!newDates[g.key]} onClick={() => saveNewDate(g)}>
                        Save date
                      </Button>
                      <DismissButton
                        label={g.shippingId || "delivery"}
                        onClick={() => clear([delayedKey(g)])}
                      />
                    </>
                  }
                />
              ))}
            </Section>
          )}

          {/* PRE-ORDERS THAT HAVE NOW SHIPPED FOR SOMEBODY */}
          {visibleReleased.length > 0 && (
            <Section
              id={SECTION.released}
              icon={<PackageCheck className="size-3" />}
              tone="emerald"
              title={
                visibleReleased.length === 1
                  ? "Your pre-order has been released"
                  : `${visibleReleased.length} of your pre-orders have been released`
              }
              collapsed={collapsed.includes(SECTION.released)}
              onToggle={toggleSection}
              link={{ to: "/preorders", onClick: () => setOpen(false) }}
            >
              {visibleReleased.map((w) => {
                const balance = Math.max((w.car.spent || 0) - (w.car.paid || 0), 0);
                return (
                  <ShipmentItem
                    key={releasedKey(w)}
                    car={w.car}
                    thumb
                    onOpen={() => act(() => drawer.open(w.car))}
                    meta={
                      <>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Wallet className="size-3" />
                            {w.car.seller
                              ? `Contact ${w.car.seller}`
                              : "No seller recorded — check where you ordered it"}
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
                        <div className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                          {releasedLabel(w.daysAgo)} · {formatDayMonthYear(w.at)}
                        </div>
                      </>
                    }
                    actions={
                      <>
                        {balance > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => act(() => setPayFor(w.car))}
                            className="gap-1.5 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                          >
                            <IndianRupee className="size-3.5" />
                            Pay balance
                          </Button>
                        )}
                        <UpdateStatusButton onClick={() => act(() => setStatusFor(w.car))} />
                        <DismissButton
                          label={w.car.name || w.car.model}
                          onClick={() => clear([releasedKey(w)])}
                        />
                      </>
                    }
                  />
                );
              })}
            </Section>
          )}

          {/* PRE-ORDERS LAUNCHING */}
          {visibleLaunches.length > 0 && (
            <Section
              id={SECTION.launches}
              icon={<PartyPopper className="size-3" />}
              tone="violet"
              title={`Get ready — ${
                visibleLaunches.length === 1
                  ? "your pre-order is"
                  : `${visibleLaunches.length} pre-orders are`
              } launching`}
              collapsed={collapsed.includes(SECTION.launches)}
              onToggle={toggleSection}
              link={{ to: "/preorders", onClick: () => setOpen(false) }}
            >
              {visibleLaunches.map((l) => {
                const [first] = l.cars;
                // An order of several stands for all of them: their total, their
                // balance, and the brand only while they agree on one.
                const many = l.cars.length > 1;
                const spent = l.cars.reduce((n, c) => n + (c.spent || 0), 0);
                const balance = l.cars.reduce(
                  (n, c) => n + Math.max((c.spent || 0) - (c.paid || 0), 0),
                  0,
                );
                // Two brands at most: an order of six from one shop is bought
                // from a couple of ranges, and the sixth name would push the
                // count off the line it belongs to.
                const brands = [...new Set(l.cars.map((c) => c.brand).filter(Boolean))].slice(0, 2);
                // What the order is called. Its shipment, when the cars agree on
                // one — that is the number you quote at the seller — and the
                // order it was bought on otherwise.
                const shipId = l.cars.every(
                  (c) => (c.shippingId || "") === (first.shippingId || ""),
                )
                  ? first.shippingId || ""
                  : "";
                const when = whenLabel(l.days);
                return (
                  <ShipmentItem
                    key={launchKey(l)}
                    car={first}
                    thumb
                    identity={many ? [plural(l.cars.length, "car"), ...brands] : undefined}
                    title={many ? shipId || l.orderId : undefined}
                    amount={many ? spent : undefined}
                    onOpen={() => act(() => drawer.open(first))}
                    meta={
                      <>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Wallet className="size-3" />
                            {first.seller || "Seller not recorded"}
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
                        {/* Only when something is owed. An order settles its
                            cars together, filling one balance then the next. */}
                        {balance > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              act(() =>
                                many
                                  ? setPayForOrder({
                                      cars: l.cars,
                                      label: shipId || l.orderId,
                                    })
                                  : setPayFor(first),
                              )
                            }
                            className="gap-1.5 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                          >
                            <IndianRupee className="size-3.5" />
                            Pay balance
                          </Button>
                        )}
                        <UpdateStatusButton
                          onClick={() =>
                            act(() =>
                              many
                                ? setStatusBatch({
                                    shippingId: l.orderId,
                                    seller: first.seller || "",
                                    items: l.cars,
                                  })
                                : setStatusFor(first),
                            )
                          }
                        />
                        <DismissButton
                          label={many ? l.orderId : first.name || first.model}
                          onClick={() => clear([launchKey(l)])}
                        />
                      </>
                    }
                  />
                );
              })}
            </Section>
          )}
        </PopoverContent>
      </Popover>

      <PayBalanceDialog
        car={payFor}
        cars={payForOrder?.cars}
        label={payForOrder?.label}
        onClose={() => {
          setPayFor(null);
          setPayForOrder(null);
        }}
      />
      <StatusUpdateDialog
        car={statusFor}
        batch={statusBatch}
        onClose={() => {
          setStatusFor(null);
          setStatusBatch(null);
        }}
      />
      <ShippingBatchDialog
        open={batchFor !== null}
        onOpenChange={(v) => !v && setBatchFor(null)}
        initialShippingId={batchFor ?? ""}
        excludeAvailable
      />
    </>
  );
}

const TONES = {
  sky: "bg-sky-500/[0.06] [&_[data-icon]]:bg-sky-500/15 [&_[data-icon]]:text-sky-500",
  emerald:
    "bg-emerald-500/[0.06] [&_[data-icon]]:bg-emerald-500/15 [&_[data-icon]]:text-emerald-500",
  rose: "bg-rose-500/[0.06] [&_[data-icon]]:bg-rose-500/15 [&_[data-icon]]:text-rose-500",
  violet: "bg-violet-500/[0.06] [&_[data-icon]]:bg-violet-500/15 [&_[data-icon]]:text-violet-500",
} as const;

/** A heading that folds its notices away, and remembers that it did. */
function Section({
  id,
  icon,
  tone,
  title,
  collapsed,
  onToggle,
  link,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  tone: keyof typeof TONES;
  title: string;
  collapsed: boolean;
  onToggle: (id: string) => void;
  link: { to: "/admin" | "/orders" | "/preorders"; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border last:border-b-0">
      <div
        className={`flex items-center justify-between gap-2 border-b border-border px-3 py-2 ${TONES[tone]}`}
      >
        <h3 className="flex min-w-0 items-center gap-2 text-xs font-semibold">
          <span data-icon className="grid size-5 shrink-0 place-items-center rounded">
            {icon}
          </span>
          <span className="truncate">{title}</span>
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            to={link.to}
            onClick={link.onClick}
            className="text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            All
          </Link>
          <button
            type="button"
            onClick={() => onToggle(id)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Show: ${title}` : `Hide: ${title}`}
            title={collapsed ? "Show this section" : "Hide this section"}
            className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </button>
        </div>
      </div>
      {!collapsed && <div className="space-y-2 p-3">{children}</div>}
    </section>
  );
}

/** One parcel: its first car, how many are with it, and what to do about it. */
function GroupNotice({
  group,
  onOpen,
  meta,
  actions,
}: {
  group: DeliveryGroup;
  onOpen: (car: Diecast) => void;
  meta: React.ReactNode;
  actions: React.ReactNode;
}) {
  const [first] = group.cars;
  const more = group.cars.length - 1;
  return (
    <ShipmentItem
      car={first}
      thumb
      onOpen={() => onOpen(first)}
      meta={
        <>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {more > 0 && (
              <span className="font-medium text-foreground">+ {plural(more, "more car")}</span>
            )}
            <span className="inline-flex items-center gap-1">
              <Wallet className="size-3" />
              {group.seller || "Seller not recorded"}
            </span>
            {group.shippingId && <span className="font-mono">{group.shippingId}</span>}
          </div>
          <div className="mt-0.5 text-[11px]">{meta}</div>
        </>
      }
      actions={actions}
    />
  );
}

function DismissButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={onClick}
      aria-label={`Close the notice for ${label}`}
      title="Close — it will not come back"
      className="size-8 shrink-0 text-muted-foreground"
    >
      <X className="size-4" />
    </Button>
  );
}
