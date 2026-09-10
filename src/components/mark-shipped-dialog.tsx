import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Truck } from "lucide-react";
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
import { useCarsActions } from "@/lib/cars-store";
import { deriveMonth, monthEtaToDate, toDateInputValue } from "@/lib/date-utils";
import { DELIVERY_PARTNER_NAMES, trackingUrlFor } from "@/lib/tracking";
import type { Diecast } from "@/lib/types";

/**
 * Moves a pre-order into transit, and collects the three things that make the
 * shipment findable while it is on its way: when it is due, who is carrying it,
 * and the consignment number.
 *
 * A pre-order arriving used to be a single unconfirmed click that set the status
 * and nothing else — the courier and consignment number had no column to go in,
 * so people typed them into the ETA note where nothing could use them. Asking
 * once, here, is what turns them into a link.
 */
export function MarkShippedDialog({ car, onClose }: { car: Diecast | null; onClose: () => void }) {
  const { updateCar } = useCarsActions();
  const [expectedDate, setExpectedDate] = useState("");
  const [partner, setPartner] = useState("");
  const [tracking, setTracking] = useState("");
  const [saving, setSaving] = useState(false);

  // Reseed whenever a different car opens the dialog. The expected date falls
  // back to the release month recorded in the ETA note ("Mar 2027"), which is
  // the only guess most pre-orders ever carried.
  useEffect(() => {
    if (!car) return;
    setExpectedDate(toDateInputValue(car.expectedDate) || monthEtaToDate(car.transitInfo) || "");
    setPartner(car.deliveryPartner || "");
    setTracking(car.trackingId || "");
    setSaving(false);
  }, [car]);

  if (!car) return null;

  const trackUrl = trackingUrlFor(partner, tracking);
  const hasTracking = Boolean(tracking.trim());

  const save = () => {
    setSaving(true);
    try {
      const iso = expectedDate.trim();
      const today = new Date().toISOString().slice(0, 10);
      updateCar({
        ...car,
        status: "Transit",
        expectedDate: iso,
        deliveryPartner: partner.trim() || undefined,
        trackingId: tracking.trim() || undefined,
        // A pre-order that never recorded when it was placed gets today, so it
        // still sorts and still earns a shipping ID.
        orderDate: car.orderDate || today,
        orderMonth: car.orderMonth || deriveMonth(today) || "",
      });
      toast.success("Moved to transit", {
        description: [car.name || car.model, partner.trim()].filter(Boolean).join(" · "),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={Boolean(car)}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="size-4 text-sky-500" />
            Mark shipped
          </DialogTitle>
          <DialogDescription className="truncate">
            {car.name || `${car.make} ${car.model}`.trim() || "Unnamed car"}
            {car.seller ? ` · ${car.seller}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ship-expected">Expected date</Label>
            <Input
              id="ship-expected"
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
            />
            {!expectedDate && (car.transitInfo || "").trim() ? (
              <p className="text-xs text-muted-foreground">
                Recorded ETA: “{car.transitInfo.trim()}”
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ship-partner">Delivery partner</Label>
            <Combobox
              id="ship-partner"
              value={partner}
              onChange={setPartner}
              options={DELIVERY_PARTNER_NAMES}
              placeholder="Who is carrying it?"
              searchPlaceholder="Search or type a courier…"
              ariaLabel="Delivery partner"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ship-tracking">Tracking ID</Label>
            <Input
              id="ship-tracking"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="Consignment / AWB number"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
          </div>

          {/* The point of storing the partner separately: the two fields
              together are a link, and this is where that becomes visible. */}
          {trackUrl ? (
            <a
              href={trackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-500 hover:bg-sky-500/15"
            >
              <span className="truncate">Track on {partner.trim()}</span>
              <ExternalLink className="size-3.5 shrink-0" />
            </a>
          ) : hasTracking ? (
            <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {partner.trim()
                ? `No public tracking page is known for “${partner.trim()}”, so the number is stored for reference only.`
                : "Add the delivery partner and this number becomes a tracking link."}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />}
            Mark shipped
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
