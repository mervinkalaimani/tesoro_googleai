import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Sparkles } from "lucide-react";

import { BlisterTile, CarOverlay } from "@/components/blister-tile";
import { BLISTER_GRID_COLS } from "@/components/view-toggle";
import { CarFormDialog } from "@/components/car-form-dialog";
import { CatalogCarDetails } from "@/components/car-details-drawer";
import { useCars } from "@/lib/cars-store";
import { catalogCarToCatalogueCar, catalogCarToDiecast, type CatalogCar } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-store";
import { forYou, purchaseStats, reshuffle } from "@/lib/for-you";
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
export function ForYou({
  onShown,
  hideHeading = false,
}: {
  onShown?: (ids: string[]) => void;
  /** Leave off the title and the line under it; the paging buttons stay. */
  hideHeading?: boolean;
}) {
  const cars = useCars();
  const { catalog } = useCatalog();
  const SET = useColumns();
  const pool = useMemo(() => forYou(cars, catalog), [cars, catalog]);
  // The period behind the picks is chosen for you (never more than two months), and shown.
  const stats = useMemo(() => purchaseStats(cars), [cars]);
  // A set at a time: Next and Back step through the ranking, Refresh reshuffles it.
  const [seed, setSeed] = useState(0);
  const [page, setPage] = useState(0);
  const ordered = useMemo(() => reshuffle(pool, seed), [pool, seed]);
  const pages = Math.max(1, Math.ceil(ordered.length / SET));
  const picks = ordered.slice(page * SET, page * SET + SET);
  const [viewing, setViewing] = useState<CatalogCar | null>(null);
  const [adding, setAdding] = useState<{ car: CatalogCar; status: string } | null>(null);

  // Tell the page which castings are up here, so its list below can leave them out.
  const shownKey = picks.map((p) => p.car.car_id).join("|");
  useEffect(() => {
    onShown?.(shownKey ? shownKey.split("|") : []);
    return () => onShown?.([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the ids, not the callback
  }, [shownKey]);

  if (!pool.length) return null;
  return (
    <>
      <section aria-label="For You" className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="min-w-0 space-y-1.5">
            {!hideHeading && (
              <div>
                <h2 className="text-display text-lg font-semibold">For You</h2>
                <p className="text-xs text-muted-foreground">
                  Picked from the cars you own and what you like
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {stats.count
                ? `Based on the last ${stats.days} days · ${stats.count} car${stats.count === 1 ? "" : "s"} · ${
                    stats.perWeek >= 1
                      ? `about ${Math.round(stats.perWeek)} a week`
                      : `about ${Math.max(1, Math.round(stats.perMonth))} a month`
                  }`
                : `Nothing bought in the last ${stats.days} days · picked from what you own`}
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
            <div key={car.car_id} className="relative h-full">
              <BlisterTile
                car={catalogCarToDiecast(car)}
                onOpen={() => setViewing(car)}
                showStatus={false}
                badge={
                  <>
                    <Sparkles className="size-3 fill-amber-400 text-amber-400" />
                    Suggested
                  </>
                }
                foot={false}
                overlay={
                  <CarOverlay
                    car={catalogCarToDiecast(car)}
                    brandOnly
                    noAssortment
                    padRight
                    detail={reason}
                  />
                }
              />
              {/* Add it without opening it: the same form, filled in from the casting. */}
              <button
                type="button"
                onClick={() => {
                  setAdding({ car, status: car.release_status === "Pre Order" ? "PO" : "In Hand" });
                }}
                aria-label="Add to my collection"
                title="Add to my collection"
                className="glass-btn-solid absolute bottom-3 right-3 grid size-8 cursor-pointer place-items-center rounded-full bg-primary/90 text-primary-foreground transition-transform hover:bg-primary active:scale-95"
              >
                <Plus className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

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
    </>
  );
}
