import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Plus, Store, Calendar, IndianRupee, Truck } from "lucide-react";

import type { Diecast } from "@/lib/types";
import { useCars, useCarsActions } from "@/lib/cars-store";
import { topSellers } from "@/lib/car-prices";
import { deriveMonth, toDateInputValue } from "@/lib/date-utils";
import { inrFull } from "@/lib/format";
import { cn } from "@/lib/utils";
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
import { SegmentControl } from "@/components/segment-control";

const STATUS_CHOICES = ["Waiting", "Available", "Transit", "Pre Order"];
const PAYMENT_CHOICES = ["Paid", "Partial", "Pending"];

interface AddAnotherCarDialogProps {
  car: Diecast | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: (newCar: Diecast) => void;
}

export function AddAnotherCarDialog({
  car,
  open,
  onOpenChange,
  onAdded,
}: AddAnotherCarDialogProps) {
  const cars = useCars();
  const { addCar } = useCarsActions();

  const [seller, setSeller] = useState("");
  const [spent, setSpent] = useState<string>("");
  const [mrp, setMrp] = useState<string>("");
  const [orderDate, setOrderDate] = useState("");
  const [status, setStatus] = useState("Waiting");
  const [payment, setPayment] = useState("Paid");
  const [receivedDate, setReceivedDate] = useState("");
  const [deliveryPartner, setDeliveryPartner] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [transitInfo, setTransitInfo] = useState("");
  const [showLogistics, setShowLogistics] = useState(false);
  const [saving, setSaving] = useState(false);

  // Frequent sellers from collection
  const sellerSuggestions = useMemo(() => {
    const list = topSellers(cars);
    if (car?.seller && !list.includes(car.seller)) {
      return [car.seller, ...list].slice(0, 6);
    }
    return list.slice(0, 6);
  }, [cars, car?.seller]);

  useEffect(() => {
    if (open && car) {
      const today = new Date().toISOString().slice(0, 10);
      setSeller(car.seller || "");
      setSpent(car.spent != null ? String(Math.round(car.spent)) : "");
      setMrp(car.mrp != null ? String(Math.round(car.mrp)) : "");
      setOrderDate(today);
      setStatus("Waiting");
      setPayment("Paid");
      setReceivedDate(today);
      setDeliveryPartner("");
      setTrackingId("");
      setTransitInfo("");
      setShowLogistics(false);
      setSaving(false);
    }
  }, [open, car]);

  if (!car) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!seller.trim()) {
      toast.error("Please enter a seller name");
      return;
    }

    setSaving(true);
    try {
      const isAvailable = status.toLowerCase() === "available";
      const spentNum = Number(spent) || 0;
      const mrpNum = Number(mrp) || car.mrp || 0;

      const newCopy: Diecast = {
        ...car,
        id: "", // Will be assigned automatically by assignCarIds
        sno: undefined,
        seller: seller.trim(),
        spent: spentNum,
        mrp: mrpNum,
        orderDate: orderDate || new Date().toISOString().slice(0, 10),
        orderMonth: deriveMonth(orderDate || new Date().toISOString().slice(0, 10)),
        date: isAvailable ? receivedDate || orderDate : "",
        month: isAvailable ? deriveMonth(receivedDate || orderDate) : "",
        status,
        payment,
        paid: payment === "Paid" ? spentNum : payment === "Pending" ? 0 : spentNum / 2,
        balance: payment === "Paid" ? 0 : payment === "Pending" ? spentNum : spentNum / 2,
        deliveryPartner: deliveryPartner.trim() || undefined,
        trackingId: trackingId.trim() || undefined,
        transitInfo: transitInfo.trim(),
        shippingId: "",
        orderId: "",
        shippingCost: 0,
      };

      const added = addCar(newCopy);
      toast.success(`Added another copy of ${car.name || car.model || "car"} to collection`);
      onAdded?.(added);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to add car copy");
    } finally {
      setSaving(false);
    }
  };

  const isAvailable = status.toLowerCase() === "available";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-sm:p-4 p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Plus className="size-5 text-primary" />
            Add Another Copy
          </DialogTitle>
          <DialogDescription className="text-xs">
            Add another identical copy of this car to your collection. Enter the seller and purchase
            details below.
          </DialogDescription>
        </DialogHeader>

        {/* Compact car summary */}
        <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-muted/30 p-2.5">
          <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted/60 flex items-center justify-center">
            {car.imageUrl ? (
              <img src={car.imageUrl} alt="" className="size-full object-cover" />
            ) : (
              <Store className="size-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {car.name || `${car.make} ${car.model}`}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {[car.brand, car.series, car.carNumber ? `#${car.carNumber}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Seller Section */}
          <div className="space-y-1.5">
            <Label
              htmlFor="seller-input"
              className="text-xs font-semibold flex items-center gap-1.5"
            >
              <Store className="size-3.5 text-muted-foreground" />
              Seller Details *
            </Label>
            <Input
              id="seller-input"
              required
              autoFocus
              placeholder="Seller or store name"
              value={seller}
              onChange={(e) => setSeller(e.target.value)}
              className="h-9 text-sm"
            />
            {sellerSuggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] text-muted-foreground font-medium">Quick pick:</span>
                {sellerSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeller(s)}
                    className={cn(
                      "text-[11px] rounded-md px-2 py-0.5 border transition-all cursor-pointer",
                      seller === s
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border/70 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pricing Row: Spent & MRP */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="spent-input"
                className="text-xs font-semibold flex items-center gap-1"
              >
                <IndianRupee className="size-3.5 text-muted-foreground" />
                Spent * (INR)
              </Label>
              <Input
                id="spent-input"
                type="number"
                min="0"
                step="any"
                required
                placeholder="Amount spent"
                value={spent}
                onChange={(e) => setSpent(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mrp-input" className="text-xs font-semibold text-muted-foreground">
                Retail / MRP (INR)
              </Label>
              <Input
                id="mrp-input"
                type="number"
                min="0"
                step="any"
                placeholder="MRP"
                value={mrp}
                onChange={(e) => setMrp(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Status & Payment Controls */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Status</Label>
              <SegmentControl
                fill
                value={status}
                options={STATUS_CHOICES}
                onChange={(v) => setStatus(v)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Payment</Label>
              <SegmentControl
                fill
                value={payment}
                options={PAYMENT_CHOICES}
                onChange={(v) => setPayment(v)}
              />
            </div>
          </div>

          {/* Order date & Received date (if available) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="order-date"
                className="text-xs font-semibold flex items-center gap-1 text-muted-foreground"
              >
                <Calendar className="size-3.5" />
                Order Date
              </Label>
              <Input
                id="order-date"
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            {isAvailable ? (
              <div className="space-y-1.5">
                <Label
                  htmlFor="received-date"
                  className="text-xs font-semibold flex items-center gap-1 text-muted-foreground"
                >
                  <Calendar className="size-3.5" />
                  Received Date
                </Label>
                <Input
                  id="received-date"
                  type="date"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            ) : null}
          </div>

          {/* Optional Logistics Accordion */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowLogistics(!showLogistics)}
              className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground py-1 border-t border-border/60 cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Truck className="size-3.5" />
                Additional Logistics / Notes
              </span>
              <span className="text-[10px]">{showLogistics ? "Hide" : "Show"}</span>
            </button>
            {showLogistics && (
              <div className="space-y-3 pt-2.5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Courier</Label>
                    <Input
                      placeholder="Delhivery, Bluedart, etc."
                      value={deliveryPartner}
                      onChange={(e) => setDeliveryPartner(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Tracking ID</Label>
                    <Input
                      placeholder="Tracking / AWB #"
                      value={trackingId}
                      onChange={(e) => setTrackingId(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Notes / Transit Info</Label>
                  <Input
                    placeholder="e.g. Expected with next batch"
                    value={transitInfo}
                    onChange={(e) => setTransitInfo(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2 flex flex-row items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="h-9 text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="h-9 gap-1.5 text-xs font-semibold cursor-pointer"
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              Add copy
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
