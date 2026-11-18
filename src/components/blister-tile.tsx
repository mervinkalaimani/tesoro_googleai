import type { ReactNode } from "react";
import { SyncedMark } from "@/components/synced-badge";
import { CopiesBadge } from "@/components/copies-badge";
import { ChaseMark, FavouriteMark, ChangedDot } from "@/components/car-marks";
import { StatusPill } from "@/components/status-pill";
import { CarThumb } from "@/components/car-thumb";
import { carNumberOf } from "@/lib/car-subline";
import { Layers } from "lucide-react";
import { rarityOf } from "@/lib/rarity";
import { cn } from "@/lib/utils";

import type { Diecast } from "@/lib/types";

/**
 * The words on the photograph: name, who made it and which box, series. White
 * on a dark fade that rises from the bottom edge, so the picture stays the
 * card and the text is a caption on it rather than a second block under it.
 */
export function CarOverlay({
  car,
  brandOnly = false,
  padRight = false,
}: {
  car: Diecast;
  brandOnly?: boolean;
  /** Room at the right for a button laid over the corner. */
  padRight?: boolean;
}) {
  const title = car.name || `${car.make} ${car.model}`.trim() || "Unnamed car";
  // brandOnly is the blister view: the packaging already says the series.
  const brandLine = [car.brand, car.assortment].filter(Boolean).join(" · ");
  const seriesLine = brandOnly ? "" : [car.series, car.subSeries].filter(Boolean).join(" · ");
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3.5 pb-3 pt-14 text-white",
        padRight && "pr-14",
      )}
    >
      <div className="line-clamp-2 text-[15px] font-semibold leading-tight" title={title}>
        {title}
        <ChangedDot car={car} className="ml-1.5 align-middle" />
      </div>
      {brandLine && <div className="mt-1 truncate text-xs text-white/80">{brandLine}</div>}
      {seriesLine && <div className="truncate text-xs text-white/60">{seriesLine}</div>}
    </div>
  );
}

/** Every pill laid on a photograph shares this height, padding and text size. */
const PILL_ON_PHOTO =
  "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs leading-none shadow-sm backdrop-blur-sm";

/**
 * Blister view: the photograph in the shape of the packaging.
 *
 * 534 × 658 is the blister card this was drawn from, and it is the picture
 * that takes that ratio — the name and the brand sit underneath it, the way
 * they do in every other grid here. The other views crop the same photograph
 * to a landscape window, which is the car; this one is the card.
 */
export function BlisterTile({
  car,
  onOpen,
  caption,
  synced,
  syncedSource,
  copies = 1,
  pack,
  foot,
  overlay,
  className = "",
}: {
  car: Diecast;
  onOpen: () => void;
  /** One short word at the end of the second line — "Owned", a price, a day. */
  caption?: string;
  /** The catalogue entry has been checked against the maker's site. */
  synced?: boolean;
  syncedSource?: string | null;
  copies?: number;
  /** Set when this is a multi-pack: "5 CARS", or "PACK" when its size is not known. */
  pack?: string;
  /** Replaces the name and brand line under the photograph. */
  foot?: ReactNode;
  /** Words laid over the bottom of the photograph. Moves the badges to the top. */
  overlay?: ReactNode;
  className?: string;
}) {
  const title = car.name || `${car.make} ${car.model}`.trim() || "Unnamed car";
  // Glass by default: the words go on the photograph. A caller that passes its
  // own foot keeps the old layout, with the words underneath.
  const words = overlay ?? (foot === undefined ? <CarOverlay car={car} brandOnly /> : undefined);

  return (
    <button
      type="button"
      onClick={onOpen}
      title={title}
      className={cn(
        "card-elevated group flex h-full flex-col overflow-hidden text-left transition-colors hover:border-primary/40",
        className,
      )}
    >
      {/* A photograph that is not already this shape is zoomed to fill it
          rather than letterboxed: a grid of cards with grey bands above and
          below each one stops reading as a shelf. `object-cover` is CarThumb's
          own default, so there is nothing to override. */}
      <div className="relative shrink-0">
        <CarThumb
          car={car}
          className="aspect-[534/658] w-full"
          // No photograph still fills the window, top to bottom: the car's own
          // name across a tinted panel. A small outline floating in the middle
          // of a tile this tall reads as a tile that failed to load.
          fallback={
            <span className="flex size-full items-center justify-center bg-gradient-to-b from-muted/60 to-muted/20 p-3 text-center text-xs font-semibold leading-tight text-muted-foreground">
              {title}
            </span>
          }
        />

        <SyncedMark synced={synced} source={syncedSource} />
        {words}
        {/* The pills on the photograph. With words laid over the bottom they all
            go in one row along the top: the same height, 8px in from the corner
            and 6px apart, so they read as one line and not as stickers. */}
        <div
          className={cn(
            "pointer-events-none absolute flex flex-nowrap items-center",
            words
              ? "left-2 top-2 max-w-[calc(100%-4.5rem)] gap-1.5"
              : "bottom-1 left-1 flex-col items-start gap-1",
          )}
        >
          {words &&
            (car.status ? (
              <StatusPill status={car.status} className={PILL_ON_PHOTO} />
            ) : caption ? (
              <span className={cn(PILL_ON_PHOTO, "bg-black/75 text-white")}>{caption}</span>
            ) : null)}
          {pack && (
            <span
              title="A multi-pack: several cars in one box"
              className={cn(PILL_ON_PHOTO, "bg-black/75 font-semibold text-amber-300")}
            >
              <Layers className="size-3" />
              {pack}
            </span>
          )}
          {copies > 1 && (
            <CopiesBadge
              n={copies}
              className={cn("bg-black/75 backdrop-blur-sm", words && "h-6")}
            />
          )}
        </div>

        {!words && (
          <div className="pointer-events-none absolute bottom-1 right-1">
            {car.status ? (
              <StatusPill
                status={car.status}
                className="px-1.5 py-0 text-xs leading-tight shadow-sm backdrop-blur-sm"
              />
            ) : caption ? (
              <span className="rounded-full bg-black/75 px-1.5 text-xs font-medium leading-tight text-white backdrop-blur-sm">
                {caption}
              </span>
            ) : null}
          </div>
        )}

        {(car.chase || car.favourite) && (
          <div
            className={cn(
              "pointer-events-none absolute flex items-center gap-1.5",
              words ? "right-2 top-2" : "right-1 top-1",
            )}
          >
            {car.chase && (
              <span className="grid size-5 place-items-center rounded-full bg-black/70 backdrop-blur-sm">
                <ChaseMark rarity={rarityOf(car)} className="size-3" />
              </span>
            )}
            {car.favourite && (
              <span className="grid size-5 place-items-center rounded-full bg-black/70 backdrop-blur-sm">
                <FavouriteMark className="size-3" />
              </span>
            )}
          </div>
        )}
      </div>

      {words
        ? foot
        : (foot ?? (
            <div className="flex min-w-0 flex-1 flex-col p-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="line-clamp-2 text-sm font-semibold leading-tight group-hover:text-primary">
                  {title}
                </span>
                <ChangedDot car={car} />
              </div>
              {/* One line, in the order the card itself prints them. Middle dots,
            and nothing left standing where a part is missing. */}
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {[car.brand, car.assortment, carNumberOf(car)].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
          ))}
    </button>
  );
}
