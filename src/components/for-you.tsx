import { useEffect, useMemo, useRef, useState } from "react";
import { WishlistHeart } from "@/components/wishlist-heart";
import { useQuickAdd } from "@/components/use-quick-add";
import { ChevronLeft, ChevronRight, Plus, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import { CarThumb } from "@/components/car-thumb";

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

/** How many castings the row holds. */
const SET = 10;

type Pick = { car: CatalogCar; reason: string };

/**
 * The picks as a row of cards the width of a blister-view tile, as many across as that grid
 * has columns, so the first few are in view on a wide screen and the arrows at the bottom right move
 * along it on a smaller one.
 */
function ForYouCarousel({
  picks,
  onOpen,
  onDismiss,
  onLike,
  onWished,
  onAdd,
}: {
  picks: Pick[];
  onOpen: (car: CatalogCar) => void;
  onDismiss: (id: string) => void;
  onLike: (id: string) => void;
  onWished: (id: string) => void;
  onAdd: (car: CatalogCar) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const n = picks.length;
  // Where the row is, in whole cards and fractions.
  const [pos, setPos] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  const raf = useRef(0);

  /** Pixels from one card to the next. */
  const step = () => {
    const el = track.current;
    const a = el?.children[0] as HTMLElement | undefined;
    const b = el?.children[1] as HTMLElement | undefined;
    return a && b ? b.offsetLeft - a.offsetLeft : (a?.offsetWidth ?? 1);
  };
  /** Stop a spring in flight and give the browser's own snapping back. */
  const settle = () => {
    cancelAnimationFrame(raf.current);
    if (track.current) track.current.style.scrollSnapType = "";
  };
  /** Glide to card `i` on a spring: it overshoots a little and settles, instead of easing flat. */
  const goTo = (i: number) => {
    const el = track.current;
    if (!el) return;
    settle();
    const target = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, i * step()));
    // Snapping would fight the spring; it is handed back when the card has settled.
    el.style.scrollSnapType = "none";
    let x = el.scrollLeft;
    let v = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      v += (-170 * (x - target) - 17 * v) * dt;
      x += v * dt;
      el.scrollLeft = x;
      if (Math.abs(x - target) < 0.5 && Math.abs(v) < 6) {
        el.scrollLeft = target;
        el.style.scrollSnapType = "";
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    setPos(el.scrollLeft / step());
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 2);
  };
  // Whether there is anywhere to go: with every card in view, the arrows have nothing to do.
  const [fits, setFits] = useState(true);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const read = () => setFits(el.scrollWidth <= el.clientWidth + 2);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n]);

  if (!n) return null;
  const btn =
    "grid cursor-pointer place-items-center rounded-full transition-transform active:scale-95";
  const atStart = pos < 0.05;
  return (
    <div className="min-w-0 [container-type:inline-size] [--sw:calc((100cqw_-_1.25rem)/2.4)] sm:[--sw:calc((100cqw_-_2.25rem)/3.4)] lg:[--sw:calc((100cqw_-_3rem)/4.4)] xl:[--sw:calc((100cqw_-_3.75rem)/5.4)]">
      <div
        ref={track}
        onScroll={onScroll}
        // A finger or wheel takes over from a spring still running.
        onPointerDown={settle}
        onWheel={settle}
        className="no-scrollbar -mx-3 -my-8 flex snap-x snap-mandatory items-stretch gap-2.5 overflow-x-auto scroll-pl-3 px-3 py-10 sm:gap-3"
        style={{ overscrollBehaviorX: "contain" }}
      >
        {picks.map((p) => {
          const c = catalogCarToDiecast(p.car);
          return (
            <article
              key={p.car.car_id}
              className="flex w-[var(--sw)] shrink-0 snap-start snap-always flex-col"
            >
              {/* The picture fills its tile, as in the blister view. */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => onOpen(p.car)}
                  className="relative block aspect-[534/658] w-full shrink-0 cursor-pointer overflow-hidden rounded-2xl"
                  aria-label={`Open ${c.name}`}
                >
                  <CarThumb car={c} className="absolute inset-0 size-full" />
                </button>
                <div className="absolute right-2 top-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onDismiss(p.car.car_id)}
                    aria-label="Not interested"
                    title="Not interested: don't suggest this again"
                    className={`${btn} size-8 border border-white/40 bg-black/35 text-white shadow-sm backdrop-blur-md backdrop-saturate-150 hover:bg-black/50`}
                  >
                    <ThumbsDown className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onLike(p.car.car_id)}
                    aria-label="Show more like this"
                    title="Show more cars like this"
                    className={`${btn} size-8 border border-white/40 bg-black/35 text-white shadow-sm backdrop-blur-md backdrop-saturate-150 hover:bg-black/50`}
                  >
                    <ThumbsUp className="size-4" />
                  </button>
                </div>
              </div>
              <div className="flex flex-1 flex-col items-start gap-1 px-1 pt-3 text-left">
                <h3 className="line-clamp-2 min-h-[2.5em] text-sm font-semibold leading-tight">
                  {c.name || `${c.make} ${c.model}`.trim() || "Unnamed car"}
                </h3>
                <p className="line-clamp-1 text-[11px] font-medium">
                  {[c.brand, c.carNumber, c.assortment].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="line-clamp-2 min-h-[2.4em] text-[10px] leading-snug text-muted-foreground">
                  {p.reason}
                </p>
                <div className="mt-auto flex flex-col items-start gap-2 pt-1.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onAdd(p.car)}
                      aria-label="Add to my collection"
                      title="Add to my collection"
                      className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-transform hover:brightness-110 active:scale-95"
                    >
                      <Plus className="size-3.5" />
                      Add
                    </button>
                    <WishlistHeart
                      entry={p.car}
                      onAdded={() => onWished(p.car.car_id)}
                      className={`${btn} size-8 border border-white/50 bg-white/25 text-foreground backdrop-blur-md hover:bg-white/35`}
                    />
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {/* Left and right, bottom right; they go when every card is already in view. */}
      {!fits && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => goTo(Math.max(0, Math.round(pos) - 1))}
            disabled={atStart}
            aria-label="Previous"
            className={`${btn} glass-btn size-9 text-foreground disabled:cursor-default disabled:opacity-40`}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => goTo(Math.min(n - 1, Math.round(pos) + 1))}
            disabled={atEnd}
            aria-label="Next"
            className={`${btn} glass-btn size-9 text-foreground disabled:cursor-default disabled:opacity-40`}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/** The castings this person said no (or yes please) to, kept on this device. */
function useDismissed(uid?: string, kind: "dismissed" | "liked" = "dismissed") {
  const key = `viiv.forYou.${kind}.${uid ?? "guest"}`;
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      setIds(JSON.parse(localStorage.getItem(key) || "[]"));
    } catch {
      setIds([]);
    }
    setReady(true);
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
  return { ids, dismiss, ready };
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
  const { isGuest, isAdmin, user } = useAuth();
  const { ids: dismissed, dismiss, ready } = useDismissed(user?.id);
  // What the ranking has learned from thumbs-down is taken when the section opens and on each
  // refresh, not on every tap: a dismissed card just leaves and the next one comes in, rather
  // than the whole set being dealt again.
  const [learned, setLearned] = useState<string[] | null>(null);
  useEffect(() => {
    if (ready && learned === null) setLearned(dismissed);
  }, [ready, learned, dismissed]);
  const { ids: liked, dismiss: like } = useDismissed(user?.id, "liked");
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
    const taught = new Set(learned ?? dismissed);
    const disliked = catalog.filter((c) => taught.has(c.car_id));
    const wanted = catalog.filter((c) => yes.has(c.car_id));
    // A casting already answered, either way, is not asked about again.
    return forYou(cars, catalog, 48, popular, disliked, wanted).filter(
      (s) => !no.has(s.car.car_id) && !yes.has(s.car.car_id),
    );
  }, [cars, catalog, popular, dismissed, liked, learned]);
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
  const fanProps = {
    picks,
    onOpen: setViewing,
    onDismiss: dismiss,
    onLike: (id: string) => {
      // More like this: its traits count for you, and the set is dealt again.
      like(id);
      setSeed(Math.floor(Math.random() * 2 ** 31) + 1);
      setLearned(dismissed);
    },
    // The heart plays out, rests a second, then the car gives way to the next one.
    onWished: (id: string) => window.setTimeout(() => like(id), 1000),
    onAdd: (car: CatalogCar) => quickAdd.start(car),
  };
  return (
    <>
      <section
        aria-label="For You"
        className={framed ? "card-elevated space-y-2 p-3 [--frame-gap:0.75rem]" : "space-y-2"}
      >
        <div className="min-w-0 space-y-0.5 px-1">
          <div className="flex items-center gap-2">
            {!hideHeading && (
              <h2 className="text-display text-lg font-semibold">Suggested for you</h2>
            )}
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-8 shrink-0"
              aria-label="Refresh suggestions"
              title="Refresh"
              onClick={() => {
                setSeed(Math.floor(Math.random() * 2 ** 31) + 1);
                setLearned(dismissed);
              }}
            >
              <RefreshCw className="size-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {!hideHeading && "Picked from the cars you own and what you like · "}
            {stats.count
              ? `Based on the last ${stats.days} days · ${stats.count} car${stats.count === 1 ? "" : "s"} · ${
                  stats.perWeek >= 1
                    ? `about ${Math.round(stats.perWeek)} a week`
                    : `about ${Math.max(1, Math.round(stats.perMonth))} a month`
                }`
              : `Nothing bought in the last ${stats.days} days · picked from what you own`}
          </p>
        </div>
        <ForYouCarousel {...fanProps} />
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
