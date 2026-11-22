import { useState, useMemo, useEffect, useRef } from "react";
import {
  Truck,
  Clock,
  CheckCircle2,
  Package,
  AlertCircle,
  Loader2,
  Plus,
  Search,
  Sparkles,
  X,
  ChevronDown,
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
import { Switch } from "@/components/ui/switch";
import { IosGroup, IosInput, IosPicker, IosRow } from "@/components/ios-field";
import { CarFormDialog } from "@/components/car-form-dialog";
import { CarLinkField } from "@/components/car-link-field";
import { makeBlankCar, useCars, useCarsActions, type ShippingBatchUpdates } from "@/lib/cars-store";
import { deriveMonth, toDateInputValue } from "@/lib/date-utils";
import { DELIVERY_PARTNER_NAMES } from "@/lib/tracking";
import { TrackingLink } from "@/components/tracking-link";
import { cn } from "@/lib/utils";
import { carNumberOf } from "@/lib/car-subline";
import { isInHand, isIso } from "@/lib/status";
import type { Diecast } from "@/lib/types";
import { carSubLine, carSubLineParts } from "@/lib/car-subline";
import { useCatalog } from "@/lib/catalog-store";
import { catalogCarToCatalogueCar, catalogMatches, type CatalogCar } from "@/lib/catalog";

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
  /**
   * Which ID this dialog batches by. A shipping ID is the parcel a car arrives
   * in; an order ID is the purchase it came from. Same dialog, same controls —
   * only the field it groups and writes changes, so a car's order can be opened
   * and edited exactly the way its shipment already could.
   */
  idField?: "shippingId" | "orderId";
}

export function ShippingBatchDialog({
  open,
  onOpenChange,
  initialShippingId = "",
  allowedShippingIds,
  excludeAvailable = false,
  onUpdated,
  idField = "shippingId",
}: ShippingBatchDialogProps) {
  const cars = useCars();
  const { catalog } = useCatalog();
  const { updateCarsByShippingId, bulkUpdateCars } = useCarsActions();
  const idLabel = idField === "orderId" ? "Order ID" : "Shipping ID";
  // Opened from an order's own card: it edits that order, with nothing to pick.
  const locked = initialShippingId.trim() !== "";

  const [selectedShippingId, setSelectedShippingId] = useState(initialShippingId);
  const [customShippingId, setCustomShippingId] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [hideDelivered, setHideDelivered] = useState(excludeAvailable);

  const [newExpectedDate, setNewExpectedDate] = useState("");
  // Pre-filled from the order; only written when it differs from what was
  // loaded, so opening and saving an order never flattens cars that were placed
  // on different days into one.
  const [newOrderDate, setNewOrderDate] = useState("");
  const [loadedOrderDate, setLoadedOrderDate] = useState("");
  const [newTransitInfo, setNewTransitInfo] = useState("");
  // A note typed here is written to every car in the order; left empty, notes stay as they are.
  const updateTransitInfo = newTransitInfo.trim() !== "";
  const [newPartner, setNewPartner] = useState("");
  const [newTrackingId, setNewTrackingId] = useState("");
  const [updateTracking, setUpdateTracking] = useState(false);

  // Cars queued to join this order — ISO rows picked below, held until Apply so
  // they take the same expected date and courier as everything else in it.
  const [pendingCars, setPendingCars] = useState<Diecast[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  // The seed is built once, when the wizard opens, and held: rebuilding it per
  // render would hand the form a new blank car — and a new id — every keystroke.
  const [newCarSeed, setNewCarSeed] = useState<Diecast | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [carsAccordionOpen, setCarsAccordionOpen] = useState(false);

  // Showing delivered cars also lifts the caller's shipping-ID restriction:
  // that list was drawn from the same in-transit rows, so leaving it in place
  // would tick the box and still show nothing.
  const scopedIds = hideDelivered ? allowedShippingIds : undefined;

  // Gather unique shipping IDs with car counts and metadata
  const shippingIdStats = useMemo(() => {
    const map = new Map<string, { count: number; sellers: Set<string>; statuses: Set<string> }>();
    for (const car of cars) {
      if (hideDelivered && isInHand(car.status)) {
        continue;
      }
      const id = (car[idField] || "").trim();
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
    // idField belongs here: this dialog stays mounted across opens, so without
    // it a second visit in the other mode would offer the first mode's groups.
  }, [cars, scopedIds, hideDelivered, idField]);

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
      if (hideDelivered && isInHand(c.status)) {
        return false;
      }
      return (c[idField] || "").trim().toLowerCase() === activeShippingId.toLowerCase();
    });
  }, [cars, activeShippingId, hideDelivered, idField]);

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
    const placed = toDateInputValue(String(first("orderDate") ?? ""));
    setNewOrderDate(placed);
    setLoadedOrderDate(placed);
    setNewTransitInfo("");
    setNewPartner(String(first("deliveryPartner") ?? ""));
    setNewTrackingId(String(first("trackingId") ?? ""));
  }, [activeShippingId, hideDelivered, open]);

  // A queue belongs to one order and one visit: switching batches, or reopening
  // the dialog, must not quietly carry cars into somewhere they were never
  // meant to go.
  useEffect(() => {
    setPendingCars([]);
    setPickerOpen(false);
    setPickerQuery("");
    setNewCarSeed(null);
    setCarsAccordionOpen(false);
  }, [activeShippingId, open]);

  const orderDateChanged = Boolean(newOrderDate) && newOrderDate !== loadedOrderDate;

  /** The row the order's own details are read from when filling gaps. */
  const template = matchedCars[0] as Diecast | undefined;

  /**
   * What you can put in the order: your own ISO entries first, then the rest of
   * the catalogue.
   *
   * The ISO list used to be the only way in, which meant a car you had simply
   * forgotten to log could not be added without retyping the batch ID by hand.
   * The two are one list because from here they are the same question — which
   * car — and they differ only in what happens next: an ISO row already exists
   * and joins the order, a catalogue entry has to be bought first.
   */
  const isoCandidates = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const queued = new Set(pendingCars.map((c) => c.id));
    return cars
      .filter((c) => isIso(c.status) && !queued.has(c.id))
      .filter((c) => {
        if (!q) return true;
        return [c.name, c.make, c.model, c.variant, c.brand, c.series, c.carNumber]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .slice(0, 50);
  }, [cars, pickerQuery, pendingCars]);

  const catalogCandidates = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    // Unfiltered, the whole catalogue is 1,400 rows of nothing you asked for.
    if (q.length < 2) return [];
    // Any field, every word of the query: the colour, the year, the car number
    // and the ID find a casting as readily as its name does.
    const words = q.split(/\s+/).filter(Boolean);
    const already = new Set(
      isoCandidates.map((c) => (c.catalogId || "").toUpperCase()).filter(Boolean),
    );
    const out: CatalogCar[] = [];
    for (const c of catalog) {
      if (already.has(c.car_id.toUpperCase())) continue;
      if (catalogMatches(c, words)) out.push(c);
      if (out.length >= 25) break;
    }
    return out;
  }, [catalog, pickerQuery, isoCandidates]);

  /**
   * What a car joining this order inherits: the batch ID, the status the order
   * is moving to, and the dates and courier being set alongside it. Anything the
   * car already knows — its own seller, its own order date — is kept.
   */
  const joinOrder = (car: Diecast): Diecast => {
    const status = template?.status || car.status;
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
    const orderDate =
      (orderDateChanged ? newOrderDate : "") ||
      car.orderDate ||
      template?.orderDate ||
      new Date().toISOString().slice(0, 10);
    // Only a delivered car has an arrival date; everything else carries the
    // estimate in expectedDate alone.
    const arrivedOn = isInHand(status) ? expected || car.date || orderDate : "";

    return {
      ...car,
      status,
      // Whichever ID this dialog is grouping by. A car joining an order takes
      // that order's ID; its shipping ID is then derived as usual.
      [idField]: activeShippingId,
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
    joinOrder({ ...makeBlankCar(), status: template?.status || "In Transit" });

  /**
   * The same seed with a casting already chosen, so the wizard opens on step two
   * with nothing left to answer but what this copy cost. What you paid starts at
   * the retail price, the way picking a catalogue entry does everywhere else.
   */
  const seedFromCatalog = (c: CatalogCar): Diecast => {
    const fields = catalogCarToCatalogueCar(c);
    return joinOrder({
      ...makeBlankCar(),
      ...fields,
      mrp: Number(fields.mrp) || 0,
      spent: Number(fields.mrp) || 0,
      status: template?.status || "In Transit",
    });
  };

  /** Everything this Apply would write: the batch, plus anything joining it. */
  const affected = matchedCars.length + pendingCars.length;

  const handleQuickDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    setNewExpectedDate(d.toISOString().slice(0, 10));
  };

  const handleApply = async () => {
    if (!activeShippingId) {
      setErrorMessage(`Please select or enter ${idField === "orderId" ? "an" : "a"} ${idLabel}.`);
      return;
    }
    if (matchedCars.length === 0 && pendingCars.length === 0) {
      setErrorMessage(`No cars found matching ${idLabel} "${activeShippingId}".`);
      return;
    }
    const changesFields =
      orderDateChanged || Boolean(newExpectedDate) || updateTransitInfo || updateTracking;
    if (!changesFields && pendingCars.length === 0) {
      setErrorMessage(
        "Please choose at least one field to change (Order Date, Expected Date, Tracking, or Notes), or add a car to this order.",
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const updates: ShippingBatchUpdates = {};
      if (orderDateChanged) {
        updates.orderDate = newOrderDate;
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
            idField,
          })
        : 0;
      const total = count + joined.length;
      setSuccessMessage(
        joined.length
          ? `Added ${joined.length} car${joined.length === 1 ? "" : "s"} to "${activeShippingId}"${
              count ? ` and updated ${count} more` : ""
            }.`
          : `Successfully updated ${count} car${count === 1 ? "" : "s"} in ${idLabel.toLowerCase()} "${activeShippingId}".`,
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
      {/* Two columns from lg, like the edit-car dialog: what you are changing
          on the left, the order it will be applied to on the right. They used
          to be stacked, with the cars folded away behind a "View cars" toggle —
          so the one thing that told you whether you had the right batch was the
          one thing not on screen. */}
      {/* Dressed like Update status: the same dialog frame, the same header
          chip, the same borders and type sizes. Only the contents differ. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl lg:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-sky-500/15 text-sky-500">
              <Truck className="size-3.5" />
            </span>
            Edit order
          </DialogTitle>
          <DialogDescription>
            {locked ? (
              <>
                Change the dates, tracking and notes across every car in{" "}
                <span className="font-mono text-foreground">{activeShippingId}</span>, or add cars
                to it. To move it to a new status, use Update status.
              </>
            ) : (
              <>
                Pick {idField === "orderId" ? "an order ID" : "a shipping ID"} to change its dates,
                tracking and notes across every car in it — or add cars to the order. To move it to
                a new status, use Update status.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {successMessage ? (
          <div className="my-6 flex flex-col items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-6 text-center text-emerald-600 animate-in fade-in zoom-in-95 dark:text-emerald-400">
            <CheckCircle2 className="size-8" />
            <p className="text-sm font-semibold">{successMessage}</p>
          </div>
        ) : (
          <div className="space-y-4 py-2 text-sm">
            {errorMessage && (
              <p className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                {errorMessage}
              </p>
            )}

            {/* Explicit grid placement rather than reordered markup: the order
                on a phone is still the order you work in — pick the batch, see
                what is in it, then say what changes. On a desktop the cars move
                to a rail on the right and stay visible for both halves. */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:grid-rows-[auto_1fr]">
              {/* Batch selector — shipping ID or order ID, per idField. */}
              {!locked && (
                <div className="space-y-1.5 lg:col-start-1 lg:row-start-1">
                  <IosGroup>
                    <IosRow label={idLabel}>
                      {useCustom ? (
                        <IosInput
                          label={idLabel}
                          placeholder={
                            idField === "orderId" ? "e.g. FIRY-2026-06-001" : "e.g. FIRY/02"
                          }
                          value={customShippingId}
                          onChange={setCustomShippingId}
                        />
                      ) : (
                        <IosPicker
                          label={idLabel}
                          placeholder="Select"
                          value={selectedShippingId}
                          onChange={setSelectedShippingId}
                          options={shippingIdStats.map((item) => ({
                            value: item.id,
                            label: `${item.id} (${item.count} car${item.count === 1 ? "" : "s"}${item.sellers ? ` · ${item.sellers}` : ""})`,
                          }))}
                        />
                      )}
                    </IosRow>
                    {/* Delivered cars were previously filtered out with no way back,
                    so a batch that had already arrived could not be corrected. */}
                    <IosRow label="Include delivered cars">
                      <Switch
                        checked={!hideDelivered}
                        onCheckedChange={(v) => setHideDelivered(!v)}
                      />
                    </IosRow>
                  </IosGroup>
                  {!allowedShippingIds && (
                    <button
                      type="button"
                      onClick={() => setUseCustom(!useCustom)}
                      className="px-1 text-xs text-primary hover:underline"
                    >
                      {useCustom ? "Choose from list" : "+ Enter custom ID"}
                    </button>
                  )}
                </div>
              )}

              {locked && activeShippingId && (
                <div className="flex items-center gap-1.5 lg:col-start-1 lg:row-start-1">
                  <Package className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate text-base font-semibold text-foreground">
                    {matchedCars.length} car{matchedCars.length === 1 ? "" : "s"} in{" "}
                    <span className="font-mono text-primary">{activeShippingId}</span>
                  </span>
                </div>
              )}

              {/* THE ORDER ITSELF — what is in it, and how to put more in.
                A rail on the right from lg, the way the edit-car dialog keeps
                the record beside the fields. */}
              {activeShippingId && (
                <aside className="space-y-2 self-start rounded-xl border border-border bg-muted/40 p-3 lg:col-start-2 lg:row-span-2 lg:row-start-1">
                  {/* Adding to the order comes first, above the list. It is the
                    thing you came here to do that the list cannot do for you,
                    and at the bottom of a panel of fourteen cars it was below
                    the fold on every screen.

                    An order grows: a car you forgot, or one you had been hunting
                    for and have now actually bought, had no way in short of
                    editing it and retyping the batch ID by hand. */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-auto text-xs text-muted-foreground">Add a car</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => setPickerOpen((v) => !v)}
                    >
                      <Sparkles className="size-3" />
                      From Catalogue
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => setNewCarSeed(seedNewCar())}
                    >
                      <Plus className="size-3" />
                      Add New
                    </Button>
                  </div>

                  {/* A link to the car's page: the wizard opens with what it read. */}
                  <CarLinkField
                    onFound={({ fields, imageUrl }) =>
                      setNewCarSeed({
                        ...seedNewCar(),
                        ...fields,
                        mrp: Number(fields.mrp) || 0,
                        spent: Number(fields.mrp) || 0,
                        expectedDate: fields.expectedDate ?? "",
                        ...(imageUrl ? { imageUrl } : {}),
                      })
                    }
                  />

                  {pickerOpen && (
                    <div className="space-y-1.5 rounded-lg border border-border bg-background p-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={pickerQuery}
                          onChange={(e) => setPickerQuery(e.target.value)}
                          placeholder="Search the catalogue…"
                          className="h-8 pl-7 text-xs"
                          autoComplete="off"
                        />
                      </div>
                      <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                        {/* Your own ISO entries lead, because one of them being
                          the car you just bought is the likeliest reason you
                          opened this — and because picking one updates the row
                          you already have instead of filing a second. */}
                        {isoCandidates.map((car) => (
                          <button
                            key={car.id}
                            type="button"
                            onClick={() => setPendingCars((prev) => [...prev, car])}
                            className="flex w-full items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1.5 text-left text-xs hover:bg-muted"
                          >
                            {/* Name on its own line, brand and series under it:
                              side by side this row was wider than a phone and
                              the name was the half that got truncated. */}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-foreground">
                                {car.name || `${car.make} ${car.model}`.trim() || "Unnamed car"}
                              </span>
                              {carSubLineParts(car).length > 0 && (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {carSubLine(car)}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-primary">
                              Wishlist
                            </span>
                            <Plus className="size-3 shrink-0 text-muted-foreground" />
                          </button>
                        ))}
                        {/* Everything else. Picking one opens the wizard rather
                          than queueing a row: the catalogue says what the car
                          is, not what you paid for it. */}
                        {catalogCandidates.map((c) => (
                          <button
                            key={c.car_id}
                            type="button"
                            onClick={() => setNewCarSeed(seedFromCatalog(c))}
                            className="flex w-full items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1.5 text-left text-xs hover:bg-muted"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-foreground">
                                {c.name || `${c.make} ${c.model}`.trim() || "Unnamed casting"}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {carSubLine(catalogCarToCatalogueCar(c))}
                              </span>
                            </span>
                            <Plus className="size-3 shrink-0 text-muted-foreground" />
                          </button>
                        ))}
                        {isoCandidates.length === 0 && catalogCandidates.length === 0 && (
                          <p className="px-1 py-2 text-center text-xs text-muted-foreground">
                            {pickerQuery.trim().length >= 2
                              ? "Nothing on your wishlist or in the catalogue matches that."
                              : "Type a name to search — your wishlist shows first."}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {pendingCars.length > 0 && (
                    <div className="space-y-1 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] p-2">
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        Joining on save — takes this order&apos;s status, dates and courier
                      </p>
                      {pendingCars.map((car) => (
                        <div
                          key={car.id}
                          className="flex items-center justify-between gap-2 rounded bg-background/60 px-2 py-1 text-xs"
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

                  {/* Mobile Accordion Toggle for Cars List (Closed by default on mobile) */}
                  <button
                    type="button"
                    onClick={() => setCarsAccordionOpen((v) => !v)}
                    className="flex w-full items-center justify-between rounded-lg border border-border bg-background/80 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted lg:hidden"
                  >
                    <span className="flex items-center gap-1.5">
                      <Package className="size-3.5 text-muted-foreground" />
                      <span>
                        {matchedCars.length} car{matchedCars.length === 1 ? "" : "s"} in order
                      </span>
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span>{carsAccordionOpen ? "Hide list" : "View list"}</span>
                      <ChevronDown
                        className={cn(
                          "size-3.5 transition-transform duration-200",
                          carsAccordionOpen && "rotate-180",
                        )}
                      />
                    </span>
                  </button>

                  <div
                    className={cn(
                      "border-t border-border pt-2",
                      carsAccordionOpen ? "block" : "hidden lg:block",
                    )}
                  >
                    <ul className="max-h-[22rem] space-y-1.5 overflow-y-auto">
                      {matchedCars.map((car) => (
                        <li key={car.id} className="rounded bg-background/60 px-2 py-1.5 text-xs">
                          <div className="truncate font-medium text-foreground">
                            {car.name || `${car.make} ${car.model}`.trim() || "Unnamed car"}
                          </div>
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <span className="min-w-0 break-words text-xs text-muted-foreground">
                              {[car.brand || car.make, carNumberOf(car), car.assortment]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                              {car.status}
                            </span>
                          </div>
                        </li>
                      ))}
                      {matchedCars.length === 0 && (
                        <li className="px-1 py-3 text-center text-xs text-muted-foreground">
                          Nothing carries this shipping ID yet.
                        </li>
                      )}
                    </ul>
                  </div>
                </aside>
              )}

              {/* Form Updates */}
              <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2">
                <div className="space-y-2">
                  <IosGroup>
                    <IosRow label="Order date">
                      <div className="flex items-center justify-end gap-2">
                        {orderDateChanged && (
                          <button
                            type="button"
                            onClick={() => setNewOrderDate(loadedOrderDate)}
                            className="shrink-0 text-xs text-primary"
                          >
                            Reset
                          </button>
                        )}
                        <div className="min-w-0 flex-1">
                          <IosInput
                            type="date"
                            label="Order date"
                            value={newOrderDate}
                            onChange={setNewOrderDate}
                          />
                        </div>
                      </div>
                    </IosRow>
                    <IosRow label="Expected date">
                      <div className="flex items-center justify-end gap-2">
                        {newExpectedDate && (
                          <button
                            type="button"
                            onClick={() => setNewExpectedDate("")}
                            className="shrink-0 text-xs text-primary"
                          >
                            Clear
                          </button>
                        )}
                        <div className="min-w-0 flex-1">
                          <IosInput
                            type="date"
                            label="Expected date"
                            value={newExpectedDate}
                            onChange={setNewExpectedDate}
                          />
                        </div>
                      </div>
                    </IosRow>
                  </IosGroup>
                  {/* Quick Date Presets */}
                  <div className="flex flex-wrap items-center gap-1.5 px-1">
                    <Clock className="size-3.5 text-muted-foreground" />
                    {[
                      ["Today", 0],
                      ["+7 days", 7],
                      ["+14 days", 14],
                      ["+1 month", 30],
                    ].map(([label, days]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => handleQuickDate(days as number)}
                        className="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors border-border bg-muted/50 text-foreground hover:bg-muted"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Delivery partner + tracking ID. Together they are a link, so
                  they are set together or not at all. */}
                <div className="space-y-2">
                  <IosGroup>
                    <IosRow label="Update tracking">
                      <Switch checked={updateTracking} onCheckedChange={setUpdateTracking} />
                    </IosRow>
                    {updateTracking && (
                      <>
                        <IosRow label="Courier">
                          <IosPicker
                            label="Courier"
                            placeholder="Select"
                            allowNew
                            clearable
                            value={newPartner}
                            onChange={setNewPartner}
                            options={DELIVERY_PARTNER_NAMES.map((n) => ({ value: n, label: n }))}
                          />
                        </IosRow>
                        <IosRow label="Tracking ID">
                          <IosInput
                            label="Tracking ID"
                            placeholder="AWB number"
                            value={newTrackingId}
                            onChange={setNewTrackingId}
                          />
                        </IosRow>
                      </>
                    )}
                  </IosGroup>
                  {updateTracking && (
                    <div className="px-1">
                      <TrackingLink partner={newPartner} trackingId={newTrackingId} />
                    </div>
                  )}
                </div>

                {/* Notes (Optional) */}
                <IosGroup>
                  <IosRow label="Notes">
                    <div className="flex items-center justify-end gap-2">
                      <div className="min-w-0 flex-1">
                        <IosInput
                          label="Notes"
                          placeholder="Add a note for every car"
                          value={newTransitInfo}
                          onChange={setNewTransitInfo}
                        />
                      </div>
                      {newTransitInfo && (
                        <button
                          type="button"
                          aria-label="Clear notes"
                          onClick={() => setNewTransitInfo("")}
                          className="shrink-0 text-xs text-primary"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </IosRow>
                </IosGroup>
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
            className="gap-1.5"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Updating {affected} cars...
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3.5" />
                Save {affected} car{affected === 1 ? "" : "s"}
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
