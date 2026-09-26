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
  getCastingOwners,
  castingSiblings,
  siblingLabels,
  ownerCount,
  isCarMatchingCatalog,
  catalogCarToDiecast,
  type CatalogCarOwner,
} from "@/lib/catalog";
import { useAuth } from "@/lib/auth-store";
import { CatalogOwnersDialog, parseDateVal } from "@/components/catalog-owners-dialog";
import { StatusPill } from "@/components/status-pill";
import { SegmentControl } from "@/components/segment-control";
import { CarFormDialog } from "@/components/car-form-dialog";
import { CatalogFormDialog } from "@/components/catalog-form-dialog";
import { ShippingBatchDialog } from "@/components/shipping-batch-dialog";
import { StatusUpdateDialog } from "@/components/status-update-dialog";
import { CarThumb } from "@/components/car-thumb";
import { carSubLine } from "@/lib/car-subline";
import { boughtOn, purchaseHistory, type Purchase } from "@/lib/copies";
import { isInHand, isIso } from "@/lib/status";

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
  const { catalog, updateCatalogCar } = useCatalog();
  const { isAdmin } = useAuth();

  const [viewCatalogCar, setViewCatalogCar] = useState<{
    car: Diecast;
    catalogCar: CatalogCar | null;
  } | null>(null);
  const [editCatalogEntry, setEditCatalogEntry] = useState<CatalogCar | null>(null);
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

      {/* View in Catalog dialog. An admin gets the same Edit button here as on
          the Catalog page — the casting is the same shared entry whichever door
          you came through, and finding a mistake while looking at your own car
          is the likeliest way to find one at all. */}
      {viewCatalogCar && (
        <CatalogCarDetails
          car={viewCatalogCar.car}
          catalogCar={viewCatalogCar.catalogCar}
          // You arrived here from a car you own, so the view says so, and Add
          // means another one of the same casting.
          preOrder={false}
          owned
          onAdd={() => {
            setAddAnotherCar(viewCatalogCar.car);
            setViewCatalogCar(null);
          }}
          onClose={() => setViewCatalogCar(null)}
          canEdit={isAdmin}
          onEdit={() => {
            setEditCatalogEntry(viewCatalogCar.catalogCar);
            setViewCatalogCar(null);
          }}
        />
      )}

      {isAdmin && (
        <CatalogFormDialog
          open={editCatalogEntry !== null}
          entry={editCatalogEntry}
          catalog={catalog}
          onClose={() => setEditCatalogEntry(null)}
          canDelete={false}
          onSave={updateCatalogCar}
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

  const { pack } = usePack(car.catalogId);
  const hasPack = Boolean(pack?.is_multipack);

  /**
   * What else there is to look at, narrowest first.
   *
   * Three readings of "more like this", each a tighter ring than the last:
   * the series, the set inside it, and the assortment the whole lot came from.
   * Every one of them is scoped to the brand — Car Culture is a Hot Wheels
   * idea, and a Matchbox car sharing the word was never the same series.
   *
   * Only the first one or two are drawn. A shelf of shelves is a second page
   * stapled to this one, and the panel has a box's contents to carry first.
   */
  const shelves = useMemo(() => {
    const norm = (v?: string | null) => (v || "").trim().toLowerCase();
    const setOf = (c: Diecast) => (c as unknown as { set?: string }).set || c.subSeries;

    const brand = norm(car.brand);
    const series = norm(car.series);
    const sub = norm(setOf(car));
    const assortment = norm(car.assortment);

    const kin = cars.filter((c) => c.id !== car.id && norm(c.brand) === brand);
    const out: { key: string; heading: string; cars: Diecast[] }[] = [];

    if (series) {
      const list = kin.filter((c) => norm(c.series) === series);
      if (list.length) out.push({ key: "series", heading: seriesHeading, cars: list });
    }
    if (series && sub) {
      const list = kin.filter((c) => norm(c.series) === series && norm(setOf(c)) === sub);
      if (list.length) out.push({ key: "set", heading: setHeading, cars: list });
    }
    if (assortment) {
      const list = kin.filter((c) => norm(c.assortment) === assortment);
      if (list.length)
        out.push({
          key: "assortment",
          heading: `More from ${(car.assortment || "").trim()}`,
          cars: list,
        });
    }
    return out;
  }, [cars, car, seriesHeading, setHeading]);

  const visibleShelves = useMemo(() => shelves.slice(0, hasPack ? 1 : 2), [shelves, hasPack]);

  const hasMoreToShow = hasPack || visibleShelves.length > 0;

  const spent = Math.round(car.spent ?? 0);
  const mrp = Math.round(car.mrp ?? 0);
  const delta = mrp - spent;

  const hasArrived = isInHand(car.status);
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
      {/* The padding moved off this row and onto the columns, so the photograph
          can run to the edges of its own. */}
      <div className="hidden md:flex md:flex-row md:items-stretch md:h-[84vh] md:max-h-[84vh] w-fit overflow-hidden divide-x divide-border">
        {/* LEFT COLUMN: Photo, Title, Specs, Rarity, purchase, buttons */}
        <div className="w-[360px] xl:w-[390px] shrink-0 flex flex-col h-full overflow-hidden justify-between">
          <div id="car-details-left-col" className="flex-1 overflow-y-auto scrollbar-thin">
            {/* Main Car Photo Area. Full width of the column, no frame of its
                own: the picture was sitting in a bordered box inside a padded
                column inside a padded row, three rectangles deep. Sixteen
                pixels shorter than the 4:3 it used to hold, so the name under
                it clears the fold. */}
            <div className="relative h-[254px] w-full shrink-0 overflow-hidden bg-muted/20 xl:h-[277px]">
              <HeroCarImage car={car} />
            </div>

            <div className="space-y-3.5 px-5 py-4 xl:px-6 xl:py-5">
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

              <hr className="border-border" />

              {/* What it cost and where it came from. This was a column of its
                own, which meant the two halves of one purchase — the money and
                the parcel — sat either side of a divider from the car they
                belong to. */}
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
          </div>

          {/* Every action on one side: View in Catalogue | Add Another, then
              Update under them. */}
          <div className="sticky bottom-0 z-10 space-y-2 bg-background/95 backdrop-blur-xs px-5 pt-3 pb-4 xl:px-6 border-t border-border/60">
            <CarActionButtons onViewInCatalog={onViewInCatalog} onAddAnother={onAddAnother} />
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

        {/* RIGHT COLUMN: what is in the box, then what else is like it. */}
        {hasMoreToShow && (
          <div className="w-[360px] xl:w-[390px] shrink-0 px-5 py-4 xl:px-6 xl:py-5 flex flex-col h-full overflow-y-auto space-y-6 scrollbar-thin">
            {hasPack && <PackContents packCarId={car.catalogId} />}

            {visibleShelves.map((shelf, i) => (
              <div key={shelf.key} className="space-y-2.5">
                {i > 0 && <hr className="border-border/60" />}
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate"
                    title={shelf.heading}
                  >
                    {shelf.heading}
                  </span>
                  <span className="text-[11px] font-semibold text-muted-foreground tabular-nums shrink-0 ml-1">
                    {shelf.cars.length} {shelf.cars.length === 1 ? "car" : "cars"}
                  </span>
                </div>

                <WebRelatedGridShelf
                  cars={shelf.cars}
                  currentCarId={car.id}
                  onSelectCar={onSelectCar}
                />
              </div>
            ))}
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
                className="relative rounded-t-3xl border-t border-border bg-background px-4 pt-3 pb-6 shadow-[0_-8px_24px_rgba(0,0,0,0.1)] flex-1 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  {/* Car title section: sticky to the top as you scroll on phone, pinned on top */}
                  <div className="sticky top-0 z-30 -mx-4 px-4 pt-2 pb-3 bg-background/95 backdrop-blur-md border-b border-border/50 shadow-xs">
                    <CarTitleSection car={car} />
                  </div>

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

                  {/* What is in the box, on the phone where there is only one
                      column for it to be in. */}
                  {hasPack && <PackContents packCarId={car.catalogId} />}

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

                  {/* What else is like this one: the same one or two shelves
                      the wide layout picks, in a row you swipe. */}
                  {visibleShelves.map((shelf) => (
                    <div key={shelf.key} className="pt-2">
                      <hr className="my-3.5 border-border" />
                      <div className="mb-2.5 flex items-center justify-between">
                        <span
                          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate"
                          title={shelf.heading}
                        >
                          {shelf.heading}
                        </span>
                        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 ml-1">
                          {shelf.cars.length} {shelf.cars.length === 1 ? "car" : "cars"}
                        </span>
                      </div>
                      <div className="-mx-4 flex snap-x scroll-px-4 items-stretch gap-2.5 overflow-x-auto px-4 pb-2 scrollbar-none">
                        {shelf.cars.map((relatedCar) => (
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
                  ))}
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
  const cars = useCars();
  const { catalog } = useCatalog();

  const catalogCount = useMemo(() => {
    const targetCatId = (car.catalogId || "").trim().toUpperCase();
    if (targetCatId) {
      const matchCount = cars.filter(
        (c) => (c.catalogId || "").trim().toUpperCase() === targetCatId,
      ).length;
      if (matchCount > 0) return matchCount;
    }
    const matchedCat = catalog.find((c) => isCarMatchingCatalog(car, c));
    if (matchedCat) {
      const matchCount = cars.filter((c) => isCarMatchingCatalog(c, matchedCat)).length;
      if (matchCount > 0) return matchCount;
    }
    return 0;
  }, [cars, catalog, car]);

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

      {/* Car ID sits below the car name, no title, no container. Show only the last 11 characters, followed by · x{count} if repeated */}
      {car.id && (
        <p className="font-mono text-xs text-muted-foreground/80 select-all tracking-wider">
          <span>{car.id.slice(-11)}</span>
          {catalogCount > 1 && <span> · x{catalogCount}</span>}
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
      {/* What is in the box is drawn beside this rather than above it now, in
          the panel that carries the shelves. */}

      {/* One grid, no headings. What a car cost and where it came from were two
          bordered blocks with two titles, which is a lot of furniture around
          nine short facts that are all answers to "what is this purchase". */}
      <div>
        <SpecGrid>
          <Spec label="Spent" value={inrFull(spent)} />
          <Spec label="Retail / MRP" value={inrFull(mrp)} />
          <Spec
            label="Difference"
            className={delta >= 0 ? "text-emerald-600 dark:text-[#00E599]" : "text-rose-400"}
            value={delta >= 0 ? `+${inrFull(delta)}` : `-${inrFull(Math.abs(delta))}`}
          />
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

        <BoughtBefore car={car} />
      </div>
    </div>
  );
}

/**
 * "You've bought this casting 6 times", and when.
 *
 * Shown only when there is more than one, because My Cars now collapses the
 * copies into a single row — this is where the rest of them went. It is the
 * answer to the question the row raises: not just that you own six, but that
 * you bought them across four separate occasions and what each cost.
 *
 * One line per day *and* shipment, never per copy: five of the six Twin Tags
 * came in one parcel on one day, and a row-per-copy list would print the same
 * date and shipping ID five times over.
 */
function BoughtBefore({ car }: { car: Diecast }) {
  const cars = useCars();

  const { copies, lines } = useMemo(() => {
    const id = (car.catalogId || "").trim().toUpperCase();
    if (!id) return { copies: [] as Diecast[], lines: [] as Purchase[] };
    const mine = cars.filter((c) => (c.catalogId || "").trim().toUpperCase() === id);
    return { copies: mine, lines: purchaseHistory(mine) };
  }, [cars, car.catalogId]);

  if (copies.length < 2) return null;

  const total = copies.reduce((s, c) => s + (c.spent || 0), 0);
  const thisDay = boughtOn(car);
  const thisShipment = (car.shippingId || "").trim();

  return (
    <div className="mt-3 rounded-lg border border-primary/25 bg-primary/5 p-2.5">
      <p className="text-xs font-semibold text-foreground">
        You've bought this casting {copies.length} times.
      </p>

      <div className="mt-1.5 divide-y divide-primary/15">
        {lines.map((l) => {
          const isThisOne = l.day === thisDay && l.shippingId === thisShipment;
          return (
            <div
              key={`${l.day}|${l.shippingId}`}
              className="flex items-baseline justify-between gap-3 py-1 text-xs"
            >
              <span className="min-w-0 tabular-nums">
                {formatDayMonthYear(l.day) || l.day || "No date"}
                {l.estimated && (
                  <span className="ml-1 text-[10px] italic text-muted-foreground">received</span>
                )}
                {isThisOne && (
                  <span className="ml-1.5 text-[10px] font-semibold text-primary">this one</span>
                )}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {l.shippingId || "—"}
                {l.n > 1 && <span className="ml-1 font-sans font-bold text-primary">{l.n}×</span>}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {inrFull(total)} across all {copies.length}.
      </p>
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
  useScrollHint(containerRef);

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
        // Three columns and a sliver of the fourth. They used to divide the
        // width exactly three ways, so the next column began precisely where
        // the shelf ended and a row of eight looked identical to a row of
        // three. 42px buys the two gaps back and leaves about 18px of the
        // fourth card showing, which is the part that says keep going.
        className="grid grid-flow-col grid-rows-2 auto-cols-[calc((100%-2.625rem)/3)] gap-2 overflow-x-auto pb-2 scrollbar-thin snap-x scroll-px-0.5 scroll-smooth"
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
    </div>
  );
}

/**
 * Nudges a scrolling shelf twenty pixels and lets it fall back, once, when it
 * has more in it than fits.
 *
 * The scrollbar is hidden until you touch the row, so a shelf with eight cars
 * in it looked exactly like a shelf with six. Two arrow buttons said so
 * instead, which is a pair of controls for something every trackpad and phone
 * already does — the movement says it without taking any room.
 */
function useScrollHint(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let back = 0;
    let settle = 0;
    // Measured when the hint plays, not when the effect runs: at mount the
    // cards have no width yet, so scrollWidth and clientWidth agree and the
    // shelf looks like it fits when it does not.
    const out = window.setTimeout(() => {
      // Nothing to hint at when it all fits, or when the person has already
      // moved it themselves.
      if (el.scrollWidth <= el.clientWidth + 8 || el.scrollLeft > 0) return;
      // Moved, not scrolled. The row carries scroll snapping, which pulls a
      // ten-pixel scroll straight back to the snap point it started on — the
      // hint played and nothing appeared to happen.
      el.style.transition = "transform 200ms ease-out";
      el.style.transform = "translateX(-20px)";
      back = window.setTimeout(() => {
        el.style.transform = "";
        settle = window.setTimeout(() => {
          el.style.transition = "";
        }, 240);
      }, 240);
    }, 500);

    return () => {
      window.clearTimeout(out);
      window.clearTimeout(back);
      window.clearTimeout(settle);
      el.style.transform = "";
      el.style.transition = "";
    };
  }, [ref]);
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
  useScrollHint(containerRef);

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
/**
 * What else the catalogue holds near this casting, in three widening rings:
 *
 *   collection   this brand's run of this series — Mini GT · Fast & Furious
 *   brand        everything else by the same maker
 *   series       the same series whoever made it
 *
 * "Collection" is the intersection because that is how the boxes are actually
 * sold and how you would go looking for the next one: Mini GT's Fast & Furious
 * cars are a thing to complete, Mini GT on its own is a thousand cars.
 *
 * The two wider rings drop anything the narrower one already showed, so a
 * casting never appears twice, and each is capped — brand alone runs to four
 * figures and a shelf is for browsing, not for listing.
 */
const RELATED_CAP = 24;

/**
 * What else the catalogue holds near this entry, narrowest ring first.
 *
 * The series it belongs to, the set inside that series, and the assortment the
 * whole thing was packed in — each scoped to the brand, because a series name
 * belongs to the maker that coined it. Two are drawn, or one when the panel is
 * also carrying the contents of a box.
 */
function CatalogRelatedShelves({
  entry,
  onSelect,
  className,
  limit = 2,
  header,
}: {
  entry: CatalogCar;
  onSelect: (c: CatalogCar) => void;
  className?: string;
  /** How many rings to draw. */
  limit?: number;
  /** Drawn above the shelves, and keeps the column alive when there are none. */
  header?: React.ReactNode;
}) {
  const { catalog } = useCatalog();

  const rings = useMemo(() => {
    const norm = (v?: string | null) => (v || "").trim().toLowerCase();
    const brand = norm(entry.brand);
    const series = norm(entry.series);
    const sub = norm(entry.sub_series);
    const assortment = norm(entry.assortment);
    const selfId = (entry.car_id || "").trim().toUpperCase();

    const kin = catalog.filter(
      (c) => (c.car_id || "").trim().toUpperCase() !== selfId && norm(c.brand) === brand,
    );

    const out: { key: string; heading: string; cars: CatalogCar[] }[] = [];
    if (brand && series) {
      const cars = kin.filter((c) => norm(c.series) === series);
      if (cars.length) out.push({ key: "collection", heading: `More from ${entry.series}`, cars });
    }
    if (brand && series && sub) {
      const cars = kin.filter((c) => norm(c.series) === series && norm(c.sub_series) === sub);
      if (cars.length) out.push({ key: "set", heading: `More from ${entry.sub_series} set`, cars });
    }
    if (brand && assortment) {
      const cars = kin.filter((c) => norm(c.assortment) === assortment);
      if (cars.length)
        out.push({ key: "assortment", heading: `More from ${entry.assortment}`, cars });
    }
    return out.slice(0, Math.max(0, limit));
  }, [catalog, entry, limit]);

  // Nothing nearby and nothing to head the column with: the caller renders this
  // as a whole column, so returning null is what makes it go away rather than
  // stand there empty.
  if (rings.length === 0 && !header) return null;

  return (
    <div className={cn("space-y-6", className)}>
      {header}
      {rings.map((ring, i) => (
        <div key={ring.key} className="space-y-2.5">
          {i > 0 && <hr className="border-border/60" />}
          <div className="flex items-center justify-between">
            <span
              className="truncate text-xs font-bold uppercase tracking-wider text-muted-foreground"
              title={ring.heading}
            >
              {ring.heading}
            </span>
            <span className="ml-1 shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">
              {ring.cars.length} {ring.cars.length === 1 ? "car" : "cars"}
            </span>
          </div>
          <WebRelatedGridShelf
            cars={ring.cars.slice(0, RELATED_CAP).map(catalogCarToDiecast)}
            onSelectCar={(picked) => {
              const match = ring.cars.find((c) => c.car_id === picked.id);
              if (match) onSelect(match);
            }}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * How many people have this casting, in the past tense.
 *
 * It read "n people add this to their collection", which is a habit rather than
 * a fact — they added it, once, and it is there now.
 */
function ownersLine(loading: boolean, count: number): string {
  if (loading) return "Loading collection stats…";
  if (count === 0) return "Nobody has added this to their collection yet.";
  if (count === 1) return "1 person added this to their collection.";
  return `${count} people added this to their collection.`;
}

export function CatalogCarDetails({
  car,
  catalogCar,
  preOrder,
  expectedDate,
  owned,
  isIso,
  onClose,
  onAdd,
  onAddIso,
  canEdit,
  onEdit,
  canDelete,
  onDelete,
  onSelectCatalogCar,
}: {
  /** The entry shaped as a car; null when closed. */
  car: Diecast | null;
  catalogCar?: CatalogCar | null;
  preOrder: boolean;
  expectedDate?: string | null;
  owned: boolean;
  isIso?: boolean;
  onClose: () => void;
  onAdd: () => void;
  /**
   * Put this casting on your ISO list — the wishlist, not the collection.
   * Absent when the caller has nowhere to put it.
   */
  onAddIso?: () => void;
  canEdit?: boolean;
  onEdit?: () => void;
  /** Owner only: removing the casting from the catalogue altogether. */
  canDelete?: boolean;
  onDelete?: () => void;
  /**
   * Open a different catalogue entry. The related shelves are only drawn when
   * a caller can act on a tap — a shelf of cards that do nothing is worse than
   * no shelf.
   */
  onSelectCatalogCar?: (c: CatalogCar) => void;
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
        className="max-md:top-0 max-md:inset-x-0 max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:w-full max-md:max-w-full max-md:rounded-none max-md:p-0 max-md:flex max-md:flex-col block gap-0 overflow-hidden rounded-3xl border-border bg-background p-0 sm:p-0 text-foreground shadow-2xl md:max-h-[82vh] md:w-fit md:max-w-[calc(100vw-2rem)] transition-[max-width] duration-200"
      >
        {car && (
          <CatalogDetailsContent
            car={car}
            catalogCar={catalogCar}
            preOrder={preOrder}
            expectedDate={expectedDate}
            owned={owned}
            isIso={isIso}
            onClose={onClose}
            onAdd={onAdd}
            onAddIso={onAddIso}
            canEdit={canEdit}
            onEdit={onEdit}
            showOwnersColumn={showOwnersColumn}
            onToggleOwnersColumn={setShowOwnersColumn}
            onSelectCatalogCar={onSelectCatalogCar}
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
  isIso: isIsoProp,
  onClose,
  onAdd,
  onAddIso,
  canEdit,
  onEdit,
  showOwnersColumn = false,
  onToggleOwnersColumn,
  onSelectCatalogCar,
}: {
  car: Diecast;
  catalogCar?: CatalogCar | null;
  preOrder: boolean;
  expectedDate?: string | null;
  owned: boolean;
  isIso?: boolean;
  onClose: () => void;
  onAdd: () => void;
  onAddIso?: () => void;
  canEdit?: boolean;
  onEdit?: () => void;
  showOwnersColumn?: boolean;
  onToggleOwnersColumn?: (show: boolean) => void;
  onSelectCatalogCar?: (c: CatalogCar) => void;
}) {
  const mobile = useMobileHeroGestures(onClose);
  const { isAdmin, user, profile } = useAuth();
  const mine = useCars();
  const [owners, setOwners] = useState<CatalogCarOwner[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [ownersModalOpen, setOwnersModalOpen] = useState(false);

  const matchingUserCar = useMemo(() => {
    if (!catalogCar) return null;
    return mine.find((c) => !isIso(c.status) && isCarMatchingCatalog(c, catalogCar)) || null;
  }, [mine, catalogCar]);

  const matchingIsoCar = useMemo(() => {
    if (!catalogCar) return null;
    return mine.find((c) => isIso(c.status) && isCarMatchingCatalog(c, catalogCar)) || null;
  }, [mine, catalogCar]);

  const isActuallyOwned = owned || Boolean(matchingUserCar);
  const isActuallyIso = Boolean(isIsoProp || matchingIsoCar);

  /** Every entry for this casting, so the owner count covers all its boxes. */
  const { catalog } = useCatalog();
  const ownerEntries = useMemo(
    () => (catalogCar ? castingSiblings(catalogCar, catalog) : []),
    [catalogCar, catalog],
  );

  // A box's contents head the shelf column, and cost it one of its two shelves.
  const { pack: catalogPack } = usePack(catalogCar?.car_id);
  const catalogHasPack = Boolean(catalogPack?.is_multipack);

  useEffect(() => {
    if (!catalogCar?.car_id) {
      setOwners([]);
      return;
    }
    let cancelled = false;
    setOwnersLoading(true);
    // Across every box the casting is catalogued in — see getCastingOwners.
    getCastingOwners(ownerEntries, (entry) => ({
      catalogCar: entry,
      isOwned: isActuallyOwned && entry.car_id === catalogCar.car_id,
      currentUser: user
        ? { uid: user.id, email: user.email, profile }
        : profile
          ? { uid: profile.user_id || "current-user", email: null, profile }
          : { uid: "current-user", email: null, profile: null },
      userCar: entry.car_id === catalogCar.car_id ? matchingUserCar : null,
    }))
      .then((data) => {
        if (!cancelled) setOwners(data);
      })
      .finally(() => {
        if (!cancelled) setOwnersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    catalogCar?.car_id,
    catalogCar,
    ownerEntries,
    isActuallyOwned,
    user,
    profile,
    matchingUserCar,
  ]);

  const handleSeeAll = () => {
    if (typeof window !== "undefined" && window.innerWidth >= 768 && onToggleOwnersColumn) {
      onToggleOwnersColumn(!showOwnersColumn);
    } else {
      setOwnersModalOpen(true);
    }
  };

  // All three share the width rather than Add taking whatever the other two
  // leave. "Add to collection" spelled out was the widest thing in the row and
  // said nothing the button's position did not: this is the catalogue, and the
  // only place to add to is your collection.
  const actionButtons = (
    <div className="flex w-full items-center gap-2.5">
      {canEdit && onEdit && (
        <Button
          type="button"
          variant="outline"
          onClick={onEdit}
          className="h-11 flex-1 gap-1.5 px-3 text-sm font-semibold cursor-pointer border-border hover:bg-muted"
        >
          <Pencil className="size-4" />
          Edit
        </Button>
      )}
      {/* Only while it is not already on the list — "Add to ISO" on a car you
          are already looking for is an offer to file the same wish twice. Your
          list, not the catalogue's: nobody else's is touched. */}
      {onAddIso && !isActuallyIso && (
        <Button
          type="button"
          variant="outline"
          onClick={onAddIso}
          className="h-11 flex-1 gap-1.5 px-3 text-sm font-semibold cursor-pointer border-border hover:bg-muted"
        >
          <Search className="size-4" />
          Add to ISO
        </Button>
      )}
      <Button onClick={onAdd} className="h-11 flex-1 gap-2 px-3 text-sm font-semibold">
        <Plus className="size-4" />
        {isActuallyOwned ? "Add another" : "Add"}
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
        {/* SECTION 1: Left Column - photo, title, the entry's details, and the
            add button pinned under them. Laid out like a car's own details
            page, where everything about the thing you are looking at is in one
            column and the column beside it is about something else. */}
        <div className="w-[360px] xl:w-[390px] shrink-0 pr-5 xl:pr-6 flex flex-col h-full overflow-hidden justify-between">
          <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin space-y-4">
            <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden shadow-xs bg-muted/20 border border-border/60 shrink-0">
              <HeroCarImage car={car} />
            </div>
            <CatalogCarTitleSection
              car={car}
              catalogCar={catalogCar}
              owned={isActuallyOwned}
              isIso={isActuallyIso}
              preOrder={preOrder}
              owners={owners}
              ownersLoading={ownersLoading}
              onSeeAllOwners={handleSeeAll}
            />
            <CatalogDetailsBody
              car={car}
              catalogCar={catalogCar}
              preOrder={preOrder}
              expectedDate={expectedDate}
              owned={isActuallyOwned}
              isIso={isActuallyIso}
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

        {/* SECTION 2: Middle Column - what else the catalogue holds nearby.
            Dropped entirely when there is nothing to put in it, rather than
            standing there empty. */}
        {catalogCar && onSelectCatalogCar && (
          <CatalogRelatedShelves
            entry={catalogCar}
            onSelect={onSelectCatalogCar}
            header={catalogHasPack ? <PackContents packCarId={catalogCar.car_id} /> : null}
            limit={catalogHasPack ? 1 : 2}
            className={cn(
              "w-[360px] xl:w-[390px] shrink-0 h-full overflow-y-auto scrollbar-thin",
              showOwnersColumn ? "px-5 xl:px-6" : "pl-5 xl:pl-6",
            )}
          />
        )}

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
                  owned={isActuallyOwned}
                  isIso={isActuallyIso}
                  showTitle={true}
                  owners={owners}
                  ownersLoading={ownersLoading}
                  onSeeAllOwners={() => setOwnersModalOpen(true)}
                />
                {catalogCar && onSelectCatalogCar && (
                  <CatalogRelatedShelves
                    entry={catalogCar}
                    onSelect={onSelectCatalogCar}
                    header={catalogHasPack ? <PackContents packCarId={catalogCar.car_id} /> : null}
                    limit={catalogHasPack ? 1 : 2}
                    className="pt-5"
                  />
                )}
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
  isIso,
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
  isIso?: boolean;
  showTitle?: boolean;
  owners?: CatalogCarOwner[];
  ownersLoading?: boolean;
  onSeeAllOwners?: () => void;
}) {
  const rarity = rarityOf(car);
  const { catalog } = useCatalog();

  /**
   * The same casting in every box the catalogue knows it in. One entry is the
   * ordinary case and shows no control at all.
   */
  const siblings = useMemo(
    () => (catalogCar ? castingSiblings(catalogCar, catalog) : []),
    [catalogCar, catalog],
  );
  const [shownId, setShownId] = useState(catalogCar?.car_id ?? "");
  useEffect(() => {
    setShownId(catalogCar?.car_id ?? "");
  }, [catalogCar?.car_id]);
  const shown = siblings.find((s) => s.car_id === shownId) ?? catalogCar;

  const siblingOptions = useMemo(() => siblingLabels(siblings), [siblings]);

  const addedBy = resolveCatalogUserId(shown?.created_by);
  const addedOn = formatDayMonthYear(shown?.created_at) || "—";
  // An entry nobody has corrected has no editor and no edit date. Falling back
  // to the creator and the filing date, as this used to, described an edit that
  // never happened — and now that the column exists it can say so instead.
  const edited = Boolean(shown?.updated_by);
  const updatedBy = edited ? resolveCatalogUserId(shown?.updated_by) : "—";
  const updatedOn = edited ? formatDayMonthYear(shown?.updated_at) || "—" : "—";

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
    if (!catalogCar?.car_id) {
      setInternalOwners([]);
      return;
    }
    let cancelled = false;
    setInternalOwnersLoading(true);
    // Every box this casting comes in, so the count is the casting's and not
    // one package's. Only the entry actually open can claim the viewer's own
    // copy; the others are answered from the database alone.
    getCastingOwners(siblings.length ? siblings : [catalogCar], (entry) => ({
      catalogCar: entry,
      isOwned: owned && entry.car_id === catalogCar.car_id,
      currentUser: user ? { uid: user.id, email: user.email, profile } : null,
      userCar: entry.car_id === catalogCar.car_id ? matchingUserCar : null,
    }))
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
    catalogCar?.car_id,
    catalogCar,
    siblings,
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
                {isIso && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-400">
                    <Search className="size-3" />
                    <span>On your ISO list</span>
                  </span>
                )}
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
                  {preOrder ? "PO" : "Released"}
                </span>
              </div>
            </div>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {car.name || `${car.make} ${car.model}`.trim() || "Unnamed car"}
            </h2>
            {/* The count is a statement, not a control. It used to be the
                clickable thing, which meant the only way to discover the owner
                list was to try tapping a sentence. "View all" beside it is the
                button, and only an admin has one — the list is people. */}
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="text-xs text-muted-foreground">
                {ownersLine(ownersLoading, ownerCount(owners))}
              </p>
              {isAdmin && onSeeAllOwners && !ownersLoading && owners.length > 0 && (
                <button
                  type="button"
                  onClick={onSeeAllOwners}
                  className="text-xs font-medium text-primary transition-colors hover:text-primary/80 cursor-pointer"
                >
                  View all
                </button>
              )}
            </div>
          </div>

          <hr className="border-border" />
        </>
      )}

      {/* Make, model and year are deliberately absent: the title above already
          says them, and repeating them three rows later was the spec grid's
          least useful third. */}
      <SpecGrid>
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

      {/* Provenance section: Catalogue ID on top, no section title, no people who owns it */}
      <div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          <div className="col-span-2">
            <Spec
              label="Catalogue ID"
              value={shown?.car_id || car.catalogId || car.carId || car.id || "—"}
            />
            {siblings.length > 1 && (
              <div className="mt-1.5">
                {/* Which box's entry the four lines below are about. The casting
                    is the same one either way; who filed it, and when, is not. */}
                <SegmentControl<string>
                  fill
                  value={shownId}
                  onChange={setShownId}
                  className="h-8 w-full"
                  options={siblingOptions}
                />
              </div>
            )}
          </div>
          {preOrder && expectedDate && (
            <div className="col-span-2">
              <Spec
                label="Expected date"
                value={formatDayMonthYear(expectedDate) || expectedDate}
              />
            </div>
          )}
          {catalogCar && (
            <>
              <Spec label="Added by" value={addedBy} />
              <Spec label="Added on" value={addedOn} />
              <Spec label="Updated by" value={updatedBy} />
              <Spec label="Updated on" value={updatedOn} />
            </>
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
    </div>
  );
}

export function CatalogCarTitleSection({
  car,
  catalogCar,
  owned,
  isIso,
  preOrder,
  owners,
  ownersLoading,
  onSeeAllOwners,
}: {
  car: Diecast;
  catalogCar?: CatalogCar | null;
  owned: boolean;
  isIso?: boolean;
  preOrder: boolean;
  owners?: CatalogCarOwner[];
  ownersLoading?: boolean;
  onSeeAllOwners?: () => void;
}) {
  const { isAdmin } = useAuth();
  const ownersList = owners || [];

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
          {isIso && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-400">
              <Search className="size-3" />
              <span>On your ISO list</span>
            </span>
          )}
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
            {preOrder ? "PO" : "Released"}
          </span>
        </div>
      </div>

      {/* Car title */}
      <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl leading-snug">
        {car.name || `${car.make} ${car.model} ${car.variant || ""}`.trim() || "Unnamed car"}
      </h2>

      {/* Same rule as the desktop layout: the count states, "View all" acts. */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className="text-xs text-muted-foreground">
          {ownersLine(Boolean(ownersLoading), ownerCount(ownersList))}
        </p>
        {isAdmin && onSeeAllOwners && !ownersLoading && ownersList.length > 0 && (
          <button
            type="button"
            onClick={onSeeAllOwners}
            className="text-xs font-medium text-primary transition-colors hover:text-primary/80 cursor-pointer"
          >
            View all
          </button>
        )}
      </div>
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

/**
 * What is in a box, wherever a box is shown.
 *
 * Takes the pack's catalogue id and resolves the rest itself, because it is
 * wanted in two places that hold different things: the catalogue's own details
 * view, which has the entry, and an owned car's, which has only the Catalog ID
 * its row points at. Renders nothing at all for an entry that is not a pack,
 * which is all but a few dozen of them.
 */
/**
 * The catalogue entry behind a car, and what is in it when it is a box.
 *
 * Shared, because the panel that draws the contents is no longer the only
 * thing that needs to know: the layout decides how many "More from" shelves
 * fit beside them.
 */
function usePack(packCarId?: string | null) {
  const { catalog, packMembers } = useCatalog();

  const pack = useMemo(() => {
    const id = (packCarId || "").trim().toUpperCase();
    if (!id) return null;
    return catalog.find((c) => c.car_id.toUpperCase() === id) ?? null;
  }, [packCarId, catalog]);

  const members = useMemo(() => {
    if (!pack?.is_multipack) return [];
    const ids = packMembers[pack.car_id] ?? [];
    const byId = new Map(catalog.map((c) => [c.car_id.toUpperCase(), c]));
    return ids.map((id) => ({ id, entry: byId.get(id.toUpperCase()) ?? null }));
  }, [pack, packMembers, catalog]);

  return { pack, members };
}

function PackContents({ packCarId }: { packCarId?: string | null }) {
  const { pack, members } = usePack(packCarId);

  if (!pack?.is_multipack) return null;

  const declared = Number(pack.pack_size) || 0;
  // A box whose contents nobody has listed yet still says it is a box: that is
  // the more useful fact, and "0 cars" would read as an empty package.
  const count = declared || members.length;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-2.5 sm:p-3">
      <div>
        <div className="mb-2 flex items-baseline gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            What&rsquo;s inside
          </h3>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {count} car{count === 1 ? "" : "s"}
          </span>
          {declared > 0 && members.length !== declared && (
            <span className="text-[11px] text-muted-foreground/80">{members.length} listed</span>
          )}
        </div>

        {members.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            Nobody has listed what is in this one yet.
          </p>
        ) : (
          // One column, one car per line, five of them before it scrolls. A ten
          // -car box otherwise pushed the shelves under it off the panel.
          <div className="flex max-h-[16.25rem] flex-col gap-1.5 overflow-y-auto pr-0.5 scrollbar-thin">
            {members.map(({ id, entry }, i) => (
              <div
                key={id}
                className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/20 px-2 py-1.5"
              >
                <span className="w-4 shrink-0 text-center text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{entry?.name || id}</div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {entry
                      ? carSubLine({
                          brand: entry.brand,
                          assortment: entry.assortment,
                          series: entry.series,
                          subSeries: entry.sub_series,
                          carNumber: entry.car_number,
                        })
                      : "No longer in the catalogue"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
