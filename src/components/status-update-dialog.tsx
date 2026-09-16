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
import { useCars, useCarsActions } from "@/lib/cars-store";
import { optionsFor } from "@/lib/car-options";
import { deriveMonth, monthEtaToDate, toDateInputValue } from "@/lib/date-utils";
import { DELIVERY_PARTNER_NAMES } from "@/lib/tracking";
import { TrackingLink } from "@/components/tracking-link";
import { inrFull } from "@/lib/format";
import type { Diecast } from "@/lib/types";

const STATUS_CHOICES = [
  "Available",
  "Out for Delivery",
  "Transit",
  "Delayed",
  "Waiting",
  "Pre Order",
  "On Hold",
  "ISO",
] as const;
type NextStatus = (typeof STATUS_CHOICES)[number];

/**
 * The order a car normally travels in. Used only to preselect the likely next
 * step — every status stays one click away, because cars go backwards too.
 */
const STATUS_FLOW: NextStatus[] = [
  "ISO",
  "Pre Order",
  "Waiting",
  "Transit",
  "Delayed",
  "Out for Delivery",
  "Available",
];

function nextInFlow(current: string): NextStatus {
  const i = STATUS_FLOW.findIndex((s) => s.toLowerCase() === (current || "").trim().toLowerCase());
  if (i < 0 || i >= STATUS_FLOW.length - 1) return "Available";
  return STATUS_FLOW[i + 1];
}

/** Statuses that mean the car is in hand, and so have a real arrival date. */
const ARRIVED = new Set<NextStatus>(["Available"]);

/**
 * Every one of these means the car has been bought or committed to, so the
 * purchase has to be recorded: who from, what it cost, when it was ordered and
 * when it is due. "On Hold" is included because a car put on hold is still one
 * somebody is holding *for you*, at a price. ISO is not — going back on the
 * wishlist means the purchase is off.
 */
const NEEDS_PURCHASE = new Set<NextStatus>([
  "Available",
  "Out for Delivery",
  "Transit",
  "Delayed",
  "Waiting",
  "Pre Order",
  "On Hold",
]);

/** Only a car actually moving has a courier and a consignment number. */
const NEEDS_TRANSIT = new Set<NextStatus>(["Transit", "Delayed", "Out for Delivery"]);

const num = (v: string) => {
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const STATUS_ICON: Record<NextStatus, LucideIcon> = {
  Available: PackageCheck,
  "Out for Delivery": Truck,
  Transit: Clock,
  Delayed: AlertTriangle,
  Waiting: Hourglass,
  "Pre Order": CalendarClock,
  "On Hold": PauseCircle,
  ISO: Search,
};

const STATUS_TONE: Partial<Record<NextStatus, string>> = {
  Available: "text-emerald-500",
  "Out for Delivery": "text-cyan-500",
  Transit: "text-amber-500",
  Delayed: "text-rose-500",
  Waiting: "text-violet-500",
  "Pre Order": "text-sky-500",
  ISO: "text-fuchsia-500",
};

/** A status outside the eight (an older spelling) gets a plain dot. */
const iconFor = (s: string): LucideIcon => STATUS_ICON[s as NextStatus] ?? CircleDot;
const toneFor = (s: string) => STATUS_TONE[s as NextStatus] ?? "text-muted-foreground";

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
export function StatusUpdateDialog({
  car,
  onClose,
  onDone,
}: {
  car: Diecast | null;
  onClose: () => void;
  onDone?: (car: Diecast) => void;
}) {
  const { updateCar } = useCarsActions();
  const cars = useCars();
  const sellerOptions = useMemo(() => optionsFor("seller", cars), [cars]);

  /**
   * The eight statuses, plus the one the car is on when that is something else
   * (an older spelling, "Wrong Item") — so where it stands now is on the list
   * and staying put is a choice rather than a gap.
   */
  const choices = useMemo<NextStatus[]>(() => {
    const current = (car?.status || "").trim();
    const known = STATUS_CHOICES.some((s) => s.toLowerCase() === current.toLowerCase());
    return current && !known ? [current as NextStatus, ...STATUS_CHOICES] : [...STATUS_CHOICES];
  }, [car?.status]);

  const [status, setStatus] = useState<NextStatus>("Available");
  const [seller, setSeller] = useState("");
  const [spent, setSpent] = useState("");
  const [mrp, setMrp] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [partner, setPartner] = useState("");
  const [tracking, setTracking] = useState("");
  const [transitInfo, setTransitInfo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Reseed per car. Whatever the ISO row already knows is carried in rather
  // than asked for again — an MRP noted while wishing for it is still the MRP.
  useEffect(() => {
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
    setError("");
    setSaving(false);
  }, [car]);

  if (!car) return null;

  const needsPurchase = NEEDS_PURCHASE.has(status);
  const needsTransit = NEEDS_TRANSIT.has(status);
  const arrived = ARRIVED.has(status);
  const title = car.name || `${car.make} ${car.model}`.trim() || "Unnamed car";
  const wasIso = (car.status || "").trim().toLowerCase() === "iso";
  const unchanged = status === car.status;

  const save = () => {
    if (needsPurchase) {
      if (!seller.trim()) {
        setError("Who did it come from? A seller is needed to record the purchase.");
        return;
      }
      if (!spent.trim()) {
        setError("What did it cost? Enter 0 if it was free.");
        return;
      }
      if (!orderDate) {
        setError("When was it ordered?");
        return;
      }
      if (!expectedDate) {
        setError(arrived ? "When did it arrive?" : "When is it expected?");
        return;
      }
    }

    setSaving(true);
    try {
      const cost = num(spent);
      const preOrder = status === "Pre Order";
      // The arrival date only exists once the car is in hand; before that the
      // expected date carries the estimate on its own.
      const date = arrived ? expectedDate : "";

      const next: Diecast = {
        ...car,
        status,
        seller: needsPurchase ? seller.trim() : car.seller,
        spent: needsPurchase ? cost : car.spent,
        mrp: mrp.trim() ? num(mrp) : car.mrp,
        // Mirrors bulk add: a pre-order is committed to but not paid off.
        paid: needsPurchase ? (preOrder ? 0 : cost) : car.paid,
        balance: needsPurchase ? (preOrder ? cost : 0) : car.balance,
        payment: needsPurchase ? (preOrder ? "Partial" : "Paid") : car.payment,
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
      open={Boolean(car)}
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
            <span className="truncate font-medium text-foreground">{title}</span>
            <span aria-hidden>·</span>
            <span>
              Now <span className="font-medium text-foreground">{car.status || "no status"}</span>
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
                const current = s.toLowerCase() === (car.status || "").trim().toLowerCase();
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
                    <span className="leading-tight">{s === "Available" ? "Delivered" : s}</span>
                    {current && (
                      <span className="text-[9px] font-semibold uppercase leading-none tracking-wide text-muted-foreground">
                        Current
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

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
                    {arrived ? "Delivery date *" : "Expected date *"}
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

              {status === "Pre Order" && spent.trim() && (
                <p className="text-xs text-muted-foreground">
                  Recorded as {inrFull(num(spent))} outstanding — settle it from the pre-orders tab
                  when you pay.
                </p>
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
                  placeholder={
                    status === "Delayed"
                      ? "e.g. Courier hub delay, customs hold, weather..."
                      : status === "Out for Delivery"
                        ? "e.g. Out with delivery agent, expected by evening..."
                        : "e.g. Dispatched via Bluedart, awaiting tracking scan..."
                  }
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <StatusIcon className="size-4" />
            )}
            {unchanged
              ? `Save ${status === "Available" ? "Delivered" : status} details`
              : `Set to ${status === "Available" ? "Delivered" : status}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
