import {
  Fragment,
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
  BadgeCheck,
  BookOpen,
  History,
  Car,
  Check,
  CheckCircle2,
  Copy,
  Flame,
  Layers,
  Users,
  Loader2,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Diecast } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCars, useCarsActions } from "@/lib/cars-store";
import { useCatalog } from "@/lib/catalog-store";
import { findCarImage } from "@/lib/car-image";
import { formatDayMonthYear, inr, inrFull, inrPriceFull } from "@/lib/format";
import { trackingPageFor } from "@/lib/tracking";
import { TrackingLink } from "@/components/tracking-link";
import {
  FAVOURITE_COLOUR,
  ChaseMark,
  FavouriteMark,
  hasUnseenAdminChange,
} from "@/components/car-marks";
import { RARITY_FLAME, RARITY_LABEL, nextRarity, rarityOf, withRarity } from "@/lib/rarity";
import { Button } from "@/components/ui/button";
import { ChangeLog } from "@/components/change-log";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CatalogCar } from "@/lib/catalog";
import {
  resolveCatalogUserId,
  getCastingOwners,
  castingSiblings,
  catalogColours,
  ownerCount,
  isCarMatchingCatalog,
  catalogCarToDiecast,
  type CatalogCarOwner,
} from "@/lib/catalog";
import { useAuth } from "@/lib/auth-store";
import { CatalogOwnersDialog, ownParcel } from "@/components/catalog-owners-dialog";
import { SegmentControl } from "@/components/segment-control";
import { CarFormDialog } from "@/components/car-form-dialog";
import { CatalogFormDialog } from "@/components/catalog-form-dialog";
import { ShippingBatchDialog } from "@/components/shipping-batch-dialog";
import { SellerOrdersDialog } from "@/components/seller-orders-dialog";
import { StatusUpdateDialog } from "@/components/status-update-dialog";
import { CarThumb } from "@/components/car-thumb";
import { SyncedBadge, VERIFIED_BY_ADMIN, isVerifiedByAdmin } from "@/components/synced-badge";
import { carSubLine } from "@/lib/car-subline";
import { attachSuggestions, castingId } from "@/lib/casting-group";
import { boughtOn, purchaseHistory, type Purchase } from "@/lib/copies";
import { moreFrom } from "@/lib/more-from";
import { isInHand, isIso, normaliseStatus, styleFor } from "@/lib/status";
import { toast } from "sonner";
import { uploadCarPhoto } from "@/lib/car-photos";
import { useImagePaste } from "@/lib/paste-image";

/**
 * A photograph pasted onto whatever is open.
 *
 * The details window has no photo controls — it is for looking at a car, not
 * editing one — but a picture of the car is exactly what you have in hand while
 * you are looking at it. Ctrl+V uploads it and saves; there is nothing else to
 * learn. The upload takes a moment, so the toast says so, and a second paste
 * while the first is still going is ignored rather than queued.
 */
function usePastedPhoto(enabled: boolean, save: (url: string) => void | Promise<unknown>) {
  const busy = useRef(false);
  useImagePaste(enabled, (file) => {
    if (busy.current) return;
    busy.current = true;
    const note = toast.loading("Adding the photo…");
    void (async () => {
      const up = await uploadCarPhoto(file);
      if ("error" in up) {
        toast.error("Could not add that photo", { id: note, description: up.error });
        busy.current = false;
        return;
      }
      await save(up.url);
      toast.success("Photo updated", { id: note });
      busy.current = false;
    })();
  });
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
  /** Whose orders are being looked at, from the seller's name on a car. */
  const [sellerOpen, setSellerOpen] = useState<string | null>(null);
  /** The panel beside the car that shows its activity log. */
  const [activityOpen, setActivityOpen] = useState(false);
  const docked = useMinWidth(1180);

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
    // Another car is another history: the panel starts closed.
    setActivityOpen(false);
  }, []);

  const close = useCallback(() => {
    setCurrentCarId(null);
    setActivityOpen(false);
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
          // The header draws its own, beside the title.
          hideClose
          // The phone layout runs its own gestures: pull the photo to close,
          // pull the card to stretch the photo.
          disableSheetDismiss
          // From a tablet up the dialog is only the frame the car's card and the
          // activity panel sit in, so the panel can grow from the card's edge.
          // The frame is centred, so as the panel grows the pair slides left to
          // keep both on screen; the card gives up width when there is not room.
          style={
            {
              "--dock": activityOpen && docked ? `calc(${DOCK_W} + ${DOCK_GAP})` : "0rem",
            } as React.CSSProperties
          }
          className="max-sm:top-0 max-sm:inset-x-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none max-sm:p-0 max-sm:pb-0 max-sm:flex max-sm:flex-col overflow-hidden rounded-3xl border-border bg-background p-0 sm:p-0 gap-0 block text-foreground shadow-2xl sm:max-h-[92vh] sm:w-fit sm:max-w-[calc(100vw-2rem)] sm:flex sm:items-stretch sm:overflow-visible sm:rounded-none sm:border-transparent sm:bg-transparent sm:shadow-none sm:transition-[width] sm:duration-300 sm:ease-out"
        >
          {car && (
            <div className="max-sm:contents sm:max-h-[92vh] sm:overflow-hidden sm:rounded-3xl sm:border sm:border-border sm:bg-background sm:shadow-2xl">
              <CarPopupContent
                activity={{
                  docked,
                  open: activityOpen,
                  toggle: () => setActivityOpen((v) => !v),
                }}
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
                onOpenSeller={(name) => setSellerOpen(name)}
                onToggleFavourite={() => updateCar({ ...car, favourite: !car.favourite })}
                // Cycles Normal → TH → STH → Chase → Normal: each tap is the next
                // colour of flame.
                onToggleChase={() => updateCar(withRarity(car, nextRarity(rarityOf(car))))}
                onUpdateStatus={() => setStatusCar(car)}
                onSelectCar={open}
              />
            </div>
          )}
          {car && docked && (
            <DockPanel
              open={activityOpen}
              title="Activity"
              subtitle={car.name || car.id}
              closeLabel="Close the activity log"
              onClose={() => setActivityOpen(false)}
            >
              {activityOpen && <ChangeLog rowKey={car.id} />}
            </DockPanel>
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

      {/* Everything from one seller. Picking a car in it moves the drawer
          underneath to that car, so the list stays where you were reading. */}
      <SellerOrdersDialog
        open={sellerOpen !== null}
        onOpenChange={(v) => !v && setSellerOpen(null)}
        seller={sellerOpen || ""}
        onSelectCar={(c) => {
          setSellerOpen(null);
          open(c);
        }}
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

/** True at this width or wider. */
function useMinWidth(px: number): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(`(min-width: ${px}px)`);
    const sync = () => setOk(m.matches);
    sync();
    m.addEventListener("change", sync);
    return () => m.removeEventListener("change", sync);
  }, [px]);
  return ok;
}

/** A panel that grows out of the card's right edge: Activity, and the possible boxes. */
function DockPanel({
  open,
  title,
  subtitle,
  closeLabel,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside
      aria-hidden={!open}
      className="relative hidden shrink-0 overflow-hidden transition-[width,padding,opacity] duration-300 ease-out sm:block"
      style={{
        width: open ? `calc(${DOCK_W} + ${DOCK_GAP})` : 0,
        paddingLeft: open ? DOCK_GAP : 0,
        opacity: open ? 1 : 0,
      }}
    >
      <div
        className="absolute inset-y-0 right-0 flex flex-col overflow-hidden rounded-3xl border border-border bg-background text-foreground shadow-2xl"
        style={{ width: DOCK_W }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 p-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">{children}</div>
      </div>
    </aside>
  );
}

/** How wide the activity panel is, and the gap between it and the car. */
const DOCK_W = "23rem";
const DOCK_GAP = "0.75rem";

interface CarPopupContentProps {
  /** The activity button: it opens a panel beside the car when there is room. */
  activity: { docked: boolean; open: boolean; toggle: () => void };
  car: Diecast;
  onClose: () => void;
  onEdit: () => void;
  onViewInCatalog: () => void;
  onAddAnother: () => void;
  onOpenBatch: (id: string, field: "shippingId" | "orderId") => void;
  onOpenSeller: (seller: string) => void;
  onToggleFavourite: () => void;
  onToggleChase: () => void;
  onUpdateStatus: () => void;
  onSelectCar?: (car: Diecast) => void;
}

function CarPopupContent({
  activity,
  car,
  onClose,
  onEdit,
  onViewInCatalog,
  onAddAnother,
  onOpenBatch,
  onOpenSeller,
  onToggleFavourite,
  onToggleChase,
  onUpdateStatus,
  onSelectCar,
}: CarPopupContentProps) {
  const cars = useCars();
  const { updateCar } = useCarsActions();
  const mobile = useMobileHeroGestures(onClose);

  // Your own copy, so no admin about it: a photo pasted here replaces the one
  // on this car.
  usePastedPhoto(true, (url) => updateCar({ ...car, imageUrl: url }));

  // Opening the car is seeing it: the dot beside its name has done its job and
  // goes. The database checks the caller owns the row, so this is safe to fire
  // for any car the drawer happens to be showing.
  const carId = car?.id;
  const unseen = car ? hasUnseenAdminChange(car) : false;
  useEffect(() => {
    if (!unseen || !carId) return;
    void (async () => {
      const { markCarSeen } = await import("@/lib/supabase-cars");
      await markCarSeen(carId);
    })();
  }, [unseen, carId]);

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

  const setName = ((car as unknown as { set?: string }).set || car.subSeries || "").trim();

  const exactCount = useMemo(() => {
    return cars.filter((c) => isExactMatch(c, car)).length;
  }, [cars, car]);

  const { pack } = usePack(car.catalogId);
  const hasPack = Boolean(pack?.is_multipack);

  /**
   * What else there is to look at: one shelf, by the rule in `moreFrom` —
   * the set, else the series, else the casting's own make and model.
   */
  const shelf = useMemo(
    () =>
      moreFrom(
        {
          brand: car.brand,
          series: car.series,
          subSeries: setName,
          make: car.make,
          model: car.model,
        },
        cars.filter((c) => c.id !== car.id),
        (c) => ({
          brand: c.brand,
          series: c.series,
          subSeries: (c as unknown as { set?: string }).set || c.subSeries,
          make: c.make,
          model: c.model,
        }),
      ),
    [cars, car, setName],
  );

  const spent = Math.round(car.spent ?? 0);
  const mrp = Math.round(car.mrp ?? 0);
  const hasArrived = isInHand(car.status);
  const cleanTransitNotes = (car.transitInfo || "").trim();

  const trackable = Boolean(trackingPageFor(car.deliveryPartner, car.trackingId));
  const rarity = rarityOf(car);
  const title = car.name || `${car.make} ${car.model} ${car.variant || ""}`.trim() || "Unnamed car";

  /** Status, marks and size: the pills beside the name. */
  const pillRow = (withId = true) => (
    <CarChips
      car={car}
      rarity={rarity}
      exactCount={exactCount}
      onToggleChase={onToggleChase}
      onToggleFavourite={onToggleFavourite}
      onUpdateStatus={onUpdateStatus}
      extra={
        <>
          {car.size && <span className={cn(CHIP, "cursor-default")}>{car.size}</span>}
          {/* On a phone the ID rides with the size; the wide layout keeps it
              up beside the Catalogue button. */}
          {withId && car.id && (
            <span title="Car ID" className={cn(CHIP, "cursor-default font-mono select-all")}>
              {car.id.length > 6 ? car.id.slice(6) : car.id}
            </span>
          )}
        </>
      }
    />
  );
  const pills = pillRow();

  /** The car's ID, and the way to its catalogue entry. */
  const idButtons = (iconOnly = false) => (
    <>
      {car.catalogId && (
        <Button
          type="button"
          variant="outline"
          onClick={onViewInCatalog}
          title="Open this casting in the Catalogue"
          aria-label="Open in the Catalogue"
          className={cn(
            "h-9 cursor-pointer rounded-full text-sm font-semibold",
            iconOnly ? "w-9 shrink-0 gap-0 p-0" : "gap-2 px-4",
          )}
        >
          <BookOpen className="size-4" />
          {!iconOnly && "Catalogue"}
        </Button>
      )}
      {/* What has been done to this car, newest first. A deleted car has no
          popup, so its history lives only in Settings → Activity log. */}
      {activity.docked ? (
        <Button
          type="button"
          variant="outline"
          onClick={activity.toggle}
          aria-pressed={activity.open}
          title="Everything that has changed on this car"
          aria-label="Activity log"
          className={cn(
            "h-9 cursor-pointer rounded-full text-sm font-semibold",
            iconOnly ? "w-9 shrink-0 gap-0 p-0" : "gap-2 px-4",
            activity.open && "border-primary/60 bg-primary/10 text-primary",
          )}
        >
          <History className="size-4" />
          {!iconOnly && "Activity"}
        </Button>
      ) : (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              title="Everything that has changed on this car"
              aria-label="Activity log"
              className={cn(
                "h-9 cursor-pointer rounded-full text-sm font-semibold",
                iconOnly ? "w-9 shrink-0 gap-0 p-0" : "gap-2 px-4",
              )}
            >
              <History className="size-4" />
              {!iconOnly && "Activity"}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="max-h-[70vh] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto p-3"
          >
            <ChangeLog rowKey={car.id} />
          </PopoverContent>
        </Popover>
      )}
    </>
  );

  /** The facts, row by row; see PhoneFacts. */
  const factRows = [
    {
      items: [
        ["Brand", car.brand],
        ["Number", car.carNumber],
      ],
    },
    {
      items: [
        ["Series", car.series],
        ["Sub series", car.subSeries],
      ],
    },
    {
      items: [
        ["Assortment", car.assortment],
        ["Colour", car.colour],
        ["Type", car.type],
      ],
    },
  ] as const;
  const conditionRows = [
    {
      items: [
        ["Car condition", conditionLine(car.carCondition, car.carRating)],
        ["Card condition", conditionLine(car.cardCondition, car.cardRating)],
      ],
    },
  ] as const;

  /** The cards: what it cost, what it is, what is in the box. */
  const panels = (cols: string, phone = false) => (
    <div className={cn("grid items-start gap-3", cols)}>
      <CarPurchaseTab
        car={car}
        spent={spent}
        mrp={mrp}
        hasArrived={hasArrived}
        cleanTransitNotes={cleanTransitNotes}
        trackable={trackable}
        onOpenBatch={onOpenBatch}
        onOpenSeller={onOpenSeller}
      />
      {/* Only when there is something to list: a car with no series, case
          number or grading would otherwise get a heading over nothing. */}
      {car.caseNumber && (
        <Panel title="Specification">
          <CarDetailsTab car={car} hasCondition={false} compact />
        </Panel>
      )}
      {hasPack && (
        <Panel title="In the Box" className="col-span-full">
          <CarInTheBoxTab packCarId={car.catalogId} />
        </Panel>
      )}
    </div>
  );

  return (
    <div className="relative w-full h-full flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Hidden Accessible Dialog Title & Description */}
      <DialogTitle className="sr-only">{title} Details</DialogTitle>
      <DialogDescription className="sr-only">
        Diecast car specifications, status, logistics, and pricing details.
      </DialogDescription>

      {/* =====================================================================
          1. DESKTOP & TABLET LAYOUT

          The name heads the window, the photograph holds the left of it, and
          the right is whichever of the three readings you asked for.
          ===================================================================== */}
      <DesktopShell
        kicker={[]}
        title={title}
        onClose={onClose}
        subtitle={<div className="mt-3">{pills}</div>}
        footerNote={<AddedBy car={car} />}
        headerAction={idButtons()}
        photo={<HeroCarImage car={car} contain />}
        below={<PhoneFacts rows={factRows} />}
        actions={<CarDetailActions onEdit={onEdit} onAddAnother={onAddAnother} />}
      >
        <PhoneFacts rows={conditionRows} />

        {panels("grid-cols-2")}

        <AssortmentSuggestions catalogId={car.catalogId} />

        {shelf && (
          <div className="mt-auto">
            <CarShelfRow
              heading={shelf.heading}
              cars={shelf.cars}
              currentId={car.id}
              onSelectCar={onSelectCar}
            />
          </div>
        )}
      </DesktopShell>

      {/* =====================================================================
          2. PHONE LAYOUT: the photo, then the same three readings stacked.
          ===================================================================== */}
      <div
        ref={mobile.rootRef}
        className="md:hidden relative w-full h-full flex flex-col flex-1 min-h-0 overflow-hidden bg-background sm:h-[min(92vh,860px)] sm:w-[min(30rem,calc(100vw-2rem))]"
        style={{ "--hero-h": "clamp(320px, 42vh, 460px)" } as React.CSSProperties}
      >
        <div className="relative flex-1 min-h-0">
          {/* The photo sits still behind the sheet: pushing the card up slides
              it over the photo, pulling the card down stretches the photo. */}
          <div
            ref={mobile.heroRef}
            className="absolute inset-x-0 top-0 z-0 w-full overflow-hidden bg-white select-none"
            style={{ height: "var(--hero-h)" }}
          >
            <HeroCarImage car={car} />
          </div>

          {/* The warmth behind the sheet, which is part of the window rather
              than part of what scrolls in it: it sits where the sheet comes to
              rest and stays there while the sheet slides over it. A phone is
              held close and holds one thing at a time, so the panel is allowed
              to glow; the wide layout has columns of its own to keep apart. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[5]"
            style={{
              top: "calc(var(--hero-h) - 1.5rem)",
              background:
                "radial-gradient(120% 55% at 88% 0%, color-mix(in oklab, var(--accent) 26%, transparent), transparent 70%)",
            }}
          />

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

              <div
                ref={mobile.cardRef}
                className="relative flex flex-1 flex-col overflow-hidden rounded-t-3xl border-t border-border bg-background/70 px-4 pt-5 pb-6 shadow-[0_-8px_24px_rgba(0,0,0,0.1)] backdrop-blur-2xl"
              >
                <div className="relative space-y-3">
                  <div className="min-w-0 space-y-3">
                    <div className="flex items-start justify-between gap-3 pr-11">
                      <h2 className="min-w-0 text-2xl font-bold leading-tight tracking-tight text-foreground">
                        {title}
                      </h2>
                      <div className="flex shrink-0 items-center gap-2">{idButtons(true)}</div>
                    </div>
                    {pillRow(true)}
                  </div>

                  <PhoneFacts rows={factRows} />

                  <PhoneFacts rows={conditionRows} />

                  {panels("grid-cols-1", true)}

                  <AssortmentSuggestions catalogId={car.catalogId} />

                  {shelf && (
                    <CarShelfRow
                      heading={shelf.heading}
                      cars={shelf.cars}
                      currentId={car.id}
                      onSelectCar={onSelectCar}
                    />
                  )}

                  <div className="text-sm text-muted-foreground">
                    <AddedBy car={car} />
                  </div>
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
            className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-30 grid size-9 cursor-pointer place-items-center rounded-full bg-foreground text-background shadow-md transition-transform active:scale-95"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Pinned bottom bar: always docked at the bottom of the screen */}
        <div className="shrink-0 z-20 border-t border-border bg-background/95 backdrop-blur-md p-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(0,0,0,0.08)]">
          <CarDetailActions onEdit={onEdit} onAddAnother={onAddAnother} />
        </div>
      </div>
    </div>
  );
}

/**
 * The wide window: the photograph runs the full height of the left, and the
 * right is a title, then whatever the page is made of, with the two actions
 * docked under it so they never scroll away.
 */
function DesktopShell({
  kicker,
  title,
  onClose,
  photo,
  chips,
  subtitle,
  headerAction,
  footerNote,
  below,
  actions,
  children,
}: {
  kicker: string[];
  title: string;
  onClose: () => void;
  photo: ReactNode;
  /** A line under the name, before the status chips. */
  subtitle?: ReactNode;
  /** Beside the close button. */
  headerAction?: ReactNode;
  /** The bottom left, on the line of the actions. */
  footerNote?: ReactNode;
  /** The status line, right under the name. */
  chips?: ReactNode;
  /** Under the name, on the left: the headline facts. */
  below?: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="hidden md:flex md:max-h-[92vh] md:w-[min(960px,calc(100vw-4rem-var(--dock,0rem)))] md:transition-[width] md:duration-300 md:flex-col">
      {/* The name, left; the close button, right. Pinned. */}
      <div className="flex shrink-0 min-w-0 items-start justify-between gap-4 px-7 pb-4 pt-7">
        <div className="min-w-0 flex-1">
          {kicker.length > 0 && (
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              {kicker.map((part, i) => (
                <span key={`${part}-${i}`} className="flex items-center gap-2">
                  {i > 0 && <span className="text-primary/40">·</span>}
                  <span className="truncate">{part}</span>
                </span>
              ))}
            </p>
          )}
          <h2 className="mt-1.5 text-3xl font-bold leading-tight tracking-tight text-foreground">
            {title}
          </h2>
          {subtitle}
          {chips && <div className="mt-3">{chips}</div>}
        </div>
        <div className="flex shrink-0 items-start justify-end gap-3">
          {headerAction}
          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="grid size-9 cursor-pointer place-items-center rounded-full bg-foreground text-background transition-transform hover:scale-105 active:scale-95"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Left side stays put; only the right side scrolls, clipped under the title. */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,6fr)_minmax(0,7fr)] gap-x-8 px-7 pb-4">
        <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden">
          <div className="relative aspect-4/3 w-full shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-white">
            {photo}
          </div>
          {below && <div className="min-w-0">{below}</div>}
        </div>
        <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto overflow-x-hidden overscroll-contain pb-2 [&>*]:shrink-0">
          {children}
        </div>
      </div>

      {/* The whole width of the window, under both columns; stays put while the page scrolls. */}
      <div className="mx-7 flex shrink-0 items-center justify-between gap-6 border-t border-border/60 pb-7 pt-5">
        <div className="min-w-0 text-sm text-muted-foreground">{footerNote}</div>
        <div className="w-[27rem] shrink-0">{actions}</div>
      </div>
    </div>
  );
}

/** "Added by Mervin on 29, Sept '26": who filed the casting, for the foot of the page. */
function AddedBy({ car }: { car: Diecast }) {
  const { catalog } = useCatalog();
  const entry = useMemo(() => {
    const id = (car.catalogId || "").trim().toUpperCase();
    if (id) {
      const byId = catalog.find((c) => (c.car_id || "").trim().toUpperCase() === id);
      if (byId) return byId;
    }
    return catalog.find((c) => isCarMatchingCatalog(car, c));
  }, [catalog, car]);
  const who = entry?.created_by ? resolveCatalogUserId(entry.created_by) : "";
  const on = formatDayMonthYear(entry?.created_at) || formatDayMonthYear(car.createdAt) || "";
  if (!who && !on) return null;
  return (
    <span className="block truncate">
      Added
      {who && (
        <>
          {" "}
          by <span className="font-semibold text-foreground">{who}</span>
        </>
      )}
      {on && (
        <>
          {" "}
          on <span className="font-semibold text-foreground">{on}</span>
        </>
      )}
    </span>
  );
}

/** A bordered panel with a small heading: the unit the wide page is built from. */
function Panel({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("min-w-0 rounded-2xl border border-border/60 bg-muted/20 p-5", className)}
    >
      {title && (
        // Sticks to the top of the scrolling column; the next section's heading
        // takes over as this one's panel scrolls out.
        <h3 className="sticky top-0 z-10 -mx-5 -mt-5 mb-3 rounded-t-2xl bg-[color-mix(in_oklab,var(--muted)_20%,var(--background))] px-5 pb-2 pt-5 text-xs font-bold uppercase tracking-[0.18em] text-primary">
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

/** One headline fact: a caption over a big answer. */
function Stat({
  label,
  children,
  sub,
  tone,
  className,
  fit,
  narrow = false,
  uniform = false,
}: {
  label: string;
  children: ReactNode;
  sub?: string;
  tone?: string;
  className?: string;
  /** The value as text: a long one steps its size down so it still fits. */
  fit?: string;
  /** A third of the row: the text steps down sooner. */
  narrow?: boolean;
  /** The one size every fact card shares, whatever its row or its text. */
  uniform?: boolean;
}) {
  const len = (fit ?? "").length + (narrow ? 5 : 0);
  const small = uniform || narrow;
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl border border-border/60 bg-muted/20",
        uniform ? "py-2" : "py-3",
        small ? "px-3" : "px-4",
        className,
      )}
    >
      <p
        className={cn(
          "truncate font-semibold uppercase text-muted-foreground",
          uniform
            ? "text-[10px] tracking-[0.08em]"
            : narrow
              ? "text-[10px] tracking-[0.04em]"
              : "text-xs tracking-[0.14em]",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          uniform ? "mt-0.5" : "mt-1",
          "truncate font-bold tracking-tight text-foreground",
          uniform ? "text-sm" : len > 14 ? "text-xs" : len > 10 ? "text-sm" : "text-base",
        )}
      >
        {children}
      </p>
      {sub && <p className={cn("mt-0.5 text-xs font-medium", tone)}>{sub}</p>}
    </div>
  );
}

/**
 * The facts as a phone lays them out, row by row:
 *
 *   Brand        | Number
 *   Series       | Sub series
 *   Assortment   | Colour   | Type
 *   Car condition | Card condition
 *
 * One cell each, every one the same size of type. A
 * cell with nothing to say is left out and the others fill its space; a row
 * with none is not drawn.
 */
function PhoneFacts({
  rows,
}: {
  rows: readonly { items: readonly (readonly [string, string | null | undefined])[] }[];
}) {
  return (
    <div className="space-y-2">
      {rows.map((row, i) => {
        const items = row.items.filter(([, v]) => (v || "").trim());
        if (items.length === 0) return null;
        return (
          // The cells share the row between them, so a fact that is missing
          // leaves no hole: the ones that are there simply grow into it.
          <div
            key={i}
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
          >
            {items.map(([label, v]) => (
              <Stat key={label} label={label} uniform>
                <span title={v ?? undefined}>{(v || "").trim()}</span>
              </Stat>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** A titled block of the page; the hairline runs from the heading to the edge. */
function PageSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-1 flex items-center gap-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{title}</h3>
        <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      </div>
      {children}
    </section>
  );
}

/**
 * One fact, on a line of its own with a rule under it.
 *
 * `stacked` puts the caption above the answer, which is how the casting reads
 * on a wide screen where there is a column to fill. Everywhere else the caption
 * holds the left and the answer the right, because a list of short answers is
 * easier to scan down the right-hand edge than down two ragged columns.
 */
function InfoRow({
  label,
  value,
  children,
  stacked = false,
  size = "md",
  accent = false,
}: {
  label: string;
  value?: string | null;
  children?: ReactNode;
  stacked?: boolean;
  size?: "md" | "lg";
  accent?: boolean;
}) {
  const text = (value ?? "").toString().trim();
  // A row that was handed a value and has none is not a row, link or not.
  if (value !== undefined ? !text : !children) return null;
  return (
    <div
      className={cn(
        "border-b border-border/50 py-3 last:border-b-0",
        stacked ? "" : "flex items-baseline justify-between gap-4",
      )}
    >
      <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "block min-w-0 font-bold",
          // Chips wrap; a plain answer still rides on one line.
          children ? "" : "truncate",
          stacked ? "mt-1.5 text-lg" : "text-right text-[15px]",
          size === "lg" && !stacked && "text-lg",
          accent && "text-primary",
        )}
      >
        {children ?? text}
      </span>
    </div>
  );
}

/** A value that opens something, in the accent the rest of the app uses. */
function LinkValue({
  value,
  title,
  onClick,
}: {
  value?: string | null;
  title: string;
  onClick: () => void;
}) {
  const text = (value || "").trim();
  if (!text) return <span>—</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="max-w-full cursor-pointer truncate text-primary hover:underline"
    >
      {text}
    </button>
  );
}

/**
 * The two things you do with a car you own: correct it, or buy it again.
 *
 * "View in Catalogue" is the Catalogue ID on the Record tab, which is the same
 * journey named after the thing it lands on rather than after the button.
 */
function CarDetailActions({
  onEdit,
  onAddAnother,
}: {
  onEdit: () => void;
  onAddAnother: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        onClick={onEdit}
        title="Update this car"
        className="h-11 min-w-0 flex-1 cursor-pointer gap-2 px-2 text-sm font-semibold"
      >
        <Pencil className="size-3.5 shrink-0" />
        <span className="truncate">Update</span>
      </Button>
      <Button
        type="button"
        onClick={onAddAnother}
        title="Add another of this casting"
        className="h-11 min-w-0 flex-1 cursor-pointer gap-2 px-2 text-sm font-semibold"
      >
        <Plus className="size-4 shrink-0" />
        <span className="truncate">Add Another</span>
      </Button>
    </div>
  );
}

/** The status, as a pill that opens the status dialog. */
function StatusChip({ car, onUpdateStatus }: { car: Diecast; onUpdateStatus: () => void }) {
  return (
    <button
      type="button"
      onClick={onUpdateStatus}
      title="Update status"
      className={cn(CHIP, "shadow-none hover:brightness-110", styleFor(car.status))}
    >
      {normaliseStatus(car.status) || "—"}
    </button>
  );
}

/**
 * Status, rarity and favourite as three pills.
 *
 * Each is the reading and the control at once: the first opens the status
 * dialog, the second cycles Normal → TH → STH → Chase, the third toggles.
 */
const CHIP =
  "inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors active:scale-95";

function CarChips({
  car,
  rarity,
  exactCount,
  onToggleChase,
  onToggleFavourite,
  onUpdateStatus,
  extra,
  showStatus = true,
}: {
  car: Diecast;
  rarity: import("@/lib/rarity").Rarity;
  exactCount: number;
  onToggleChase: () => void;
  onToggleFavourite: () => void;
  onUpdateStatus: () => void;
  /** False when the status sits elsewhere, beside the name. */
  showStatus?: boolean;
  /** More pills, straight after Favourite. */
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showStatus && <StatusChip car={car} onUpdateStatus={onUpdateStatus} />}

      {/* Marks, not controls: shown only when the car has them, and changed in
          Update, so a stray tap here cannot flip one. */}
      {rarity !== "Normal" && (
        <span
          title={RARITY_LABEL[rarity]}
          className={cn(CHIP, "cursor-default border-accent/50 bg-accent/20 text-foreground")}
        >
          <Flame className={cn("size-3.5 shrink-0", RARITY_FLAME[rarity])} />
          <span>{RARITY_LABEL[rarity]}</span>
        </span>
      )}

      {car.favourite && (
        <span
          title="Favourite"
          className={cn(
            CHIP,
            "cursor-default border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400",
          )}
        >
          <Star className={cn("size-3.5 shrink-0", FAVOURITE_COLOUR)} />
          <span>Favourite</span>
        </span>
      )}

      {extra}

      {exactCount > 1 && (
        <span
          title={`${exactCount} identical cars in your collection`}
          className={cn(CHIP, "cursor-default border-primary/30 bg-primary/10 text-primary")}
        >
          <Layers className="size-3 shrink-0" />
          {exactCount}× Cars
        </span>
      )}
    </div>
  );
}

/** What the casting is: the chips, then the description, field by field. */
function CarDetailsTab({
  car,
  rarity,
  exactCount,
  hasCondition,
  stacked = false,
  compact = false,
  withSeries = false,
  onToggleChase,
  onToggleFavourite,
  onUpdateStatus,
}: {
  car: Diecast;
  rarity?: import("@/lib/rarity").Rarity;
  exactCount?: number;
  hasCondition: boolean;
  stacked?: boolean;
  /** Rows only: the wide page shows the chips, colour and type elsewhere. */
  compact?: boolean;
  /** Series and sub series as rows, for a phone whose tiles left them out. */
  withSeries?: boolean;
  onToggleChase?: () => void;
  onToggleFavourite?: () => void;
  onUpdateStatus?: () => void;
}) {
  return (
    <div className="min-w-0 space-y-5">
      {!compact && rarity && onToggleChase && onToggleFavourite && onUpdateStatus && (
        <CarChips
          car={car}
          rarity={rarity}
          exactCount={exactCount ?? 0}
          onToggleChase={onToggleChase}
          onToggleFavourite={onToggleFavourite}
          onUpdateStatus={onUpdateStatus}
        />
      )}

      <div>
        {(!compact || withSeries) && (
          <>
            <InfoRow stacked={stacked} size="lg" label="Series" value={car.series} />
            <InfoRow stacked={stacked} size="lg" label="Sub series" value={car.subSeries} />
          </>
        )}
        {!compact && <InfoRow stacked={stacked} size="lg" label="Colour" value={car.colour} />}
        {!compact && <InfoRow stacked={stacked} size="lg" label="Type" value={car.type} />}
        <InfoRow stacked={stacked} label="Case number" value={car.caseNumber} />
        {hasCondition && (
          <>
            <InfoRow
              stacked={stacked}
              label="Car condition"
              value={conditionLine(car.carCondition, car.carRating)}
            />
            <InfoRow
              stacked={stacked}
              label="Card condition"
              value={conditionLine(car.cardCondition, car.cardRating)}
            />
          </>
        )}
      </div>

      {/* An admin reading a car is the person who can file the box it is
          missing, so the suggestion sits with the description it is about. */}
      {!compact && <AssortmentSuggestions catalogId={car.catalogId} />}
    </div>
  );
}

/**
 * What is in the box, one car to a line.
 *
 * The catalogue ID rides on the right because that is the part you would go
 * looking up; the name is what you read.
 */
function CarInTheBoxTab({ packCarId }: { packCarId?: string | null }) {
  const { pack, members } = usePack(packCarId);
  if (!pack?.is_multipack) return null;

  const declared = Number(pack.pack_size) || 0;

  return (
    <div className="min-w-0">
      {members.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          Nobody has listed what is in this one yet.
        </p>
      ) : (
        members.map(({ id, entry }) => (
          <div
            key={id}
            className="flex items-baseline justify-between gap-4 border-b border-border/50 py-3 last:border-b-0"
          >
            <span className="min-w-0 truncate text-[15px] font-bold text-foreground">
              {entry?.name || id}
            </span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{id}</span>
          </div>
        ))
      )}
      {/* A box that says it holds eight and lists six is worth saying out loud,
          rather than quietly showing six. */}
      {declared > 0 && members.length !== declared && (
        <p className="pt-3 text-xs text-muted-foreground">
          {members.length} of {declared} listed
        </p>
      )}
    </div>
  );
}

/** "Mint · ★★★★☆", or whichever half of it was recorded. */
function conditionLine(grade?: string | null, rating?: number | null): string {
  const g = (grade || "").trim();
  const stars = typeof rating === "number" && rating > 0 ? "★".repeat(Math.round(rating)) : "";
  return [g, stars].filter(Boolean).join(" · ");
}

/**
 * Catalogue entries that look like another box of this casting.
 *
 * Which boxes a casting comes in is read off the description, so two entries
 * only group once somebody makes them agree -- and until then the Blister and
 * the Box of one car sit in the catalogue as strangers. This is the list of
 * entries worth looking at, and the one tap that makes them agree.
 *
 * Admin only, and silent for everybody else: attaching rewrites a shared
 * catalogue entry, so a suggestion nobody can act on is noise on a page that is
 * for looking at a car.
 */
/** "Not this car": pairs an admin has said are not boxes of one casting, kept on this device. */
const DISMISSED_KEY = "tesoro-dismissed-boxes";
const readDismissed = (): Record<string, string[]> => {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "{}");
  } catch {
    return {};
  }
};
const writeDismissed = (a: string, b: string) => {
  try {
    const all = readDismissed();
    for (const [x, y] of [
      [a, b],
      [b, a],
    ])
      all[x] = [...new Set([...(all[x] || []), y])];
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable: it will simply be suggested again */
  }
};

function useAssortmentSuggestions(catalogId?: string | null) {
  const { isAdmin } = useAuth();
  const { catalog, updateCatalogCar } = useCatalog();
  const [busy, setBusy] = useState("");

  const id = (catalogId || "").trim().toUpperCase();
  const entry = useMemo(
    () => (id ? catalog.find((c) => (c.car_id || "").trim().toUpperCase() === id) : undefined),
    [catalog, id],
  );

  const [dismissals, setDismissals] = useState(0);
  const suggestions = useMemo(
    () =>
      entry
        ? attachSuggestions(entry, catalog, {
            exclude: [
              ...castingSiblings(entry, catalog).map((c) => c.car_id),
              ...(readDismissed()[entry.car_id] || []),
            ],
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry, catalog, dismissals],
  );

  const dismiss = (pick: CatalogCar) => {
    if (!entry) return;
    writeDismissed(entry.car_id, pick.car_id);
    setDismissals((n) => n + 1);
  };

  /**
   * Joining a casting means agreeing with it: the entry keeps its own ID, box,
   * price and photograph and takes this one's description, which is the only
   * thing the grouping reads. The same bargain the catalogue's own form makes.
   */
  const attach = async (pick: CatalogCar) => {
    if (!entry) return;
    setBusy(pick.car_id);
    const moved = await updateCatalogCar({
      ...pick,
      brand: entry.brand,
      make: entry.make,
      model: entry.model,
      variant: entry.variant,
      series: entry.series,
      sub_series: entry.sub_series,
      car_number: entry.car_number,
      standalone: false,
    });
    // This entry may itself have been taken out of its group, in which case
    // nothing would show: a group needs both sides in it.
    if (moved && entry.standalone) await updateCatalogCar({ ...entry, standalone: false });
    setBusy("");
    if (!moved) {
      toast.error("That entry could not be moved");
      return;
    }
    toast.success(`${pick.assortment || pick.car_id} is a box of this casting now`, {
      description: "It keeps its own ID, price and photograph.",
    });
  };

  return {
    enabled: isAdmin && Boolean(entry) && suggestions.length > 0,
    suggestions,
    busy,
    attach,
    dismiss,
  };
}

type BoxSuggestions = ReturnType<typeof useAssortmentSuggestions>;

/**
 * Who has this casting. An admin reads every name; anyone else reads only
 * themselves, by "You", and how many others there are.
 */
function BuyersList({
  owners,
  myUid,
  isAdmin,
  myShipping,
  onOpenParcel,
  onOpenMine,
}: {
  owners: CatalogCarOwner[];
  myUid?: string | null;
  /** Opens the reader's own copy of the box that row is about. */
  onOpenMine: (owner: CatalogCarOwner) => void;
  isAdmin: boolean;
  myShipping: Record<string, string>;
  onOpenParcel: (shippingId: string) => void;
}) {
  const mine = owners.filter((o) => myUid && o.auth_uid === myUid);
  const others = new Set(owners.filter((o) => o.auth_uid !== myUid).map((o) => o.auth_uid)).size;
  const rows = isAdmin
    ? [...owners].sort((a, b) => (a.auth_uid === myUid ? -1 : b.auth_uid === myUid ? 1 : 0))
    : mine;

  return (
    <ul className="space-y-1.5">
      {rows.map((o) => {
        const you = Boolean(myUid) && o.auth_uid === myUid;
        const parcel = ownParcel(o, myUid, myShipping);
        const when = o.date_added && o.date_added !== "—" ? formatDayMonthYear(o.date_added) : "";
        return (
          <li
            key={`${o.auth_uid}@${o.assortment}`}
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border border-border bg-background/85 p-3",
              you && "cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/40",
            )}
            // Your own row opens your own car.
            {...(you
              ? {
                  role: "button",
                  tabIndex: 0,
                  title: "Open your copy",
                  onClick: () => onOpenMine(o),
                  onKeyDown: (ev: React.KeyboardEvent) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      onOpenMine(o);
                    }
                  },
                }
              : {})}
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {you ? "You" : o.display_name || o.user_id}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {[o.assortment, when].filter(Boolean).join(" · ")}
              </div>
            </div>
            {you && parcel && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 px-2.5 text-xs font-semibold"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onOpenParcel(parcel);
                }}
              >
                Parcel
              </Button>
            )}
          </li>
        );
      })}
      {!isAdmin && others > 0 && (
        <li className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
          {others} other {others === 1 ? "person" : "people"}
        </li>
      )}
    </ul>
  );
}

/** The suggested boxes, one row each. */
function SuggestionList({ boxes }: { boxes: BoxSuggestions }) {
  return (
    <ul className="space-y-1.5">
      {boxes.suggestions.map(({ car, definite, because }) => (
        <li
          key={car.car_id}
          className="space-y-3 rounded-xl border border-border bg-background/85 p-3"
        >
          <div className="flex items-start gap-3">
            <div className="size-16 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-white">
              <CarThumb car={catalogCarToDiecast(car)} className="size-full object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{car.assortment || "No box"}</div>
              <div className="truncate font-mono text-xs text-muted-foreground">{car.car_id}</div>
              <p className="mt-1 text-xs leading-snug text-muted-foreground">
                {because}
                {Number(car.mrp) ? ` · ${inrPriceFull(Math.round(Number(car.mrp)))}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 flex-1 text-xs font-semibold"
              disabled={boxes.busy !== ""}
              onClick={() => boxes.dismiss(car)}
            >
              Not this car
            </Button>
            <Button
              type="button"
              size="sm"
              variant={definite ? "default" : "outline"}
              className="h-8 flex-1 gap-1.5 text-xs font-semibold"
              disabled={boxes.busy !== ""}
              onClick={() => void boxes.attach(car)}
            >
              {boxes.busy === car.car_id ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              Attach
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The same list under its own heading, for where there is no room beside the car. */
function BoxesInline({ boxes }: { boxes: BoxSuggestions }) {
  if (!boxes.enabled) return null;
  return (
    <div className="mt-3 rounded-lg border border-border/80 bg-muted/20 p-2.5">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Layers className="size-3.5" />
        Possible other boxes
      </p>
      <SuggestionList boxes={boxes} />
    </div>
  );
}

function AssortmentSuggestions({ catalogId }: { catalogId?: string | null }) {
  return <BoxesInline boxes={useAssortmentSuggestions(catalogId)} />;
}

/**
 * One fact, set small: the caption over the answer, in a size that lets three
 * sit across with no box around them. Like InfoRow it draws nothing when it has nothing to say.
 */
function MiniFact({
  label,
  value,
  children,
  accent = false,
}: {
  label: string;
  value?: string | null;
  children?: ReactNode;
  accent?: boolean;
}) {
  const text = (value ?? "").toString().trim();
  if (value !== undefined ? !text : !children) return null;
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div
        className={cn(
          "mt-1 min-w-0 truncate text-[13px] font-bold leading-tight",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {children ?? text}
      </div>
    </div>
  );
}

/**
 * What this copy cost and how it got here.
 *
 * The price leads, because it is the one number you came to this tab for, and
 * what it was against retail is the line under it rather than a field of its
 * own — a gap only means anything next to the number it is a gap from.
 */
function CarPurchaseTab({
  car,
  spent,
  mrp,
  hasArrived,
  cleanTransitNotes,
  trackable,
  onOpenBatch,
  onOpenSeller,
  rowsOnly = false,
}: {
  rowsOnly?: boolean;
  car: Diecast;
  spent: number;
  mrp: number;
  hasArrived: boolean;
  cleanTransitNotes: string;
  trackable: boolean;
  onOpenBatch: (id: string, field: "orderId" | "shippingId") => void;
  onOpenSeller: (seller: string) => void;
}) {
  const courier = (car.deliveryPartner || car.trackingId || "").trim();
  // The note stands in for the courier when there is none to name, so it is
  // only printed again below when the field is already saying something else.
  const noteBelow = cleanTransitNotes && courier ? cleanTransitNotes : "";

  return (
    <div className="col-span-full min-w-0 space-y-4">
      <Panel>
        {/* Paid, MRP and the seller share the row in equal thirds. */}
        <div className="grid grid-cols-3 gap-6">
          {!rowsOnly && (
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Paid
              </p>
              <p className="mt-1 truncate text-lg font-bold leading-tight tracking-tight text-foreground">
                {inrFull(spent)}
              </p>
            </div>
          )}
          {mrp > 0 && (
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                MRP
              </p>
              <p className="mt-1 truncate text-lg font-bold leading-tight tracking-tight text-muted-foreground">
                {inrFull(mrp)}
              </p>
            </div>
          )}
          {car.seller && (
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Sold by
              </p>
              <div className="mt-1 truncate text-lg font-bold leading-tight text-primary">
                <LinkValue
                  value={car.seller}
                  title={`Everything bought from ${car.seller}`}
                  onClick={() => onOpenSeller(car.seller)}
                />
              </div>
            </div>
          )}
        </div>
      </Panel>

      {(car.orderDate ||
        car.orderId ||
        courier ||
        cleanTransitNotes ||
        car.shippingId ||
        car.expectedDate ||
        car.date) && (
        <Panel>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <MiniFact
              label="Ordered on"
              value={formatDayMonthYear(car.orderDate) || car.orderDate}
            />
            <MiniFact label="Order ID" value={car.orderId} accent>
              <LinkValue
                value={car.orderId}
                title={`Everything in order ${car.orderId}`}
                onClick={() => onOpenBatch(car.orderId || "", "orderId")}
              />
            </MiniFact>
            <MiniFact label="Transit info" value={courier || cleanTransitNotes} accent={trackable}>
              {trackable ? (
                <TrackingLink
                  compact
                  partner={car.deliveryPartner}
                  trackingId={car.trackingId}
                  className="text-[13px] font-bold text-primary"
                />
              ) : (
                <span className="truncate">{courier || cleanTransitNotes}</span>
              )}
            </MiniFact>
            <MiniFact
              label={hasArrived ? "Received on" : "Expected on"}
              value={formatDayMonthYear(
                hasArrived ? car.date || car.expectedDate : car.expectedDate,
              )}
            />
            <MiniFact label="Shipping ID" value={car.shippingId} accent>
              <LinkValue
                value={car.shippingId}
                title={`Everything in shipment ${car.shippingId}`}
                onClick={() => onOpenBatch(car.shippingId || "", "shippingId")}
              />
            </MiniFact>
          </div>
        </Panel>
      )}

      {noteBelow && (
        <p className="rounded-lg border border-border/50 bg-muted/30 p-2.5 text-xs text-foreground">
          {noteBelow}
        </p>
      )}
    </div>
  );
}

/**
 * The small print: which row this is, which casting it points at, and who filed
 * that casting.
 *
 * Added and updated are the catalogue entry's, not the car's — a car carries no
 * editor of its own, and the entry is the thing several people have a hand in.
 * With no entry to read, all that is left is the day the car reached the
 * collection.
 */
function CarRecordTab({ car, onViewInCatalog }: { car: Diecast; onViewInCatalog: () => void }) {
  const { catalog } = useCatalog();
  const mine = useCars();

  const entry = useMemo(() => {
    const id = (car.catalogId || "").trim().toUpperCase();
    if (id) {
      const byId = catalog.find((c) => (c.car_id || "").trim().toUpperCase() === id);
      if (byId) return byId;
    }
    return catalog.find((c) => isCarMatchingCatalog(car, c));
  }, [catalog, car]);

  const edited = Boolean(entry?.updated_by);
  const addedOn = formatDayMonthYear(entry?.created_at) || formatDayMonthYear(car.createdAt) || "";

  /**
   * Every copy of this casting you own, as one line per day *and* parcel.
   *
   * Never a line per copy: five of the six Twin Tags came in one parcel on one
   * day, and a row-per-copy list prints the same date five times over.
   */
  const { copies, lines } = useMemo(() => {
    const id = (car.catalogId || "").trim().toUpperCase();
    if (!id) return { copies: [] as Diecast[], lines: [] as Purchase[] };
    const ownCopies = mine.filter((c) => (c.catalogId || "").trim().toUpperCase() === id);
    return { copies: ownCopies, lines: purchaseHistory(ownCopies) };
  }, [mine, car.catalogId]);

  const thisDay = boughtOn(car);
  const thisShipment = (car.shippingId || "").trim();

  return (
    <div className="min-w-0">
      {/* The first six characters are the owner's prefix, the same on every car
          you own, so they say nothing here. */}
      <InfoRow label="Car ID">
        <span className="font-mono tracking-wide select-all" title={car.id}>
          {car.id.length > 6 ? car.id.slice(6) : car.id || "—"}
        </span>
      </InfoRow>
      <InfoRow label="Catalogue ID" accent>
        <span className="font-mono tracking-wide">
          <LinkValue
            value={car.catalogId || entry?.car_id}
            title="Open this casting in the Catalogue"
            onClick={onViewInCatalog}
          />
        </span>
      </InfoRow>
      {entry && (
        <InfoRow label="Added by">
          <NameOnDate name={resolveCatalogUserId(entry.created_by)} date={addedOn} />
        </InfoRow>
      )}
      {!entry && addedOn && (
        <InfoRow label="Added on">
          <span>{addedOn}</span>
        </InfoRow>
      )}
      {entry && edited && (
        <InfoRow label="Updated by">
          <NameOnDate
            name={resolveCatalogUserId(entry.updated_by)}
            date={formatDayMonthYear(entry.updated_at) || ""}
          />
        </InfoRow>
      )}

      {copies.length > 1 && (
        <div className="pt-6">
          <div className="flex items-baseline justify-between gap-4 pb-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Purchased {copies.length} times
            </p>
            {lines.some((l) => l.n > 1) && (
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Purchased multiple times
              </p>
            )}
          </div>

          {lines.map((l) => (
            <div
              key={`${l.day}|${l.shippingId}`}
              className="flex items-baseline justify-between gap-4 border-b border-border/50 py-3 last:border-b-0"
            >
              <span className="flex min-w-0 items-baseline gap-2 truncate">
                <span className="text-[15px] font-bold text-foreground">
                  {formatDayMonthYear(l.day) || l.day || "No date"}
                </span>
                {/* Which of them you are looking at. */}
                {l.day === thisDay && l.shippingId === thisShipment && (
                  <span className="text-xs font-medium text-muted-foreground">This one</span>
                )}
                {l.estimated && (
                  <span className="text-xs italic text-muted-foreground">received</span>
                )}
              </span>
              <span className="shrink-0 text-[15px] font-bold text-primary">
                {l.shippingId || "—"}
                {l.n > 1 && <span className="ml-2 text-foreground">{l.n}×</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Mervin on 29, Sept '26" — the person in the reading weight, the day beside it. */
function NameOnDate({ name, date }: { name: string; date: string }) {
  return (
    <span className="truncate">
      {name || "—"}
      {date && (
        <>
          <span className="mx-1.5 text-xs font-normal text-muted-foreground">on</span>
          {date}
        </>
      )}
    </span>
  );
}

/**
 * What else is in the same series, as a shelf you flick.
 *
 * The heading stands to the left of the cars on a wide screen and above them on
 * a phone, because 12 Models is a caption for the row and not a row of its own.
 */
function CarShelfRow({
  heading,
  cars,
  currentId,
  onSelectCar,
}: {
  heading: string;
  cars: Diecast[];
  currentId: string;
  onSelectCar?: (car: Diecast) => void;
}) {
  if (cars.length === 0) return null;
  const count = `${cars.length} ${cars.length === 1 ? "Model" : "Models"}`;
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p
          className="min-w-0 truncate text-base font-bold text-foreground md:text-lg"
          title={heading}
        >
          <span className="font-semibold text-muted-foreground">More from </span>
          {heading}
        </p>
        <p className="shrink-0 text-sm font-semibold text-primary">{count}</p>
      </div>

      <div className="-mx-1 flex min-w-0 snap-x scroll-px-1 items-stretch gap-3 overflow-x-auto px-1 pb-1 no-scrollbar md:grid md:grid-cols-4 md:overflow-hidden md:[&>*:nth-child(n+5)]:hidden">
        {cars.map((related) => (
          <RelatedCarCard
            key={related.id}
            car={related}
            isCurrent={related.id === currentId}
            className="w-28 shrink-0 snap-start md:w-auto md:min-w-0"
            onSelect={() => onSelectCar?.(related)}
          />
        ))}
      </div>
    </section>
  );
}

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
        <div className="mt-1 flex items-baseline justify-between gap-1 text-xs text-muted-foreground">
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

function CopyId({ id, className }: { id: string; className?: string }) {
  const [done, setDone] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    } catch {
      // A denied clipboard is not worth a dialog: the ID is on screen either
      // way, and the button simply does nothing.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${id}`}
      aria-label={`Copy catalogue ID ${id}`}
      className={cn(
        "inline-flex shrink-0 items-center rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {done ? (
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </button>
  );
}

function HeroCarImage({ car, contain = false }: { car: Diecast; contain?: boolean }) {
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
    <div className="relative flex h-full w-full items-center justify-center">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {src ? (
        <img
          src={src}
          alt={car.name || `${car.make} ${car.model}`}
          className={cn(
            "h-full w-full transition-opacity duration-300",
            contain ? "object-contain" : "object-cover",
          )}
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

/**
 * One of several, as a row of pills.
 *
 * The catalogue's two multiple-choice facts — which colour, and which box —
 * are the same question asked twice, and they are not decoration: what is
 * chosen here is what the Add button puts in your collection.
 */
function PickChips({
  value,
  onChange,
  options,
  stacked,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; title?: string }[];
  stacked: boolean;
}) {
  return (
    <span className={cn("flex flex-wrap items-center gap-2", stacked ? "" : "justify-end")}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            title={o.title ?? o.label}
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              CHIP,
              "text-xs",
              active
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border/80 text-foreground hover:border-foreground/40",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </span>
  );
}

/**
 * What the catalogue says about this entry, as badges.
 *
 * Read-only, every one of them: this is everybody's entry, and nothing here is
 * yours to toggle. The car's own details page has the same row as controls,
 * which is the difference between the two pages in one line.
 */
function CatalogChips({
  preOrder,
  owned,
  isIso,
  packSize,
  rarity,
}: {
  preOrder: boolean;
  owned: boolean;
  isIso: boolean;
  packSize: number;
  rarity: import("@/lib/rarity").Rarity;
}) {
  const base = cn(CHIP, "cursor-default");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={cn(
          base,
          preOrder
            ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        )}
      >
        {preOrder ? "Pre-order" : "Released"}
      </span>

      {owned && (
        <span
          className={cn(
            base,
            "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          )}
        >
          <CheckCircle2 className="size-3 shrink-0" />
          In collection
        </span>
      )}

      {isIso && (
        <span
          className={cn(base, "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400")}
        >
          <Search className="size-3 shrink-0" />
          On your ISO list
        </span>
      )}

      {packSize > 1 && (
        <span className={cn(base, "border-primary/30 bg-primary/10 text-primary")}>
          <Layers className="size-3 shrink-0" />
          {packSize} Pack
        </span>
      )}

      {rarity !== "Normal" && (
        <span className={cn(base, "border-accent/50 bg-accent/20 text-foreground")}>
          <Flame className={cn("size-3.5 shrink-0", RARITY_FLAME[rarity])} />
          {RARITY_LABEL[rarity]}
        </span>
      )}
    </div>
  );
}

/**
 * What the casting is, and which of it you mean.
 *
 * The colours and the boxes are pickable because the answer travels: the Add
 * button below files exactly the box and the colour chosen here, rather than
 * whichever entry you happened to arrive on.
 */
function CatalogDetailsTab({
  car,
  stacked,
  preOrder,
  owned,
  isIso,
  packSize,
  colours,
  colour,
  onColour,
  siblings,
  shownId,
  onShown,
  ownersText,
  onSeeAllOwners,
}: {
  car: Diecast;
  stacked: boolean;
  preOrder: boolean;
  owned: boolean;
  isIso: boolean;
  packSize: number;
  colours: string[];
  colour: string;
  onColour: (v: string) => void;
  siblings: CatalogCar[];
  shownId: string;
  onShown: (id: string) => void;
  ownersText: string;
  /** Admin only — the list is people, so most readers do not get a button. */
  onSeeAllOwners?: () => void;
}) {
  const boxPrice = (c: CatalogCar) =>
    Number(c.mrp)
      ? `${c.assortment || "—"} · ${inrPriceFull(Math.round(Number(c.mrp)))}`
      : c.assortment || "—";

  return (
    <div className="min-w-0 space-y-5">
      <CatalogChips
        preOrder={preOrder}
        owned={owned}
        isIso={isIso}
        packSize={packSize}
        rarity={rarityOf(car)}
      />

      <div>
        <InfoRow stacked={stacked} size="lg" label="Series" value={car.series} />
        <InfoRow stacked={stacked} size="lg" label="Sub series" value={car.subSeries} />

        {colours.length > 1 ? (
          <InfoRow stacked={stacked} label="Colours">
            <PickChips
              stacked={stacked}
              value={colour}
              onChange={onColour}
              options={colours.map((c) => ({ value: c, label: c }))}
            />
          </InfoRow>
        ) : (
          <InfoRow stacked={stacked} size="lg" label="Colour" value={colours[0] || car.colour} />
        )}

        {siblings.length > 1 ? (
          <InfoRow stacked={stacked} label="Assortments">
            <PickChips
              stacked={stacked}
              value={shownId}
              onChange={onShown}
              options={siblings.map((s) => ({
                value: s.car_id,
                label: boxPrice(s),
                title: `${s.assortment || "This box"} — ${s.car_id}`,
              }))}
            />
          </InfoRow>
        ) : (
          <InfoRow
            stacked={stacked}
            size="lg"
            label="Assortment"
            value={siblings[0] ? boxPrice(siblings[0]) : car.assortment}
          />
        )}

        <InfoRow stacked={stacked} size="lg" label="Type" value={car.type} />
        <InfoRow stacked={stacked} size="lg" label="Case / Mix" value={car.caseNumber} />
      </div>

      {/* The count states; "View all" acts. Only an admin has the button. */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className="text-xs text-muted-foreground">{ownersText}</p>
        {onSeeAllOwners && (
          <button
            type="button"
            onClick={onSeeAllOwners}
            className="cursor-pointer text-xs font-medium text-primary transition-colors hover:text-primary/80"
          >
            View all
          </button>
        )}
      </div>

      {/* Under the description, because it is about which entries belong
          together — the same place it sits on a car. */}
      <AssortmentSuggestions catalogId={shownId} />
    </div>
  );
}

/**
 * The catalogue ID of each box of this casting. One entry is the ordinary case
 * and its box names the panel; several are one line each, named by their box.
 * Who filed an entry is in the activity log, not here.
 */
function CatalogRecordTab({
  siblings,
  stacked,
  preOrder,
  expectedDate,
}: {
  siblings: CatalogCar[];
  stacked: boolean;
  preOrder: boolean;
  expectedDate?: string | null;
}) {
  if (siblings.length === 0) return null;

  const idRow = (sib: CatalogCar, label: string) => (
    <InfoRow stacked={stacked} label={label} accent>
      <span className="inline-flex max-w-full items-center gap-1.5">
        <span className="truncate font-mono">{sib.car_id}</span>
        <CopyId id={sib.car_id} />
      </span>
    </InfoRow>
  );

  // The rows carry their own padding and rule; -my-3 takes the first row's top and the
  // last row's bottom back out, so the panel's padding is all there is.
  return (
    <div className="-my-3 min-w-0">
      {siblings.length > 1 ? (
        <>
          <InfoRow stacked={stacked} label="Casting">
            <span className="font-mono">{castingId(siblings[0])}</span>
          </InfoRow>
          {siblings.map((sib) => (
            <Fragment key={sib.car_id}>{idRow(sib, sib.assortment || "Entry")}</Fragment>
          ))}
        </>
      ) : (
        <>
          <InfoRow stacked={stacked} label="Assortment" value={siblings[0].assortment} />
          {idRow(siblings[0], "Catalogue ID")}
        </>
      )}

      {preOrder && expectedDate && (
        <InfoRow
          stacked={stacked}
          label="Expected"
          value={formatDayMonthYear(expectedDate) || expectedDate}
        />
      )}
    </div>
  );
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
  /**
   * Add it to the collection. The entry handed back is the box and the colour
   * chosen on the page, not whichever entry the window happened to open on —
   * a casting sold in two boxes and four colours is eight different things to
   * own, and the page is where you say which.
   */
  onAdd: (pick?: CatalogCar) => void;
  /**
   * Put this casting on your ISO list — the wishlist, not the collection.
   * Absent when the caller has nowhere to put it.
   */
  onAddIso?: (pick?: CatalogCar) => void;
  canEdit?: boolean;
  onEdit?: () => void;
  /**
   * Open a different catalogue entry. The related shelf is only drawn when a
   * caller can act on a tap — a shelf of cards that do nothing is worse than
   * no shelf.
   */
  onSelectCatalogCar?: (c: CatalogCar) => void;
}) {
  return (
    <Dialog open={Boolean(car)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        hideDragHandle
        hideClose
        disableSheetDismiss
        className="max-sm:top-0 max-sm:inset-x-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none max-sm:p-0 max-sm:pb-0 max-sm:flex max-sm:flex-col overflow-hidden rounded-3xl border-border bg-background p-0 sm:p-0 gap-0 block text-foreground shadow-2xl sm:max-h-[92vh] sm:w-fit sm:max-w-[calc(100vw-2rem)] sm:flex sm:items-stretch sm:overflow-visible sm:rounded-none sm:border-transparent sm:bg-transparent sm:shadow-none sm:transition-[width] sm:duration-300 sm:ease-out"
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
  onSelectCatalogCar,
}: {
  car: Diecast;
  catalogCar?: CatalogCar | null;
  preOrder: boolean;
  expectedDate?: string | null;
  owned: boolean;
  isIso?: boolean;
  onClose: () => void;
  onAdd: (pick?: CatalogCar) => void;
  onAddIso?: (pick?: CatalogCar) => void;
  canEdit?: boolean;
  onEdit?: () => void;
  onSelectCatalogCar?: (c: CatalogCar) => void;
}) {
  const mobile = useMobileHeroGestures(onClose);
  const { isAdmin, isOwner, user, profile } = useAuth();
  const mine = useCars();
  const { deleteCar } = useCarsActions();
  const { catalog, updateCatalogCar } = useCatalog();
  /** The wish being taken back off the list, while it is being confirmed. */
  const [dropIso, setDropIso] = useState(false);
  const [owners, setOwners] = useState<CatalogCarOwner[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [ownersModalOpen, setOwnersModalOpen] = useState(false);
  /** The parcel being opened from the owners list, by its shipping ID. */
  const [parcel, setParcel] = useState("");

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

  /** Every box this casting is sold in, so one page answers for all of them. */
  const siblings = useMemo(
    () => (catalogCar ? castingSiblings(catalogCar, catalog) : []),
    [catalogCar, catalog],
  );

  /**
   * Which box, and which colour. Both start on the entry you opened and both
   * travel to the Add button — see `pick` below.
   */
  const [shownId, setShownId] = useState(catalogCar?.car_id ?? "");
  useEffect(() => {
    setShownId(catalogCar?.car_id ?? "");
  }, [catalogCar?.car_id]);
  const shown = siblings.find((s) => s.car_id === shownId) ?? catalogCar ?? null;

  const colours = useMemo(() => (shown ? catalogColours(shown) : []), [shown]);
  const [colour, setColour] = useState("");
  // A box picked while a colour was chosen keeps the colour when that box comes
  // in it, and falls back to the box's own first colour when it does not.
  useEffect(() => {
    setColour((c) =>
      c && colours.some((x) => x.toLowerCase() === c.toLowerCase()) ? c : (colours[0] ?? ""),
    );
  }, [colours]);

  /** The casting shaped as a car, following whichever box is chosen. */
  const shownCar = useMemo(
    () => (shown ? { ...catalogCarToDiecast(shown), colour: colour || shown.colour || "" } : car),
    [shown, colour, car],
  );

  /** What the Add button files: this box, in this colour. */
  const pick = useMemo(
    () => (shown ? { ...shown, colour: colour || shown.colour || "" } : undefined),
    [shown, colour],
  );

  // The catalogue is everybody's: this photo is the one every collection shows
  // for this casting, so only an admin can paste over it.
  usePastedPhoto(Boolean(isAdmin && catalogCar), (url) =>
    updateCatalogCar({ ...catalogCar!, image_url: url }),
  );

  const { pack } = usePack(shown?.car_id);
  const hasPack = Boolean(pack?.is_multipack);
  const packSize = hasPack ? Number(pack?.pack_size) || 0 : 0;

  useEffect(() => {
    if (!catalogCar?.car_id) {
      setOwners([]);
      return;
    }
    let cancelled = false;
    setOwnersLoading(true);
    // Across every box the casting is catalogued in — see getCastingOwners.
    getCastingOwners(siblings.length ? siblings : [catalogCar], (entry) => ({
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
  }, [catalogCar?.car_id, catalogCar, siblings, isActuallyOwned, user, profile, matchingUserCar]);

  /**
   * The one shelf under the window: the set, the series, or the casting's own
   * make and model. Its own boxes are not "more from" anything — they are this
   * car, and they are already named in the control above.
   */
  const shelf = useMemo(() => {
    if (!catalogCar || !onSelectCatalogCar) return null;
    const self = new Set(siblings.map((c) => (c.car_id || "").trim().toUpperCase()));
    self.add((catalogCar.car_id || "").trim().toUpperCase());
    const pool = catalog.filter((c) => !self.has((c.car_id || "").trim().toUpperCase()));
    return moreFrom(
      {
        brand: catalogCar.brand,
        series: catalogCar.series,
        subSeries: catalogCar.sub_series,
        make: catalogCar.make,
        model: catalogCar.model,
      },
      pool,
      (c) => ({
        brand: c.brand,
        series: c.series,
        subSeries: c.sub_series,
        make: c.make,
        model: c.model,
      }),
    );
  }, [catalog, catalogCar, siblings, onSelectCatalogCar]);

  const boxes = useAssortmentSuggestions(shownId);
  const docked = useMinWidth(1180);
  /** Which panel sits beside the card, and whether it is out. Kept apart so it can slide shut still showing. */
  const [panel, setPanel] = useState<"boxes" | "activity" | "buyers">("boxes");
  const [dockOpen, setDockOpen] = useState(false);
  const togglePanel = (p: "boxes" | "activity" | "buyers") => {
    if (dockOpen && panel === p) setDockOpen(false);
    else {
      setPanel(p);
      setDockOpen(true);
    }
  };
  // Who changed a catalogue entry is for the people who run the catalogue.
  const drawer = useContext(CarDrawerCtx);
  /** The reader's own copy of the box a "You" row names, in the car window. */
  const openMine = (o: CatalogCarOwner) => {
    const box = (o.assortment || "").trim().toLowerCase();
    const pool = siblings.length ? siblings : catalogCar ? [catalogCar] : [];
    const copy =
      mine.find(
        (c) =>
          !isIso(c.status) &&
          pool.some(
            (e) => (e.assortment || "").trim().toLowerCase() === box && isCarMatchingCatalog(c, e),
          ),
      ) ?? matchingUserCar;
    if (!copy || !drawer) return;
    onClose();
    drawer.openCar(copy);
  };
  const canLog = Boolean(isAdmin || isOwner);
  const verified = isVerifiedByAdmin(shown?.synced_source);
  /**
   * Verify the entry on show, or take that back. It writes the columns the maker
   * sync writes, so it overrides a Mini GT sync, and a later sync overrides it.
   */
  const toggleVerified = async () => {
    if (!shown) return;
    const ok = await updateCatalogCar(
      verified
        ? { ...shown, synced_at: null, synced_source: null }
        : { ...shown, synced_at: new Date().toISOString(), synced_source: VERIFIED_BY_ADMIN },
    );
    if (ok) toast.success(verified ? "Verification removed" : "Marked as verified");
  };
  const boxesDock = docked && boxes.enabled;
  const filedBy = shown?.created_at
    ? { name: resolveCatalogUserId(shown.created_by), at: shown.created_at }
    : undefined;
  const buyerCount = ownerCount(owners);
  const buyersDock = docked && buyerCount > 0;
  const dock = docked && (boxesDock || canLog || buyersDock);

  const shelfRow = shelf ? (
    <CarShelfRow
      heading={shelf.heading}
      cars={shelf.cars.map(catalogCarToDiecast)}
      currentId={shownId}
      onSelectCar={(picked) => {
        const match = shelf.cars.find((c) => c.car_id === picked.id);
        if (match) onSelectCatalogCar?.(match);
      }}
    />
  ) : null;

  /**
   * The parcel each of my own copies came in, by the box it came in.
   *
   * Read from my own collection, not from the owners list: the list is everyone
   * and a parcel reference is one person's. Keyed by box because the same
   * casting in a Blister and in a 5 Pack arrived in two different parcels.
   */
  const myShipping = useMemo(() => {
    const out: Record<string, string> = {};
    const pool = siblings.length ? siblings : catalogCar ? [catalogCar] : [];
    for (const c of mine) {
      const ship = (c.shippingId || "").trim();
      if (!ship || isIso(c.status)) continue;
      if (!pool.some((entry) => isCarMatchingCatalog(c, entry))) continue;
      out[(c.assortment || "").trim().toLowerCase()] = ship;
    }
    return out;
  }, [mine, siblings, catalogCar]);

  const ownersText = ownersLine(ownersLoading, ownerCount(owners));
  const canSeeAllOwners = isAdmin && !ownersLoading && owners.length > 0;

  /** Status, the catalogue ID and size: the pills under the name. */
  const pills = (
    <div className="flex flex-wrap items-center gap-2">
      <CatalogChips
        preOrder={preOrder}
        owned={isActuallyOwned}
        isIso={isActuallyIso}
        packSize={packSize}
        rarity={rarityOf(shownCar)}
      />
      {shown && (
        <SyncedBadge
          car={shown}
          className="!h-8 !bg-card !px-3 !text-sm !text-sky-500 [&>svg]:!size-4"
        />
      )}
      {shownCar.size && (
        <span className="inline-flex h-8 items-center rounded-full border border-border/80 px-3 text-sm font-semibold text-foreground">
          {shownCar.size}
        </span>
      )}
    </div>
  );

  /** The facts, row by row; see PhoneFacts. */
  const factRows = [
    {
      items: [
        ["Brand", shownCar.brand],
        ["Number", shownCar.carNumber],
      ],
    },
    {
      items: [
        ["Series", shownCar.series],
        ["Sub series", shownCar.subSeries],
      ],
    },
    {
      items: [
        ["Assortment", shownCar.assortment],
        ["Colour", colour || colours[0] || shownCar.colour],
        ["Type", shownCar.type],
      ],
    },
  ] as const;

  const recordSiblings = siblings.length ? siblings : catalogCar ? [catalogCar] : [];

  /** The cards: the choices, the description, the box, who filed what. */
  const panels = (cols: string, phone = false) => (
    <div className={cn("grid items-start gap-3", cols)}>
      {shownCar.caseNumber && (
        <Panel title="Specification" className="col-span-full">
          <InfoRow label="Case / Mix" value={shownCar.caseNumber} />
        </Panel>
      )}
      {(colours.length > 1 || siblings.length > 1) && (
        <Panel title="Options" className="col-span-full space-y-4">
          {colours.length > 1 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Colours
              </p>
              <PickChips
                stacked
                value={colour}
                onChange={setColour}
                options={colours.map((c) => ({ value: c, label: c }))}
              />
            </div>
          )}
          {siblings.length > 1 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Assortments
              </p>
              <PickChips
                stacked
                value={shownId}
                onChange={setShownId}
                options={siblings.map((x) => ({
                  value: x.car_id,
                  label: Number(x.mrp)
                    ? `${x.assortment || "—"} · ${inrPriceFull(Math.round(Number(x.mrp)))}`
                    : x.assortment || "—",
                  title: `${x.assortment || "This box"} — ${x.car_id}`,
                }))}
              />
            </div>
          )}
        </Panel>
      )}
      {hasPack && (
        <Panel title="What's Inside" className="col-span-full">
          <CarInTheBoxTab packCarId={shown?.car_id} />
        </Panel>
      )}
      <Panel title="Record" className="col-span-full">
        <CatalogRecordTab
          siblings={recordSiblings}
          stacked={false}
          preOrder={preOrder}
          expectedDate={expectedDate}
        />
      </Panel>
    </div>
  );

  /** The count states; "View all" acts. Only an admin has the button. */
  const owners_ = buyersDock ? null : (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <p className="text-xs text-muted-foreground">{ownersText}</p>
      {canSeeAllOwners && (
        <button
          type="button"
          onClick={() => setOwnersModalOpen(true)}
          className="cursor-pointer text-xs font-medium text-primary transition-colors hover:text-primary/80"
        >
          View all
        </button>
      )}
    </div>
  );

  // All three share the width rather than Add taking whatever the other two
  // leave. "Add to collection" spelled out was the widest thing in the row and
  // said nothing the button's position did not: this is the catalogue, and the
  // only place to add to is your collection.
  const actions = (
    <div className="flex w-full items-center gap-2.5">
      {canEdit && onEdit && (
        <Button
          type="button"
          variant="outline"
          onClick={onEdit}
          className="h-11 min-w-0 flex-1 cursor-pointer gap-2 px-2 text-sm font-semibold"
        >
          <Pencil className="size-3.5 shrink-0" />
          <span className="truncate">Update</span>
        </Button>
      )}
      {/* One button, both directions. It used to vanish once the casting was
          on the list, which read as "done" and left no way back off the list
          from the catalogue at all — the wish could only be dropped by finding
          its row in My Cars. Your list either way: nobody else's is touched.

          Three full labels do not fit a 375px phone, so this one keeps its
          icon and gives up its words rather than clipping all three to half a
          word each. */}
      {onAddIso &&
        (isActuallyIso ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setDropIso(true)}
            title="Take this off your ISO list"
            className="h-11 w-11 shrink-0 cursor-pointer gap-2 px-0 text-sm font-semibold text-rose-500 hover:text-rose-500 sm:w-auto sm:min-w-0 sm:flex-1 sm:px-2"
          >
            <Trash2 className="size-3.5 shrink-0" />
            <span className="hidden truncate sm:inline">Remove ISO</span>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => onAddIso(pick)}
            title="Add to your ISO list"
            className="h-11 w-11 shrink-0 cursor-pointer gap-2 px-0 text-sm font-semibold sm:w-auto sm:min-w-0 sm:flex-1 sm:px-2"
          >
            <Search className="size-3.5 shrink-0" />
            <span className="hidden truncate sm:inline">Add to ISO</span>
          </Button>
        ))}
      <Button
        type="button"
        onClick={() => onAdd(pick)}
        // Its words are the ones that must not be cut: the others give way.
        className="h-11 shrink-0 cursor-pointer gap-2 whitespace-nowrap px-4 text-sm font-semibold"
      >
        <Plus className="size-4 shrink-0" />
        {isActuallyOwned ? "Add another" : "Add"}
      </Button>
    </div>
  );

  const title =
    shownCar.name ||
    `${shownCar.make} ${shownCar.model} ${shownCar.variant || ""}`.trim() ||
    "Unnamed car";

  return (
    <div
      className="max-sm:contents sm:flex sm:items-stretch"
      style={
        {
          "--dock": dock && dockOpen ? `calc(${DOCK_W} + ${DOCK_GAP})` : "0rem",
        } as React.CSSProperties
      }
    >
      <div className="relative flex h-full w-full min-h-0 flex-1 flex-col overflow-hidden sm:max-h-[92vh] sm:rounded-3xl sm:border sm:border-border sm:bg-background sm:shadow-2xl">
        <DialogTitle className="sr-only">{title} — catalogue</DialogTitle>
        <DialogDescription className="sr-only">
          What this casting is, which boxes and colours it comes in, and who filed it.
        </DialogDescription>

        {/* =====================================================================
          1. DESKTOP & TABLET: the same window a car you own opens in — the
          name heads it, the photograph holds the left, and the right is
          whichever reading you asked for.
          ===================================================================== */}
        <DesktopShell
          kicker={[]}
          title={title}
          onClose={onClose}
          subtitle={<div className="mt-3">{pills}</div>}
          headerAction={
            <>
              {canLog && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void toggleVerified()}
                  aria-pressed={verified}
                  title={
                    verified
                      ? "Verified by admin: click to remove it"
                      : "Mark this entry as verified"
                  }
                  className={cn(
                    "h-9 cursor-pointer gap-2 rounded-full px-4 text-sm font-semibold",
                    verified && "border-sky-500/60 bg-sky-500/10 text-sky-500",
                  )}
                >
                  <BadgeCheck className="size-4" />
                  {verified ? "Verified" : "Verify"}
                </Button>
              )}
              {canLog &&
                (docked ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => togglePanel("activity")}
                    aria-pressed={dockOpen && panel === "activity"}
                    title="Everything that has changed on this entry"
                    className={cn(
                      "h-9 cursor-pointer gap-2 rounded-full px-4 text-sm font-semibold",
                      dockOpen &&
                        panel === "activity" &&
                        "border-primary/60 bg-primary/10 text-primary",
                    )}
                  >
                    <History className="size-4" />
                    Activity
                  </Button>
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        title="Everything that has changed on this entry"
                        className="h-9 cursor-pointer gap-2 rounded-full px-4 text-sm font-semibold"
                      >
                        <History className="size-4" />
                        Activity
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      className="max-h-[70vh] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto p-3"
                    >
                      <ChangeLog rowKey={shownId} origin={filedBy} />
                    </PopoverContent>
                  </Popover>
                ))}
            </>
          }
          photo={<HeroCarImage car={shownCar} contain />}
          below={<PhoneFacts rows={factRows} />}
          actions={actions}
        >
          {panels("grid-cols-2")}
          {(buyersDock || boxesDock) && (
            <div className="flex items-center gap-2.5">
              {buyersDock && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => togglePanel("buyers")}
                  aria-pressed={dockOpen && panel === "buyers"}
                  title="Collectors who have this in their collection"
                  className={cn(
                    "h-11 flex-1 cursor-pointer gap-2 text-sm font-semibold",
                    dockOpen &&
                      panel === "buyers" &&
                      "border-primary/60 bg-primary/10 text-primary",
                  )}
                >
                  <Users className="size-4" />
                  Bought by
                  <span className="tabular-nums text-muted-foreground">{buyerCount}</span>
                </Button>
              )}
              {boxesDock && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => togglePanel("boxes")}
                  aria-pressed={dockOpen && panel === "boxes"}
                  title="Entries that may be other boxes of this casting"
                  className={cn(
                    "h-11 flex-1 cursor-pointer gap-2 text-sm font-semibold",
                    dockOpen && panel === "boxes" && "border-primary/60 bg-primary/10 text-primary",
                  )}
                >
                  <Layers className="size-4" />
                  Other boxes
                  <span className="tabular-nums text-muted-foreground">
                    {boxes.suggestions.length}
                  </span>
                </Button>
              )}
            </div>
          )}
          {owners_}
          {!boxesDock && <BoxesInline boxes={boxes} />}
          <div className="mt-auto">{shelfRow}</div>
        </DesktopShell>

        {/* =====================================================================
          2. PHONE: the photo, then the same readings stacked over it.
          ===================================================================== */}
        <div
          ref={mobile.rootRef}
          className="md:hidden relative w-full h-full flex flex-col flex-1 min-h-0 overflow-hidden bg-background sm:h-[min(92vh,860px)] sm:w-[min(30rem,calc(100vw-2rem))]"
          style={{ "--hero-h": "clamp(320px, 42vh, 460px)" } as React.CSSProperties}
        >
          <div className="relative flex-1 min-h-0">
            <div
              ref={mobile.heroRef}
              className="absolute inset-x-0 top-0 z-0 w-full overflow-hidden bg-white select-none"
              style={{ height: "var(--hero-h)" }}
            >
              <HeroCarImage car={shownCar} />
            </div>

            {/* The warmth behind the sheet, which is part of the window rather
              than part of what scrolls in it. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 z-[5]"
              style={{
                top: "calc(var(--hero-h) - 1.5rem)",
                background:
                  "radial-gradient(120% 55% at 88% 0%, color-mix(in oklab, var(--accent) 26%, transparent), transparent 70%)",
              }}
            />

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
                  className="relative flex flex-1 flex-col overflow-hidden rounded-t-3xl border-t border-border bg-background/70 px-4 pt-5 pb-6 shadow-[0_-8px_24px_rgba(0,0,0,0.1)] backdrop-blur-2xl"
                >
                  <div className="relative space-y-3">
                    <div className="min-w-0 space-y-3">
                      <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
                      {pills}
                    </div>

                    <PhoneFacts rows={factRows} />

                    {panels("grid-cols-1", true)}

                    {owners_}

                    <BoxesInline boxes={boxes} />

                    {shelfRow}
                  </div>
                </div>
              </div>
            </div>

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
              className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-30 grid size-9 cursor-pointer place-items-center rounded-full bg-foreground text-background shadow-md transition-transform active:scale-95"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="shrink-0 z-20 border-t border-border bg-background/95 backdrop-blur-md p-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(0,0,0,0.08)]">
            {actions}
          </div>
        </div>

        {/* A wish is not a purchase record, so this asks once rather than making
          you type a word — and the row it drops is undoable from the top bar
          like any other car. */}
        <Dialog open={dropIso} onOpenChange={setDropIso}>
          <DialogContent className="sm:max-w-md">
            <DialogTitle className="text-lg font-semibold">
              Take this off your ISO list?
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{title}</span> stays in the catalogue.
              You are only saying you have stopped looking for it.
            </DialogDescription>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDropIso(false)}>
                Keep it
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!matchingIsoCar) return;
                  deleteCar(matchingIsoCar.id);
                  setDropIso(false);
                  toast.success("Off your ISO list", {
                    description: "Undo in the top bar brings it back.",
                  });
                }}
                className="bg-rose-600 text-white hover:bg-rose-600/90"
              >
                <Trash2 className="size-4 shrink-0" />
                Remove
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {isAdmin && (
          <CatalogOwnersDialog
            open={ownersModalOpen}
            onClose={() => setOwnersModalOpen(false)}
            carName={title}
            owners={owners}
            loading={ownersLoading}
            myUid={user?.id}
            myShipping={myShipping}
            onOpenParcel={setParcel}
          />
        )}

        {/* The parcel the reader's own copy came in: same dialog the Shipping ID
          on a car opens, so one parcel has one screen. */}
        <ShippingBatchDialog
          open={Boolean(parcel)}
          onOpenChange={(v) => !v && setParcel("")}
          initialShippingId={parcel}
        />
      </div>
      {dock && (
        <DockPanel
          open={dockOpen}
          title={
            panel === "activity"
              ? "Activity"
              : panel === "buyers"
                ? "Bought by"
                : "Possible other boxes"
          }
          subtitle={title}
          closeLabel="Close this panel"
          onClose={() => setDockOpen(false)}
        >
          {panel === "activity" ? (
            dockOpen && <ChangeLog rowKey={shownId} origin={filedBy} />
          ) : panel === "buyers" ? (
            <BuyersList
              owners={owners}
              myUid={user?.id}
              isAdmin={Boolean(isAdmin)}
              myShipping={myShipping}
              onOpenParcel={setParcel}
              onOpenMine={openMine}
            />
          ) : (
            <SuggestionList boxes={boxes} />
          )}
        </DockPanel>
      )}
    </div>
  );
}

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
            <span className="text-xs text-muted-foreground/80">{members.length} listed</span>
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
                <span className="w-4 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{entry?.name || id}</div>
                  <div className="truncate text-xs text-muted-foreground">
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
