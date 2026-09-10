import { useState, useMemo, useEffect, useRef } from "react";
import {
  Truck,
  Calendar,
  Clock,
  CheckCircle2,
  Package,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { useCars, useCarsActions, type ShippingBatchUpdates } from "@/lib/cars-store";
import { toDateInputValue } from "@/lib/date-utils";
import { DELIVERY_PARTNER_NAMES, trackingUrlFor } from "@/lib/tracking";
import type { Diecast } from "@/lib/types";

const STATUS_CHOICES = [
  { value: "keep", label: "— Keep current status —" },
  { value: "Available", label: "Available (Delivered / Received)" },
  { value: "Transit", label: "Transit (In Courier / Shipped)" },
  { value: "Pre Order", label: "Pre Order" },
  { value: "Waiting", label: "Waiting" },
  { value: "ISO", label: "ISO (In Search Of)" },
  { value: "On Hold", label: "On Hold" },
];

export interface ShippingBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialShippingId?: string;
  allowedShippingIds?: string[];
  /**
   * Where the dialog starts, not where it is stuck. A caller scoped to a list of
   * in-transit shipments opens with delivered cars hidden; the checkbox inside
   * lets the person reach them anyway. It used to be a hard exclusion, which is
   * why a batch that had already arrived could not be corrected at all.
   */
  excludeAvailable?: boolean;
  onUpdated?: (count: number, shippingId: string) => void;
}

export function ShippingBatchDialog({
  open,
  onOpenChange,
  initialShippingId = "",
  allowedShippingIds,
  excludeAvailable = false,
  onUpdated,
}: ShippingBatchDialogProps) {
  const cars = useCars();
  const { updateCarsByShippingId } = useCarsActions();

  const [selectedShippingId, setSelectedShippingId] = useState(initialShippingId);
  const [customShippingId, setCustomShippingId] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [hideDelivered, setHideDelivered] = useState(excludeAvailable);

  const [newStatus, setNewStatus] = useState("keep");
  const [newExpectedDate, setNewExpectedDate] = useState("");
  const [newTransitInfo, setNewTransitInfo] = useState("");
  const [updateTransitInfo, setUpdateTransitInfo] = useState(false);
  const [newPartner, setNewPartner] = useState("");
  const [newTrackingId, setNewTrackingId] = useState("");
  const [updateTracking, setUpdateTracking] = useState(false);

  const [showCarList, setShowCarList] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Showing delivered cars also lifts the caller's shipping-ID restriction:
  // that list was drawn from the same in-transit rows, so leaving it in place
  // would tick the box and still show nothing.
  const scopedIds = hideDelivered ? allowedShippingIds : undefined;

  // Gather unique shipping IDs with car counts and metadata
  const shippingIdStats = useMemo(() => {
    const map = new Map<string, { count: number; sellers: Set<string>; statuses: Set<string> }>();
    for (const car of cars) {
      if (hideDelivered && (car.status || "").trim().toLowerCase() === "available") {
        continue;
      }
      const id = (car.shippingId || "").trim();
      if (!id) continue;
      if (
        scopedIds &&
        !scopedIds.some((allowed) => allowed.trim().toLowerCase() === id.toLowerCase())
      ) {
        continue;
      }
      const existing = map.get(id) || {
        count: 0,
        sellers: new Set<string>(),
        statuses: new Set<string>(),
      };
      existing.count += 1;
      if (car.seller) existing.sellers.add(car.seller);
      if (car.status) existing.statuses.add(car.status);
      map.set(id, existing);
    }
    return Array.from(map.entries())
      .map(([id, stats]) => ({
        id,
        count: stats.count,
        sellers: Array.from(stats.sellers).slice(0, 2).join(", "),
        statuses: Array.from(stats.statuses),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [cars, scopedIds, hideDelivered]);

  // Reopening starts from the caller's scope again, whatever the last visit
  // left the checkbox on.
  useEffect(() => {
    if (open) setHideDelivered(excludeAvailable);
  }, [open, excludeAvailable]);

  // Synchronize when initialShippingId changes or dialog opens
  useEffect(() => {
    if (open) {
      setSuccessMessage("");
      setErrorMessage("");
      if (initialShippingId && initialShippingId.trim()) {
        const found = shippingIdStats.some(
          (s) => s.id.toLowerCase() === initialShippingId.trim().toLowerCase(),
        );
        if (found) {
          setSelectedShippingId(initialShippingId.trim());
          setUseCustom(false);
        } else if (!scopedIds) {
          setCustomShippingId(initialShippingId.trim());
          setUseCustom(true);
        } else if (shippingIdStats.length > 0) {
          setSelectedShippingId(shippingIdStats[0].id);
          setUseCustom(false);
        }
      } else if (shippingIdStats.length > 0) {
        // If current selection is not in list, select the first one
        if (!shippingIdStats.some((s) => s.id === selectedShippingId)) {
          setSelectedShippingId(shippingIdStats[0].id);
        }
        setUseCustom(false);
      } else {
        setSelectedShippingId("");
      }
    }
  }, [open, initialShippingId, shippingIdStats, selectedShippingId, scopedIds]);

  const activeShippingId = useCustom ? customShippingId.trim() : selectedShippingId.trim();

  // The cars this dialog is about — and, because the same rule is handed to the
  // store on apply, exactly the cars that will be written.
  const matchedCars = useMemo(() => {
    if (!activeShippingId) return [];
    return cars.filter((c) => {
      if (hideDelivered && (c.status || "").trim().toLowerCase() === "available") {
        return false;
      }
      return (c.shippingId || "").trim().toLowerCase() === activeShippingId.toLowerCase();
    });
  }, [cars, activeShippingId, hideDelivered]);

  // Pre-fill from whatever the batch already carries, but only when the batch
  // itself changes. Keyed on matchedCars it re-ran on every background refresh —
  // a new array identity every 15 seconds — and wiped what was half typed.
  const matchedRef = useRef(matchedCars);
  matchedRef.current = matchedCars;
  useEffect(() => {
    const batch = matchedRef.current;
    if (batch.length === 0) return;
    const first = <K extends keyof Diecast>(key: K) =>
      batch.map((c) => c[key]).find((v) => Boolean(v));

    setNewExpectedDate(toDateInputValue(String(first("expectedDate") ?? "")));
    setNewTransitInfo(String(first("transitInfo") ?? ""));
    setNewPartner(String(first("deliveryPartner") ?? ""));
    setNewTrackingId(String(first("trackingId") ?? ""));
  }, [activeShippingId, hideDelivered, open]);

  const handleQuickDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    setNewExpectedDate(d.toISOString().slice(0, 10));
  };

  const handleApply = async () => {
    if (!activeShippingId) {
      setErrorMessage("Please select or enter a Shipping ID.");
      return;
    }
    if (matchedCars.length === 0) {
      setErrorMessage(`No cars found matching Shipping ID "${activeShippingId}".`);
      return;
    }
    if (newStatus === "keep" && !newExpectedDate && !updateTransitInfo && !updateTracking) {
      setErrorMessage(
        "Please choose at least one field to update (Status, Expected Date, Tracking, or Transit Info).",
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const updates: ShippingBatchUpdates = {};
      if (newStatus !== "keep") {
        updates.status = newStatus;
      }
      if (newExpectedDate) {
        updates.expectedDate = newExpectedDate;
      }
      if (updateTransitInfo) {
        updates.transitInfo = newTransitInfo;
      }
      if (updateTracking) {
        updates.deliveryPartner = newPartner;
        updates.trackingId = newTrackingId;
      }

      // bulkUpdateCars takes whole Diecast rows, not (ids, patch): calling it
      // that way passed an array of id strings as the cars and dropped the
      // updates entirely, which is why saved changes never reached the table.
      //
      // The scope goes with it so the store writes the same set this dialog
      // counted, rather than every car sharing the ID.
      const count = await updateCarsByShippingId(activeShippingId, updates, {
        excludeAvailable: hideDelivered,
      });
      setSuccessMessage(
        `Successfully updated ${count} car${count === 1 ? "" : "s"} in shipping ID "${activeShippingId}".`,
      );
      onUpdated?.(count, activeShippingId);

      setTimeout(() => {
        onOpenChange(false);
      }, 1400);
    } catch (err) {
      setErrorMessage((err as Error)?.message || "Failed to update cars.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-border bg-background text-foreground shadow-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1 text-left">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <Truck className="size-4" />
            </div>
            <DialogTitle className="text-lg font-bold text-foreground">
              Update by Shipping ID
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Select a Shipping ID to simultaneously update the status, expected date, and transit
            notes across all matching cars.
          </DialogDescription>
        </DialogHeader>

        {successMessage ? (
          <div className="my-6 flex flex-col items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center text-emerald-400 animate-in fade-in zoom-in-95">
            <CheckCircle2 className="size-8" />
            <p className="text-sm font-semibold">{successMessage}</p>
          </div>
        ) : (
          <div className="space-y-4 py-2 text-xs">
            {errorMessage && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-rose-400">
                <AlertCircle className="size-4 shrink-0" />
                <span className="text-xs">{errorMessage}</span>
              </div>
            )}

            {/* Shipping ID Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">Select Shipping ID</label>
                {!allowedShippingIds && (
                  <button
                    type="button"
                    onClick={() => setUseCustom(!useCustom)}
                    className="text-[11px] text-primary hover:underline"
                  >
                    {useCustom ? "Choose from list" : "+ Enter custom ID"}
                  </button>
                )}
              </div>

              {useCustom ? (
                <Input
                  placeholder="e.g. FIRY/02, ANIH/PO/09..."
                  value={customShippingId}
                  onChange={(e) => setCustomShippingId(e.target.value)}
                  className="border-border bg-background text-xs text-foreground"
                />
              ) : (
                <Select value={selectedShippingId} onValueChange={setSelectedShippingId}>
                  <SelectTrigger className="border-border bg-background text-xs text-foreground">
                    <SelectValue placeholder="Select a shipping ID..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-64 border-border bg-background text-foreground">
                    {shippingIdStats.map((item) => (
                      <SelectItem key={item.id} value={item.id} className="text-xs">
                        <span className="font-mono font-bold text-amber-400">{item.id}</span>
                        <span className="ml-2 text-muted-foreground">
                          ({item.count} car{item.count === 1 ? "" : "s"}
                          {item.sellers ? ` · ${item.sellers}` : ""})
                        </span>
                      </SelectItem>
                    ))}
                    {shippingIdStats.length === 0 && (
                      <div className="p-2 text-center text-muted-foreground">
                        No shipping IDs found
                      </div>
                    )}
                  </SelectContent>
                </Select>
              )}

              {/* Delivered cars were previously filtered out with no way back,
                  so a batch that had already arrived could not be corrected —
                  its ID was not even in the list. */}
              <label className="flex cursor-pointer items-center gap-1.5 pt-0.5 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!hideDelivered}
                  onChange={(e) => setHideDelivered(!e.target.checked)}
                  className="rounded border-input bg-background text-primary"
                />
                <span>Include cars already delivered</span>
              </label>
            </div>

            {/* Matched Cars Overview Card */}
            {activeShippingId && (
              <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Package className="size-3.5 text-muted-foreground" />
                    <span className="font-semibold text-foreground">
                      {matchedCars.length} car{matchedCars.length === 1 ? "" : "s"} in{" "}
                      <span className="font-mono text-amber-400">{activeShippingId}</span>
                    </span>
                  </div>
                  {matchedCars.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowCarList(!showCarList)}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {showCarList ? "Hide cars" : "View cars"}
                      {showCarList ? (
                        <ChevronUp className="size-3" />
                      ) : (
                        <ChevronDown className="size-3" />
                      )}
                    </button>
                  )}
                </div>

                {/* Collapsible list of cars */}
                {showCarList && matchedCars.length > 0 && (
                  <div className="mt-2 max-h-36 overflow-y-auto space-y-1.5 pr-1 border-t border-border pt-2">
                    {matchedCars.map((car) => (
                      <div
                        key={car.id}
                        className="flex items-center justify-between rounded bg-muted/50 px-2 py-1 text-[11px]"
                      >
                        <div className="min-w-0 truncate pr-2">
                          <span className="font-medium text-foreground">
                            {car.name || `${car.make} ${car.model}`}
                          </span>
                          <span className="ml-1.5 text-muted-foreground">
                            ({car.brand || car.make})
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="text-muted-foreground">
                            {car.expectedDate || car.date || "No ETA"}
                          </span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground">
                            {car.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Form Updates */}
            <div className="space-y-3 pt-1">
              {/* New Status */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  Update Status for All Cars
                </label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger className="border-border bg-background text-xs text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-background text-foreground">
                    {STATUS_CHOICES.map((choice) => (
                      <SelectItem key={choice.value} value={choice.value} className="text-xs">
                        {choice.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* New Expected Date */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Calendar className="size-3.5 text-amber-400" />
                    <span>Expected / Available Date</span>
                  </label>
                  {newExpectedDate && (
                    <button
                      type="button"
                      onClick={() => setNewExpectedDate("")}
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <Input
                  type="date"
                  value={newExpectedDate}
                  onChange={(e) => setNewExpectedDate(e.target.value)}
                  className="border-border bg-background text-xs text-foreground"
                />

                {/* Quick Date Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <Clock className="size-3" /> Quick:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleQuickDate(0)}
                    className="rounded border border-border bg-muted/60 px-2 py-0.5 text-[10px] text-foreground hover:bg-muted hover:text-foreground"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDate(7)}
                    className="rounded border border-border bg-muted/60 px-2 py-0.5 text-[10px] text-foreground hover:bg-muted hover:text-foreground"
                  >
                    +7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDate(14)}
                    className="rounded border border-border bg-muted/60 px-2 py-0.5 text-[10px] text-foreground hover:bg-muted hover:text-foreground"
                  >
                    +14 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDate(30)}
                    className="rounded border border-border bg-muted/60 px-2 py-0.5 text-[10px] text-foreground hover:bg-muted hover:text-foreground"
                  >
                    +1 Month
                  </button>
                </div>
              </div>

              {/* Delivery partner + tracking ID. Together they are a link, so
                  they are set together or not at all. */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Truck className="size-3.5 text-sky-400" />
                    <span>Delivery partner &amp; tracking ID</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={updateTracking}
                      onChange={(e) => setUpdateTracking(e.target.checked)}
                      className="rounded border-input bg-background text-primary"
                    />
                    <span>Update tracking</span>
                  </label>
                </div>
                {updateTracking && (
                  <div className="space-y-1.5">
                    <Combobox
                      value={newPartner}
                      onChange={setNewPartner}
                      options={DELIVERY_PARTNER_NAMES}
                      placeholder="Courier"
                      searchPlaceholder="Search or type a courier…"
                      ariaLabel="Delivery partner"
                      className="h-9 border-border bg-background text-xs text-foreground"
                    />
                    <Input
                      placeholder="Consignment / AWB number"
                      value={newTrackingId}
                      onChange={(e) => setNewTrackingId(e.target.value)}
                      className="border-border bg-background font-mono text-xs text-foreground"
                    />
                    {trackingUrlFor(newPartner, newTrackingId) && (
                      <a
                        href={trackingUrlFor(newPartner, newTrackingId) ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5 text-[11px] text-sky-400 hover:bg-sky-500/15"
                      >
                        <span className="truncate">Track on {newPartner.trim()}</span>
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Transit Info / ETA Notes (Optional) */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Truck className="size-3.5 text-muted-foreground" />
                    <span>Transit Info / Tracking Notes</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={updateTransitInfo}
                      onChange={(e) => setUpdateTransitInfo(e.target.checked)}
                      className="rounded border-input bg-background text-primary"
                    />
                    <span>Update notes</span>
                  </label>
                </div>
                {updateTransitInfo && (
                  <Input
                    placeholder="Courier AWB, tracking code, dispatch notes..."
                    value={newTransitInfo}
                    onChange={(e) => setNewTransitInfo(e.target.value)}
                    className="border-border bg-background text-xs text-foreground"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex flex-row items-center justify-between gap-2 border-t border-border pt-3 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground"
            disabled={isSubmitting}
          >
            Cancel
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleApply}
            disabled={isSubmitting || matchedCars.length === 0}
            className="gap-1.5 bg-amber-500 text-zinc-950 font-semibold hover:bg-amber-400"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Updating {matchedCars.length} cars...
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3.5" />
                Update {matchedCars.length} Car{matchedCars.length === 1 ? "" : "s"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
