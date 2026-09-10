import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  Car,
  CheckCircle2,
  ExternalLink,
  Flame,
  Loader2,
  Pencil,
  Star,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Diecast } from "@/lib/types";
import { useCars, useCarsActions } from "@/lib/cars-store";
import { findCarImage } from "@/lib/car-image";
import { deriveMonth } from "@/lib/date-utils";
import { formatDayMonthYear, inrFull } from "@/lib/format";
import { trackingUrlFor } from "@/lib/tracking";
import { Input } from "@/components/ui/input";
import { CarFormDialog } from "@/components/car-form-dialog";
import { ShippingBatchDialog } from "@/components/shipping-batch-dialog";

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
        <DialogContent className="max-w-2xl sm:max-w-2xl border-zinc-800 bg-[#0e121a] text-zinc-100 shadow-2xl rounded-2xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto [&>button]:hidden">
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
              onAdvanceStatus={() => {
                const next = nextStatus(car.status);
                if (!next) return;
                if (next !== "Available") {
                  updateCar({ ...car, status: next });
                  return;
                }
                const today = new Date().toISOString().slice(0, 10);
                const arrDate = car.expectedDate || car.date || today;
                updateCar({
                  ...car,
                  status: "Available",
                  date: arrDate,
                  month: deriveMonth(arrDate) || car.month,
                });
              }}
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
      <DialogContent className="max-w-md border-zinc-800 bg-[#0e121a] text-zinc-100">
        <DialogTitle className="text-lg font-semibold">Delete this car?</DialogTitle>
        <DialogDescription className="text-sm text-zinc-400">
          <span className="font-medium text-zinc-200">
            {car.name || `${car.make} ${car.model}`}
          </span>{" "}
          {/* No longer "cannot be undone": the top bar's undo button puts the
              car back, row and all. That holds until the page is reloaded,
              which is the honest limit to state here. */}
          will be removed from your collection. Undo brings it back, until you reload.
        </DialogDescription>

        <div className="space-y-2">
          <p className="text-sm text-zinc-400">
            Type <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-100">{phrase}</code>{" "}
            to confirm.
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
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
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
  onAdvanceStatus: () => void;
  onDelete: () => void;
}

function CarPopupContent({
  car,
  onClose,
  onEdit,
  onOpenShippingBatch,
  onToggleFavourite,
  onToggleChase,
  onAdvanceStatus,
  onDelete,
}: CarPopupContentProps) {
  const [deliveredAnim, setDeliveredAnim] = useState(false);

  const spent = Math.round(car.spent ?? 0);
  const mrp = Math.round(car.mrp ?? 0);
  const delta = mrp - spent;
  const advanceTo = nextStatus(car.status);

  const handleMarkDeliveredClick = () => {
    if (!advanceTo) return;
    onAdvanceStatus();
    // Only flash the delivered confirmation when that is what just happened.
    if (advanceTo === "Available") {
      setDeliveredAnim(true);
      setTimeout(() => setDeliveredAnim(false), 2000);
    }
  };

  const getStatusColor = (st: string) => {
    const s = (st || "").toLowerCase();
    if (s.includes("transit")) return "text-rose-400";
    if (s.includes("available")) return "text-emerald-400";
    if (s.includes("pre order")) return "text-amber-400";
    if (s.includes("wait")) return "text-cyan-400";
    if (s.includes("hold")) return "text-purple-400";
    if (s.includes("iso")) return "text-blue-400";
    return "text-white";
  };

  const cleanTransitNotes = (car.transitInfo || "").trim();
  const trackUrl = trackingUrlFor(car.deliveryPartner, car.trackingId);

  return (
    <div className="space-y-4">
      {/* Hidden Accessible Dialog Title & Description */}
      <DialogTitle className="sr-only">
        {car.name || `${car.make} ${car.model}`} Details
      </DialogTitle>
      <DialogDescription className="sr-only">
        Diecast car specifications, status, logistics, and pricing details.
      </DialogDescription>

      {/* TOP HEADER ROW: ID Badge on left, Star + Edit + Close on right */}
      <div className="flex items-center justify-between">
        <div className="rounded-md border border-zinc-700/60 bg-zinc-800/40 px-2.5 py-1 font-mono text-xs font-medium tracking-wider text-zinc-300">
          {car.id}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Chase toggle, sits left of the favourite star */}
          <button
            type="button"
            onClick={onToggleChase}
            title={car.chase ? "Unmark as chase" : "Mark as chase"}
            aria-pressed={car.chase}
            className="flex size-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 transition-colors hover:bg-zinc-800 cursor-pointer"
          >
            <Flame
              className={`size-4 ${
                car.chase ? "fill-orange-400 text-orange-400" : "text-zinc-400 hover:text-white"
              }`}
            />
          </button>

          {/* Favorite Star Button */}
          <button
            type="button"
            onClick={onToggleFavourite}
            title={car.favourite ? "Remove from favourites" : "Add to favourites"}
            className="flex size-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <Star
              className={`size-4 ${
                car.favourite ? "fill-amber-400 text-amber-400" : "text-zinc-400 hover:text-white"
              }`}
            />
          </button>

          {/* Edit Pencil Button */}
          <button
            type="button"
            onClick={onEdit}
            title="Edit car details"
            className="flex size-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
          >
            <Pencil className="size-4" />
          </button>

          {/* Close X Button */}
          <button
            type="button"
            onClick={onClose}
            title="Close popup"
            className="flex size-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* HERO IMAGE: Landscape with Brand and Size badges overlaid at bottom-left */}
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-zinc-900/80 border border-zinc-800/80 shadow-inner">
        <HeroCarImage car={car} />

        {/* Scale badge only — brand now reads in the subtitle below. */}
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2">
          <span className="rounded-md bg-black/85 backdrop-blur-md px-2 py-1 text-xs font-mono font-medium text-zinc-300 tracking-tight shadow-md border border-white/10">
            {car.size || "1:64"}
          </span>
        </div>
      </div>

      {/* CAR TITLE & SUBTITLE */}
      <div className="pt-1">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          {car.name || `${car.make} ${car.model} ${car.variant || ""}`.trim() || "Unnamed car"}
        </h2>
        {/* Make and model are already in the title, so the subtitle carries the
            collection context instead. */}
        <p className="mt-1 text-sm font-normal text-zinc-400">
          {[car.brand, car.series, car.subSeries].filter(Boolean).join(" • ") || "—"}
        </p>
      </div>

      {/* 3-COLUMN FINANCIALS CARD: PURCHASE SPENT | RETAIL / MRP | GAIN / DELTA */}
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-zinc-800/90 bg-zinc-900/50 p-4">
        <div>
          <span className="text-[10px] sm:text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
            PURCHASE SPENT
          </span>
          <span className="mt-1 block text-xl sm:text-2xl font-bold text-white">
            {inrFull(spent)}
          </span>
        </div>

        <div>
          <span className="text-[10px] sm:text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
            RETAIL / MRP
          </span>
          <span className="mt-1 block text-xl sm:text-2xl font-bold text-white">
            {inrFull(mrp)}
          </span>
        </div>

        <div>
          <span className="text-[10px] sm:text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
            GAIN / DELTA
          </span>
          {delta >= 0 ? (
            <span className="mt-1 block text-xl sm:text-2xl font-bold text-[#00E599]">
              +{inrFull(delta)}
            </span>
          ) : (
            <span className="mt-1 block text-xl sm:text-2xl font-bold text-rose-400">
              -{inrFull(Math.abs(delta))}
            </span>
          )}
        </div>
      </div>

      {/* 3-COLUMN SPECIFICATIONS GRID */}
      <div className="grid grid-cols-3 gap-x-3 gap-y-4 text-sm pt-1">
        <div>
          <span className="text-xs text-zinc-400">Series</span>
          <span className="mt-0.5 block font-semibold text-white truncate">
            {car.series || "Showroom"}
          </span>
        </div>

        <div>
          <span className="text-xs text-zinc-400">Assortment</span>
          <span className="mt-0.5 block font-semibold text-white truncate">
            {car.assortment || "Premium"}
          </span>
        </div>

        <div>
          <span className="text-xs text-zinc-400">Vehicle Type</span>
          <span className="mt-0.5 block font-semibold text-white truncate">
            {car.type || "SUV"}
          </span>
        </div>

        <div>
          <span className="text-xs text-zinc-400">Colour / Livery</span>
          <span className="mt-0.5 block font-semibold text-white truncate">
            {car.colour || "—"}
          </span>
        </div>

        <div>
          <span className="text-xs text-zinc-400">Current Status</span>
          <span className={`mt-0.5 block font-semibold truncate ${getStatusColor(car.status)}`}>
            {car.status || "—"}
          </span>
        </div>
      </div>

      {/* SHIPPING & TRANSIT TRACKING CARD */}
      <div className="rounded-xl border border-amber-500/35 bg-[#17140e] p-4 space-y-3">
        {/* Card Header with Truck Icon and Mark Delivered Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="size-4 text-amber-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
              SHIPPING & TRANSIT TRACKING
            </span>
          </div>

          {/* Advances one stage at a time: ISO → Pre Order → Waiting → Transit
              → Out for Delivery → Delivered. */}
          <button
            type="button"
            onClick={handleMarkDeliveredClick}
            disabled={!advanceTo}
            title={
              advanceTo
                ? `Move from ${car.status || "unknown"} to ${advanceTo}`
                : "Already delivered"
            }
            className={`flex items-center gap-1.5 rounded-lg text-xs font-semibold px-3 py-1.5 transition-colors shadow-sm cursor-pointer ${
              !advanceTo
                ? "bg-emerald-600/80 text-white cursor-default"
                : "bg-[#00c57d] hover:bg-[#00b070] text-white"
            }`}
          >
            <CheckCircle2 className="size-3.5" />
            <span>
              {deliveredAnim || !advanceTo
                ? "Delivered ✓"
                : advanceTo === "Available"
                  ? "Mark Delivered"
                  : `Mark ${advanceTo}`}
            </span>
          </button>
        </div>

        {/* 4-column Details: Seller | Shipping ID | Order Date | Expected Date */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
          <div>
            <span className="text-zinc-400">Seller:</span>
            <span className="mt-0.5 block font-medium text-white truncate">
              {car.seller || "—"}
            </span>
          </div>

          <div>
            <span className="text-zinc-400">Shipping ID:</span>
            <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span className="font-mono font-medium text-white">{car.shippingId || "—"}</span>
              {car.shippingId && (
                <button
                  type="button"
                  onClick={() => onOpenShippingBatch(car.shippingId)}
                  className="text-[10px] text-amber-400 hover:underline cursor-pointer"
                  title={`Update all cars in batch ${car.shippingId}`}
                >
                  (Batch)
                </button>
              )}
            </div>
          </div>

          <div>
            <span className="text-zinc-400">Order Date:</span>
            <span className="mt-0.5 block font-medium text-white truncate">
              {car.orderDate || "—"}
            </span>
          </div>

          <div>
            <span className="text-zinc-400">Expected Date:</span>
            <span className="mt-0.5 block font-medium text-white truncate">
              {formatDayMonthYear(car.expectedDate || car.date) || "—"}
            </span>
          </div>

          <div>
            <span className="text-zinc-400">Delivery Partner:</span>
            <span className="mt-0.5 block font-medium text-white truncate">
              {car.deliveryPartner || "—"}
            </span>
          </div>

          <div>
            <span className="text-zinc-400">Tracking ID:</span>
            <span className="mt-0.5 block truncate font-mono font-medium text-white">
              {car.trackingId || "—"}
            </span>
          </div>
        </div>

        {/* The consignment number is only useful if it goes somewhere. */}
        {trackUrl && (
          <a
            href={trackUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-400 hover:bg-sky-500/15"
          >
            <span className="truncate">Track on {(car.deliveryPartner || "").trim()}</span>
            <ExternalLink className="size-3.5 shrink-0" />
          </a>
        )}

        {/* Tracking Notes Footer */}
        <div className="border-t border-amber-500/20 pt-2 text-xs text-zinc-300">
          Tracking Notes:{" "}
          <span className="text-zinc-400 font-mono">
            {cleanTransitNotes
              ? cleanTransitNotes.startsWith("[")
                ? cleanTransitNotes
                : `[${cleanTransitNotes}]`
              : "[No tracking notes recorded]"}
          </span>
        </div>
      </div>

      {/* BOTTOM ACTIONS FOOTER: Delete on left, Close on right */}
      <div className="flex items-center justify-between border-t border-zinc-800/80 pt-4">
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-rose-500 hover:text-rose-400 transition-colors cursor-pointer"
        >
          <Trash2 className="size-4" />
          <span>Delete from collection</span>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-zinc-800 hover:bg-zinc-700 px-5 py-2 text-sm font-medium text-white transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>
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
    <div className="relative h-full w-full flex items-center justify-center bg-zinc-950/60">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/40">
          <Loader2 className="size-6 animate-spin text-zinc-500" />
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
        <div className="flex flex-col items-center justify-center gap-1 text-zinc-600">
          <Car className="size-10" />
          <span className="text-xs">No image available</span>
        </div>
      ) : null}
    </div>
  );
}
