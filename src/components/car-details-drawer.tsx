import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AlertCircle, Car, Flame, Loader2, Star } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { StatusPill } from "@/components/cars-table";
import type { Diecast } from "@/lib/types";
import { inr } from "@/lib/format";
import { useCars } from "@/lib/cars-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { findCarImage } from "@/lib/car-image";

type Ctx = { open: (car: Diecast) => void };
const CarDrawerCtx = createContext<Ctx | null>(null);

export function useCarDrawer() {
  const ctx = useContext(CarDrawerCtx);
  if (!ctx) throw new Error("useCarDrawer must be used inside CarDrawerProvider");
  return ctx;
}

export function CarDrawerProvider({ children }: { children: ReactNode }) {
  const cars = useCars();
  const isMobile = useIsMobile();
  const [request, setRequest] = useState<{ id: string; fallback: Diecast } | null>(null);
  const [car, setCar] = useState<Diecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const open = useCallback((next: Diecast) => {
    setRequest({ id: next.id, fallback: next });
    setCar(null);
    setError("");
    setLoading(true);
  }, []);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      try {
        const latest = cars.find((item) => item.id === request.id) ?? request.fallback;
        if (!latest?.id) throw new Error("Car not found");
        setCar(latest);
      } catch {
        setCar(null);
        setError("We couldn't load this car's details. Close the drawer and try again.");
      } finally {
        setLoading(false);
      }
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cars, request]);

  const close = () => {
    setRequest(null);
    setCar(null);
    setLoading(false);
    setError("");
  };

  const side = isMobile ? "bottom" : "right";
  const sheetClass = isMobile
    ? "h-[92svh] max-h-[92svh] w-full rounded-t-2xl p-0 flex flex-col"
    : "w-full sm:max-w-lg overflow-y-auto";

  return (
    <CarDrawerCtx.Provider value={{ open }}>
      {children}
      <Sheet
        open={!!request}
        onOpenChange={(v) => {
          if (!v) close();
        }}
      >
        <SheetContent side={side} className={sheetClass}>
          {isMobile ? (
            <MobileBody car={car} loading={loading} error={error} onClose={close} />
          ) : (
            <DesktopBody car={car} loading={loading} error={error} />
          )}
        </SheetContent>
      </Sheet>
    </CarDrawerCtx.Provider>
  );
}

function DesktopBody({
  car,
  loading,
  error,
}: {
  car: Diecast | null;
  loading: boolean;
  error: string;
}) {
  return (
    <>
      {car && !loading && !error && (
        <CarImage car={car} className="mb-4 aspect-square w-full rounded-lg" />
      )}
      <SheetHeader className="space-y-2 text-left">
        {!loading && !error && car ? (
          <HeaderContent car={car} />
        ) : (
          <>
            <SheetTitle className="text-display text-2xl">
              {error ? "Details unavailable" : "Loading car details"}
            </SheetTitle>
            <SheetDescription>
              {error
                ? "The selected car could not be loaded."
                : "Fetching the latest saved fields."}
            </SheetDescription>
          </>
        )}
      </SheetHeader>
      {loading && <DrawerSkeleton />}
      {!loading && error && <DrawerError message={error} />}
      {!loading && !error && car && <CarDetails car={car} />}
    </>
  );
}

function MobileBody({
  car,
  loading,
  error,
  onClose,
}: {
  car: Diecast | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  const startY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    startY.current = e.clientY;
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (startY.current == null) return;
    const dy = e.clientY - startY.current;
    setDragY(Math.max(0, dy));
  };
  const onPointerUp = () => {
    if (dragY > 100) {
      onClose();
    }
    startY.current = null;
    setDragging(false);
    setDragY(0);
  };

  return (
    <div
      className="flex h-full flex-col"
      style={{
        transform: dragY ? `translateY(${dragY}px)` : undefined,
        transition: dragging ? "none" : "transform 200ms ease-out",
      }}
    >
      <div
        className="flex cursor-grab touch-none justify-center py-2 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label="Drag to close"
      >
        <div className="h-1.5 w-12 rounded-full bg-muted-foreground/40" />
      </div>
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {car && !loading && !error && (
          <CarImage car={car} className="mb-4 aspect-square w-full rounded-xl" />
        )}
        <SheetHeader className="space-y-2 text-left">
          {!loading && !error && car ? (
            <HeaderContent car={car} />
          ) : (
            <>
              <SheetTitle className="text-display text-2xl">
                {error ? "Details unavailable" : "Loading car details"}
              </SheetTitle>
              <SheetDescription>
                {error
                  ? "The selected car could not be loaded."
                  : "Fetching the latest saved fields."}
              </SheetDescription>
            </>
          )}
        </SheetHeader>
        {loading && <DrawerSkeleton />}
        {!loading && error && <DrawerError message={error} />}
        {!loading && !error && car && <CarDetails car={car} />}
      </div>
    </div>
  );
}

function HeaderContent({ car }: { car: Diecast }) {
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <StatusPill status={car.status || "Unknown"} />
        {car.chase && (
          <span className="inline-flex items-center gap-1 rounded-sm bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-500 dark:text-rose-400">
            <Flame className="size-3" /> CHASE
          </span>
        )}
        {car.favourite && (
          <span className="inline-flex items-center gap-1 rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500">
            <Star className="size-3 fill-amber-400 stroke-amber-500" /> Favourite
          </span>
        )}
      </div>
      <SheetTitle className="text-display text-2xl">{car.name || "Unnamed car"}</SheetTitle>
      <SheetDescription>
        {[car.brand, car.series, car.subSeries].filter(Boolean).join(" · ") ||
          "Brand detail not recorded"}
      </SheetDescription>
    </>
  );
}

function CarImage({ car, className = "" }: { car: Diecast; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "fail">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setSrc(null);
    findCarImage(car, car.brand || "", car.make || "")
      .then((url) => {
        if (cancelled) return;
        if (url) {
          setSrc(url);
          setState("ok");
        } else {
          setState("fail");
        }
      })
      .catch(() => !cancelled && setState("fail"));
    return () => {
      cancelled = true;
    };
  }, [car.id, car.model, car.variant, car.colour, car.brand, car.make]);

  return (
    <div className={`relative overflow-hidden bg-muted ${className}`}>
      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {state === "ok" && src && (
        <img
          src={src}
          alt={`${car.make || car.brand || "Diecast"} ${car.name || ""}`.trim()}
          className="h-full w-full object-contain"
          onError={() => setState("fail")}
        />
      )}
      {state === "fail" && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
          <Car className="size-8" />
          <span className="text-xs">No image found</span>
        </div>
      )}
    </div>
  );
}

function CarDetails({ car }: { car: Diecast }) {
  return (
    <>
      <Section title="Car">
        <Field label="Make" value={car.make} placeholder="Make not recorded" />
        <Field label="Model" value={car.model} placeholder="Model not recorded" />
        <Field label="Variant" value={car.variant} placeholder="Variant not recorded" />
        <Field label="Year" value={car.year} placeholder="Year not recorded" />
        <Field label="Car number" value={car.carNumber} placeholder="Car number not recorded" />
        <Field label="Colour" value={car.colour} placeholder="Colour not recorded" />
        <Field label="Type" value={car.type} placeholder="Type not recorded" />
        <Field label="Size" value={car.size} placeholder="Size not recorded" />
      </Section>

      <Section title="Brand">
        <Field label="Brand" value={car.brand} placeholder="Brand not recorded" />
        <Field label="Assortment" value={car.assortment} placeholder="Assortment not recorded" />
        <Field label="Series" value={car.series} placeholder="Series not recorded" />
        <Field label="Sub series" value={car.subSeries} placeholder="Sub series not recorded" />
        <Field label="Official" value={car.official ? "Yes" : "No"} />
        <Field label="Open" value={car.open ? "Yes" : "No"} />
      </Section>

      <Section title="Purchase">
        <Field label="Seller" value={car.seller} placeholder="Seller not recorded" />
        <Field
          label="Spent"
          value={car.spent ? inr(car.spent) : ""}
          placeholder="Cost not recorded"
        />
        <Field label="Order date" value={car.orderDate} placeholder="Order date not recorded" />
        <Field label="Order month" value={car.orderMonth} placeholder="Order month not recorded" />
        <Field
          label="Expected date"
          value={car.expectedDate || car.date}
          placeholder="Expected date not recorded"
        />
        <Field label="Date added" value={car.date} placeholder="Date not recorded" />
        <Field label="Month" value={car.month} placeholder="Month not recorded" />
      </Section>

      <Section title="Transit">
        <Field label="Status" value={car.status} placeholder="Status not recorded" />
        <Field
          label="Transit info"
          value={car.transitInfo}
          placeholder="Transit info not recorded"
        />
      </Section>

      <Section title="Meta">
        <Field label="Car ID" value={car.id} placeholder="ID not recorded" />
      </Section>
    </>
  );
}

function DrawerSkeleton() {
  return (
    <div className="mt-6 space-y-6" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading car details…
      </div>
      <div className="space-y-3">
        <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
      </div>
      {[0, 1, 2, 3].map((section) => (
        <div key={section} className="space-y-2">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((field) => (
              <div key={field} className="space-y-1.5">
                <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DrawerError({ message }: { message: string }) {
  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-medium">Details unavailable</div>
            <p className="mt-1 text-destructive/80">{message}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="text-display text-xs uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">{children}</dl>
    </div>
  );
}

function Field({
  label,
  value,
  placeholder = "Not recorded",
}: {
  label: string;
  value?: string | number | null;
  placeholder?: string;
}) {
  const missing = value == null || value === "";
  const v = missing ? placeholder : String(value);
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`truncate font-medium ${missing ? "text-muted-foreground" : ""}`} title={v}>
        {v}
      </dd>
    </div>
  );
}
