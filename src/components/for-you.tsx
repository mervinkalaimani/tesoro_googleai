import { useEffect, useMemo, useState } from "react";
import { HeartBurst } from "@/components/wishlist-heart";
import { useQuickAdd } from "@/components/use-quick-add";
import { useAddToIso } from "@/lib/quick-iso";
import { Heart, Plus, RefreshCw, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";

import { BlisterTile, CarOverlay } from "@/components/blister-tile";
import { BLISTER_GRID_COLS } from "@/components/view-toggle";
import { CarFormDialog } from "@/components/car-form-dialog";
import { CatalogFormDialog } from "@/components/catalog-form-dialog";
import { CatalogCarDetails } from "@/components/car-details-drawer";
import { useAuth } from "@/lib/auth-store";
import { useCars } from "@/lib/cars-store";
import { useRecentPreorders } from "@/lib/catalogue-search";
import { catalogCarToCatalogueCar, catalogCarToDiecast, type CatalogCar } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-store";
import { castingKey, forYou, MAX_WINDOW_DAYS, purchaseStats, reshuffle } from "@/lib/for-you";
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
 * Glass heart: tapped, it fills red and pops, and only then puts the car on the ISO list,
 * which takes the card off the shelf, so the pop has time to be seen.
 */
function HeartButton({ onAdd }: { onAdd: () => void }) {
  const [popped, setPopped] = useState(false);
  return (
    <button
      type="button"
      disabled={popped}
      onClick={() => {
        setPopped(true);
        window.setTimeout(onAdd, 650);
      }}
      aria-label="Add to my ISO list"
      title="Add to my ISO list"
      className="absolute bottom-14 right-3 grid size-8 cursor-pointer place-items-center rounded-full border border-white/50 bg-white/25 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_4px_12px_rgba(0,0,0,0.25)] backdrop-blur-md transition-colors hover:bg-white/35"
    >
      {popped && <HeartBurst />}
      <Heart
        className={popped ? "size-4 fill-red-500 text-red-500" : "size-4"}
        style={popped ? { animation: "heart-pop 0.6s ease-out" } : undefined}
      />
    </button>
  );
}

/** The castings this person said no (or yes please) to, kept on this device. */
function useDismissed(uid?: string, kind: "dismissed" | "liked" = "dismissed") {
  const key = `viiv.forYou.${kind}.${uid ?? "guest"}`;
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      setIds(JSON.parse(localStorage.getItem(key) || "[]"));
    } catch {
      setIds([]);
    }
  }, [key]);
  const dismiss = (id: string) =>
    setIds((prev) => {
      const next = [...prev, id];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* the pick is still hidden for this visit */
      }
      return next;
    });
  return { ids, dismiss };
}

/**
 * Castings VIIV thinks you will want, each with the reason it is there. Hidden until
 * there is something to base it on. Opening one shows the casting and offers to add it.
 */
export function ForYou({
  onShown,
  hideHeading = false,
  framed = false,
}: {
  onShown?: (ids: string[]) => void;
  /** Leave off the title and the line under it; the paging buttons stay. */
  hideHeading?: boolean;
  /** Sit in a frame of its own, apart from the list it leads. */
  framed?: boolean;
}) {
  const cars = useCars();
  const { catalog, updateCatalogCar } = useCatalog();
  const SET = useColumns();
  const { isGuest, isAdmin, user } = useAuth();
  const { ids: dismissed, dismiss } = useDismissed(user?.id);
  const { ids: liked, dismiss: like } = useDismissed(user?.id, "liked");
  const addToIso = useAddToIso();
  const quickAdd = useQuickAdd();
  // What other collectors bought in the last two months, and how many of them each.
  const { cars: shared } = useRecentPreorders(!isGuest, MAX_WINDOW_DAYS, 50);
  const popular = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shared) if (!s.inMyCollection) m.set(castingKey(s), Math.max(1, s.copies ?? 1));
    return m;
  }, [shared]);
  const pool = useMemo(() => {
    const no = new Set(dismissed);
    const yes = new Set(liked);
    const disliked = catalog.filter((c) => no.has(c.car_id));
    const wanted = catalog.filter((c) => yes.has(c.car_id));
    // A casting already answered, either way, is not asked about again.
    return forYou(cars, catalog, 48, popular, disliked, wanted).filter(
      (s) => !no.has(s.car.car_id) && !yes.has(s.car.car_id),
    );
  }, [cars, catalog, popular, dismissed, liked]);
  // The period behind the picks is chosen for you (never more than two months), and shown.
  const stats = useMemo(() => purchaseStats(cars), [cars]);
  // One set at a time; Refresh reshuffles the ranking and brings up another.
  const [seed, setSeed] = useState(0);
  const ordered = useMemo(() => reshuffle(pool, seed), [pool, seed]);
  const picks = ordered.slice(0, SET);
  const [viewing, setViewing] = useState<CatalogCar | null>(null);
  // An admin corrects the casting from its page, and lands back on it after saving.
  const [editing, setEditing] = useState<CatalogCar | null>(null);
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
      <section
        aria-label="For You"
        className={framed ? "card-elevated space-y-2 p-3 [--frame-gap:0.75rem]" : "space-y-2"}
      >
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
              aria-label="Refresh suggestions"
              title="Refresh"
              onClick={() => {
                setSeed(Math.floor(Math.random() * 2 ** 31) + 1);
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
                    detailClassName="leading-snug [font-size:clamp(9px,4.2cqw,11px)]"
                  />
                }
              />
              {/* Top right: not for me (it never comes back up here), or more like this. */}
              <div className="absolute right-2 top-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => dismiss(car.car_id)}
                  aria-label="Not interested"
                  title="Not interested: don't suggest this again"
                  className="grid size-6 cursor-pointer place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-transform hover:bg-black/75 active:scale-95"
                >
                  <ThumbsDown className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // More like this: its traits count for you, and the set is dealt again.
                    like(car.car_id);
                    setSeed(Math.floor(Math.random() * 2 ** 31) + 1);
                  }}
                  aria-label="Show more like this"
                  title="Show more cars like this"
                  className="grid size-6 cursor-pointer place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-transform hover:bg-black/75 active:scale-95"
                >
                  <ThumbsUp className="size-3.5" />
                </button>
              </div>
              {/* On top of the +: put it on my ISO list. */}
              <HeartButton onAdd={() => addToIso(car)} />
              {/* Add it without opening it: the same form, filled in from the casting. */}
              <button
                type="button"
                onClick={() => quickAdd.start(car)}
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

      {quickAdd.node}
      <CatalogCarDetails
        car={viewing ? catalogCarToDiecast(viewing) : null}
        catalogCar={viewing ?? undefined}
        preOrder={viewing?.release_status === "Pre Order"}
        owned={false}
        onClose={() => setViewing(null)}
        canEdit={isAdmin}
        onEdit={() => {
          setEditing(viewing);
          setViewing(null);
        }}
        onAdd={(pick) => {
          const car = pick ?? viewing;
          if (car)
            setAdding({ car, status: car.release_status === "Pre Order" ? "PO" : "In Hand" });
          setViewing(null);
        }}
      />
      {isAdmin && (
        <CatalogFormDialog
          open={editing !== null}
          entry={editing}
          catalog={catalog}
          onClose={() => setEditing(null)}
          canDelete={false}
          onSave={async (saved) => {
            const ok = await updateCatalogCar(saved);
            if (ok) setViewing(saved);
            return ok;
          }}
        />
      )}
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
