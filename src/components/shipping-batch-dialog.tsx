import { useState, useMemo, useEffect } from "react";
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
import { useCars, useCarsActions } from "@/lib/cars-store";
import { toDateInputValue } from "@/lib/date-utils";
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
  excludeAvailable?: boolean;
  onUpdated?: (count: number, shippingId: string) => void;
}

export function ShippingBatchDialog({
  open,
  onOpenChange,
  initialShippingId = "",
  allowedShippingIds,
  excludeAvailable = true,
  onUpdated,
}: ShippingBatchDialogProps) {
  const cars = useCars();
  const { updateCarsByShippingId } = useCarsActions();

  const [selectedShippingId, setSelectedShippingId] = useState(initialShippingId);
  const [customShippingId, setCustomShippingId] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  const [newStatus, setNewStatus] = useState("keep");
  const [newExpectedDate, setNewExpectedDate] = useState("");
  const [newTransitInfo, setNewTransitInfo] = useState("");
  const [updateTransitInfo, setUpdateTransitInfo] = useState(false);

  const [showCarList, setShowCarList] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Gather unique shipping IDs with car counts and metadata
  // Automatically excludes cars with status "Available" if excludeAvailable is true
  const shippingIdStats = useMemo(() => {
    const map = new Map<string, { count: number; sellers: Set<string>; statuses: Set<string> }>();
    for (const car of cars) {
      if (excludeAvailable && (car.status || "").trim().toLowerCase() === "available") {
        continue;
      }
      const id = (car.shippingId || "").trim();
      if (!id) continue;
      if (
        allowedShippingIds &&
        !allowedShippingIds.some((allowed) => allowed.trim().toLowerCase() === id.toLowerCase())
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
  }, [cars, allowedShippingIds, excludeAvailable]);

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
        } else if (!allowedShippingIds) {
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
  }, [open, initialShippingId, shippingIdStats, selectedShippingId, allowedShippingIds]);

  const activeShippingId = useCustom ? customShippingId.trim() : selectedShippingId.trim();

  // Find matching cars for the active shipping ID (excluding Available cars if excludeAvailable is true)
  const matchedCars = useMemo(() => {
    if (!activeShippingId) return [];
    return cars.filter((c) => {
      if (excludeAvailable && (c.status || "").trim().toLowerCase() === "available") {
        return false;
      }
      return (c.shippingId || "").trim().toLowerCase() === activeShippingId.toLowerCase();
    });
  }, [cars, activeShippingId, excludeAvailable]);

  // When active shipping ID changes, pre-fill common current values
  useEffect(() => {
    if (matchedCars.length > 0) {
      // Find most common expected date
      const dates = matchedCars.map((c) => c.expectedDate).filter(Boolean);
      if (dates.length > 0) {
        setNewExpectedDate(toDateInputValue(dates[0]));
      } else {
        setNewExpectedDate("");
      }

      // Find common transit info
      const infos = matchedCars.map((c) => c.transitInfo).filter(Boolean);
      if (infos.length > 0) {
        setNewTransitInfo(infos[0]);
      } else {
        setNewTransitInfo("");
      }
    }
  }, [matchedCars]);

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
    if (newStatus === "keep" && !newExpectedDate && !updateTransitInfo) {
      setErrorMessage(
        "Please choose at least one field to update (Status, Expected Date, or Transit Info).",
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const updates: { status?: string; expectedDate?: string; transitInfo?: string } = {};
      if (newStatus !== "keep") {
        updates.status = newStatus;
      }
      if (newExpectedDate) {
        updates.expectedDate = newExpectedDate;
      }
      if (updateTransitInfo) {
        updates.transitInfo = newTransitInfo;
      }

      // bulkUpdateCars takes whole Diecast rows, not (ids, patch): calling it
      // that way passed an array of id strings as the cars and dropped the
      // updates entirely, which is why saved changes never reached the table.
      const count = await updateCarsByShippingId(activeShippingId, updates);
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
      <DialogContent className="max-w-lg border-zinc-800 bg-[#0e121a] text-zinc-100 shadow-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1 text-left">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <Truck className="size-4" />
            </div>
            <DialogTitle className="text-lg font-bold text-white">
              Update by Shipping ID
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-zinc-400">
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
                <label className="text-xs font-semibold text-zinc-300">Select Shipping ID</label>
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
                  className="border-zinc-800 bg-zinc-900 text-xs text-white"
                />
              ) : (
                <Select value={selectedShippingId} onValueChange={setSelectedShippingId}>
                  <SelectTrigger className="border-zinc-800 bg-zinc-900 text-xs text-white">
                    <SelectValue placeholder="Select a shipping ID..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-64 border-zinc-800 bg-zinc-900 text-zinc-100">
                    {shippingIdStats.map((item) => (
                      <SelectItem key={item.id} value={item.id} className="text-xs">
                        <span className="font-mono font-bold text-amber-400">{item.id}</span>
                        <span className="ml-2 text-zinc-400">
                          ({item.count} car{item.count === 1 ? "" : "s"}
                          {item.sellers ? ` · ${item.sellers}` : ""})
                        </span>
                      </SelectItem>
                    ))}
                    {shippingIdStats.length === 0 && (
                      <div className="p-2 text-center text-zinc-500">No shipping IDs found</div>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Matched Cars Overview Card */}
            {activeShippingId && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Package className="size-3.5 text-zinc-400" />
                    <span className="font-semibold text-white">
                      {matchedCars.length} car{matchedCars.length === 1 ? "" : "s"} in{" "}
                      <span className="font-mono text-amber-400">{activeShippingId}</span>
                    </span>
                  </div>
                  {matchedCars.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowCarList(!showCarList)}
                      className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white"
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
                  <div className="mt-2 max-h-36 overflow-y-auto space-y-1.5 pr-1 border-t border-zinc-800/80 pt-2">
                    {matchedCars.map((car) => (
                      <div
                        key={car.id}
                        className="flex items-center justify-between rounded bg-zinc-800/50 px-2 py-1 text-[11px]"
                      >
                        <div className="min-w-0 truncate pr-2">
                          <span className="font-medium text-white">
                            {car.name || `${car.make} ${car.model}`}
                          </span>
                          <span className="ml-1.5 text-zinc-400">({car.brand || car.make})</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="text-zinc-400">
                            {car.expectedDate || car.date || "No ETA"}
                          </span>
                          <span className="rounded bg-zinc-700/60 px-1.5 py-0.5 text-[10px] text-zinc-300">
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
                <label className="text-xs font-semibold text-zinc-300">
                  Update Status for All Cars
                </label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger className="border-zinc-800 bg-zinc-900 text-xs text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-100">
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
                  <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <Calendar className="size-3.5 text-amber-400" />
                    <span>Expected / Available Date</span>
                  </label>
                  {newExpectedDate && (
                    <button
                      type="button"
                      onClick={() => setNewExpectedDate("")}
                      className="text-[10px] text-zinc-500 hover:text-zinc-300"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <Input
                  type="date"
                  value={newExpectedDate}
                  onChange={(e) => setNewExpectedDate(e.target.value)}
                  className="border-zinc-800 bg-zinc-900 text-xs text-white"
                />

                {/* Quick Date Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-zinc-500 flex items-center gap-0.5">
                    <Clock className="size-3" /> Quick:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleQuickDate(0)}
                    className="rounded border border-zinc-800 bg-zinc-900/80 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDate(7)}
                    className="rounded border border-zinc-800 bg-zinc-900/80 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  >
                    +7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDate(14)}
                    className="rounded border border-zinc-800 bg-zinc-900/80 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  >
                    +14 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDate(30)}
                    className="rounded border border-zinc-800 bg-zinc-900/80 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  >
                    +1 Month
                  </button>
                </div>
              </div>

              {/* Transit Info / ETA Notes (Optional) */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <Truck className="size-3.5 text-zinc-400" />
                    <span>Transit Info / Tracking Notes</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-zinc-400">
                    <input
                      type="checkbox"
                      checked={updateTransitInfo}
                      onChange={(e) => setUpdateTransitInfo(e.target.checked)}
                      className="rounded border-zinc-700 bg-zinc-900 text-primary"
                    />
                    <span>Update notes</span>
                  </label>
                </div>
                {updateTransitInfo && (
                  <Input
                    placeholder="Courier AWB, tracking code, dispatch notes..."
                    value={newTransitInfo}
                    onChange={(e) => setNewTransitInfo(e.target.value)}
                    className="border-zinc-800 bg-zinc-900 text-xs text-white"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex flex-row items-center justify-between gap-2 border-t border-zinc-800/80 pt-3 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-zinc-400 hover:text-white"
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
