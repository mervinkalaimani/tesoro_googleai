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
import { IosGroup, IosInput, IosPicker, IosRow } from "@/components/ios-field";
import { Label } from "@/components/ui/label";
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
  statusLabel,
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
const FLOW_ORDER: NextStatus[] = ["ISO", "PO", "Ordered", "In Transit", "In Hand"];

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
  // The way an order goes, left to right; anything else the car is on (an older
  // spelling) leads the line so staying put is still a choice. On Hold is not a step.
  const flow = [
    ...choices.filter((s) => s !== "On Hold" && !FLOW_ORDER.includes(s)),
    ...FLOW_ORDER.filter((s) => choices.includes(s)),
  ];
  const hold = choices.includes("On Hold") ? ("On Hold" as NextStatus) : null;
  const flowIndex = flow.indexOf(status);
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

  // An order that is already placed has its seller and order date: those are facts
  // about the order, edited under Edit order, not asked again with every status.
  const placed =
    isBatch && items.every((c) => !isIso(c.status) && Boolean(c.seller) && Boolean(c.orderDate));
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
            seller: needsPurchase && !placed ? seller.trim() : c.seller,
            paid: needsPurchase ? m.paid : c.paid,
            balance: needsPurchase ? m.balance : c.balance,
            payment: needsPurchase ? m.payment : c.payment,
            orderDate: needsPurchase && !placed ? orderDate : c.orderDate,
            orderMonth:
              needsPurchase && !placed ? deriveMonth(orderDate) || c.orderMonth : c.orderMonth,
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
      toast.success(wasIso ? "Moved off your wishlist" : "Status updated", {
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

          {/* Where it is on the way, in one line: the steps up to the chosen one
              fill in. On Hold sits off to the side, it is not a step. */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">New Status</Label>
            <ol className="flex items-start" aria-label="New status">
              {flow.map((s, i) => {
                const Icon = iconFor(s);
                const selected = status === s;
                const reached = flowIndex >= i;
                const isCurrent = s.toLowerCase() === (current.status || "").trim().toLowerCase();
                return (
                  <li key={s} className="relative flex min-w-0 flex-1 flex-col items-center">
                    {i > 0 && (
                      <span
                        aria-hidden
                        className={`absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 ${
                          reached ? "bg-primary" : "bg-border"
                        }`}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setStatus(s)}
                      aria-pressed={selected}
                      className="group relative flex min-w-0 flex-col items-center gap-1"
                    >
                      <span
                        className={`grid size-8 place-items-center rounded-full border-2 transition-colors ${
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : reached
                              ? "border-primary bg-background text-primary"
                              : "border-border bg-background text-muted-foreground group-hover:border-primary/50"
                        }`}
                      >
                        <Icon className="size-3.5" />
                      </span>
                      <span
                        className={`text-center text-[11px] leading-tight ${
                          selected ? "font-semibold text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {isInHand(s) ? "Delivered" : statusLabel(s)}
                      </span>
                      {isCurrent && (
                        <span className="text-[9px] font-semibold uppercase leading-none tracking-wide text-muted-foreground">
                          Now
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
              {hold && (
                <li className="ml-2 flex shrink-0 flex-col items-center border-l border-border pl-2">
                  <button
                    type="button"
                    onClick={() => setStatus(hold)}
                    aria-pressed={status === hold}
                    className="group flex flex-col items-center gap-1"
                  >
                    <span
                      className={`grid size-8 place-items-center rounded-full border-2 border-dashed transition-colors ${
                        status === hold
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground group-hover:border-primary/50"
                      }`}
                    >
                      {(() => {
                        const HoldIcon = iconFor(hold);
                        return <HoldIcon className="size-3.5" />;
                      })()}
                    </span>
                    <span
                      className={`text-[11px] leading-tight ${
                        status === hold ? "font-semibold text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {statusLabel(hold)}
                    </span>
                    {current.status?.toLowerCase() === "on hold" && (
                      <span className="text-[9px] font-semibold uppercase leading-none tracking-wide text-muted-foreground">
                        Now
                      </span>
                    )}
                  </button>
                </li>
              )}
            </ol>
          </div>

          {!isBatch && needsCarNumber(current.brand) && (
            <div className="space-y-1">
              <IosGroup>
                <IosRow label="Car number *">
                  <IosInput
                    label="Car number"
                    placeholder="e.g. 1133 or KHMG217"
                    value={carNumber}
                    onChange={setCarNumber}
                  />
                </IosRow>
              </IosGroup>
              <p className="px-1 text-xs text-muted-foreground">
                {current.brand} collector number printed on the box.
              </p>
            </div>
          )}

          {needsPurchase && (
            <>
              <div className="space-y-2">
                <IosGroup>
                  {!placed && (
                    <IosRow label="Seller *">
                      <IosPicker
                        label="Seller"
                        allowNew
                        placeholder="Who it came from"
                        value={seller}
                        onChange={setSeller}
                        options={sellerOptions.map((v) => ({ value: v, label: v }))}
                      />
                    </IosRow>
                  )}
                  {!isBatch && (
                    <>
                      <IosRow label="Cost *">
                        <IosInput
                          label="Cost"
                          inputMode="decimal"
                          placeholder="450"
                          value={spent}
                          onChange={setSpent}
                        />
                      </IosRow>
                      <IosRow label="MRP">
                        <IosInput
                          label="MRP"
                          inputMode="decimal"
                          placeholder="199"
                          value={mrp}
                          onChange={setMrp}
                        />
                      </IosRow>
                    </>
                  )}
                  {!placed && (
                    <IosRow label="Order date *">
                      <IosInput
                        type="date"
                        label="Order date"
                        value={orderDate}
                        onChange={setOrderDate}
                      />
                    </IosRow>
                  )}
                  <IosRow label={arrived ? "Available date *" : "Expected date *"}>
                    <IosInput
                      type="date"
                      label="Expected date"
                      value={expectedDate}
                      onChange={setExpectedDate}
                    />
                  </IosRow>
                </IosGroup>
                <div className="flex flex-wrap items-center gap-1.5 px-1">
                  {(arrived ? [0] : [0, 3, 7]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setExpectedIn(d)}
                      className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      {d === 0 ? "Today" : `+${d} days`}
                    </button>
                  ))}
                </div>
              </div>

              {outstanding > 0 && (
                <div className="space-y-1">
                  <IosGroup>
                    <IosRow label="Pay balance">
                      <Switch
                        checked={payBalance}
                        onCheckedChange={(v) => {
                          setPayTouched(true);
                          setPayBalance(v);
                        }}
                        aria-label="Pay balance"
                      />
                    </IosRow>
                  </IosGroup>
                  <p className="px-1 text-xs text-muted-foreground">
                    {payBalance
                      ? `Records ${inrFull(outstanding)} as paid, settling ${
                          isBatch ? "every car in the order" : "the car"
                        }.`
                      : `${inrFull(outstanding)} stays outstanding.`}
                  </p>
                </div>
              )}
            </>
          )}

          {needsTransit && (
            <>
              <div className="space-y-2">
                <IosGroup>
                  <IosRow label="Courier">
                    <IosPicker
                      label="Delivery partner"
                      placeholder="Select"
                      allowNew
                      clearable
                      value={partner}
                      onChange={setPartner}
                      options={DELIVERY_PARTNER_NAMES.map((n) => ({ value: n, label: n }))}
                    />
                  </IosRow>
                  <IosRow label="Tracking ID">
                    <IosInput
                      label="Tracking ID"
                      placeholder="AWB number"
                      autoComplete="off"
                      value={tracking}
                      onChange={setTracking}
                    />
                  </IosRow>
                </IosGroup>
                <div className="px-1">
                  <TrackingLink partner={partner} trackingId={tracking} />
                </div>
              </div>

              <IosGroup>
                <IosRow label="Notes">
                  <IosInput
                    label="Notes"
                    placeholder="e.g. Dispatched via Bluedart"
                    value={transitInfo}
                    onChange={setTransitInfo}
                  />
                </IosRow>
              </IosGroup>
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
