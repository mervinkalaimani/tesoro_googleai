import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Car,
  Check,
  Copy,
  FileSpreadsheet,
  LayoutGrid,
  PackageCheck,
  ScanLine,
  Truck,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-store";
import type { CatalogCar } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-store";
import { cn } from "@/lib/utils";

/*
 * Whether the tour has been dealt with, for this load. The plans dialog waits
 * on it: two dialogs at once on somebody's first minute is one too many.
 */
let settled = false;
const listeners = new Set<() => void>();
function settle() {
  settled = true;
  listeners.forEach((l) => l());
}
export function useTourSettled(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => settled,
    () => false,
  );
}

const keyFor = (who: string | number) => `dg.tour.${who}`;

/** A real photo from the catalogue, or a quiet tile when there is none yet. */
function Photo({ car, className }: { car?: CatalogCar; className?: string }) {
  return (
    <div
      className={cn(
        "grid place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-muted to-muted/40",
        className,
      )}
    >
      {car?.image_url ? (
        <img src={car.image_url} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <Car className="size-6 text-muted-foreground/60" />
      )}
    </div>
  );
}

function ScanPicture({ car }: { car?: CatalogCar }) {
  return (
    <div className="relative flex items-center gap-4">
      <div className="relative h-44 w-36 rounded-2xl border-4 border-foreground/80 bg-background p-2 shadow-xl">
        <Photo car={car} className="size-full" />
        {/* Viewfinder corners and the line that reads the card. */}
        {[
          "left-1 top-1 border-l-2 border-t-2",
          "right-1 top-1 border-r-2 border-t-2",
          "bottom-1 left-1 border-b-2 border-l-2",
          "bottom-1 right-1 border-b-2 border-r-2",
        ].map((pos) => (
          <span key={pos} className={cn("absolute size-5 rounded-sm border-primary", pos)} />
        ))}
        <span className="tour-scan absolute inset-x-2 top-1/2 h-0.5 rounded-full bg-primary shadow-[0_0_12px_2px] shadow-primary/60" />
      </div>
      <div className="space-y-1.5">
        {[car?.make || "Porsche", car?.brand || "Hot Wheels", car?.series || "HW Exotics"].map(
          (v, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[11px] font-medium shadow-md"
            >
              <Check className="size-3 text-emerald-500" />
              <span className="max-w-28 truncate">{v}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function ImportPicture({ cars }: { cars: CatalogCar[] }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 overflow-hidden rounded-xl border border-emerald-600/40 bg-card shadow-xl">
        <div className="flex items-center gap-1.5 bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white">
          <FileSpreadsheet className="size-3" />
          my-collection.csv
        </div>
        {cars.slice(0, 5).map((c, i) => (
          <div key={i} className="flex border-t border-border text-[9px]">
            <span className="w-5 shrink-0 border-r border-border bg-muted/50 text-center text-muted-foreground">
              {i + 1}
            </span>
            <span className="truncate px-1.5 py-1">{c.name || `${c.make} ${c.model}`}</span>
          </div>
        ))}
      </div>
      <ArrowRight className="size-5 shrink-0 text-primary" />
      <div className="grid grid-cols-2 gap-1.5">
        {cars.slice(0, 4).map((c, i) => (
          <Photo key={i} car={c} className="size-14 shadow-md" />
        ))}
      </div>
    </div>
  );
}

function ShipmentPicture({ car }: { car?: CatalogCar }) {
  const stops = ["Ordered", "Shipped", "On the way", "Delivered"];
  return (
    <div className="w-full max-w-xs space-y-4">
      <div className="flex items-center gap-3 rounded-xl bg-card p-2.5 shadow-xl">
        <Photo car={car} className="size-12 shrink-0" />
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold">
            {car?.name || "'71 Datsun 510 Wagon"}
          </div>
          <div className="text-[10px] text-muted-foreground">Arriving in 2 days</div>
        </div>
      </div>
      <div className="relative px-1">
        <div className="absolute inset-x-3 top-3 h-1 rounded-full bg-muted" />
        <div className="absolute left-3 top-3 h-1 w-2/3 rounded-full bg-primary" />
        <div className="tour-drive absolute top-0 left-[66%] -ml-1 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
          <Truck className="size-3.5" />
        </div>
        <div className="relative flex justify-between pt-9">
          {stops.map((s, i) => (
            <span
              key={s}
              className={cn(
                "w-14 text-center text-[10px]",
                i < 3 ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SpendingPicture() {
  // Shape only: no amounts, and nobody's real figures.
  const bars = [38, 62, 45, 80, 55, 92];
  const months = ["May", "Jun", "Jul", "Aug", "Sep", "Oct"];
  return (
    <div className="w-full max-w-xs rounded-xl bg-card p-4 shadow-xl">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold">
        <Wallet className="size-3.5 text-primary" />
        Spent each month
      </div>
      <div className="mt-3 flex h-28 items-end gap-2">
        {bars.map((h, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center gap-1">
            <div className="flex w-full flex-1 items-end">
              <div
                className={cn(
                  "tour-rise w-full rounded-t-md",
                  i === bars.length - 1 ? "bg-primary" : "bg-primary/35",
                )}
                style={{ height: `${h}%`, animationDelay: `${i * 80}ms` }}
              />
            </div>
            <span className="text-[9px] text-muted-foreground">{months[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DuplicatesPicture({ car }: { car?: CatalogCar }) {
  return (
    <div className="relative flex items-center gap-3">
      {[0, 1].map((i) => (
        <div
          key={i}
          className={cn(
            "w-28 rounded-xl bg-card p-1.5 shadow-xl",
            i === 0 ? "-rotate-6" : "rotate-6",
          )}
        >
          <Photo car={car} className="aspect-[534/658] w-full" />
          <div className="truncate px-0.5 pt-1 text-[10px] font-medium">
            {car?.name || "Nissan Skyline GT-R"}
          </div>
        </div>
      ))}
      <span className="absolute left-1/2 top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-amber-500 text-sm font-bold text-white shadow-lg ring-4 ring-background">
        ×2
      </span>
    </div>
  );
}

function CollectionPicture({ cars }: { cars: CatalogCar[] }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {Array.from({ length: 8 }, (_, i) => (
        <Photo key={i} car={cars[i]} className="aspect-[534/658] w-14 shadow-md sm:w-16" />
      ))}
    </div>
  );
}

type Slide = { icon: typeof ScanLine; title: string; text: string; picture: ReactNode };

/**
 * What VIIV does, once, the first time an account opens the app on a device.
 * Six slides, each with a picture built from real catalogue photos rather than
 * stock art: the cars in them are cars people here actually own.
 *
 * Closing it in any way counts as seen. Nothing is lost by skipping it.
 */
export function FeatureTour() {
  const { status, profile, isGuest } = useAuth();
  const { catalog } = useCatalog();
  const who = isGuest ? "guest" : profile?.sno;
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (status !== "ready" || who == null) return;
    try {
      if (localStorage.getItem(keyFor(who))) {
        settle();
        return;
      }
    } catch {
      // Storage refused: show it, and it will show again next load.
    }
    setOpen(true);
  }, [status, who]);

  const close = () => {
    try {
      if (who != null) localStorage.setItem(keyFor(who), new Date().toISOString());
    } catch {
      // Seen for this load, at least.
    }
    setOpen(false);
    settle();
  };

  // Photographed castings only, newest first, so every picture has a car in it.
  const cars = useMemo(
    () =>
      catalog
        .filter((c) => c.image_url)
        .sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""))
        .slice(0, 12),
    [catalog],
  );

  const slides: Slide[] = [
    {
      icon: ScanLine,
      title: "Scan to add a car",
      text: "Point your camera at the card. The make, brand and series are read off it, and the rest fills itself in.",
      picture: <ScanPicture car={cars[0]} />,
    },
    {
      icon: FileSpreadsheet,
      title: "Bring your spreadsheet",
      text: "Already keep your collection in Excel? Save it as CSV and import every car in one go.",
      picture: <ImportPicture cars={cars.slice(1)} />,
    },
    {
      icon: PackageCheck,
      title: "Track every shipment",
      text: "What is on its way, who it is coming from, and when it should land on your doorstep.",
      picture: <ShipmentPicture car={cars[5]} />,
    },
    {
      icon: Wallet,
      title: "Know what you spend",
      text: "Month by month, against MRP, by seller and by brand. Hide it all with one switch when you would rather not see it.",
      picture: <SpendingPicture />,
    },
    {
      icon: Copy,
      title: "Catch duplicates",
      text: "See the castings you already have before you buy the same one again.",
      picture: <DuplicatesPicture car={cars[6]} />,
    },
    {
      icon: LayoutGrid,
      title: "See your collection",
      text: "Every car you own, in a grid, a list, or the shape of the card it came on.",
      picture: <CollectionPicture cars={cars.slice(4)} />,
    },
  ];

  const slide = slides[i];
  const last = i === slides.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="w-full max-w-md gap-0 overflow-hidden p-0">
        <div className="relative grid h-64 place-items-center overflow-hidden bg-gradient-to-br from-primary/25 via-primary/5 to-transparent px-6">
          <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 size-40 rounded-full bg-accent/20 blur-3xl" />
          {/* Keyed so each slide's picture plays its motion from the start. */}
          <div key={i} className="relative flex items-center justify-center">
            {slide.picture}
          </div>
        </div>

        <div className="space-y-2 p-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <slide.icon className="size-3.5" />
            {i + 1} of {slides.length}
          </div>
          <DialogTitle className="text-display text-xl font-semibold tracking-tight">
            {slide.title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {slide.text}
          </DialogDescription>

          <div className="flex items-center gap-1.5 pt-2" role="tablist" aria-label="Slides">
            {slides.map((s, n) => (
              <button
                key={s.title}
                type="button"
                role="tab"
                aria-selected={n === i}
                aria-label={s.title}
                onClick={() => setI(n)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  n === i ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30",
                )}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-3">
            {i > 0 ? (
              <Button variant="ghost" className="gap-2" onClick={() => setI(i - 1)}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
            ) : (
              <Button variant="ghost" onClick={close}>
                Skip
              </Button>
            )}
            <Button className="gap-2" onClick={() => (last ? close() : setI(i + 1))}>
              {last ? "Get started" : "Next"}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
