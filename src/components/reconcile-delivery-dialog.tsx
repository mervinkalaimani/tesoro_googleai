import { useEffect, useState } from "react";
import {
  AlertCircle,
  Clock,
  Loader2,
  PackageCheck,
  Truck,
  AlertTriangle,
  Calendar,
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
import { Checkbox } from "@/components/ui/checkbox";
import { SegmentControl } from "@/components/segment-control";
import { useCarsActions } from "@/lib/cars-store";
import { toDateInputValue } from "@/lib/date-utils";
import { inrFull } from "@/lib/format";
import type { Diecast } from "@/lib/types";

export type ReconcileTarget = {
  shippingId: string;
  seller: string;
  items: Diecast[];
};

export type OrderStatusChoice = "Out for Delivery" | "Delayed" | "Available" | "Transit";

const ORDER_STATUS_OPTIONS: { value: OrderStatusChoice; label: string; icon: typeof Truck }[] = [
  { value: "Out for Delivery", label: "Out for Delivery", icon: Truck },
  { value: "Delayed", label: "Delayed", icon: AlertTriangle },
  { value: "Available", label: "Delivered", icon: PackageCheck },
  { value: "Transit", label: "In Transit", icon: Clock },
];

/** Leave the money alone, settle what is owed, or wipe the figure entirely. */
type PaymentMode = "keep" | "settle" | "clear";

const PAYMENT_OPTIONS = [
  { value: "keep" as const, label: "Leave" },
  { value: "settle" as const, label: "Settle" },
  { value: "clear" as const, label: "Clear" },
];

/**
 * Updates an order/shipment status to Out for Delivery, Delayed, Delivered (Available), or Transit.
 */
export function ReconcileDeliveryDialog({
  target,
  onClose,
  onDone,
}: {
  target: ReconcileTarget | null;
  onClose: () => void;
  onDone?: (count: number) => void;
}) {
  const { updateCarsByShippingId } = useCarsActions();
  const [status, setStatus] = useState<OrderStatusChoice>("Out for Delivery");
  const [date, setDate] = useState("");
  const [transitNote, setTransitNote] = useState("");
  const [clearTransit, setClearTransit] = useState(true);
  const [payment, setPayment] = useState<PaymentMode>("keep");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const items = target?.items ?? [];
  const outstanding = items.reduce((s, c) => s + Math.max((c.spent || 0) - (c.paid || 0), 0), 0);
  const paidSoFar = items.reduce((s, c) => s + (c.paid || 0), 0);

  useEffect(() => {
    if (!target) return;
    const currentStatus = (items[0]?.status || "").toLowerCase();
    if (currentStatus === "transit") {
      setStatus("Out for Delivery");
    } else if (currentStatus === "delayed") {
      setStatus("Delayed");
    } else if (currentStatus === "out for delivery") {
      setStatus("Available");
    } else {
      setStatus("Out for Delivery");
    }

    const expected = items.map((c) => c.expectedDate).find(Boolean);
    const existingNote = items.map((c) => c.transitInfo).find(Boolean) || "";
    setDate(toDateInputValue(expected) || new Date().toISOString().slice(0, 10));
    setTransitNote(existingNote);
    setClearTransit(true);
    setPayment(outstanding > 0 ? "settle" : "keep");
    setError("");
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.shippingId]);

  if (!target) return null;

  const handleDatePreset = (daysFromNow: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    setDate(d.toISOString().slice(0, 10));
  };

  const save = async () => {
    if (!date && status === "Available") {
      setError("Pick the date the shipment arrived.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      let count = 0;
      if (status === "Available") {
        count = await updateCarsByShippingId(
          target.shippingId,
          {
            status: "Available",
            date,
            ...(clearTransit ? { transitInfo: "", deliveryPartner: "", trackingId: "" } : {}),
            ...(payment === "keep" ? {} : { payment }),
          },
          {
            excludeAvailable: true,
            label: `delivering ${target.shippingId}`,
          },
        );
        toast.success(`Marked ${count} car${count === 1 ? "" : "s"} delivered`, {
          description: target.shippingId,
        });
      } else if (status === "Delayed") {
        count = await updateCarsByShippingId(
          target.shippingId,
          {
            status: "Delayed",
            expectedDate: date,
            transitInfo: transitNote || "Delayed shipment",
          },
          {
            label: `delaying ${target.shippingId}`,
          },
        );
        toast.success(`Marked ${count} car${count === 1 ? "" : "s"} delayed`, {
          description: `Expected: ${date}`,
        });
      } else if (status === "Out for Delivery") {
        count = await updateCarsByShippingId(
          target.shippingId,
          {
            status: "Out for Delivery",
            expectedDate: date,
            ...(transitNote ? { transitInfo: transitNote } : {}),
          },
          {
            label: `updating ${target.shippingId} out for delivery`,
          },
        );
        toast.success(`Marked ${count} car${count === 1 ? "" : "s"} out for delivery`, {
          description: target.shippingId,
        });
      } else {
        count = await updateCarsByShippingId(
          target.shippingId,
          {
            status: "Transit",
            expectedDate: date,
            ...(transitNote ? { transitInfo: transitNote } : {}),
          },
          {
            label: `updating ${target.shippingId} transit`,
          },
        );
        toast.success(`Updated ${count} car${count === 1 ? "" : "s"} in transit`, {
          description: target.shippingId,
        });
      }

      onDone?.(count);
      onClose();
    } catch (err) {
      setError((err as Error)?.message || "Could not update order status.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(v) => {
        if (!v && !saving) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {status === "Available" && <PackageCheck className="size-4 text-emerald-500" />}
            {status === "Out for Delivery" && <Truck className="size-4 text-cyan-500" />}
            {status === "Delayed" && <AlertTriangle className="size-4 text-rose-500" />}
            {status === "Transit" && <Clock className="size-4 text-amber-500" />}
            Update Order Status
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono font-medium">{target.shippingId}</span> · {items.length} car
            {items.length === 1 ? "" : "s"} from {target.seller}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span className="text-xs">{error}</span>
            </div>
          )}

          {/* Status Segmented Buttons */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">New Status</Label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {ORDER_STATUS_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = status === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setStatus(opt.value);
                      if (opt.value === "Out for Delivery" && !date) {
                        setDate(new Date().toISOString().slice(0, 10));
                      }
                    }}
                    className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center text-xs font-medium transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary font-semibold shadow-xs"
                        : "border-border bg-background hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    <span className="leading-tight">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status-specific fields */}
          {status === "Available" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="reconcile-date">Delivery date</Label>
                <Input
                  id="reconcile-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Recorded as the arrival date on every car in the batch.
                </p>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-3">
                <Checkbox
                  checked={clearTransit}
                  onCheckedChange={(v) => setClearTransit(Boolean(v))}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Clear transit info</span>
                  <span className="block text-xs text-muted-foreground">
                    Drops the note, courier and tracking number.
                  </span>
                </span>
              </label>

              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">Payment status</span>
                  <SegmentControl
                    value={payment}
                    onChange={setPayment}
                    options={PAYMENT_OPTIONS}
                    className="h-8 text-xs"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {payment === "settle"
                    ? `Records the full cost as paid, clearing ${inrFull(outstanding)} still owed.`
                    : payment === "clear"
                      ? `Resets the paid amount to nothing. ${inrFull(paidSoFar)} already recorded will be lost.`
                      : outstanding > 0
                        ? `${inrFull(outstanding)} stays outstanding.`
                        : "Nothing is outstanding on this batch."}
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Date selection for Delayed, Out for Delivery, or Transit */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="order-eta" className="text-xs">
                    {status === "Delayed"
                      ? "Revised Expected Date"
                      : status === "Out for Delivery"
                        ? "Expected Delivery (Today)"
                        : "Expected Date"}
                  </Label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleDatePreset(0)}
                      className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDatePreset(3)}
                      className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      +3d
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDatePreset(7)}
                      className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      +7d
                    </button>
                  </div>
                </div>
                <Input
                  id="order-eta"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              {/* Reason / Transit note */}
              <div className="space-y-1.5">
                <Label htmlFor="transit-note" className="text-xs">
                  {status === "Delayed"
                    ? "Delay Reason / Note"
                    : status === "Out for Delivery"
                      ? "Delivery Instructions / Courier Note"
                      : "Transit Note"}
                </Label>
                <Input
                  id="transit-note"
                  placeholder={
                    status === "Delayed"
                      ? "e.g. Courier hub delay, customs hold, weather..."
                      : status === "Out for Delivery"
                        ? "e.g. Out with delivery agent, expected by evening..."
                        : "e.g. Dispatched via Bluedart, awaiting tracking scan..."
                  }
                  value={transitNote}
                  onChange={(e) => setTransitNote(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving} className="gap-1.5">
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : status === "Available" ? (
              <PackageCheck className="size-4" />
            ) : status === "Delayed" ? (
              <AlertTriangle className="size-4" />
            ) : status === "Out for Delivery" ? (
              <Truck className="size-4" />
            ) : (
              <Clock className="size-4" />
            )}
            Set {items.length} car{items.length === 1 ? "" : "s"} to {status}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
