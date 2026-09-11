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
  Plus,
  Search,
  Sparkles,
  X,
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
import { CarFormDialog } from "@/components/car-form-dialog";
import { makeBlankCar, useCars, useCarsActions, type ShippingBatchUpdates } from "@/lib/cars-store";
import { deriveMonth, toDateInputValue } from "@/lib/date-utils";
import { DELIVERY_PARTNER_NAMES } from "@/lib/tracking";
import { TrackingLink } from "@/components/tracking-link";
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
  const { updateCarsByShippingId, bulkUpdateCars } = useCarsActions();

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
  // Cars queued to join this order — ISO rows picked below, held until Apply so
  // they take the same expected date and courier as everything else in it.
  const [pendingCars, setPendingCars] = useState<Diecast[]>([]);
  const [isoPickerOpen, setIsoPickerOpen] = useState(false);
  const [isoQuery, setIsoQuery] = useState("");
  // The seed is built once, when the wizard opens, and held: rebuilding it per
  // render would hand the form a new blank car — and a new id — every keystroke.
  const [newCarSeed, setNewCarSeed] = useState<Diecast | null>(null);
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

  // A queue belongs to one order and one visit: switching batches, or reopening
  // the dialog, must not quietly carry cars into somewhere they were never
  // meant to go.
  useEffect(() => {
    setPendingCars([]);
    setIsoPickerOpen(false);
    setIsoQuery("");
    setNewCarSeed(null);
  }, [activeShippingId, open]);

  /** The row the order's own details are read from when filling gaps. */
  const template = matchedCars[0] as Diecast | undefined;

  const isoCandidates = useMemo(() => {
    const q = isoQuery.trim().toLowerCase();
    const queued = new Set(pendingCars.map((c) => c.id));
    return cars
      .filter((c) => (c.status || "").trim().toLowerCase() === "iso" && !queued.has(c.id))
      .filter((c) => {
        if (!q) return true;
        return [c.name, c.make, c.model, c.variant, c.brand, c.series, c.carNumber]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .slice(0, 50);
  }, [cars, isoQuery, pendingCars]);

  /**
   * What a car joining this order inherits: the batch ID, the status the order
   * is moving to, and the dates and courier being set alongside it. Anything the
   * car already knows — its own seller, its own order date — is kept.
   */
  const joinOrder = (car: Diecast): Diecast => {
    const status = newStatus !== "keep" ? newStatus : template?.status || car.status;
    const expected = newExpectedDate || template?.expectedDate || car.expectedDate || "";
    const partner = updateTracking
      ? newPartner.trim()
      : template?.deliveryPartner || car.deliveryPartner || "";
    const trackingId = updateTracking
      ? newTrackingId.trim()
      : template?.trackingId || car.trackingId || "";
    const note = updateTransitInfo
      ? newTransitInfo.trim()
      : template?.transitInfo || car.transitInfo || "";
    const orderDate = car.orderDate || template?.orderDate || new Date().toISOString().slice(0, 10);
    // Only a delivered car has an arrival date; everything else carries the
    // estimate in expectedDate alone.
    const arrivedOn = status === "Available" ? expected || car.date || orderDate : "";

    return {
      ...car,
      status,
      shippingId: activeShippingId,
      seller: car.seller || template?.seller || "",
      orderDate,
      orderMonth: deriveMonth(orderDate) || car.orderMonth,
      expectedDate: expected,
      deliveryPartner: partner || undefined,
      trackingId: trackingId || undefined,
      transitInfo: note,
      date: arrivedOn,
      month: arrivedOn ? deriveMonth(arrivedOn) || car.month : "",
    };
  };

  /** Seeds the add-a-car wizard with everything the order already knows. */
  const seedNewCar = (): Diecast =>
    joinOrder({ ...makeBlankCar(), status: template?.status || "Transit" });

  /** Everything this Apply would write: the batch, plus anything joining it. */
  const affected = matchedCars.length + pendingCars.length;

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
    if (matchedCars.length === 0 && pendingCars.length === 0) {
      setErrorMessage(`No cars found matching Shipping ID "${activeShippingId}".`);
      return;
    }
    const changesFields =
      newStatus !== "keep" || Boolean(newExpectedDate) || updateTransitInfo || updateTracking;
    if (!changesFields && pendingCars.length === 0) {
      setErrorMessage(
        "Please choose at least one field to update (Status, Expected Date, Tracking, or Transit Info), or add a car to this order.",
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

      // Joiners are written first, and written whole: they need the order's ID
      // before a batch update could ever find them, and the fields the form is
      // setting are applied to them here rather than in a second pass.
      const joined = pendingCars.map(joinOrder);
      if (joined.length) bulkUpdateCars(joined);

      // bulkUpdateCars takes whole Diecast rows, not (ids, patch): calling it
      // that way passed an array of id strings as the cars and dropped the
      // updates entirely, which is why saved changes never reached the table.
      //
      // The scope goes with it so the store writes the same set this dialog
      // counted, rather than every car sharing the ID.
      const count = changesFields
        ? await updateCarsByShippingId(activeShippingId, updates, {
            excludeAvailable: hideDelivered,
          })
        : 0;
      const total = count + joined.length;
      setSuccessMessage(
        joined.length
          ? `Added ${joined.length} car${joined.length === 1 ? "" : "s"} to "${activeShippingId}"${
              count ? ` and updated ${count} more` : ""
            }.`
          : `Successfully updated ${count} car${count === 1 ? "" : "s"} in shipping ID "${activeShippingId}".`,
      );
      setPendingCars([]);
      onUpdated?.(total, activeShippingId);

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
            <DialogTitle className="text-lg font-bold text-foreground">Update Order</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Pick a Shipping ID to set the status, expected date and transit notes across every car
            in it — or add cars to the order.
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

                {/* An order grows. A car you forgot, or one you had been hunting
                    for and have now actually bought, had no way in short of
                    editing it and retyping the batch ID by hand. */}
                <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
                  <span className="mr-auto text-[11px] text-muted-foreground">
                    Add cars to this order
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-[11px]"
                    onClick={() => setIsoPickerOpen((v) => !v)}
                  >
                    <Sparkles className="size-3" />
                    From ISO
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-[11px]"
                    onClick={() => setNewCarSeed(seedNewCar())}
                  >
                    <Plus className="size-3" />
                    New car
                  </Button>
                </div>

                {isoPickerOpen && (
                  <div className="space-y-1.5 rounded-lg border border-border bg-background p-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={isoQuery}
                        onChange={(e) => setIsoQuery(e.target.value)}
                        placeholder="Search your ISO list…"
                        className="h-8 pl-7 text-xs"
                        autoComplete="off"
                      />
                    </div>
                    <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                      {isoCandidates.map((car) => (
                        <button
                          key={car.id}
                          type="button"
                          onClick={() => setPendingCars((prev) => [...prev, car])}
                          className="flex w-full items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1.5 text-left text-[11px] hover:bg-muted"
                        >
                          {/* Name on its own line, brand and series under it:
                              side by side this row was wider than a phone and
                              the name was the half that got truncated. */}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-foreground">
                              {car.name || `${car.make} ${car.model}`.trim() || "Unnamed car"}
                            </span>
                            {[car.brand, car.series].filter(Boolean).length > 0 && (
                              <span className="block truncate text-[10px] text-muted-foreground">
                                {[car.brand, car.series].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </span>
                          <Plus className="size-3 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                      {isoCandidates.length === 0 && (
                        <p className="px-1 py-2 text-center text-[11px] text-muted-foreground">
                          {isoQuery.trim()
                            ? "Nothing on your ISO list matches that."
                            : "Your ISO list is empty."}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {pendingCars.length > 0 && (
                  <div className="space-y-1 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] p-2">
                    <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      Joining on save — takes this order&apos;s status, dates and courier
                    </p>
                    {pendingCars.map((car) => (
                      <div
                        key={car.id}
                        className="flex items-center justify-between gap-2 rounded bg-background/60 px-2 py-1 text-[11px]"
                      >
                        <span className="min-w-0 truncate font-medium text-foreground">
                          {car.name || `${car.make} ${car.model}`.trim() || "Unnamed car"}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setPendingCars((prev) => prev.filter((c) => c.id !== car.id))
                          }
                          aria-label={`Remove ${car.name || "car"} from this order`}
                          className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <X className="size-3" />
                        </button>
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
                    <TrackingLink partner={newPartner} trackingId={newTrackingId} />
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
            disabled={isSubmitting || affected === 0}
            className="gap-1.5 bg-amber-500 text-zinc-950 font-semibold hover:bg-amber-400"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Updating {affected} cars...
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3.5" />
                Update {affected} Car{affected === 1 ? "" : "s"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Stacked over this dialog: a car added to an order still deserves the
          full wizard, and cancelling out of it leaves the order untouched. The
          batch it belongs to is filled in already. */}
      {newCarSeed && (
        <CarFormDialog
          open
          onOpenChange={(v) => {
            if (!v) setNewCarSeed(null);
          }}
          mode="add"
          initial={newCarSeed}
        />
      )}
    </Dialog>
  );
}
