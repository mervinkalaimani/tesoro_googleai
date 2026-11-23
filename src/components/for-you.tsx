import { useEffect, useMemo, useRef, useState } from "react";
import { WishlistHeart } from "@/components/wishlist-heart";
import { useQuickAdd } from "@/components/use-quick-add";
import { Plus, RefreshCw, Sparkles, Tag, ThumbsDown, ThumbsUp } from "lucide-react";
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

/** How many castings the carousel holds at a time. */
const SET = 5;

type Pick = { car: CatalogCar; reason: string };

/**
 * The picks as a flat, snapping carousel: the front car centred with its neighbours peeking in at
 * both edges, and a dot for each pick under it. On a wide screen the front car's details and
 * buttons sit on glass to the right; on a phone the reason and buttons sit under the dots.
 */
function ForYouCarousel({
  picks,
  onOpen,
  onDismiss,
  onLike,
  onAdd,
}: {
  picks: Pick[];
  onOpen: (car: CatalogCar) => void;
  onDismiss: (id: string) => void;
  onLike: (id: string) => void;
  onAdd: (car: CatalogCar) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [front, setFront] = useState(0);
  // Where the track is, in whole slides and fractions, so each card can size itself by how far it
  // is from the middle.
  const [pos, setPos] = useState(0);
  const n = picks.length;
  const at = picks[Math.min(front, n - 1)];

  /** Pixels from one slide's centre to the next. */
  const step = () => {
    const el = track.current;
    const a = el?.children[0] as HTMLElement | undefined;
    const b = el?.children[1] as HTMLElement | undefined;
    return a && b ? b.offsetLeft - a.offsetLeft : (a?.offsetWidth ?? 1);
  };
  const goTo = (i: number) => track.current?.scrollTo({ left: i * step(), behavior: "smooth" });
  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const p = el.scrollLeft / step();
    setPos(p);
    setFront(Math.max(0, Math.min(n - 1, Math.round(p))));
  };

  if (!n || !at) return null;
  const btn =
    "grid cursor-pointer place-items-center rounded-full transition-transform active:scale-95";
  return (
    <div className="min-w-0 [container-type:inline-size]">
      <div
        ref={track}
        onScroll={onScroll}
        className="no-scrollbar -mx-3 flex snap-x snap-mandatory items-center gap-3 overflow-x-auto px-[15cqw] py-4 sm:mx-0 sm:gap-5 sm:px-[36cqw]"
        style={{ overscrollBehaviorX: "contain" }}
      >
        {picks.map((p, i) => {
          const c = catalogCarToDiecast(p.car);
          const d = Math.min(2, Math.abs(i - pos));
          const isFront = i === front;
          const stats = (
            [
              ["Number", c.carNumber],
              ["Colour", c.colour],
              ["Type", c.type],
            ] as [string, string | undefined][]
          )
            .filter(([, v]) => (v || "").trim())
            .slice(0, 3);
          return (
            <div
              key={p.car.car_id}
              // The cars either side are smaller and a little dimmer, so the front one is the card.
              style={{ transform: `scale(${1 - 0.09 * d})`, opacity: 1 - 0.18 * d }}
              className="w-[70cqw] shrink-0 snap-center snap-always transition-[transform,opacity] duration-150 sm:w-[28cqw]"
            >
              <article className="card-elevated flex flex-col gap-2 overflow-hidden p-2.5">
                <button
                  type="button"
                  onClick={() => (isFront ? onOpen(p.car) : goTo(i))}
                  className="block w-full cursor-pointer overflow-hidden rounded-2xl"
                  aria-label={isFront ? `Open ${c.name}` : `Show ${c.name}`}
                >
                  <CarThumb car={c} className="aspect-[4/3] w-full [&_img]:object-cover" />
                </button>
                <div className="space-y-0.5 px-1">
                  <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                    <Sparkles className="size-3 fill-amber-400 text-amber-400" />
                    Suggested
                  </div>
                  <div className="line-clamp-1 text-lg font-semibold leading-tight">
                    {c.name || `${c.make} ${c.model}`.trim() || "Unnamed car"}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Tag className="size-3 shrink-0" />
                    <span className="truncate">
                      {[c.brand, c.series].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </div>
                </div>
                <div className="px-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider">
                    Description
                  </div>
                  <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                    {p.reason}
                  </p>
                </div>
                {stats.length > 0 && (
                  <dl className="flex gap-5 px-1">
                    {stats.map(([k, v]) => (
                      <div key={k} className="min-w-0">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider">{k}</dt>
                        <dd className="truncate text-xs font-medium text-primary">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <div
                  className={`flex items-center gap-2 px-1 pb-1 ${isFront ? "" : "pointer-events-none"}`}
                >
                  <button
                    type="button"
                    onClick={() => onDismiss(p.car.car_id)}
                    aria-label="Not interested"
                    title="Not interested: don't suggest this again"
                    className={`${btn} glass-btn size-8 text-foreground`}
                  >
                    <ThumbsDown className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onLike(p.car.car_id)}
                    aria-label="Show more like this"
                    title="Show more cars like this"
                    className={`${btn} glass-btn size-8 text-foreground`}
                  >
                    <ThumbsUp className="size-4" />
                  </button>
                  <WishlistHeart
                    entry={p.car}
                    className={`${btn} size-8 border border-white/50 bg-white/25 text-foreground backdrop-blur-md hover:bg-white/35`}
                  />
                  <button
                    type="button"
                    onClick={() => onAdd(p.car)}
                    aria-label="Add to my collection"
                    title="Add to my collection"
                    className={`${btn} glass-btn-solid ml-auto size-11 bg-primary/90 text-primary-foreground hover:bg-primary`}
                  >
                    <Plus className="size-5" />
                  </button>
                </div>
              </article>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-2" role="tablist">
        {picks.map((p, i) => (
          <button
            key={p.car.car_id}
            type="button"
            role="tab"
            aria-selected={i === front}
            aria-label={`Show suggestion ${i + 1} of ${n}`}
            onClick={() => goTo(i)}
            className={`h-2 cursor-pointer rounded-full transition-all ${
              i === front ? "w-5 bg-foreground" : "w-2 bg-foreground/30"
            }`}
          />
        ))}
      </div>
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
    onAdd: (car: CatalogCar) => quickAdd.start(car),
  };
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
                setLearned(dismissed);
              }}
            >
              <RefreshCw className="size-4" />
            </Button>
          </div>
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
