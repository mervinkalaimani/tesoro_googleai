import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Car, Flame, Loader2, Pencil, Star, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Diecast } from "@/lib/types";
import { useCars, useCarsActions } from "@/lib/cars-store";
import { findCarImage } from "@/lib/car-image";
import { formatDayMonthYear, inrFull } from "@/lib/format";
import { TrackingLink } from "@/components/tracking-link";
import { Input } from "@/components/ui/input";
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
  const [pendingDelete, setPendingDelete] = useState<Diecast | null>(null);

  const cars = useCars();
  const { updateCar, deleteCar } = useCarsActions();

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
        <DialogContent className="max-w-2xl sm:max-w-2xl border-border bg-background text-foreground shadow-2xl rounded-2xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto [&>button]:hidden">
          {car && (
            <CarPopupContent
              car={car}
              onClose={close}
              onEdit={() => setEditCar(car)}
              onOpenShippingBatch={(sId) => {
                setBatchShippingId(sId);
                setBatchOpen(true);
              }}
              onToggleFavourite={() => updateCar({ ...car, favourite: !car.favourite })}
              onToggleChase={() => updateCar({ ...car, chase: !car.chase })}
              onUpdateStatus={() => setStatusCar(car)}
              onDelete={() => setPendingDelete(car)}
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

      <DeleteCarDialog
        car={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteCar(pendingDelete.id);
          setPendingDelete(null);
          close();
        }}
      />
    </CarDrawerCtx.Provider>
  );
}

/**
 * Deleting a car is not undoable, so it takes a deliberate typed phrase rather
 * than a single click on a native confirm.
 */
function DeleteCarDialog({
  car,
  onCancel,
  onConfirm,
}: {
  car: Diecast | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    setTyped("");
  }, [car?.id]);

  if (!car) return null;

  const phrase = `delete ${(car.make || car.name || "car").trim()}`.toLowerCase();
  const matches = typed.trim().toLowerCase() === phrase;

  return (
    <Dialog
      open={Boolean(car)}
      onOpenChange={(v) => {
        if (!v) onCancel();
      }}
    >
      <DialogContent className="max-w-md border-border bg-background text-foreground">
        <DialogTitle className="text-lg font-semibold">Delete this car?</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {car.name || `${car.make} ${car.model}`}
          </span>{" "}
          {/* No longer "cannot be undone": the top bar's undo button puts the
              car back, row and all. That holds until the page is reloaded,
              which is the honest limit to state here. */}
          will be removed from your collection. Undo brings it back, until you reload.
        </DialogDescription>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Type <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">{phrase}</code> to
            confirm.
          </p>
          <Input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches) onConfirm();
            }}
            placeholder={phrase}
            aria-label="Type the confirmation phrase"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!matches}
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="size-4" />
            Delete
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface CarPopupContentProps {
  car: Diecast;
  onClose: () => void;
  onEdit: () => void;
  onOpenShippingBatch: (shippingId: string) => void;
  onToggleFavourite: () => void;
  onToggleChase: () => void;
  onUpdateStatus: () => void;
  onDelete: () => void;
}

function CarPopupContent({
  car,
  onClose,
  onEdit,
  onOpenShippingBatch,
  onToggleFavourite,
  onToggleChase,
  onUpdateStatus,
  onDelete,
}: CarPopupContentProps) {
  const spent = Math.round(car.spent ?? 0);
  const mrp = Math.round(car.mrp ?? 0);
  const delta = mrp - spent;
  // Only for the button's tooltip now — the dialog decides where the car
  // actually goes, and preselects the same next stage itself.
  const advanceTo = nextStatus(car.status);

  const getStatusColor = (st: string) => {
    const s = (st || "").toLowerCase();
    if (s.includes("transit")) return "text-rose-400";
    if (s.includes("available")) return "text-emerald-400";
    if (s.includes("pre order")) return "text-amber-600 dark:text-amber-400";
    if (s.includes("wait")) return "text-cyan-400";
    if (s.includes("hold")) return "text-purple-400";
    if (s.includes("iso")) return "text-blue-400";
    return "text-foreground";
  };

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

      {/* TOP HEADER ROW
          The car ID used to sit on the left of this row and the Close button on
          the right. The ID is a catalogue number — it reads with the rest of the
          detail below rather than as the headline — and closing is the X in the
          dialog's own corner, or a push down on a phone. What is left is the
          three things you do to a car from here. */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-1.5">
          {/* Chase toggle, sits left of the favourite star */}
          <button
            type="button"
            onClick={onToggleChase}
            title={car.chase ? "Unmark as chase" : "Mark as chase"}
            aria-pressed={car.chase}
            className="flex size-8 items-center justify-center rounded-lg border border-border bg-muted/40 transition-colors hover:bg-muted cursor-pointer"
          >
            <Flame
              className={`size-4 ${
                car.chase
                  ? "fill-orange-400 text-orange-400"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            />
          </button>

          {/* Favorite Star Button */}
          <button
            type="button"
            onClick={onToggleFavourite}
            title={car.favourite ? "Remove from favourites" : "Add to favourites"}
            className="flex size-8 items-center justify-center rounded-lg border border-border bg-muted/40 hover:bg-muted transition-colors cursor-pointer"
          >
            <Star
              className={`size-4 ${
                car.favourite
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            />
          </button>

          {/* Edit Pencil Button */}
          <button
            type="button"
            onClick={onEdit}
            title="Edit car details"
            className="flex size-8 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <Pencil className="size-4" />
          </button>
        </div>
      </div>

      {/* HERO IMAGE
          Nothing is overlaid on it now. The scale badge sat in the corner of
          every photograph to say "1:64", which is what almost every car in the
          collection is; it reads beside the colour below, where a scale that is
          not 1:64 is worth noticing. */}
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-muted/60 border border-border shadow-inner">
        <HeroCarImage car={car} />
      </div>

      {/* CAR TITLE & SUBTITLE */}
      <div className="pt-1">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          {car.name || `${car.make} ${car.model} ${car.variant || ""}`.trim() || "Unnamed car"}
        </h2>
        {/* Make and model are already in the title, so the subtitle carries the
            collection context instead. */}
        <p className="mt-1 text-sm font-normal text-muted-foreground">
          {[car.brand, car.series, car.subSeries].filter(Boolean).join(" • ") || "—"}
        </p>
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
          <Spec label="Car ID" value={car.id} className="font-mono" />
          <Spec label="Status" value={car.status} className={getStatusColor(car.status)} />
        </div>
      </Section>

      {/* SHIPPING
          The courier, the number and the note appear only when the car actually
          has them. Six fields of "—" told you nothing except that this car was
          not shipped by anyone. */}
      <Section
        title="Shipping"
        action={
          // Was a one-click "Mark <next stage>", which moved the status and
          // nothing else — so a car became Transit with no courier, or
          // Available with no seller or price. It opens the status dialog
          // instead: same one the ISO suggestions use, which asks for what the
          // new status actually implies. The next stage is still what it
          // defaults to.
          <UpdateStatusButton
            onClick={onUpdateStatus}
            title={
              advanceTo
                ? `Update status — ${car.status || "unknown"} to ${advanceTo}`
                : "Update status"
            }
            className="h-8 px-3 text-xs"
          />
        }
      >
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

      {/* BOTTOM ACTION
          The Close button that sat beside this was the third way out of the
          dialog — there is an X in the corner, and on a phone the whole sheet
          can be pushed down. Delete takes the width instead of hiding in a
          corner: it is the one thing down here, and a destructive action you
          have to hunt for is a destructive action you hit by accident. */}
      <button
        type="button"
        onClick={onDelete}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-500 transition-colors hover:bg-rose-500/15 hover:text-rose-400"
      >
        <Trash2 className="size-4" />
        <span>Delete from collection</span>
      </button>
    </div>
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
