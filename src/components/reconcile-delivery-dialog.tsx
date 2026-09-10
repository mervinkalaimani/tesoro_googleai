import { useEffect, useState } from "react";
import { AlertCircle, Loader2, PackageCheck } from "lucide-react";
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

/** Leave the money alone, settle what is owed, or wipe the figure entirely. */
type PaymentMode = "keep" | "settle" | "clear";

const PAYMENT_OPTIONS = [
  { value: "keep" as const, label: "Leave" },
  { value: "settle" as const, label: "Settle" },
  { value: "clear" as const, label: "Clear" },
];

/**
 * Marks a whole shipment as arrived.
 *
 * Reconciling used to be one unconfirmed click that stamped today's date on
 * every car in the batch. A parcel that turns up on Monday and gets logged on
 * Thursday was recorded as arriving on Thursday, and there was no way to say
 * otherwise — nor to deal with the two things that are always stale once a box
 * is open: the transit note, and a balance that was due on delivery.
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
  const [date, setDate] = useState("");
  const [clearTransit, setClearTransit] = useState(true);
  const [payment, setPayment] = useState<PaymentMode>("keep");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const items = target?.items ?? [];
  const outstanding = items.reduce((s, c) => s + Math.max((c.spent || 0) - (c.paid || 0), 0), 0);
  const paidSoFar = items.reduce((s, c) => s + (c.paid || 0), 0);

  useEffect(() => {
    if (!target) return;
    // The expected date is the best guess available at the moment a parcel is
    // being logged, and is usually within a day of when it actually landed.
    const expected = items.map((c) => c.expectedDate).find(Boolean);
    setDate(toDateInputValue(expected) || new Date().toISOString().slice(0, 10));
    setClearTransit(true);
    // Only offer to settle when there is in fact something outstanding —
    // otherwise the safe option is the one already selected.
    setPayment(outstanding > 0 ? "settle" : "keep");
    setError("");
    setSaving(false);
    // Reseeding is keyed on the batch, not on its contents, which change as the
    // update lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.shippingId]);

  if (!target) return null;

  const save = async () => {
    if (!date) {
      setError("Pick the date the shipment arrived.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const count = await updateCarsByShippingId(
        target.shippingId,
        {
          status: "Available",
          date,
          ...(clearTransit ? { transitInfo: "", deliveryPartner: "", trackingId: "" } : {}),
          ...(payment === "keep" ? {} : { payment }),
        },
        {
          // Delivered cars are the point of this dialog's *result*, not its
          // input: re-reconciling a batch that is already Available would only
          // restamp its date.
          excludeAvailable: true,
          label: `reconciling ${target.shippingId}`,
        },
      );
      toast.success(`Reconciled ${count} car${count === 1 ? "" : "s"}`, {
        description: target.shippingId,
      });
      onDone?.(count);
      onClose();
    } catch (err) {
      setError((err as Error)?.message || "Could not reconcile the shipment.");
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="size-4 text-emerald-500" />
            Reconcile delivery
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono">{target.shippingId}</span> · {items.length} car
            {items.length === 1 ? "" : "s"} from {target.seller}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span className="text-xs">{error}</span>
            </div>
          )}

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
              <span className="block text-sm font-medium">Clear the transit info</span>
              <span className="block text-xs text-muted-foreground">
                Drops the note, courier and tracking number. They describe a journey that is over.
              </span>
            </span>
          </label>

          <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">Paid</span>
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
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving} className="gap-1.5">
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PackageCheck className="size-4" />
            )}
            Mark {items.length} car{items.length === 1 ? "" : "s"} delivered
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
