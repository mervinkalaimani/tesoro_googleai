import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

import { BlisterTile, CarOverlay } from "@/components/blister-tile";
import { BLISTER_GRID_COLS } from "@/components/view-toggle";
import { CarFormDialog } from "@/components/car-form-dialog";
import { CatalogCarDetails } from "@/components/car-details-drawer";
import { useCars } from "@/lib/cars-store";
import { catalogCarToCatalogueCar, catalogCarToDiecast, type CatalogCar } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-store";
import { forYou, reshuffle } from "@/lib/for-you";
import { Button } from "@/components/ui/button";

/**
 * One row of the same tiles the blister view lays out, so a set is as many castings as
 * that grid has columns at this width (2, 3, 4 or 5, on the same breakpoints).
 */
function useColumns() {
  const [n, setN] = useState(5);
  useEffect(() => {
    const read = () => {
      const w = window.innerWidth;
      setN(w >= 1280 ? 5 : w >= 1024 ? 4 : w >= 640 ? 3 : 2);
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return n;
}

/**
 * Castings VIIV thinks you will want, each with the reason it is there. Hidden until
 * there is something to base it on. Opening one shows the casting and offers to add it.
 */
export function ForYou() {
  const cars = useCars();
  const { catalog } = useCatalog();
  const SET = useColumns();
  const pool = useMemo(() => forYou(cars, catalog), [cars, catalog]);
  // A set at a time: Next and Back step through the ranking, Refresh reshuffles it.
  const [seed, setSeed] = useState(0);
  const [page, setPage] = useState(0);
  const ordered = useMemo(() => reshuffle(pool, seed), [pool, seed]);
  const pages = Math.max(1, Math.ceil(ordered.length / SET));
  const picks = ordered.slice(page * SET, page * SET + SET);
  const [viewing, setViewing] = useState<CatalogCar | null>(null);
  const [adding, setAdding] = useState<{ car: CatalogCar; status: string } | null>(null);

  if (!pool.length) return null;
  return (
    <section aria-label="For You" className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <h2 className="text-display text-lg font-semibold">For You</h2>
          <p className="text-xs text-muted-foreground">
            Picked from the cars you own and what you like
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8"
            aria-label="Previous set"
            title="Back"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8"
            aria-label="Next set"
            title="Next"
            onClick={() => setPage((p) => (p + 1) % pages)}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8"
            aria-label="Refresh suggestions"
            title="Refresh"
            onClick={() => {
              setSeed(Math.floor(Math.random() * 2 ** 31) + 1);
              setPage(0);
            }}
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>
      <div className={BLISTER_GRID_COLS}>
        {picks.map(({ car, reason }) => (
          <BlisterTile
            key={car.car_id}
            car={catalogCarToDiecast(car)}
            onOpen={() => setViewing(car)}
            showStatus={false}
            foot={false}
            overlay={
              <CarOverlay car={catalogCarToDiecast(car)} brandOnly noAssortment detail={reason} />
            }
          />
        ))}
      </div>

      <CatalogCarDetails
        car={viewing ? catalogCarToDiecast(viewing) : null}
        catalogCar={viewing ?? undefined}
        preOrder={viewing?.release_status === "Pre Order"}
        owned={false}
        onClose={() => setViewing(null)}
        onAdd={(pick) => {
          const car = pick ?? viewing;
          if (car)
            setAdding({ car, status: car.release_status === "Pre Order" ? "PO" : "In Hand" });
          setViewing(null);
        }}
      />
      <CarFormDialog
        open={adding !== null}
        onOpenChange={(v) => !v && setAdding(null)}
        mode="add"
        prefill={adding ? catalogCarToCatalogueCar(adding.car) : null}
        prefillStatus={adding?.status ?? ""}
        draftScope="for-you"
      />
    </section>
  );
}
