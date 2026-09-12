import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2, Search } from "lucide-react";

import { CarMarks } from "@/components/car-marks";
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
import { CarThumb } from "@/components/car-thumb";
import { SegmentControl } from "@/components/segment-control";
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
  "Waiting",
  "Pre Order",
  "On Hold",
]);

/** Only a car actually moving has a courier and a consignment number. */
const NEEDS_TRANSIT = new Set<NextStatus>(["Transit", "Out for Delivery"]);

const num = (v: string) => {
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** One read-only fact about the casting. */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-xs font-medium" title={value || undefined}>
        {value || "—"}
      </dd>
    </div>
  );
}

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

  return (
    <Dialog
      open={Boolean(car)}
      onOpenChange={(v) => {
        if (!v && !saving) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-sky-500/15 text-sky-500">
              <Search className="size-3.5" />
            </span>
            Update status
          </DialogTitle>
          <DialogDescription>
            {wasIso
              ? "This car is on your ISO list. Say what happened to it and the entry moves with it — no second copy."
              : "Say where the car is now. What you are asked for depends on where it moves to."}
          </DialogDescription>
        </DialogHeader>

        {/* The whole casting, so there is no doubt which entry is being moved. */}
        <section className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex items-start gap-3">
            <CarThumb car={car} className="size-16 shrink-0 overflow-hidden rounded-md" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="truncate text-sm font-semibold">{title}</h3>
                <CarMarks car={car} primary="chase" iconClassName="size-3.5" />
              </div>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{car.id}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs">
                <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-500">
                  {car.status}
                </span>
                <ArrowRight className="size-3 text-muted-foreground" />
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                  {status}
                </span>
              </p>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3 sm:grid-cols-4">
            <Detail label="Make" value={car.make} />
            <Detail label="Model" value={car.model} />
            <Detail label="Variant" value={car.variant} />
            <Detail label="Year" value={car.year} />
            <Detail label="Brand" value={car.brand} />
            <Detail label="Assortment" value={car.assortment} />
            <Detail label="Series" value={car.series} />
            <Detail label="Sub series" value={car.subSeries} />
            <Detail label="Colour" value={car.colour} />
            <Detail label="Type" value={car.type} />
            <Detail label="Car number" value={car.carNumber} />
            <Detail label="Size" value={car.size} />
            <Detail label="MRP" value={car.mrp ? inrFull(car.mrp) : ""} />
            <Detail label="Packaging" value={car.open ? "Loose" : "Carded"} />
            <Detail label="Official" value={car.official ? "Yes" : "No"} />
            <Detail label="Added" value={car.sno ? `#${car.sno}` : ""} />
          </dl>
        </section>

        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="space-y-1.5">
          <Label>New status</Label>
          <SegmentControl
            value={status}
            onChange={setStatus}
            options={STATUS_CHOICES.map((s) => ({ value: s, label: s }))}
            className="grid w-full grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-0.5"
          />
        </div>

        {needsPurchase && (
          <section className="space-y-3 rounded-lg border border-border p-3">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Purchase
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="iso-seller">Seller *</Label>
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
                  <Label htmlFor="iso-spent">Cost *</Label>
                  <Input
                    id="iso-spent"
                    inputMode="decimal"
                    value={spent}
                    onChange={(e) => setSpent(e.target.value)}
                    placeholder="450"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="iso-mrp">MRP</Label>
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
                <Label htmlFor="iso-ordered">Order date *</Label>
                <Input
                  id="iso-ordered"
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="iso-expected">
                  {arrived ? "Arrival date *" : "Expected date *"}
                </Label>
                <Input
                  id="iso-expected"
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                />
              </div>
            </div>
            {status === "Pre Order" && spent.trim() && (
              <p className="text-xs text-muted-foreground">
                Recorded as {inrFull(num(spent))} outstanding — settle it from the pre-orders tab
                when you pay.
              </p>
            )}
          </section>
        )}

        {needsTransit && (
          <section className="space-y-3 rounded-lg border border-border p-3">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Transit
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="iso-partner">Delivery partner</Label>
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
                <Label htmlFor="iso-tracking">Tracking ID</Label>
                <Input
                  id="iso-tracking"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  placeholder="Consignment / AWB number"
                  className="font-mono"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="iso-note">Transit note</Label>
                <Input
                  id="iso-note"
                  value={transitInfo}
                  onChange={(e) => setTransitInfo(e.target.value)}
                  placeholder="Dispatch notes, hold-ups, anything worth remembering"
                />
              </div>
            </div>
            <TrackingLink partner={partner} trackingId={tracking} />
          </section>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowRight className="size-4" />
            )}
            {unchanged ? `Save ${status} details` : `Move to ${status}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
