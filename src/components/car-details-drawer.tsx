import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Car, Flame, Loader2, Pencil, Star } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Diecast } from "@/lib/types";
import { useCars, useCarsActions } from "@/lib/cars-store";
import { findCarImage } from "@/lib/car-image";
import { formatDayMonthYear, inrFull } from "@/lib/format";
import { TrackingLink } from "@/components/tracking-link";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/status-pill";
import { CarFormDialog } from "@/components/car-form-dialog";
import { ShippingBatchDialog } from "@/components/shipping-batch-dialog";
import { StatusUpdateDialog } from "@/components/status-update-dialog";
import { UpdateStatusButton } from "@/components/update-status-button";

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
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl border-border bg-background p-5 text-foreground shadow-2xl sm:max-w-2xl sm:p-6">
          {car && (
            <CarPopupContent
              car={car}
              onEdit={() => setEditCar(car)}
              onOpenShippingBatch={(sId) => {
                setBatchShippingId(sId);
                setBatchOpen(true);
              }}
              onToggleFavourite={() => updateCar({ ...car, favourite: !car.favourite })}
              onToggleChase={() => updateCar({ ...car, chase: !car.chase })}
              onUpdateStatus={() => setStatusCar(car)}
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

      {/* Shipping batch update dialog triggered from shipping ID */}
      <ShippingBatchDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        initialShippingId={batchShippingId || ""}
      />
    </CarDrawerCtx.Provider>
  );
}

interface CarPopupContentProps {
  car: Diecast;
  onEdit: () => void;
  onOpenShippingBatch: (shippingId: string) => void;
  onToggleFavourite: () => void;
  onToggleChase: () => void;
  onUpdateStatus: () => void;
}

function CarPopupContent({
  car,
  onEdit,
  onOpenShippingBatch,
  onToggleFavourite,
  onToggleChase,
  onUpdateStatus,
}: CarPopupContentProps) {
  const spent = Math.round(car.spent ?? 0);
  const mrp = Math.round(car.mrp ?? 0);
  const delta = mrp - spent;
  // Only for the button's tooltip now — the dialog decides where the car
  // actually goes, and preselects the same next stage itself.
  const advanceTo = nextStatus(car.status);

  const hasArrived = (car.status || "").trim().toLowerCase() === "available";
  const cleanTransitNotes = (car.transitInfo || "").trim();

  return (
    <div className="space-y-4">
      {/* Hidden Accessible Dialog Title & Description */}
      <DialogTitle className="sr-only">
        {car.name || `${car.make} ${car.model}`} Details
      </DialogTitle>
      <DialogDescription className="sr-only">
        Diecast car specifications, status, logistics, and pricing details.
      </DialogDescription>

      {/* TITLE, AT THE TOP
          It used to sit under the photograph, which meant the first thing on
          screen was a row of three icon buttons and the name of the car arrived
          about 200px in. The status moves up here with it: it is the fact that
          decides what you do next, and it reads as part of the headline rather
          than as the sixth entry in a specification grid.

          The right padding leaves the dialog's own close button its corner —
          desktop only, since a phone pushes the sheet down instead. */}
      <div className="flex items-start justify-between gap-3 sm:pr-8">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {car.name || `${car.make} ${car.model} ${car.variant || ""}`.trim() || "Unnamed car"}
          </h2>
          {/* Make and model are already in the title, so the subtitle carries the
              collection context instead. */}
          <p className="mt-1 text-sm font-normal text-muted-foreground">
            {[car.brand, car.series, car.subSeries].filter(Boolean).join(" • ") || "—"}
          </p>
        </div>
        <div className="shrink-0 pt-1">
          <StatusPill status={car.status} />
        </div>
      </div>

      {/* HERO IMAGE
          The scale badge that used to be overlaid here is gone — it said "1:64"
          on almost every car in the collection, and it reads beside the colour
          below where a scale that is *not* 1:64 is worth noticing. What is
          overlaid now are the two flags, which are about this car as an object
          and belong on the picture of it. */}
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-border bg-muted/60 shadow-inner">
        <HeroCarImage car={car} />
        <div className="absolute right-2 top-2 flex items-center gap-1.5">
          <FlagButton
            onClick={onToggleChase}
            pressed={Boolean(car.chase)}
            title={car.chase ? "Unmark as chase" : "Mark as chase"}
          >
            <Flame
              className={`size-4 ${car.chase ? "fill-orange-400 text-orange-400" : "text-white"}`}
            />
          </FlagButton>
          <FlagButton
            onClick={onToggleFavourite}
            pressed={Boolean(car.favourite)}
            title={car.favourite ? "Remove from favourites" : "Add to favourites"}
          >
            <Star
              className={`size-4 ${car.favourite ? "fill-amber-400 text-amber-400" : "text-white"}`}
            />
          </FlagButton>
        </div>
      </div>

      {/* PURCHASE
          Was a filled card of its own. Three sections each in their own
          container stacked into three boxes on a phone with nothing to say which
          one you were in; a rule and a heading does the same job in less. */}
      <Section title="Purchase">
        <div className="grid grid-cols-3 gap-2">
          <Spec label="Spent" value={inrFull(spent)} size="lg" />
          <Spec label="Retail / MRP" value={inrFull(mrp)} size="lg" />
          <Spec
            label="Gain / Delta"
            size="lg"
            className={delta >= 0 ? "text-emerald-600 dark:text-[#00E599]" : "text-rose-400"}
            value={delta >= 0 ? `+${inrFull(delta)}` : `-${inrFull(Math.abs(delta))}`}
          />
        </div>
      </Section>

      {/* DETAILS
          Read in the order you would describe the car: what it looks like, what
          set it belongs to, what it is, and only then the numbers that identify
          it in the catalogue. */}
      <Section title="Details">
        <div className="grid grid-cols-3 gap-x-3 gap-y-4 text-sm">
          <Spec
            label="Colour / Livery"
            value={[car.colour || "—", car.size].filter(Boolean).join(" · ")}
          />
          <Spec label="Assortment" value={car.assortment} />
          <Spec label="Vehicle Type" value={car.type} />
          <Spec label="Car Number" value={car.carNumber} />
          {/* Status is the pill beside the title now, so it is not repeated. */}
          <Spec label="Car ID" value={car.id} className="font-mono" />
        </div>
      </Section>

      {/* SHIPPING
          The courier, the number and the note appear only when the car actually
          has them. Six fields of "—" told you nothing except that this car was
          not shipped by anyone. */}
      <Section title="Shipping">
        <div className="grid grid-cols-3 gap-x-3 gap-y-4 text-sm">
          <Spec label="Seller" value={car.seller} />
          <div className="min-w-0">
            <span className="text-xs text-muted-foreground">Shipping ID</span>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="truncate font-mono font-semibold text-foreground">
                {car.shippingId || "—"}
              </span>
              {car.shippingId && (
                <button
                  type="button"
                  onClick={() => onOpenShippingBatch(car.shippingId)}
                  className="cursor-pointer text-[10px] text-primary hover:underline"
                  title={`Update every car in order ${car.shippingId}`}
                >
                  (View Order)
                </button>
              )}
            </div>
          </div>
          <Spec label="Order Date" value={car.orderDate} />

          {/* A car in hand has an arrival date; one still coming has an
              estimate. Showing "Expected" against a car that turned up last
              month was the wrong word for the only date that mattered. */}
          <Spec
            label={hasArrived ? "Received Date" : "Expected Date"}
            value={formatDayMonthYear(hasArrived ? car.date || car.expectedDate : car.expectedDate)}
          />
          {car.deliveryPartner ? (
            <Spec label="Delivery Partner" value={car.deliveryPartner} />
          ) : null}
          {car.trackingId ? (
            <Spec label="Tracking ID" value={car.trackingId} className="font-mono" />
          ) : null}
          {cleanTransitNotes ? (
            <Spec label="Notes" value={cleanTransitNotes} className="col-span-3" />
          ) : null}
        </div>

        {/* The consignment number is only useful if it goes somewhere. */}
        <TrackingLink partner={car.deliveryPartner} trackingId={car.trackingId} className="mt-3" />
      </Section>

      {/* BOTTOM ACTIONS
          The two things you do to a car after reading about it, at the end of
          the reading rather than scattered through it: the status button was
          tucked into the Shipping heading and Edit was a pencil in a row of
          icons at the very top.

          Delete is not here any more. It was a full-width red button one tap
          from simply looking at a car; it lives behind Edit now, where changing
          the record is what you already came to do. */}
      <div className="flex items-center gap-2 border-t border-border pt-3">
        <Button variant="outline" onClick={onEdit} className="flex-1 gap-1.5">
          <Pencil className="size-4" />
          Edit
        </Button>
        {/* Same size as Edit beside it. It was `sm` — two buttons in one row,
            one 32px tall and one 36px, which reads as a mistake rather than a
            hierarchy. */}
        <UpdateStatusButton
          size="default"
          onClick={onUpdateStatus}
          title={
            advanceTo
              ? `Update status — ${car.status || "unknown"} to ${advanceTo}`
              : "Update status"
          }
          className="flex-1"
        />
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
    <section className="border-t border-border pt-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One labelled value inside a section. */
function Spec({
  label,
  value,
  className,
  size = "sm",
}: {
  label: string;
  value?: string | null;
  className?: string;
  size?: "sm" | "lg";
}) {
  return (
    <div className="min-w-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`mt-0.5 block truncate font-semibold text-foreground ${
          size === "lg" ? "text-xl sm:text-2xl font-bold" : ""
        } ${className ?? ""}`}
        title={value || undefined}
      >
        {value || "—"}
      </span>
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
  }, [car.id, car.imageUrl, car.model, car.variant, car.colour, car.brand, car.make]);

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
          className="h-full w-full object-cover sm:object-contain transition-opacity duration-300"
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
