import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Loader2,
  Pencil,
  Star,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Diecast } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCars, useCarsActions } from "@/lib/cars-store";
import { findCarImage } from "@/lib/car-image";
import { formatDayMonthYear, inr, inrFull } from "@/lib/format";
import { trackingPageFor } from "@/lib/tracking";
import { TrackingLink } from "@/components/tracking-link";
import { FAVOURITE_COLOUR, ChaseMark, FavouriteMark } from "@/components/car-marks";
import { StarRating } from "@/components/star-rating";
import { RARITY_FLAME, RARITY_LABEL, nextRarity, rarityOf, withRarity } from "@/lib/rarity";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/status-pill";
import { CarFormDialog } from "@/components/car-form-dialog";
import { ShippingBatchDialog } from "@/components/shipping-batch-dialog";
import { StatusUpdateDialog } from "@/components/status-update-dialog";
import { UpdateStatusButton } from "@/components/update-status-button";
import { CarThumb } from "@/components/car-thumb";

/**
 * A car moves forward one step at a time rather than jumping straight to
 * delivered, so the button always advances to the next real stage.
 */
const STATUS_FLOW = ["ISO", "Pre Order", "Waiting", "Transit", "Out for Delivery", "Available"];

function nextStatus(current: string): string | null {
  const now = (current || "").trim().toLowerCase();
  const i = STATUS_FLOW.findIndex((s) => s.toLowerCase() === now);
  // An unrecognised status has no place in the chain; treat delivery as the
  // only sensible next move.
  if (i < 0) return "Available";
  if (i >= STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[i + 1];
}

type Ctx = {
  open: (car: Diecast) => void;
  openCar: (car: Diecast) => void;
  close: () => void;
};

const CarDrawerCtx = createContext<Ctx | null>(null);

export function useCarDrawer() {
  const ctx = useContext(CarDrawerCtx);
  if (!ctx) throw new Error("useCarDrawer must be used inside CarDrawerProvider");
  return ctx;
}

export function CarDrawerProvider({ children }: { children: ReactNode }) {
  const [currentCarId, setCurrentCarId] = useState<string | null>(null);
  const [editCar, setEditCar] = useState<Diecast | null>(null);
  const [batchShippingId, setBatchShippingId] = useState<string | null>(null);
  const [batchField, setBatchField] = useState<"shippingId" | "orderId">("shippingId");
  const [batchOpen, setBatchOpen] = useState(false);
  const [statusCar, setStatusCar] = useState<Diecast | null>(null);

  const cars = useCars();
  const { updateCar } = useCarsActions();

  // Find latest car state by ID
  const car = cars.find((c) => c.id === currentCarId) || null;

  const open = useCallback((c: Diecast) => {
    setCurrentCarId(c.id);
  }, []);

  const close = useCallback(() => {
    setCurrentCarId(null);
  }, []);

  return (
    <CarDrawerCtx.Provider value={{ open, openCar: open, close }}>
      {children}

      {/* Car Details Popup Modal matching the exact screenshot design */}
      <Dialog
        open={Boolean(car)}
        onOpenChange={(v) => {
          if (!v) close();
        }}
      >
        {/* The close button is the dialog's own now, and it shows on a desktop
            only — a phone still pushes the sheet down. */}
        {/* Tighter than it was — p-5/p-6 became p-4/p-5, and the sections lost
            a step of spacing each — so the whole card fits a phone without
            scrolling in the common case. */}
        <DialogContent
          id="car-details-dialog-content"
          hideDragHandle
          className="max-sm:top-0 max-sm:inset-x-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none max-sm:pb-0 overflow-y-auto xl:overflow-hidden overflow-x-hidden rounded-3xl border-border bg-background p-0 sm:p-0 gap-0 block text-foreground shadow-2xl sm:max-h-[92vh] sm:max-w-2xl md:max-w-5xl lg:max-w-6xl xl:max-w-[1240px]"
        >
          {car && (
            <CarPopupContent
              car={car}
              onClose={close}
              onEdit={() => setEditCar(car)}
              onOpenBatch={(id, field) => {
                setBatchShippingId(id);
                setBatchField(field);
                setBatchOpen(true);
              }}
              onToggleFavourite={() => updateCar({ ...car, favourite: !car.favourite })}
              // Cycles Normal → TH → STH → Chase → Normal: each tap is the next
              // colour of flame.
              onToggleChase={() => updateCar(withRarity(car, nextRarity(rarityOf(car))))}
              onUpdateStatus={() => setStatusCar(car)}
              onSelectCar={open}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Full edit dialog with frozen saved fields preserved */}
      {editCar && (
        <CarFormDialog
          open={Boolean(editCar)}
          onOpenChange={(v) => {
            if (!v) setEditCar(null);
          }}
          initial={editCar}
          mode="edit"
        />
      )}

      {/* Same dialog the ISO suggestions open: one place that knows what each
          status needs recording alongside it. The drawer stays open behind it,
          so the car is still there when it closes — showing its new status. */}
      <StatusUpdateDialog car={statusCar} onClose={() => setStatusCar(null)} />

      {/* The same Update order dialog, pointed at whichever ID was pressed —
          the parcel a car arrived in, or the purchase it came from. */}
      <ShippingBatchDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        initialShippingId={batchShippingId || ""}
        idField={batchField}
      />
    </CarDrawerCtx.Provider>
  );
}

interface CarPopupContentProps {
  car: Diecast;
  onClose: () => void;
  onEdit: () => void;
  onOpenBatch: (id: string, field: "shippingId" | "orderId") => void;
  onToggleFavourite: () => void;
  onToggleChase: () => void;
  onUpdateStatus: () => void;
  onSelectCar?: (car: Diecast) => void;
}

function CarPopupContent({
  car,
  onClose,
  onEdit,
  onOpenBatch,
  onToggleFavourite,
  onToggleChase,
  onUpdateStatus,
  onSelectCar,
}: CarPopupContentProps) {
  const cars = useCars();

  useEffect(() => {
    const dialogElem = document.getElementById("car-details-dialog-content");
    if (dialogElem) {
      dialogElem.scrollTo({ top: 0, behavior: "smooth" });
    }
    const middleElem = document.getElementById("car-details-middle-col");
    if (middleElem) {
      middleElem.scrollTo({ top: 0, behavior: "smooth" });
    }
    const tabElem = document.getElementById("car-details-tab-container");
    if (tabElem) {
      tabElem.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [car.id]);

  const seriesName = (car.series || "").trim();
  const setName = ((car as unknown as { set?: string }).set || car.subSeries || "").trim();

  const seriesCars = useMemo(() => {
    if (!seriesName) return [];
    const targetSeries = seriesName.toLowerCase();
    return cars.filter(
      (c) => c.id !== car.id && (c.series || "").trim().toLowerCase() === targetSeries,
    );
  }, [cars, car.id, seriesName]);

  const setCars = useMemo(() => {
    if (!setName) return [];
    const targetSet = setName.toLowerCase();
    return cars.filter((c) => {
      if (c.id === car.id) return false;
      const cSet = ((c as unknown as { set?: string }).set || c.subSeries || "")
        .trim()
        .toLowerCase();
      return cSet === targetSet;
    });
  }, [cars, car.id, setName]);

  const spent = Math.round(car.spent ?? 0);
  const mrp = Math.round(car.mrp ?? 0);
  const delta = mrp - spent;
  const advanceTo = nextStatus(car.status);

  const hasArrived = (car.status || "").trim().toLowerCase() === "available";
  const cleanTransitNotes = (car.transitInfo || "").trim();

  const trackable = Boolean(trackingPageFor(car.deliveryPartner, car.trackingId));
  const rarity = rarityOf(car);
  const hasCondition = Boolean(
    (car.carCondition && car.carCondition.trim()) ||
    (car.cardCondition && car.cardCondition.trim()) ||
    (typeof car.carRating === "number" && car.carRating > 0) ||
    (typeof car.cardRating === "number" && car.cardRating > 0),
  );

  return (
    <div className="relative w-full">
      {/* Hidden Accessible Dialog Title & Description */}
      <DialogTitle className="sr-only">
        {car.name || `${car.make} ${car.model}`} Details
      </DialogTitle>
      <DialogDescription className="sr-only">
        Diecast car specifications, status, logistics, and pricing details.
      </DialogDescription>

      {/* =====================================================================
          1. DESKTOP 3-COLUMN LAYOUT (Screen >= xl: Image left, Details center, More from right)
          ===================================================================== */}
      <div className="hidden xl:flex xl:flex-row xl:items-stretch xl:h-[84vh] xl:max-h-[84vh] w-full overflow-hidden">
        {/* LEFT COLUMN: Image on top, Rarity & Favourite icons pinned at the bottom */}
        <div className="flex flex-col justify-between border-r border-border bg-muted/15 w-[340px] xl:w-[380px] shrink-0 h-full overflow-hidden">
          {/* Main Car Photo Area */}
          <div className="relative flex-1 min-h-[300px] w-full overflow-hidden bg-muted/30 flex items-center justify-center p-4">
            <div className="relative size-full rounded-2xl overflow-hidden shadow-xs bg-background/50 border border-border/60">
              <HeroCarImage car={car} />
            </div>
          </div>

          {/* Bottom Bar: Rarity and Favourite toggles */}
          <div className="border-t border-border bg-card/85 p-3.5 sm:p-4 backdrop-blur-xs flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              <span>Tags & Rarity</span>
              <span className="text-[10px] lowercase text-muted-foreground/70">tap to cycle</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Rarity Button */}
              <button
                type="button"
                onClick={onToggleChase}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none active:scale-95",
                  rarity !== "Normal"
                    ? "bg-accent/20 border-accent/50 text-foreground shadow-xs"
                    : "bg-muted/40 border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/70",
                )}
                title={`${RARITY_LABEL[rarity]} — tap for ${RARITY_LABEL[nextRarity(rarity)]}`}
              >
                <Flame
                  className={cn(
                    "size-4 shrink-0",
                    rarity === "Normal" ? "text-muted-foreground" : RARITY_FLAME[rarity],
                  )}
                />
                <span className="truncate">{RARITY_LABEL[rarity]}</span>
              </button>

              {/* Favourite Button */}
              <button
                type="button"
                onClick={onToggleFavourite}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none active:scale-95",
                  car.favourite
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400 shadow-xs"
                    : "bg-muted/40 border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/70",
                )}
                title={car.favourite ? "Remove from favourites" : "Add to favourites"}
              >
                <Star
                  className={cn(
                    "size-4 shrink-0",
                    car.favourite ? FAVOURITE_COLOUR : "text-muted-foreground",
                  )}
                />
                <span className="truncate">{car.favourite ? "Favourited" : "Favourite"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* MIDDLE COLUMN: Car Details & Action buttons (sticky bottom) */}
        <div className="flex flex-col flex-1 min-w-0 h-full max-h-[84vh] overflow-hidden">
          <div
            id="car-details-middle-col"
            className="flex-1 min-w-0 overflow-y-auto p-6 lg:p-7 scrollbar-thin"
          >
            <CarDetailsBody
              car={car}
              spent={spent}
              mrp={mrp}
              delta={delta}
              hasCondition={hasCondition}
              hasArrived={hasArrived}
              cleanTransitNotes={cleanTransitNotes}
              trackable={trackable}
              onOpenBatch={onOpenBatch}
            />
          </div>

          {/* Sticky bottom bar for desktop middle section */}
          <div className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-background/95 backdrop-blur-xs p-4 px-6 lg:px-7 flex items-center gap-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
            <Button
              variant="outline"
              onClick={onEdit}
              className="flex-1 gap-1.5 h-10 cursor-pointer"
            >
              <Pencil className="size-4" />
              Edit
            </Button>
            <UpdateStatusButton
              size="default"
              onClick={onUpdateStatus}
              title={
                advanceTo
                  ? `Update status — ${car.status || "unknown"} to ${advanceTo}`
                  : "Update status"
              }
              className="flex-1 h-10 cursor-pointer"
            />
          </div>
        </div>

        {/* RIGHT COLUMN: More from series & set (3x2 grid with horizontal scrolling on web, empty state if none) */}
        <div className="w-[340px] lg:w-[390px] xl:w-[430px] shrink-0 border-l border-border bg-muted/10 p-4 sm:p-5 overflow-y-auto max-h-[84vh] flex flex-col space-y-6 pr-9 scrollbar-thin">
          {/* Series Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate"
                title={seriesName ? `Series: ${seriesName}` : "Series"}
              >
                More from series {seriesName ? `· ${seriesName}` : ""}
              </span>
              {seriesCars.length > 0 && (
                <span className="text-[11px] font-semibold text-muted-foreground tabular-nums shrink-0 ml-1">
                  {seriesCars.length} {seriesCars.length === 1 ? "car" : "cars"}
                </span>
              )}
            </div>

            {seriesCars.length > 0 ? (
              <WebRelatedGridShelf cars={seriesCars} onSelectCar={onSelectCar} />
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-background/50 py-5 px-3 text-center">
                <Car className="size-6 text-muted-foreground/40 mb-1.5" />
                <span className="text-xs font-semibold text-foreground/80">No cars available</span>
                <span className="text-[11px] text-muted-foreground mt-0.5 max-w-[200px] leading-relaxed">
                  {seriesName
                    ? `No other cars from "${seriesName}" in your collection.`
                    : "No series specified for this car."}
                </span>
              </div>
            )}
          </div>

          <hr className="border-border/60" />

          {/* Set Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate"
                title={setName ? `Set: ${setName}` : "Set"}
              >
                More from set {setName ? `· ${setName}` : ""}
              </span>
              {setCars.length > 0 && (
                <span className="text-[11px] font-semibold text-muted-foreground tabular-nums shrink-0 ml-1">
                  {setCars.length} {setCars.length === 1 ? "car" : "cars"}
                </span>
              )}
            </div>

            {setCars.length > 0 ? (
              <WebRelatedGridShelf cars={setCars} onSelectCar={onSelectCar} />
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-background/50 py-5 px-3 text-center">
                <Car className="size-6 text-muted-foreground/40 mb-1.5" />
                <span className="text-xs font-semibold text-foreground/80">No cars available</span>
                <span className="text-[11px] text-muted-foreground mt-0.5 max-w-[200px] leading-relaxed">
                  {setName
                    ? `No other cars from "${setName}" in your collection.`
                    : "No set specified for this car."}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          2. TABLET / TAB 2-COLUMN + BOTTOM SHELF LAYOUT (md to xl screens: 768px - 1279px)
             - Top: Image on left, Details on right
             - Bottom: More from series & set at the bottom
          ===================================================================== */}
      <div
        id="car-details-tab-container"
        className="hidden md:flex xl:hidden flex-col w-full h-[86vh] max-h-[86vh] overflow-y-auto overflow-x-hidden scrollbar-thin"
      >
        {/* TOP SECTION: Left image (sticky), Right details */}
        <div className="flex flex-row items-stretch border-b border-border min-h-[480px]">
          {/* LEFT SIDE: Car Photo & Tags/Rarity Controls */}
          <div className="w-[340px] lg:w-[380px] shrink-0 border-r border-border bg-muted/15 flex flex-col justify-between self-start sticky top-0">
            {/* Car Photo Area */}
            <div className="relative flex-1 min-h-[300px] w-full overflow-hidden bg-muted/30 flex items-center justify-center p-4">
              <div className="relative size-full rounded-2xl overflow-hidden shadow-xs bg-background/50 border border-border/60">
                <HeroCarImage car={car} />
              </div>
            </div>

            {/* Bottom Bar: Rarity & Favourite toggles */}
            <div className="border-t border-border bg-card/85 p-3.5 sm:p-4 backdrop-blur-xs flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                <span>Tags & Rarity</span>
                <span className="text-[10px] lowercase text-muted-foreground/70">tap to cycle</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Rarity Button */}
                <button
                  type="button"
                  onClick={onToggleChase}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none active:scale-95",
                    rarity !== "Normal"
                      ? "bg-accent/20 border-accent/50 text-foreground shadow-xs"
                      : "bg-muted/40 border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/70",
                  )}
                  title={`${RARITY_LABEL[rarity]} — tap for ${RARITY_LABEL[nextRarity(rarity)]}`}
                >
                  <Flame
                    className={cn(
                      "size-4 shrink-0",
                      rarity === "Normal" ? "text-muted-foreground" : RARITY_FLAME[rarity],
                    )}
                  />
                  <span className="truncate">{RARITY_LABEL[rarity]}</span>
                </button>

                {/* Favourite Button */}
                <button
                  type="button"
                  onClick={onToggleFavourite}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none active:scale-95",
                    car.favourite
                      ? "bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400 shadow-xs"
                      : "bg-muted/40 border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/70",
                  )}
                  title={car.favourite ? "Remove from favourites" : "Add to favourites"}
                >
                  <Star
                    className={cn(
                      "size-4 shrink-0",
                      car.favourite ? FAVOURITE_COLOUR : "text-muted-foreground",
                    )}
                  />
                  <span className="truncate">{car.favourite ? "Favourited" : "Favourite"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE: Car Details & Action Buttons */}
          <div className="flex flex-col flex-1 min-w-0 p-5 lg:p-6 bg-background pr-12 justify-between">
            <CarDetailsBody
              car={car}
              spent={spent}
              mrp={mrp}
              delta={delta}
              hasCondition={hasCondition}
              hasArrived={hasArrived}
              cleanTransitNotes={cleanTransitNotes}
              trackable={trackable}
              onOpenBatch={onOpenBatch}
            />

            {/* Action buttons (Edit & Update Status) */}
            <div className="mt-6 pt-4 border-t border-border flex items-center gap-3">
              <Button
                variant="outline"
                onClick={onEdit}
                className="flex-1 gap-1.5 h-10 cursor-pointer"
              >
                <Pencil className="size-4" />
                Edit
              </Button>
              <UpdateStatusButton
                size="default"
                onClick={onUpdateStatus}
                title={
                  advanceTo
                    ? `Update status — ${car.status || "unknown"} to ${advanceTo}`
                    : "Update status"
                }
                className="flex-1 h-10 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION: More from series & set */}
        <div className="p-5 lg:p-6 bg-muted/10 space-y-6">
          {/* Series Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate"
                title={seriesName ? `Series: ${seriesName}` : "Series"}
              >
                More from series {seriesName ? `· ${seriesName}` : ""}
              </span>
              {seriesCars.length > 0 && (
                <span className="text-[11px] font-semibold text-muted-foreground tabular-nums shrink-0 ml-1">
                  {seriesCars.length} {seriesCars.length === 1 ? "car" : "cars"}
                </span>
              )}
            </div>

            {seriesCars.length > 0 ? (
              <TabRelatedShelf cars={seriesCars} onSelectCar={onSelectCar} />
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/80 bg-background/50 py-3.5 px-4 text-left">
                <Car className="size-5 shrink-0 text-muted-foreground/40" />
                <span className="text-xs text-muted-foreground">
                  {seriesName
                    ? `No other cars from "${seriesName}" in your collection.`
                    : "No series specified for this car."}
                </span>
              </div>
            )}
          </div>

          <hr className="border-border/60" />

          {/* Set Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate"
                title={setName ? `Set: ${setName}` : "Set"}
              >
                More from set {setName ? `· ${setName}` : ""}
              </span>
              {setCars.length > 0 && (
                <span className="text-[11px] font-semibold text-muted-foreground tabular-nums shrink-0 ml-1">
                  {setCars.length} {setCars.length === 1 ? "car" : "cars"}
                </span>
              )}
            </div>

            {setCars.length > 0 ? (
              <TabRelatedShelf cars={setCars} onSelectCar={onSelectCar} />
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/80 bg-background/50 py-3.5 px-4 text-left">
                <Car className="size-5 shrink-0 text-muted-foreground/40" />
                <span className="text-xs text-muted-foreground">
                  {setName
                    ? `No other cars from "${setName}" in your collection.`
                    : "No set specified for this car."}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          3. MOBILE SINGLE-COLUMN LAYOUT (< md screens)
          ===================================================================== */}
      <div className="md:hidden relative w-full flex flex-col min-h-full">
        {/* Top Car Image with sticky positioning */}
        <div className="sticky top-0 z-0 h-[30vh] min-h-[220px] max-h-[360px] w-full overflow-hidden bg-muted/60">
          <HeroCarImage car={car} />

          {/* Top left action icons: Rarity Flame & Favourite Star */}
          <div className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex items-center gap-1.5">
            <FlagButton
              onClick={onToggleChase}
              pressed={rarity !== "Normal"}
              title={`${RARITY_LABEL[rarity]} — tap for ${RARITY_LABEL[nextRarity(rarity)]}`}
            >
              <Flame
                className={`size-4 ${rarity === "Normal" ? "fill-none text-white" : RARITY_FLAME[rarity]}`}
              />
            </FlagButton>
            <FlagButton
              onClick={onToggleFavourite}
              pressed={Boolean(car.favourite)}
              title={car.favourite ? "Remove from favourites" : "Add to favourites"}
            >
              <Star
                className={`size-4 ${car.favourite ? FAVOURITE_COLOUR : "fill-none text-white"}`}
              />
            </FlagButton>
          </div>

          {/* Top right actions: Close button */}
          <div className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClose}
              title="Close details"
              aria-label="Close"
              className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur-md transition-colors hover:bg-black/70 active:scale-95"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Car Design Card (overlaps the car image on scroll) */}
        <div className="relative z-10 -mt-7 rounded-t-3xl border-t border-border bg-background px-4 pt-5 pb-6 shadow-[0_-8px_24px_rgba(0,0,0,0.1)] flex-1">
          <CarDetailsBody
            car={car}
            spent={spent}
            mrp={mrp}
            delta={delta}
            hasCondition={hasCondition}
            hasArrived={hasArrived}
            cleanTransitNotes={cleanTransitNotes}
            trackable={trackable}
            onOpenBatch={onOpenBatch}
          />

          {/* More from series (mobile shelf: all cars in single row. Hidden if none) */}
          {seriesCars.length > 0 && (
            <div className="pt-2">
              <hr className="my-3.5 border-border" />
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
                  More from series {seriesName ? `· ${seriesName}` : ""}
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 ml-1">
                  {seriesCars.length} {seriesCars.length === 1 ? "car" : "cars"}
                </span>
              </div>
              <div className="-mx-4 flex snap-x scroll-px-4 items-stretch gap-2.5 overflow-x-auto px-4 pb-2 scrollbar-none">
                {seriesCars.map((relatedCar) => (
                  <RelatedCarCard
                    key={relatedCar.id}
                    car={relatedCar}
                    className="w-28 sm:w-32 shrink-0 snap-start"
                    onSelect={() => onSelectCar?.(relatedCar)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* More from set (mobile shelf: all cars in single row. Hidden if none) */}
          {setCars.length > 0 && (
            <div className="pt-2">
              <hr className="my-3.5 border-border" />
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
                  More from set {setName ? `· ${setName}` : ""}
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 ml-1">
                  {setCars.length} {setCars.length === 1 ? "car" : "cars"}
                </span>
              </div>
              <div className="-mx-4 flex snap-x scroll-px-4 items-stretch gap-2.5 overflow-x-auto px-4 pb-2 scrollbar-none">
                {setCars.map((relatedCar) => (
                  <RelatedCarCard
                    key={relatedCar.id}
                    car={relatedCar}
                    className="w-28 sm:w-32 shrink-0 snap-start"
                    onSelect={() => onSelectCar?.(relatedCar)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sticky bottom bar for mobile section */}
        <div className="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur-md p-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(0,0,0,0.12)] flex items-center gap-2.5">
          <Button variant="outline" onClick={onEdit} className="flex-1 gap-1.5 h-10 cursor-pointer">
            <Pencil className="size-4" />
            Edit
          </Button>
          <UpdateStatusButton
            size="default"
            onClick={onUpdateStatus}
            title={
              advanceTo
                ? `Update status — ${car.status || "unknown"} to ${advanceTo}`
                : "Update status"
            }
            className="flex-1 h-10 cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}

/** Reusable details section for middle column and mobile card */
function CarDetailsBody({
  car,
  spent,
  mrp,
  delta,
  hasCondition,
  hasArrived,
  cleanTransitNotes,
  trackable,
  onOpenBatch,
}: {
  car: Diecast;
  spent: number;
  mrp: number;
  delta: number;
  hasCondition: boolean;
  hasArrived: boolean;
  cleanTransitNotes: string;
  trackable: boolean;
  onOpenBatch: (id: string, field: "orderId" | "shippingId") => void;
}) {
  return (
    <div className="space-y-4">
      {/* Brand & Assortment on the left side, status tag on the right side */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 min-w-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
            <span>{car.brand || "—"}</span>
            {car.assortment && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="truncate">{car.assortment}</span>
              </>
            )}
          </div>
          <div className="shrink-0">
            <StatusPill status={car.status} />
          </div>
        </div>

        {/* Followed by car name with reduced spacing */}
        <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {car.name || `${car.make} ${car.model} ${car.variant || ""}`.trim() || "Unnamed car"}
        </h2>
      </div>

      {/* Divider */}
      <hr className="border-border" />

      {/* Car details section (no title) */}
      <div>
        <SpecGrid>
          <Spec label="Series" value={car.series} />
          <Spec label="Sub series" value={car.subSeries} />
          <Spec label="Car number" value={car.carNumber} />
          <Spec label="Type" value={car.type} />
          <Spec label="Colour" value={car.colour} />
          <Spec label="Size" value={car.size} />
        </SpecGrid>
        {hasCondition ? (
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
            <ConditionSpec label="Car" grade={car.carCondition} rating={car.carRating} />
            <ConditionSpec label="Card" grade={car.cardCondition} rating={car.cardRating} />
          </div>
        ) : null}
      </div>

      {/* Divider */}
      <hr className="border-border" />

      {/* Purchase details (no title) */}
      <div>
        <SpecGrid>
          <Spec label="Spent" value={inrFull(spent)} />
          <Spec label="Retail / MRP" value={inrFull(mrp)} />
          <Spec
            label="Difference"
            className={delta >= 0 ? "text-emerald-600 dark:text-[#00E599]" : "text-rose-400"}
            value={delta >= 0 ? `+${inrFull(delta)}` : `-${inrFull(Math.abs(delta))}`}
          />
        </SpecGrid>
      </div>

      {/* Divider */}
      <hr className="border-border" />

      {/* Shipping details (no title) */}
      <div>
        <SpecGrid>
          <Spec label="Seller" value={car.seller} />
          <Spec label="Order date" value={formatDayMonthYear(car.orderDate) || car.orderDate} />
          <Spec
            label={hasArrived ? "Received date" : "Expected date"}
            value={formatDayMonthYear(hasArrived ? car.date || car.expectedDate : car.expectedDate)}
          />
          <IdSpec
            label="Order ID"
            value={car.orderId}
            title={`See every car in order ${car.orderId}`}
            onClick={() => onOpenBatch(car.orderId, "orderId")}
          />
          <IdSpec
            label="Shipping ID"
            value={car.shippingId}
            title={`See every car in shipment ${car.shippingId}`}
            onClick={() => onOpenBatch(car.shippingId, "shippingId")}
          />
          {(car.deliveryPartner || car.trackingId) && (
            <div className="min-w-0">
              <span className="text-xs text-muted-foreground">Courier</span>
              <div className="mt-0.5 truncate text-sm font-semibold">
                {trackable ? (
                  <TrackingLink
                    compact
                    partner={car.deliveryPartner}
                    trackingId={car.trackingId}
                    className="text-sm font-semibold"
                  />
                ) : (
                  car.deliveryPartner || car.trackingId
                )}
              </div>
            </div>
          )}
        </SpecGrid>
        {cleanTransitNotes && (
          <p className="mt-2 text-sm text-foreground bg-muted/30 rounded-lg p-2.5 border border-border/50">
            {cleanTransitNotes}
          </p>
        )}
      </div>
    </div>
  );
}

/** 3x2 grid with horizontal scrolling for desktop right column */
function WebRelatedGridShelf({
  cars,
  onSelectCar,
}: {
  cars: Diecast[];
  onSelectCar?: (car: Diecast) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (!containerRef.current) return;
    const scrollAmount = containerRef.current.clientWidth * 0.85;
    containerRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;
      const canScrollLeft = scrollLeft > 0;
      const canScrollRight = scrollLeft + clientWidth < scrollWidth - 1;
      if ((e.deltaY > 0 && canScrollRight) || (e.deltaY < 0 && canScrollLeft)) {
        containerRef.current.scrollLeft += e.deltaY;
      }
    }
  };

  return (
    <div className="relative">
      <div
        ref={containerRef}
        onWheel={handleWheel}
        className="grid grid-flow-col grid-rows-2 auto-cols-[calc((100%-1rem)/3)] gap-2 overflow-x-auto pb-2 scrollbar-thin snap-x scroll-px-0.5 scroll-smooth"
      >
        {cars.map((relatedCar) => (
          <RelatedCarCard
            key={relatedCar.id}
            car={relatedCar}
            className="w-full h-full snap-start"
            onSelect={() => onSelectCar?.(relatedCar)}
          />
        ))}
      </div>
      {cars.length > 6 && (
        <div className="mt-1 flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => scroll("left")}
            aria-label="Scroll left"
            title="Scroll left"
            className="flex size-6 cursor-pointer items-center justify-center rounded-md border border-border/80 bg-background/90 text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95 shadow-2xs"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => scroll("right")}
            aria-label="Scroll right"
            title="Scroll right"
            className="flex size-6 cursor-pointer items-center justify-center rounded-md border border-border/80 bg-background/90 text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95 shadow-2xs"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Single-row horizontal shelf for tablet layout at bottom */
function TabRelatedShelf({
  cars,
  onSelectCar,
}: {
  cars: Diecast[];
  onSelectCar?: (car: Diecast) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (!containerRef.current) return;
    const scrollAmount = containerRef.current.clientWidth * 0.75;
    containerRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="flex items-stretch gap-3 overflow-x-auto pb-2 scrollbar-thin snap-x scroll-smooth"
      >
        {cars.map((relatedCar) => (
          <RelatedCarCard
            key={relatedCar.id}
            car={relatedCar}
            className="w-36 sm:w-40 shrink-0 snap-start"
            onSelect={() => onSelectCar?.(relatedCar)}
          />
        ))}
      </div>
      {cars.length > 4 && (
        <div className="mt-1 flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => scroll("left")}
            aria-label="Scroll left"
            title="Scroll left"
            className="flex size-6 cursor-pointer items-center justify-center rounded-md border border-border/80 bg-background/90 text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95 shadow-2xs"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => scroll("right")}
            aria-label="Scroll right"
            title="Scroll right"
            className="flex size-6 cursor-pointer items-center justify-center rounded-md border border-border/80 bg-background/90 text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95 shadow-2xs"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Related car card used both in mobile horizontal shelf and web 3x2 grid */
function RelatedCarCard({
  car,
  onSelect,
  className,
}: {
  car: Diecast;
  onSelect: () => void;
  className?: string;
}) {
  const title = car.name || `${car.make} ${car.model}`.trim() || "Unnamed car";
  const rarity = rarityOf(car);
  const subtitle = car.subSeries || car.series || car.brand || car.make || "—";

  return (
    <button
      type="button"
      onClick={onSelect}
      title={title}
      className={cn(
        "group flex flex-col rounded-xl border border-border/80 bg-card p-2 text-left shadow-xs transition-all hover:border-primary/50 hover:shadow-md active:scale-95 cursor-pointer",
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted/40">
        <CarThumb car={car} className="size-full object-cover" />
        {(car.chase || car.favourite) && (
          <div className="pointer-events-none absolute right-1 top-1 flex items-center gap-1">
            {car.chase && (
              <span className="grid size-4 place-items-center rounded-full bg-black/70 backdrop-blur-xs">
                <ChaseMark rarity={rarity} className="size-2.5" />
              </span>
            )}
            {car.favourite && (
              <span className="grid size-4 place-items-center rounded-full bg-black/70 backdrop-blur-xs">
                <FavouriteMark className="size-2.5" />
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-1.5 flex min-w-0 flex-1 flex-col justify-between">
        <div className="line-clamp-2 text-xs font-semibold leading-snug text-foreground group-hover:text-primary transition-colors min-h-[2.1rem]">
          {title}
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-1 text-[10px] text-muted-foreground">
          <span className="truncate">{subtitle}</span>
          {car.spent ? (
            <span className="shrink-0 tabular-nums font-medium text-foreground/80">
              {inr(car.spent)}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

/** Three across at every width, so a label always sits above its own value. */
function SpecGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">{children}</div>;
}

/**
 * A derived ID that opens the batch it names.
 *
 * Both of these are links rather than a value with "(View Order)" bolted after
 * it: the ID *is* the order, so the thing you would point at should be the
 * thing you can press.
 */
function IdSpec({
  label,
  value,
  title,
  onClick,
}: {
  label: string;
  value?: string | null;
  title: string;
  onClick: () => void;
}) {
  const id = (value || "").trim();
  return (
    <div className="min-w-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-0.5 truncate text-sm font-semibold">
        {id ? (
          <button
            type="button"
            onClick={onClick}
            title={title}
            className="max-w-full truncate font-mono text-sky-500 hover:underline"
          >
            {id}
          </button>
        ) : (
          <span className="text-foreground">—</span>
        )}
      </div>
    </div>
  );
}

/** A flag toggle sitting on top of the photograph, legible over either. */
function FlagButton({
  onClick,
  pressed,
  title,
  children,
}: {
  onClick: () => void;
  pressed: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={pressed}
      className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-white/20 bg-black/40 backdrop-blur-sm transition-colors hover:bg-black/60"
    >
      {children}
    </button>
  );
}

/**
 * A band of related facts under a rule and a heading.
 *
 * Purchase and shipping were each a filled card with its own border and tint,
 * which on a phone stacked into a column of boxes — three containers deep in
 * places, and no clearer for it. A hairline and a small capitalised heading
 * separate them just as well and leave the values room to breathe.
 */
function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border pt-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * One labelled value inside a section.
 *
 * One size, everywhere. Purchase used to render at text-2xl while the rest of
 * the card sat at text-sm, so three of the twenty facts on screen were four
 * times the size of the others for no reason anyone could have named.
 */
function Spec({
  label,
  value,
  className,
}: {
  label: string;
  value?: string | null;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`mt-0.5 block truncate text-sm font-semibold text-foreground ${className ?? ""}`}
        title={value || undefined}
      >
        {value || "—"}
      </span>
    </div>
  );
}

/** A condition grade with its star rating underneath. */
function ConditionSpec({
  label,
  grade,
  rating,
}: {
  label: string;
  grade?: string;
  rating?: number;
}) {
  return (
    <div className="min-w-0">
      <span className="text-xs text-muted-foreground">{label} condition</span>
      <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">
        {grade || "—"}
      </span>
      {rating ? <StarRating value={rating} label={`${label} rating`} size="sm" /> : null}
    </div>
  );
}

function HeroCarImage({ car }: { car: Diecast }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSrc(null);

    if (car.imageUrl) {
      setSrc(car.imageUrl);
      setLoading(false);
      return;
    }

    findCarImage(car, car.brand || "", car.make || "")
      .then((url) => {
        if (cancelled) return;
        if (url) {
          setSrc(url);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    car.id,
    car.imageUrl,
    car.model,
    car.variant,
    car.colour,
    car.brand,
    car.make,
    car.year,
    car.assortment,
    car.series,
    car.subSeries,
    car.carNumber,
  ]);

  return (
    <div className="relative h-full w-full flex items-center justify-center bg-background/60">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {src ? (
        <img
          src={src}
          alt={car.name || `${car.make} ${car.model}`}
          className="h-full w-full object-cover transition-opacity duration-300"
          onError={() => setSrc(null)}
        />
      ) : !loading ? (
        <div className="flex flex-col items-center justify-center gap-1 text-muted-foreground">
          <Car className="size-10" />
          <span className="text-xs">No image available</span>
        </div>
      ) : null}
    </div>
  );
}
