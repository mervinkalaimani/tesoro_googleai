import { useEffect, useState } from "react";
import { Car, Check, Loader2, Sparkles } from "lucide-react";

import type { CarImageCandidate } from "@/lib/car-image-search";
import { cn } from "@/lib/utils";

/**
 * Tap the photo, get the right one.
 *
 * Both dialogs that describe a casting show the same little thumbnail at the
 * top, and in both of them a wrong or missing picture is noticed there — it is
 * the only image on screen. The fix used to live several sections down under
 * Photo & notes. The search has already run by the time the card is drawn, so
 * the right photo is usually one tap away; this is that tap.
 *
 * The two halves are separate because the card's header row and the strip sit
 * at different levels of the layout: the thumbnail is a cell in a flex row, the
 * strip is a band under the whole row. The caller holds the open/closed flag.
 */

/** Photos drawn before you scroll for more. */
const PHOTO_PAGE = 16;

export type PhotoSuggestions = {
  key: string;
  candidates: CarImageCandidate[];
  loading: boolean;
};

export function PhotoThumbButton({
  url,
  picking,
  onClick,
  className = "",
}: {
  url?: string;
  picking: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={picking}
      title="Pick a different photo"
      className={cn(
        "group relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-muted transition",
        "ring-offset-2 ring-offset-background hover:ring-2 hover:ring-primary/60",
        picking && "ring-2 ring-primary",
        className,
      )}
    >
      {url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <Car className="size-5 text-muted-foreground" />
      )}
      <span className="absolute inset-0 grid place-items-center bg-black/55 opacity-0 transition group-hover:opacity-100">
        <Sparkles className="size-4 text-white" />
      </span>
    </button>
  );
}

export function PhotoCandidateStrip({
  search,
  value,
  onPick,
  emptyHint = "Nothing found — Photo & notes below takes a file or a link",
}: {
  search: PhotoSuggestions;
  value?: string;
  onPick: (url: string) => void;
  /** What to say when the search came back with nothing. */
  emptyHint?: string;
}) {
  // Reaching the right-hand end reveals the next page rather than stopping at
  // sixteen. The whole ranked list is already in hand — the endpoint sends its
  // tail — so this costs no round trip.
  const [page, setPage] = useState(PHOTO_PAGE);
  useEffect(() => {
    setPage(PHOTO_PAGE);
  }, [search.key]);

  return (
    <div className="space-y-1.5 border-t border-border bg-background px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {search.loading ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Sparkles className="size-3 text-primary" />
        )}
        {search.loading
          ? "Looking for this car…"
          : search.candidates.length > 0
            ? "Tap the one that is this car"
            : emptyHint}
      </p>
      {search.candidates.length > 0 && (
        // w-0 min-w-full so the row scrolls inside the card rather than
        // reporting its full length upwards and widening the dialog.
        <div
          className="flex w-0 min-w-full snap-x gap-2 overflow-x-auto pb-1"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollLeft + el.clientWidth < el.scrollWidth - 48) return;
            setPage((n) => (n >= search.candidates.length ? n : n + PHOTO_PAGE));
          }}
        >
          {search.candidates.slice(0, page).map((c) => {
            const active = c.url === value;
            return (
              <button
                key={c.url}
                type="button"
                onClick={() => onPick(c.url)}
                title={`${c.title} — ${c.source}`}
                aria-label={`Use this photo: ${c.title}`}
                aria-pressed={active}
                className={cn(
                  "relative h-20 w-16 shrink-0 snap-start overflow-hidden rounded-md border bg-muted/40 transition",
                  active
                    ? "border-primary ring-2 ring-primary"
                    : "border-border hover:border-primary/60",
                )}
              >
                <img
                  src={c.thumb}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="size-full object-contain"
                />
                {c.kind === "card" && (
                  <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-[9px] font-medium text-white">
                    Card
                  </span>
                )}
                {active && (
                  <span className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-2.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
