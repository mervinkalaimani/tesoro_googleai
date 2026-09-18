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
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookOpen,
  Calendar,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Diecast } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCars, useCarsActions } from "@/lib/cars-store";
import { useCatalog } from "@/lib/catalog-store";
import { findCarImage } from "@/lib/car-image";
import { formatDayMonthYear, inr, inrFull } from "@/lib/format";
import { trackingPageFor } from "@/lib/tracking";
import { TrackingLink } from "@/components/tracking-link";
import { FAVOURITE_COLOUR, ChaseMark, FavouriteMark } from "@/components/car-marks";
import { StarRating } from "@/components/star-rating";
import { RARITY_FLAME, RARITY_LABEL, nextRarity, rarityOf, withRarity } from "@/lib/rarity";
import { Button } from "@/components/ui/button";
import type { CatalogCar } from "@/lib/catalog";
import {
  resolveCatalogUserId,
  getCatalogCarOwners,
  isCarMatchingCatalog,
  type CatalogCarOwner,
} from "@/lib/catalog";
import { useAuth } from "@/lib/auth-store";
import { CatalogOwnersDialog, parseDateVal } from "@/components/catalog-owners-dialog";
import { StatusPill } from "@/components/status-pill";
import { CarFormDialog } from "@/components/car-form-dialog";
import { ShippingBatchDialog } from "@/components/shipping-batch-dialog";
import { StatusUpdateDialog } from "@/components/status-update-dialog";
import { CarThumb } from "@/components/car-thumb";
import { carSubLine } from "@/lib/car-subline";

/**
 * A car moves forward one step at a time rather than jumping straight to
 * delivered, so the button always advances to the next real stage.
 */
const STATUS_FLOW = [
  "ISO",
  "Pre Order",
  "Waiting",
  "Transit",
  "Delayed",
  "Out for Delivery",
  "Available",
];

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
  const { catalog } = useCatalog();

  const [viewCatalogCar, setViewCatalogCar] = useState<{
    car: Diecast;
    catalogCar: CatalogCar | null;
  } | null>(null);
  const [addAnotherCar, setAddAnotherCar] = useState<Diecast | null>(null);

  // Find latest car state by ID
  const car = cars.find((c) => c.id === currentCarId) || null;

  const open = useCallback((c: Diecast) => {
    setCurrentCarId(c.id);
  }, []);

  const close = useCallback(() => {
    setCurrentCarId(null);
  }, []);

  const handleViewInCatalog = useCallback(
    (targetCar: Diecast) => {
      const found = catalog.find(
        (c) =>
          (targetCar.catalogId && c.car_id.toUpperCase() === targetCar.catalogId.toUpperCase()) ||
          isCarMatchingCatalog(targetCar, c),
      );

      const catCar: CatalogCar = found || {
        car_id: targetCar.catalogId || targetCar.id,
        name: targetCar.name || `${targetCar.make} ${targetCar.model}`.trim(),
        make: targetCar.make,
        model: targetCar.model,
        variant: targetCar.variant || "",
        year: targetCar.year || "",
        colour: targetCar.colour || "",
        type: targetCar.type || "",
        brand: targetCar.brand,
        assortment: targetCar.assortment,
        series: targetCar.series,
        sub_series: targetCar.subSeries,
        car_number: targetCar.carNumber,
        size: targetCar.size || "1:64",
        mrp: targetCar.mrp || targetCar.spent || 0,
        image_url: targetCar.imageUrl || null,
        rarity: targetCar.rarity || "Normal",
        status: "Released",
      };

      const displayCar: Diecast = {
        ...targetCar,
        id: catCar.car_id,
        name: catCar.name || targetCar.name,
      };

      setViewCatalogCar({ car: displayCar, catalogCar: catCar });
    },
    [catalog],
  );

  const handleAddAnother = useCallback(
    (targetCar: Diecast) => {
      close();
      setAddAnotherCar(targetCar);
    },
    [close],
  );

  const handleEdit = useCallback(
    (targetCar: Diecast) => {
      close();
      setEditCar(targetCar);
    },
    [close],
  );

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
          // The phone layout runs its own gestures: pull the photo to close,
          // pull the card to stretch the photo.
          disableSheetDismiss
          className="max-sm:top-0 max-sm:inset-x-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none max-sm:p-0 max-sm:pb-0 max-sm:flex max-sm:flex-col overflow-hidden rounded-3xl border-border bg-background p-0 sm:p-0 gap-0 block text-foreground shadow-2xl sm:max-h-[92vh] sm:w-fit sm:max-w-[calc(100vw-2rem)]"
        >
          {car && (
            <CarPopupContent
              car={car}
              onClose={close}
              onEdit={() => handleEdit(car)}
              onViewInCatalog={() => handleViewInCatalog(car)}
              onAddAnother={() => handleAddAnother(car)}
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

      {/* View in Catalog dialog */}
      {viewCatalogCar && (
        <CatalogCarDetails
          car={viewCatalogCar.car}
          catalogCar={viewCatalogCar.catalogCar}
          open={Boolean(viewCatalogCar)}
          onClose={() => setViewCatalogCar(null)}
        />
      )}

      {/* Add Another car dialog: opens the standard Add a car window with all details of the car added */}
      {addAnotherCar && (
        <CarFormDialog
          open={Boolean(addAnotherCar)}
          onOpenChange={(v) => {
            if (!v) setAddAnotherCar(null);
          }}
          initial={addAnotherCar}
          mode="add"
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

/** How far the photo can be stretched by pulling the card down. */
const MAX_PULL_PX = 180;
/** How far the photo has to be pulled down, or how fast, to close the sheet. */
const CLOSE_PX = 90;
const SPRING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/**
 * The phone layout's gestures, on one scroller:
 *
 * - pushing the card up scrolls it over the photo, which stays put;
 * - pulling the card down from the top stretches the photo (rubber-banded, so
 *   it gives less the further it goes) and springs back on release;
 * - a pull that starts on the photo itself drags the whole sheet down, and
 *   closes it when let go far or fast enough.
 *
 * Touch listeners are attached natively because a pull has to cancel the
 * browser's own overscroll, which React's passive touch handlers cannot.
 */
function useMobileHeroGestures(onClose: () => void) {
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const scroller = scrollRef.current;
    const hero = heroRef.current;
    const content = contentRef.current;
    const card = cardRef.current;
    if (!scroller || !hero || !content || !card) return;
    const sheet = scroller.closest<HTMLElement>('[role="dialog"]');

    let tracking = false;
    let zone: "photo" | "card" = "card";
    let mode: "stretch" | "drag" | null = null;
    let startY = 0;
    let startTime = 0;
    let amount = 0;

    const stretch = (px: number, animate: boolean) => {
      const t = animate ? `260ms ${SPRING}` : "0s";
      content.style.transition = `transform ${t}`;
      content.style.transform = px ? `translateY(${px}px)` : "";
      hero.style.transition = `height ${t}`;
      hero.style.height = px ? `calc(var(--hero-h) + ${px}px)` : "var(--hero-h)";
    };
    const drag = (px: number, animate: boolean) => {
      if (!sheet) return;
      sheet.style.transition = animate ? `transform 220ms ${SPRING}` : "none";
      sheet.style.transform = px ? `translateY(${px}px)` : "";
    };

    const onStart = (e: TouchEvent) => {
      tracking = e.touches.length === 1;
      if (!tracking) return;
      startY = e.touches[0].clientY;
      startTime = Date.now();
      mode = null;
      amount = 0;
      // Above the card's top edge the finger is on the photo.
      zone = startY < card.getBoundingClientRect().top ? "photo" : "card";
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const y = e.touches[0].clientY;
      if (!mode) {
        const dy = y - startY;
        // Pushing up is plain scrolling, and so is pulling down while there is
        // still content above to scroll back to.
        if (dy < 0) {
          tracking = false;
          return;
        }
        if (dy === 0 || scroller.scrollTop > 0) return;
        mode = zone === "photo" ? "drag" : "stretch";
        startY = y;
        startTime = Date.now();
      }
      if (e.cancelable) e.preventDefault();
      const d = Math.max(0, y - startY);
      if (mode === "drag") {
        amount = d;
        drag(amount, false);
      } else {
        amount = MAX_PULL_PX * (1 - Math.exp(-d / (MAX_PULL_PX * 1.4)));
        stretch(amount, false);
      }
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (mode === "drag") {
        const velocity = amount / Math.max(1, Date.now() - startTime);
        if (amount > CLOSE_PX || (velocity > 0.5 && amount > 30)) closeRef.current();
        else drag(0, true);
      } else if (mode === "stretch") {
        stretch(0, true);
      }
      mode = null;
      amount = 0;
    };

    const onScroll = () => {
      if (pillRef.current) {
        pillRef.current.style.opacity = String(Math.max(0, 1 - scroller.scrollTop / 120));
      }
    };

    scroller.addEventListener("touchstart", onStart, { passive: true });
    scroller.addEventListener("touchmove", onMove, { passive: false });
    scroller.addEventListener("touchend", onEnd);
    scroller.addEventListener("touchcancel", onEnd);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("touchstart", onStart);
      scroller.removeEventListener("touchmove", onMove);
      scroller.removeEventListener("touchend", onEnd);
      scroller.removeEventListener("touchcancel", onEnd);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, []);

  return { rootRef, heroRef, scrollRef, contentRef, cardRef, pillRef };
}

function isExactMatch(a: Diecast, b: Diecast): boolean {
  const norm = (v?: string | number | null) =>
    String(v ?? "")
      .trim()
      .toLowerCase();
  return (
    norm(a.make) === norm(b.make) &&
    norm(a.model) === norm(b.model) &&
    norm(a.variant) === norm(b.variant) &&
    norm(a.year) === norm(b.year) &&
    norm(a.colour) === norm(b.colour) &&
    norm(a.brand) === norm(b.brand) &&
    norm(a.series) === norm(b.series) &&
    norm(a.subSeries) === norm(b.subSeries) &&
    norm(a.carNumber) === norm(b.carNumber) &&
    norm(a.assortment) === norm(b.assortment) &&
    norm(a.type) === norm(b.type) &&
    norm(a.size) === norm(b.size)
  );
}

interface CarPopupContentProps {
  car: Diecast;
  onClose: () => void;
  onEdit: () => void;
  onViewInCatalog: () => void;
  onAddAnother: () => void;
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
  onViewInCatalog,
  onAddAnother,
  onOpenBatch,
  onToggleFavourite,
  onToggleChase,
  onUpdateStatus,
  onSelectCar,
}: CarPopupContentProps) {
  const cars = useCars();
  const mobile = useMobileHeroGestures(onClose);

  useEffect(() => {
    document.getElementById("car-details-mobile-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
    const dialogElem = document.getElementById("car-details-dialog-content");
    if (dialogElem) {
      dialogElem.scrollTo({ top: 0, behavior: "smooth" });
    }
    const leftElem = document.getElementById("car-details-left-col");
    if (leftElem) {
      leftElem.scrollTo({ top: 0, behavior: "smooth" });
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
  const seriesHeading = seriesName ? `More from ${seriesName}` : "More from collection";
  const setHeading = setName ? `More from ${setName} set` : "More from set";

  const exactCount = useMemo(() => {
    return cars.filter((c) => isExactMatch(c, car)).length;
  }, [cars, car]);

  const seriesCars = useMemo(() => {
    if (!seriesName) return [];
    const targetSeries = seriesName.toLowerCase();
    return cars.filter((c) => (c.series || "").trim().toLowerCase() === targetSeries);
  }, [cars, seriesName]);

  const setCars = useMemo(() => {
    if (!setName) return [];
    const targetSet = setName.toLowerCase();
    return cars.filter((c) => {
      const cSet = ((c as unknown as { set?: string }).set || c.subSeries || "")
        .trim()
        .toLowerCase();
      return cSet === targetSet;
    });
  }, [cars, setName]);

  // Cars other than the current car
  const otherSeriesCars = useMemo(() => {
    return seriesCars.filter((c) => c.id !== car.id);
  }, [seriesCars, car.id]);

  const otherSetCars = useMemo(() => {
    return setCars.filter((c) => c.id !== car.id);
  }, [setCars, car.id]);

  const hasMoreToShow = otherSeriesCars.length > 0 || otherSetCars.length > 0;

  // A set that holds only this car has nothing to show beside it.
  const showSet = setCars.length > 1;

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
    <div className="relative w-full h-full flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Hidden Accessible Dialog Title & Description */}
      <DialogTitle className="sr-only">
        {car.name || `${car.make} ${car.model}`} Details
      </DialogTitle>
      <DialogDescription className="sr-only">
        Diecast car specifications, status, logistics, and pricing details.
      </DialogDescription>

      {/* =====================================================================
          1. DESKTOP & TABLET LAYOUT (Screen >= md: 2 or 3 columns based on hasMoreToShow)
          ===================================================================== */}
      <div className="hidden md:flex md:flex-row md:items-stretch md:h-[84vh] md:max-h-[84vh] w-fit overflow-hidden px-5 xl:px-6 py-4 xl:py-5 divide-x divide-border">
        {/* LEFT COLUMN: Photo, Title, Specs, Rarity, 3 Action Buttons */}
        <div className="w-[360px] xl:w-[390px] shrink-0 pr-5 xl:pr-6 flex flex-col h-full overflow-hidden justify-between">
          <div
            id="car-details-left-col"
            className="flex-1 overflow-y-auto pr-1 scrollbar-thin space-y-3.5"
          >
            {/* Main Car Photo Area */}
            <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden shadow-xs bg-muted/20 border border-border/60 shrink-0">
              <HeroCarImage car={car} />
            </div>

            {/* Car title section */}
            <CarTitleSection car={car} />

            <hr className="border-border" />

            {/* Car details section (specs) */}
            <CarSpecsSection car={car} hasCondition={hasCondition} />

            <hr className="border-border" />

            {/* Rarity & Favourite section */}
            <CarRaritySection
              car={car}
              rarity={rarity}
              onToggleChase={onToggleChase}
              onToggleFavourite={onToggleFavourite}
              exactCount={exactCount}
            />
          </div>

          {/* Action Buttons on the left side: View in Catalogue | Add Another */}
          <div className="sticky bottom-0 z-10 bg-background/95 backdrop-blur-xs pt-3 pb-1 border-t border-border/60">
            <CarActionButtons onViewInCatalog={onViewInCatalog} onAddAnother={onAddAnother} />
          </div>
        </div>

        {/* MIDDLE/RIGHT COLUMN: Purchase details, Logistics & Shipping, and Update button */}
        <div
          className={cn(
            "w-[360px] xl:w-[390px] shrink-0 flex flex-col h-full overflow-hidden justify-between",
            hasMoreToShow ? "px-5 xl:px-6" : "pl-5 xl:pl-6",
          )}
        >
          <div id="car-details-middle-col" className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
            <CarPurchaseAndShippingSection
              car={car}
              spent={spent}
              mrp={mrp}
              delta={delta}
              hasArrived={hasArrived}
              cleanTransitNotes={cleanTransitNotes}
              trackable={trackable}
              onOpenBatch={onOpenBatch}
            />
          </div>

          {/* Sticky bottom bar for right section: Update button */}
          <div className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-background/95 backdrop-blur-xs pt-3 pb-1">
            <Button
              onClick={onEdit}
              className="w-full h-10 font-semibold gap-2 cursor-pointer shadow-xs"
              title="Update car"
            >
              <Pencil className="size-4 shrink-0" />
              <span>Update</span>
            </Button>
          </div>
        </div>

        {/* RIGHT COLUMN: More from series & set (ONLY RENDERED IF hasMoreToShow) */}
        {hasMoreToShow && (
          <div className="w-[360px] xl:w-[390px] shrink-0 pl-5 xl:pl-6 flex flex-col h-full overflow-y-auto space-y-6 scrollbar-thin">
            {/* Series Section */}
            {otherSeriesCars.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate"
                    title={seriesHeading}
                  >
                    {seriesHeading}
                  </span>
                  <span className="text-[11px] font-semibold text-muted-foreground tabular-nums shrink-0 ml-1">
                    {otherSeriesCars.length} {otherSeriesCars.length === 1 ? "car" : "cars"}
                  </span>
                </div>

                <WebRelatedGridShelf
                  cars={seriesCars}
                  currentCarId={car.id}
                  onSelectCar={onSelectCar}
                />
              </div>
            )}

            {/* Set Section */}
            {otherSetCars.length > 0 && (
              <>
                {otherSeriesCars.length > 0 && <hr className="border-border/60" />}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate"
                      title={setHeading}
                    >
                      {setHeading}
                    </span>
                    <span className="text-[11px] font-semibold text-muted-foreground tabular-nums shrink-0 ml-1">
                      {otherSetCars.length} {otherSetCars.length === 1 ? "car" : "cars"}
                    </span>
                  </div>

                  <WebRelatedGridShelf
                    cars={setCars}
                    currentCarId={car.id}
                    onSelectCar={onSelectCar}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* =====================================================================
          3. MOBILE SINGLE-COLUMN LAYOUT (< md screens)
          ===================================================================== */}
      <div
        ref={mobile.rootRef}
        className="md:hidden relative w-full h-full flex flex-col flex-1 min-h-0 overflow-hidden bg-background"
        style={{ "--hero-h": "clamp(360px, 48vh, 520px)" } as React.CSSProperties}
      >
        <div className="relative flex-1 min-h-0">
          {/* The photo sits still behind the sheet: pushing the card up slides
              it over the photo, pulling the card down stretches the photo. */}
          <div
            ref={mobile.heroRef}
            className="absolute inset-x-0 top-0 z-0 w-full overflow-hidden bg-muted/60 select-none"
            style={{ height: "var(--hero-h)" }}
          >
            <HeroCarImage car={car} />
          </div>

          {/* Scrollable body: a see-through gap the height of the photo, then the card */}
          <div
            ref={mobile.scrollRef}
            id="car-details-mobile-scroll"
            className="absolute inset-0 z-10 overflow-y-auto overflow-x-hidden overscroll-contain"
          >
            <div ref={mobile.contentRef} className="flex min-h-full flex-col">
              <div
                aria-hidden
                className="shrink-0"
                style={{ height: "calc(var(--hero-h) - 1.5rem)" }}
              />

              {/* Car Design Card (slides over the car image on scroll) */}
              <div
                ref={mobile.cardRef}
                className="relative rounded-t-3xl border-t border-border bg-background px-4 pt-5 pb-6 shadow-[0_-8px_24px_rgba(0,0,0,0.1)] flex-1 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  {/* Car title section */}
                  <CarTitleSection car={car} />

                  {/* Action buttons on the left / card top: View in Catalogue | Add Another */}
                  <CarActionButtons onViewInCatalog={onViewInCatalog} onAddAnother={onAddAnother} />

                  <hr className="border-border" />

                  {/* Car details (specs) */}
                  <CarSpecsSection car={car} hasCondition={hasCondition} />

                  <hr className="border-border" />

                  {/* Rarity */}
                  <CarRaritySection
                    car={car}
                    rarity={rarity}
                    onToggleChase={onToggleChase}
                    onToggleFavourite={onToggleFavourite}
                    exactCount={exactCount}
                  />

                  <hr className="border-border" />

                  {/* Purchase & Shipping */}
                  <CarPurchaseAndShippingSection
                    car={car}
                    spent={spent}
                    mrp={mrp}
                    delta={delta}
                    hasArrived={hasArrived}
                    cleanTransitNotes={cleanTransitNotes}
                    trackable={trackable}
                    onOpenBatch={onOpenBatch}
                  />

                  {/* More from series shelf */}
                  {otherSeriesCars.length > 0 && (
                    <div className="pt-2">
                      <hr className="my-3.5 border-border" />
                      <div className="mb-2.5 flex items-center justify-between">
                        <span
                          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate"
                          title={seriesHeading}
                        >
                          {seriesHeading}
                        </span>
                        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 ml-1">
                          {otherSeriesCars.length} {otherSeriesCars.length === 1 ? "car" : "cars"}
                        </span>
                      </div>
                      <div className="-mx-4 flex snap-x scroll-px-4 items-stretch gap-2.5 overflow-x-auto px-4 pb-2 scrollbar-none">
                        {seriesCars.map((relatedCar) => (
                          <RelatedCarCard
                            key={relatedCar.id}
                            car={relatedCar}
                            isCurrent={relatedCar.id === car.id}
                            className="w-28 sm:w-32 shrink-0 snap-start"
                            onSelect={() => onSelectCar?.(relatedCar)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* More from set shelf */}
                  {otherSetCars.length > 0 && (
                    <div className="pt-2">
                      <hr className="my-3.5 border-border" />
                      <div className="mb-2.5 flex items-center justify-between">
                        <span
                          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate"
                          title={setHeading}
                        >
                          {setHeading}
                        </span>
                        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 ml-1">
                          {otherSetCars.length} {otherSetCars.length === 1 ? "car" : "cars"}
                        </span>
                      </div>
                      <div className="-mx-4 flex snap-x scroll-px-4 items-stretch gap-2.5 overflow-x-auto px-4 pb-2 scrollbar-none">
                        {setCars.map((relatedCar) => (
                          <RelatedCarCard
                            key={relatedCar.id}
                            car={relatedCar}
                            isCurrent={relatedCar.id === car.id}
                            className="w-28 sm:w-32 shrink-0 snap-start"
                            onSelect={() => onSelectCar?.(relatedCar)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Drag pill and close button float above the photo. The pill fades as
              the card covers the photo; the close button stays reachable. */}
          <div
            ref={mobile.pillRef}
            aria-hidden
            className="pointer-events-none absolute top-2.5 left-1/2 z-20 -translate-x-1/2 py-1 px-4"
          >
            <div className="h-1.5 w-12 rounded-full bg-white/85 shadow-md backdrop-blur-md" />
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close details"
            aria-label="Close"
            className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-30 flex size-8 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur-md transition-colors hover:bg-black/70 active:scale-95"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Pinned bottom bar: always docked at the bottom of the screen */}
        <div className="shrink-0 z-20 border-t border-border bg-background/95 backdrop-blur-md p-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(0,0,0,0.08)] flex items-center gap-2.5">
          <Button
            onClick={onEdit}
            className="w-full h-10 font-semibold gap-2 cursor-pointer shadow-xs"
            title="Update car"
          >
            <Pencil className="size-4 shrink-0" />
            <span>Update</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Reusable title section placed on left column above or in card */
export function CarTitleSection({ car }: { car: Diecast }) {
  return (
    <div className="space-y-1.5">
      {/* Brand & Assortment on the left side, status tag on the right side */}
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

      {/* Followed by car name */}
      <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl leading-snug">
        {car.name || `${car.make} ${car.model} ${car.variant || ""}`.trim() || "Unnamed car"}
      </h2>

      {/* Car ID sits below the car name, no title, no container. Show only the last 11 characters. */}
      {car.id && (
        <p className="font-mono text-xs text-muted-foreground/80 select-all tracking-wider">
          {car.id.slice(-11)}
        </p>
      )}
    </div>
  );
}

/** 2 action buttons on the left side: View in Catalogue | Add Another */
function CarActionButtons({
  onViewInCatalog,
  onAddAnother,
}: {
  onViewInCatalog: () => void;
  onAddAnother: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={onViewInCatalog}
        className="h-9 px-2 text-xs font-semibold gap-1.5 cursor-pointer hover:bg-muted"
        title="View in Catalogue"
      >
        <BookOpen className="size-3.5 shrink-0" />
        <span className="truncate">View in Catalogue</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onAddAnother}
        className="h-9 px-2 text-xs font-semibold gap-1.5 cursor-pointer hover:bg-muted"
        title="Add Another"
      >
        <Plus className="size-3.5 shrink-0" />
        <span className="truncate">Add Another</span>
      </Button>
    </div>
  );
}

/** Car details section (specs) */
function CarSpecsSection({ car, hasCondition }: { car: Diecast; hasCondition: boolean }) {
  return (
    <div>
      <SpecGrid>
        <Spec label="Series" value={car.series} />
        <Spec label="Sub series" value={car.subSeries} />
        <Spec label="Car number" value={car.carNumber} />
        {car.caseNumber ? <Spec label="Case number" value={car.caseNumber} /> : null}
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
  );
}

/** Rarity & Favourite section */
function CarRaritySection({
  car,
  rarity,
  onToggleChase,
  onToggleFavourite,
  exactCount,
}: {
  car: Diecast;
  rarity: import("@/lib/rarity").Rarity;
  onToggleChase: () => void;
  onToggleFavourite: () => void;
  exactCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-muted/20 p-2 sm:p-2.5">
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Rarity Button */}
        <button
          type="button"
          onClick={onToggleChase}
          title={`${RARITY_LABEL[rarity]} — tap for ${RARITY_LABEL[nextRarity(rarity)]}`}
          className={cn(
            "flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer select-none active:scale-95",
            rarity !== "Normal"
              ? "bg-accent/20 border-accent/50 text-foreground shadow-xs"
              : "bg-background/80 border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/70",
          )}
        >
          <Flame
            className={cn(
              "size-3.5 shrink-0",
              rarity === "Normal" ? "text-muted-foreground" : RARITY_FLAME[rarity],
            )}
          />
          <span>{RARITY_LABEL[rarity]}</span>
        </button>

        {/* Favourite Button */}
        <button
          type="button"
          onClick={onToggleFavourite}
          title={car.favourite ? "Remove from favourites" : "Add to favourites"}
          className={cn(
            "flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer select-none active:scale-95",
            car.favourite
              ? "bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400 shadow-xs"
              : "bg-background/80 border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/70",
          )}
        >
          <Star
            className={cn(
              "size-3.5 shrink-0",
              car.favourite ? FAVOURITE_COLOUR : "text-muted-foreground",
            )}
          />
          <span>{car.favourite ? "Favourited" : "Favourite"}</span>
        </button>
      </div>

      {/* Number of identical cars if > 1 */}
      {exactCount > 1 ? (
        <div
          title={`${exactCount} identical cars with matching specifications in your collection`}
          className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary tabular-nums select-none"
        >
          <Layers className="size-3 shrink-0" />
          <span>{exactCount}x Cars</span>
        </div>
      ) : null}
    </div>
  );
}

/** Purchase, Shipping & Logistics section */
function CarPurchaseAndShippingSection({
  car,
  spent,
  mrp,
  delta,
  hasArrived,
  cleanTransitNotes,
  trackable,
  onOpenBatch,
}: {
  car: Diecast;
  spent: number;
  mrp: number;
  delta: number;
  hasArrived: boolean;
  cleanTransitNotes: string;
  trackable: boolean;
  onOpenBatch: (id: string, field: "orderId" | "shippingId") => void;
}) {
  return (
    <div className="space-y-4">
      {/* Purchase details */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Purchase
        </h3>
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

      <hr className="border-border" />

      {/* Shipping / Logistics details */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Logistics & Shipping
        </h3>
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
          <p className="mt-2 text-xs text-foreground bg-muted/30 rounded-lg p-2.5 border border-border/50">
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
  currentCarId,
  onSelectCar,
}: {
  cars: Diecast[];
  currentCarId?: string;
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
            isCurrent={relatedCar.id === currentCarId}
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
  currentCarId,
  onSelectCar,
}: {
  cars: Diecast[];
  currentCarId?: string;
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
            isCurrent={relatedCar.id === currentCarId}
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
  isCurrent = false,
}: {
  car: Diecast;
  onSelect: () => void;
  className?: string;
  isCurrent?: boolean;
}) {
  const title = car.name || `${car.make} ${car.model}`.trim() || "Unnamed car";
  const rarity = rarityOf(car);
  const subtitle = carSubLine(car);

  return (
    <button
      type="button"
      onClick={onSelect}
      title={title}
      className={cn(
        "group relative flex flex-col rounded-xl border border-border/80 bg-card p-2 text-left shadow-xs transition-all hover:border-primary/50 hover:shadow-md active:scale-95 cursor-pointer",
        isCurrent && "border-primary/70 ring-1 ring-primary/40 bg-primary/5",
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted/40">
        <CarThumb car={car} className="size-full object-cover" />
        {isCurrent && (
          <span className="absolute left-1 top-1 rounded bg-primary/90 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider text-primary-foreground shadow-xs">
            Viewing
          </span>
        )}
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

/**
 * A catalogue entry, in the car details layout with everything about a purchase
 * taken out: what the casting is, how rare, what it retails for, and — for a
 * pre-order — when it is due. One long button at the bottom adds it.
 */
export function CatalogCarDetails({
  car,
  catalogCar,
  preOrder,
  expectedDate,
  owned,
  onClose,
  onAdd,
  canEdit,
  onEdit,
  canDelete,
  onDelete,
}: {
  /** The entry shaped as a car; null when closed. */
  car: Diecast | null;
  catalogCar?: CatalogCar | null;
  preOrder: boolean;
  expectedDate?: string | null;
  owned: boolean;
  onClose: () => void;
  onAdd: () => void;
  canEdit?: boolean;
  onEdit?: () => void;
  /** Owner only: removing the casting from the catalogue altogether. */
  canDelete?: boolean;
  onDelete?: () => void;
}) {
  const [showOwnersColumn, setShowOwnersColumn] = useState(false);

  // Reset 3rd column whenever a different car is opened
  useEffect(() => {
    setShowOwnersColumn(false);
  }, [car?.id]);

  return (
    <Dialog open={Boolean(car)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        hideDragHandle
        disableSheetDismiss
        className="max-sm:top-0 max-sm:inset-x-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none max-sm:p-0 max-sm:flex max-sm:flex-col block gap-0 overflow-hidden rounded-3xl border-border bg-background p-0 sm:p-0 text-foreground shadow-2xl sm:max-h-[92vh] sm:w-fit w-fit max-w-fit sm:max-w-[calc(100vw-2rem)] transition-[max-width] duration-200"
      >
        {car && (
          <CatalogDetailsContent
            car={car}
            catalogCar={catalogCar}
            preOrder={preOrder}
            expectedDate={expectedDate}
            owned={owned}
            onClose={onClose}
            onAdd={onAdd}
            canEdit={canEdit}
            onEdit={onEdit}
            showOwnersColumn={showOwnersColumn}
            onToggleOwnersColumn={setShowOwnersColumn}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CatalogDetailsContent({
  car,
  catalogCar,
  preOrder,
  expectedDate,
  owned,
  onClose,
  onAdd,
  canEdit,
  onEdit,
  showOwnersColumn = false,
  onToggleOwnersColumn,
}: {
  car: Diecast;
  catalogCar?: CatalogCar | null;
  preOrder: boolean;
  expectedDate?: string | null;
  owned: boolean;
  onClose: () => void;
  onAdd: () => void;
  canEdit?: boolean;
  onEdit?: () => void;
  showOwnersColumn?: boolean;
  onToggleOwnersColumn?: (show: boolean) => void;
}) {
  const mobile = useMobileHeroGestures(onClose);
  const { isAdmin, user, profile } = useAuth();
  const mine = useCars();
  const [owners, setOwners] = useState<CatalogCarOwner[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [ownersModalOpen, setOwnersModalOpen] = useState(false);

  const matchingUserCar = useMemo(() => {
    if (!catalogCar) return null;
    return mine.find((c) => isCarMatchingCatalog(c, catalogCar)) || null;
  }, [mine, catalogCar]);

  const isActuallyOwned = owned || Boolean(matchingUserCar);

  useEffect(() => {
    if (!isAdmin || !catalogCar?.car_id) {
      setOwners([]);
      return;
    }
    let cancelled = false;
    setOwnersLoading(true);
    getCatalogCarOwners(catalogCar.car_id, {
      catalogCar,
      isOwned: isActuallyOwned,
      currentUser: user
        ? { uid: user.id, email: user.email, profile }
        : profile
          ? { uid: profile.user_id || "current-user", email: null, profile }
          : { uid: "current-user", email: null, profile: null },
      userCar: matchingUserCar,
    })
      .then((data) => {
        if (!cancelled) setOwners(data);
      })
      .finally(() => {
        if (!cancelled) setOwnersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, catalogCar?.car_id, catalogCar, isActuallyOwned, user, profile, matchingUserCar]);

  const handleSeeAll = () => {
    if (typeof window !== "undefined" && window.innerWidth >= 768 && onToggleOwnersColumn) {
      onToggleOwnersColumn(!showOwnersColumn);
    } else {
      setOwnersModalOpen(true);
    }
  };

  const actionButtons = (
    <div className="flex w-full items-center gap-2.5">
      {canEdit && onEdit && (
        <Button
          type="button"
          variant="outline"
          onClick={onEdit}
          className="h-11 shrink-0 gap-1.5 px-4 text-sm font-semibold cursor-pointer border-border hover:bg-muted"
        >
          <Pencil className="size-4" />
          Edit
        </Button>
      )}
      <Button onClick={onAdd} className="h-11 flex-1 gap-2 text-sm font-semibold">
        <Plus className="size-4" />
        {isActuallyOwned ? "Add another to collection" : "Add to collection"}
      </Button>
    </div>
  );

  return (
    <div className="relative flex h-full w-full min-h-0 flex-1 flex-col overflow-hidden">
      <DialogTitle className="sr-only">{car.name} — catalogue</DialogTitle>
      <DialogDescription className="sr-only">
        What this casting is, its rarity and retail price, with a button to add it.
      </DialogDescription>

      {/* Desktop layout: 3 sections in equal size, side padding, image filled above title on left, 3rd column on See All */}
      <div className="hidden w-fit md:flex md:h-[82vh] md:max-h-[82vh] md:flex-row md:items-stretch overflow-hidden px-5 xl:px-6 py-4 xl:py-5 divide-x divide-border">
        {/* SECTION 1: Left Column - Image filled above & Title section below */}
        <div className="w-[360px] xl:w-[390px] shrink-0 pr-5 xl:pr-6 flex flex-col h-full overflow-y-auto scrollbar-thin space-y-4">
          <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden shadow-xs bg-muted/20 border border-border/60 shrink-0">
            <HeroCarImage car={car} />
          </div>
          <CatalogCarTitleSection
            car={car}
            catalogCar={catalogCar}
            owned={isActuallyOwned}
            preOrder={preOrder}
            onSeeAllOwners={handleSeeAll}
          />
        </div>

        {/* SECTION 2: Middle Column - Specifications, Provenance & Sticky Actions */}
        <div
          className={cn(
            "w-[360px] xl:w-[390px] shrink-0 flex flex-col h-full overflow-hidden",
            showOwnersColumn ? "px-5 xl:px-6" : "pl-5 xl:pl-6",
          )}
        >
          <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
            <CatalogDetailsBody
              car={car}
              catalogCar={catalogCar}
              preOrder={preOrder}
              expectedDate={expectedDate}
              owned={isActuallyOwned}
              showTitle={false}
              owners={owners}
              ownersLoading={ownersLoading}
              onSeeAllOwners={handleSeeAll}
            />
          </div>
          <div className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-background/95 backdrop-blur-xs pt-3 pb-1 flex items-center gap-2.5">
            {actionButtons}
          </div>
        </div>

        {/* SECTION 3: Right Column - Owners (Only when See All is clicked, do not auto scale) */}
        {showOwnersColumn && (
          <div className="w-[360px] xl:w-[390px] shrink-0 pl-5 xl:pl-6 flex flex-col h-full overflow-hidden">
            <CatalogOwnersColumn
              owners={owners}
              loading={ownersLoading}
              carName={car.name || `${car.make} ${car.model}`}
              onClose={() => onToggleOwnersColumn?.(false)}
            />
          </div>
        )}
      </div>

      {/* Phone: the same photo-under-card layout as a car's own details. */}
      <div
        ref={mobile.rootRef}
        className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-background md:hidden"
        style={{ "--hero-h": "clamp(320px, 44vh, 480px)" } as React.CSSProperties}
      >
        <div className="relative min-h-0 flex-1">
          <div
            ref={mobile.heroRef}
            className="absolute inset-x-0 top-0 z-0 w-full select-none overflow-hidden bg-muted/60"
            style={{ height: "var(--hero-h)" }}
          >
            <HeroCarImage car={car} />
          </div>
          <div
            ref={mobile.scrollRef}
            className="absolute inset-0 z-10 overflow-y-auto overflow-x-hidden overscroll-contain"
          >
            <div ref={mobile.contentRef} className="flex min-h-full flex-col">
              <div
                aria-hidden
                className="shrink-0"
                style={{ height: "calc(var(--hero-h) - 1.5rem)" }}
              />
              <div
                ref={mobile.cardRef}
                className="relative flex-1 rounded-t-3xl border-t border-border bg-background px-4 pb-6 pt-5 shadow-[0_-8px_24px_rgba(0,0,0,0.1)]"
              >
                <CatalogDetailsBody
                  car={car}
                  catalogCar={catalogCar}
                  preOrder={preOrder}
                  expectedDate={expectedDate}
                  owned={owned}
                  showTitle={true}
                  owners={owners}
                  ownersLoading={ownersLoading}
                  onSeeAllOwners={() => setOwnersModalOpen(true)}
                />
              </div>
            </div>
          </div>
          <div
            ref={mobile.pillRef}
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-2.5 z-20 -translate-x-1/2 px-4 py-1"
          >
            <div className="h-1.5 w-12 rounded-full bg-white/85 shadow-md backdrop-blur-md" />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-30 flex size-8 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur-md transition-colors hover:bg-black/70 active:scale-95"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="z-20 shrink-0 border-t border-border bg-background/95 p-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(0,0,0,0.08)] backdrop-blur-md">
          {actionButtons}
        </div>
      </div>

      {/* Mobile Dialog fallback when See All is clicked on phone */}
      {isAdmin && (
        <CatalogOwnersDialog
          open={ownersModalOpen}
          onClose={() => setOwnersModalOpen(false)}
          carName={car.name || `${car.make} ${car.model}`}
          owners={owners}
          loading={ownersLoading}
        />
      )}
    </div>
  );
}

function CatalogDetailsBody({
  car,
  catalogCar,
  preOrder,
  expectedDate,
  owned,
  showTitle = true,
  owners: externalOwners,
  ownersLoading: externalOwnersLoading,
  onSeeAllOwners,
}: {
  car: Diecast;
  catalogCar?: CatalogCar | null;
  preOrder: boolean;
  expectedDate?: string | null;
  owned: boolean;
  showTitle?: boolean;
  owners?: CatalogCarOwner[];
  ownersLoading?: boolean;
  onSeeAllOwners?: () => void;
}) {
  const rarity = rarityOf(car);
  const addedBy = resolveCatalogUserId(catalogCar?.created_by);
  const addedOn = formatDayMonthYear(catalogCar?.created_at) || "—";
  // An entry nobody has corrected has no editor and no edit date. Falling back
  // to the creator and the filing date, as this used to, described an edit that
  // never happened — and now that the column exists it can say so instead.
  const edited = Boolean(catalogCar?.updated_by);
  const updatedBy = edited ? resolveCatalogUserId(catalogCar?.updated_by) : "—";
  const updatedOn = edited ? formatDayMonthYear(catalogCar?.updated_at) || "—" : "—";

  const { isAdmin, user, profile } = useAuth();
  const mine = useCars();
  const [internalOwners, setInternalOwners] = useState<CatalogCarOwner[]>([]);
  const [internalOwnersLoading, setInternalOwnersLoading] = useState(false);
  const [ownersModalOpen, setOwnersModalOpen] = useState(false);

  const owners = externalOwners ?? internalOwners;
  const ownersLoading = externalOwnersLoading ?? internalOwnersLoading;

  const matchingUserCar = useMemo(() => {
    if (!catalogCar?.car_id) return null;
    const clean = catalogCar.car_id.trim().toUpperCase();
    return (
      mine.find((c) => (c.catalogId || "").trim().toUpperCase() === clean) ||
      mine.find((c) => (c.id || "").trim().toUpperCase() === clean) ||
      mine.find((c) => (c.carId || "").trim().toUpperCase() === clean) ||
      mine.find(
        (c) =>
          c.make?.trim().toLowerCase() === catalogCar.make?.trim().toLowerCase() &&
          c.model?.trim().toLowerCase() === catalogCar.model?.trim().toLowerCase() &&
          c.brand?.trim().toLowerCase() === catalogCar.brand?.trim().toLowerCase() &&
          (!catalogCar.assortment ||
            c.assortment?.trim().toLowerCase() === catalogCar.assortment?.trim().toLowerCase()),
      ) ||
      null
    );
  }, [mine, catalogCar]);

  useEffect(() => {
    if (externalOwners !== undefined) return;
    if (!isAdmin || !catalogCar?.car_id) {
      setInternalOwners([]);
      return;
    }
    let cancelled = false;
    setInternalOwnersLoading(true);
    getCatalogCarOwners(catalogCar.car_id, {
      catalogCar,
      isOwned: owned,
      currentUser: user ? { uid: user.id, email: user.email, profile } : null,
      userCar: matchingUserCar,
    })
      .then((data) => {
        if (!cancelled) setInternalOwners(data);
      })
      .finally(() => {
        if (!cancelled) setInternalOwnersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    externalOwners,
    isAdmin,
    catalogCar?.car_id,
    catalogCar,
    owned,
    user,
    profile,
    matchingUserCar,
  ]);

  return (
    <div className="space-y-4">
      {showTitle && (
        <>
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-1.5 truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span>{car.brand || "—"}</span>
                {car.assortment && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="truncate">{car.assortment}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {owned && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                    <CheckCircle2 className="size-3" />
                    <span>In your collection</span>
                  </span>
                )}
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    preOrder
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
                  )}
                >
                  {preOrder ? "Pre Order" : "Released"}
                </span>
              </div>
            </div>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {car.name || `${car.make} ${car.model}`.trim() || "Unnamed car"}
            </h2>
          </div>

          <hr className="border-border" />
        </>
      )}

      <SpecGrid>
        <Spec label="Make" value={car.make} />
        <Spec label="Model" value={car.model} />
        <Spec label="Year" value={car.year} />
        <Spec label="Colour" value={car.colour} />
        <Spec label="Assortment" value={car.assortment} />
        <Spec label="Series" value={car.series} />
        <Spec label="Sub series" value={car.subSeries} />
        <Spec label="Car number" value={car.carNumber} />
        <Spec label="Retail / MRP" value={car.mrp ? inrFull(Math.round(car.mrp)) : ""} />
      </SpecGrid>

      <hr className="border-border" />

      {/* Read-only here: the rarity is the catalogue's, not something to tap. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/80 bg-muted/20 p-2.5 sm:p-3">
        {(["Chase", "TH", "STH"] as const).map((r) => (
          <span
            key={r}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold",
              rarity === r
                ? "border-accent/50 bg-accent/20 text-foreground shadow-xs"
                : "border-border/80 bg-background/80 text-muted-foreground/60",
            )}
          >
            <Flame
              className={cn(
                "size-4 shrink-0",
                rarity === r ? RARITY_FLAME[r] : "text-muted-foreground/50",
              )}
            />
            {r}
          </span>
        ))}
      </div>

      <hr className="border-border" />

      <SpecGrid>
        <Spec
          label="Catalogue ID"
          value={catalogCar?.car_id || car.catalogId || car.carId || car.id || "—"}
        />
        {preOrder && expectedDate && (
          <Spec label="Expected date" value={formatDayMonthYear(expectedDate) || expectedDate} />
        )}
      </SpecGrid>

      {/* Only when the entry itself is to hand. Opened off a shared pre-order
          there is no catalogue row behind it, and three em-dashes under a
          heading say less than no heading at all. */}
      {catalogCar && (
        <>
          <hr className="border-border" />

          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Catalogue Provenance
              </h3>
              {isAdmin && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onSeeAllOwners || (() => setOwnersModalOpen(true))}
                  className="h-6 px-2 text-xs font-semibold text-primary hover:text-primary/80 hover:bg-primary/10 cursor-pointer"
                >
                  See All
                </Button>
              )}
            </div>
            {/* Two columns, not three: who and when, read across — filed on the
                top line, last corrected on the bottom. */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              <Spec label="Added by" value={addedBy} />
              <Spec label="Added on" value={addedOn} />
              <Spec label="Updated by" value={updatedBy} />
              <Spec label="Updated on" value={updatedOn} />

              {isAdmin && (
                <div className="col-span-2 pt-2 border-t border-border/50">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      People who owns it
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={onSeeAllOwners || (() => setOwnersModalOpen(true))}
                      className="h-5 px-1.5 text-xs font-semibold text-primary hover:text-primary/80 hover:bg-primary/10 cursor-pointer"
                    >
                      See All
                    </Button>
                  </div>
                  <div className="text-sm font-semibold text-foreground mt-0.5">
                    {ownersLoading ? (
                      <span className="text-xs text-muted-foreground">Loading...</span>
                    ) : (
                      `${owners.length} ${owners.length === 1 ? "user" : "users"}`
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {isAdmin && !onSeeAllOwners && (
            <CatalogOwnersDialog
              open={ownersModalOpen}
              onClose={() => setOwnersModalOpen(false)}
              carName={car.name || `${car.make} ${car.model}`}
              owners={owners}
              loading={ownersLoading}
            />
          )}
        </>
      )}
    </div>
  );
}

export function CatalogCarTitleSection({
  car,
  catalogCar,
  owned,
  preOrder,
  onSeeAllOwners,
}: {
  car: Diecast;
  catalogCar?: CatalogCar | null;
  owned: boolean;
  preOrder: boolean;
  onSeeAllOwners?: () => void;
}) {
  const { isAdmin } = useAuth();

  return (
    <div className="space-y-2.5">
      {/* Brand & Assortment on the left, status tags on the right */}
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
        <div className="flex items-center gap-1.5 shrink-0">
          {owned && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
              <CheckCircle2 className="size-3" />
              <span>In your collection</span>
            </span>
          )}
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
              preOrder
                ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
            )}
          >
            {preOrder ? "Pre Order" : "Released"}
          </span>
        </div>
      </div>

      {/* Car title */}
      <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl leading-snug">
        {car.name || `${car.make} ${car.model} ${car.variant || ""}`.trim() || "Unnamed car"}
      </h2>

      {/* Catalog ID sits below the title, no container, no title label */}
      {(catalogCar?.car_id || car.catalogId) && (
        <p className="font-mono text-xs text-muted-foreground/80 select-all tracking-wider">
          {catalogCar?.car_id || car.catalogId}
        </p>
      )}
    </div>
  );
}

export function CatalogOwnersColumn({
  owners,
  loading,
  carName,
  onClose,
}: {
  owners: CatalogCarOwner[];
  loading: boolean;
  carName: string;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return owners;
    return owners.filter((o) => {
      return (
        (o.display_name && o.display_name.toLowerCase().includes(q)) ||
        (o.user_id && o.user_id.toLowerCase().includes(q)) ||
        (o.first_name && o.first_name.toLowerCase().includes(q)) ||
        (o.last_name && o.last_name.toLowerCase().includes(q))
      );
    });
  }, [owners, search]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/60 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">People who own it</h3>
          <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-xs font-semibold tabular-nums shrink-0">
            {owners.length}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="size-7 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Search filter if many owners */}
      {owners.length > 4 && (
        <div className="pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search owners..."
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
      )}

      {/* Owners list */}
      <div className="flex-1 overflow-y-auto pt-3 space-y-2 scrollbar-thin pr-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-xs">Loading owners...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Users className="size-8 stroke-[1.5] mb-2 opacity-40" />
            <span className="text-xs font-medium">
              {search ? "No matching owners" : "No registered owners yet"}
            </span>
          </div>
        ) : (
          filtered.map((o) => {
            const initials = (o.display_name || o.user_id || "U").slice(0, 2).toUpperCase();
            return (
              <div
                key={o.auth_uid || o.user_id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="size-8 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-foreground truncate">
                      {o.display_name}
                    </div>
                    {o.user_id && o.user_id !== o.display_name && (
                      <div className="text-[10px] text-muted-foreground truncate">@{o.user_id}</div>
                    )}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                  {o.date_added && o.date_added !== "—"
                    ? formatDayMonthYear(o.date_added) || o.date_added
                    : "Owned"}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
