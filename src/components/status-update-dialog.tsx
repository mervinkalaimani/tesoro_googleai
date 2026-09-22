import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  CircleDot,
  Clock,
  Hourglass,
  Loader2,
  PackageCheck,
  PauseCircle,
  Search,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Switch } from "@/components/ui/switch";
import { useCars, useCarsActions } from "@/lib/cars-store";
import { optionsFor } from "@/lib/car-options";
import { deriveMonth, monthEtaToDate, toDateInputValue } from "@/lib/date-utils";
import { DELIVERY_PARTNER_NAMES } from "@/lib/tracking";
import { TrackingLink } from "@/components/tracking-link";
import { inrFull } from "@/lib/format";
import { needsCarNumber } from "@/lib/duplicate";
import {
  STATUSES,
  iconFor,
  isInHand,
  isIso,
  isPreOrder,
  needsPurchase as statusNeedsPurchase,
  needsTransit as statusNeedsTransit,
  nextInFlow,
  normaliseStatus,
  toneFor,
  type Status,
} from "@/lib/status";
import type { Diecast } from "@/lib/types";

type NextStatus = Status;

const num = (v: string) => {
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Moves a car to a new status and records what that status implies.
 *
 * The casting is already described on the row, so none of it is asked for
 * again; it is shown, in full, so there is no doubt which car is being updated.
 * What changes with the status is everything around it — a car in transit has a
 * courier, a delivered one has an arrival date, and neither of those means
 * anything for a car still on the wishlist. Only the fields the chosen status
 * actually implies are asked for.
 *
 * This replaced a one-click "Mark <next stage>" button that moved the status
 * and nothing else, so a car could become Available with no seller and no
 * price, or Transit with no way to track it.
 */
export type StatusBatch = {
  shippingId: string;
  seller: string;
  items: Diecast[];
};

export function StatusUpdateDialog({
  car = null,
  batch = null,
  onClose,
  onDone,
}: {
  /** One car… */
  car?: Diecast | null;
  /** …or a whole shipment, moved together. */
  batch?: StatusBatch | null;
  onClose: () => void;
  onDone?: (car: Diecast) => void;
}) {
  const { updateCar, bulkUpdateCars } = useCarsActions();
  const items = batch ? batch.items : car ? [car] : [];
  // A shipment's cars travel together, so the first one speaks for the rest.
  const lead = items[0] ?? null;
  const isBatch = Boolean(batch);
  const cars = useCars();
  const sellerOptions = useMemo(() => optionsFor("seller", cars), [cars]);

  /**
   * The eight statuses, plus the one the car is on when that is something else
   * (an older spelling, "Wrong Item") — so where it stands now is on the list
   * and staying put is a choice rather than a gap.
   */
  const choices = useMemo<NextStatus[]>(() => {
    const current = normaliseStatus(lead?.status);
    const known = (STATUSES as readonly string[]).includes(current);
    return current && !known ? [current as NextStatus, ...STATUSES] : [...STATUSES];
  }, [lead?.status]);

  const [status, setStatus] = useState<NextStatus>("In Hand");
  const [seller, setSeller] = useState("");
  const [spent, setSpent] = useState("");
  const [mrp, setMrp] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [carNumber, setCarNumber] = useState("");
  const [partner, setPartner] = useState("");
  const [tracking, setTracking] = useState("");
  const [transitInfo, setTransitInfo] = useState("");
  /** Settle what is still owed as part of this update. */
  const [payBalance, setPayBalance] = useState(true);
  /** Once the switch has been touched, changing status stops resetting it. */
  const [payTouched, setPayTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Arriving or on its way usually means paid for; a pre-order usually not yet.
  useEffect(() => {
    if (!payTouched) setPayBalance(!isPreOrder(status));
  }, [status, payTouched]);

  // Reseed per car. Whatever the ISO row already knows is carried in rather
  // than asked for again — an MRP noted while wishing for it is still the MRP.
  useEffect(() => {
    const car = lead;
    if (!car) return;
    const today = new Date().toISOString().slice(0, 10);
    // Preselect where the car would normally go next, so the common case is one
    // click — the same move the old button made, just with its consequences
    // spelled out.
    setStatus(nextInFlow(car.status));
    setSeller(car.seller || "");
    setSpent(car.spent ? String(car.spent) : "");
    setMrp(car.mrp ? String(car.mrp) : "");
    setOrderDate(toDateInputValue(car.orderDate) || today);
    setExpectedDate(
      toDateInputValue(car.expectedDate) ||
        toDateInputValue(car.date) ||
        monthEtaToDate(car.transitInfo) ||
        today,
    );
    setPartner(car.deliveryPartner || "");
    setTracking(car.trackingId || "");
    setTransitInfo(car.transitInfo || "");
    setCarNumber(car.carNumber || "");
    setPayTouched(false);
    setError("");
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [car, batch?.shippingId]);

  if (!lead) return null;
  const current = lead;

  const needsPurchase = statusNeedsPurchase(status);
  const needsTransit = statusNeedsTransit(status);
  const arrived = isInHand(status);
  const title = batch
    ? batch.shippingId || batch.seller
    : current.name || `${current.make} ${current.model}`.trim() || "Unnamed car";
  const wasIso = isIso(current.status);
  const unchanged = status === normaliseStatus(current.status);
  const statusName = isInHand(status) ? "Delivered" : status;

  /** What a car has already paid towards `cost` — nothing, if it was only wished for. */
  const paidSoFar = (c: Diecast, cost: number) =>
    isIso(c.status) ? 0 : Math.min(c.paid || 0, cost);
  const outstanding = isBatch
    ? items.reduce((s, c) => s + Math.max((c.spent || 0) - paidSoFar(c, c.spent || 0), 0), 0)
    : Math.max(num(spent) - paidSoFar(current, num(spent)), 0);
  /** Paid, balance and payment label for a car costing `cost`. */
  const money = (c: Diecast, cost: number) => {
    const paid = payBalance ? cost : paidSoFar(c, cost);
    const balance = Math.max(cost - paid, 0);
    return { paid, balance, payment: balance > 0 ? (paid > 0 ? "Partial" : "Pending") : "Paid" };
  };

  const save = () => {
    if (needsPurchase) {
      if (!seller.trim()) {
        setError("Who did it come from? A seller is needed to record the purchase.");
        return;
      }
      if (!isBatch && !spent.trim()) {
        setError("What did it cost? Enter 0 if it was free.");
        return;
      }
      if (!orderDate) {
        setError("When was it ordered?");
        return;
      }
      if (!expectedDate) {
        setError(arrived ? "When did it arrive / become available?" : "When is it expected?");
        return;
      }
    }

    if (!isBatch && needsCarNumber(current.brand) && !carNumber.trim()) {
      setError(
        `${current.brand} prints a collector number on the box — enter it to update status.`,
      );
      return;
    }

    setSaving(true);
    try {
      // The arrival date only exists once the car is in hand; before that the
      // expected date carries the estimate on its own.
      const date = arrived ? expectedDate : "";

      if (isBatch) {
        // What the shipment shares is set on every car; what each car cost is
        // its own, so prices are left alone and payment follows each one.
        const nexts = items.map((c): Diecast => {
          const m = money(c, c.spent || 0);
          return {
            ...c,
            status,
            seller: needsPurchase ? seller.trim() : c.seller,
            paid: needsPurchase ? m.paid : c.paid,
            balance: needsPurchase ? m.balance : c.balance,
            payment: needsPurchase ? m.payment : c.payment,
            orderDate: needsPurchase ? orderDate : c.orderDate,
            orderMonth: needsPurchase ? deriveMonth(orderDate) || c.orderMonth : c.orderMonth,
            expectedDate: needsPurchase ? expectedDate : c.expectedDate,
            date,
            month: date ? deriveMonth(date) || c.month : "",
            transitInfo: needsTransit ? transitInfo.trim() : "",
            deliveryPartner: needsTransit ? partner.trim() || undefined : undefined,
            trackingId: needsTransit ? tracking.trim() || undefined : undefined,
          };
        });
        bulkUpdateCars(
          nexts,
          `marking ${batch?.shippingId || "the order"} ${statusName.toLowerCase()}`,
        );
        toast.success(
          `Set ${nexts.length} car${nexts.length === 1 ? "" : "s"} to ${statusName.toLowerCase()}`,
          { description: batch?.shippingId },
        );
        onDone?.(nexts[0]);
        onClose();
        return;
      }

      const car = current;
      const cost = num(spent);
      const m = money(car, cost);
      const next: Diecast = {
        ...car,
        status,
        carNumber: !isBatch && needsCarNumber(car.brand) ? carNumber.trim() : car.carNumber,
        seller: needsPurchase ? seller.trim() : car.seller,
        spent: needsPurchase ? cost : car.spent,
        mrp: mrp.trim() ? num(mrp) : car.mrp,
        // Whatever was already paid stays paid; the switch settles the rest.
        paid: needsPurchase ? m.paid : car.paid,
        balance: needsPurchase ? m.balance : car.balance,
        payment: needsPurchase ? m.payment : car.payment,
        orderDate: needsPurchase ? orderDate : car.orderDate,
        orderMonth: needsPurchase ? deriveMonth(orderDate) || car.orderMonth : car.orderMonth,
        expectedDate: needsPurchase ? expectedDate : car.expectedDate,
        date,
        month: date ? deriveMonth(date) || car.month : "",
        transitInfo: needsTransit ? transitInfo.trim() : "",
        deliveryPartner: needsTransit ? partner.trim() || undefined : undefined,
        trackingId: needsTransit ? tracking.trim() || undefined : undefined,
        // Left as it is rather than blanked: updateCar re-derives it by itself
        // when the seller or the dates move, and keeps it otherwise. Blanking
        // would renumber a car that is happily part of an existing batch.
        shippingId: car.shippingId,
      };

      updateCar(next);
      toast.success(wasIso ? "Moved off your ISO list" : "Status updated", {
        description: `${title} is now ${status.toLowerCase()}.`,
      });
      onDone?.(next);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const setExpectedIn = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setExpectedDate(d.toISOString().slice(0, 10));
  };

  const StatusIcon = iconFor(status);
  const count = choices.length;

  return (
    <Dialog
      open={Boolean(lead)}
      onOpenChange={(v) => {
        if (!v && !saving) onClose();
      }}
    >
      {/* Laid out like My Orders' order-status dialog: a compact card, the
          statuses as icon tiles, then only the fields the choice needs. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StatusIcon className={`size-4 ${toneFor(status)}`} />
            Update status
          </DialogTitle>
          <DialogDescription className="flex min-w-0 flex-wrap items-center gap-x-1.5">
            <span className={`truncate font-medium text-foreground ${batch ? "font-mono" : ""}`}>
              {title}
            </span>
            {batch && (
              <>
                <span aria-hidden>·</span>
                <span>
                  {items.length} car{items.length === 1 ? "" : "s"} from {batch.seller}
                </span>
              </>
            )}
            <span aria-hidden>·</span>
            <span>
              Now{" "}
              <span className="font-medium text-foreground">{current.status || "no status"}</span>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span className="text-xs">{error}</span>
            </div>
          )}

          {/* Every status, with the one the car is on marked. */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">New Status</Label>
            <div
              className={`grid grid-cols-3 gap-1.5 ${count > 8 ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}
            >
              {choices.map((s) => {
                const Icon = iconFor(s);
                const selected = status === s;
                const isCurrent = s.toLowerCase() === (current.status || "").trim().toLowerCase();
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    aria-pressed={selected}
                    className={`relative flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center text-xs font-medium transition-colors ${
                      selected
                        ? "border-primary bg-primary/10 font-semibold text-primary shadow-xs"
                        : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    <span className="leading-tight">{isInHand(s) ? "Delivered" : s}</span>
                    {isCurrent && (
                      <span className="text-[9px] font-semibold uppercase leading-none tracking-wide text-muted-foreground">
                        Current
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {!isBatch && needsCarNumber(current.brand) && (
            <div className="space-y-1.5">
              <Label htmlFor="status-car-number" className="text-xs">
                Car Number *
              </Label>
              <Input
                id="status-car-number"
                value={carNumber}
                onChange={(e) => setCarNumber(e.target.value)}
                placeholder="e.g. 1133 or KHMG217"
              />
              <p className="text-[11px] text-muted-foreground">
                {current.brand} collector number printed on the box.
              </p>
            </div>
          )}

          {needsPurchase && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="iso-seller" className="text-xs">
                  Seller *
                </Label>
                <Combobox
                  id="iso-seller"
                  value={seller}
                  onChange={setSeller}
                  options={sellerOptions}
                  placeholder="Who it came from"
                  searchPlaceholder="Search sellers, or type a new one…"
                  ariaLabel="Seller"
                />
              </div>

              {!isBatch && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="iso-spent" className="text-xs">
                      Cost *
                    </Label>
                    <Input
                      id="iso-spent"
                      inputMode="decimal"
                      value={spent}
                      onChange={(e) => setSpent(e.target.value)}
                      placeholder="450"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="iso-mrp" className="text-xs">
                      MRP
                    </Label>
                    <Input
                      id="iso-mrp"
                      inputMode="decimal"
                      value={mrp}
                      onChange={(e) => setMrp(e.target.value)}
                      placeholder="199"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="iso-ordered" className="text-xs">
                  Order date *
                </Label>
                <Input
                  id="iso-ordered"
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="iso-expected" className="text-xs">
                    {arrived ? "Expected / available date *" : "Expected date *"}
                  </Label>
                  <div className="flex items-center gap-1">
                    {(arrived ? [0] : [0, 3, 7]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setExpectedIn(d)}
                        className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        {d === 0 ? "Today" : `+${d}d`}
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  id="iso-expected"
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                />
              </div>

              {outstanding > 0 && (
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">Pay balance</span>
                    <span className="block text-xs text-muted-foreground">
                      {payBalance
                        ? `Records ${inrFull(outstanding)} as paid, settling ${
                            isBatch ? "every car in the order" : "the car"
                          }.`
                        : `${inrFull(outstanding)} stays outstanding.`}
                    </span>
                  </span>
                  <Switch
                    checked={payBalance}
                    onCheckedChange={(v) => {
                      setPayTouched(true);
                      setPayBalance(v);
                    }}
                    aria-label="Pay balance"
                  />
                </label>
              )}
            </>
          )}

          {needsTransit && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="iso-partner" className="text-xs">
                    Delivery partner
                  </Label>
                  <Combobox
                    id="iso-partner"
                    value={partner}
                    onChange={setPartner}
                    options={DELIVERY_PARTNER_NAMES}
                    placeholder="Courier"
                    searchPlaceholder="Search or type a courier…"
                    ariaLabel="Delivery partner"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="iso-tracking" className="text-xs">
                    Tracking ID
                  </Label>
                  <Input
                    id="iso-tracking"
                    value={tracking}
                    onChange={(e) => setTracking(e.target.value)}
                    placeholder="AWB number"
                    className="font-mono"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </div>
              <TrackingLink partner={partner} trackingId={tracking} />

              <div className="space-y-1.5">
                <Label htmlFor="iso-note" className="text-xs">
                  Notes
                </Label>
                <Input
                  id="iso-note"
                  value={transitInfo}
                  onChange={(e) => setTransitInfo(e.target.value)}
                  placeholder={"e.g. Dispatched via Bluedart, awaiting tracking scan..."}
                />
              </div>
            </>
          )}
        </div>

        {/* Cancel on the left, the action on the right, on a phone too — the
            same footer as Update order. */}
        <DialogFooter className="mt-2 flex flex-row items-center justify-between gap-2 border-t border-border pt-3 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={saving}
            className="text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={saving}
            className="min-w-0 gap-1.5"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <StatusIcon className="size-3.5" />
            )}
            <span className="truncate">
              {isBatch
                ? `Set ${items.length} car${items.length === 1 ? "" : "s"} to ${statusName}`
                : unchanged
                  ? `Save ${statusName} details`
                  : `Set to ${statusName}`}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
