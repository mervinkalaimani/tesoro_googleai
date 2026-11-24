import { Plus } from "lucide-react";
import { CarThumb } from "@/components/car-thumb";
import { WishlistHeart } from "@/components/wishlist-heart";
import type { CatalogCar } from "@/lib/catalog";
import type { Diecast } from "@/lib/types";

/**
 * A shelf card in the For You design: the picture fills the card, the name and brand sit on a
 * frosted band along its bottom, and Wishlist and Add are two glass halves under it. `onAdd` left
 * out means the car is already yours: only Wishlist (or nothing) is offered.
 */
export function ShelfCard({
  car,
  entry,
  caption,
  onOpen,
  onAdd,
  wish = true,
}: {
  car: Diecast;
  entry: CatalogCar;
  /** A chip on the picture: "2 days ago", "In your collection". */
  caption?: string;
  onOpen: () => void;
  onAdd?: () => void;
  /** Offer the wishlist (not for a guest). */
  wish?: boolean;
}) {
  const name = car.name || `${car.make} ${car.model}`.trim() || "Unnamed car";
  const line = [car.brand, car.carNumber].filter(Boolean).join(" · ");
  const seg =
    "glass-btn !flex h-9 flex-1 cursor-pointer items-center justify-center gap-1 whitespace-nowrap !rounded-none px-2 text-xs font-medium text-foreground";
  return (
    <article className="flex size-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${name}`}
        className="relative block aspect-[534/658] w-full shrink-0 cursor-pointer overflow-hidden"
      >
        <CarThumb car={car} className="absolute inset-0 size-full" />
        {caption && (
          <span className="absolute left-2 top-2 inline-flex h-5 items-center rounded-full bg-black/75 px-1.5 text-[10px] leading-none text-white backdrop-blur-sm">
            {caption}
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 flex h-16 flex-col gap-0.5 overflow-hidden bg-black/40 px-2 pb-2 pt-1.5 text-left text-white backdrop-blur-md backdrop-saturate-150">
          <span className="line-clamp-2 text-xs font-semibold leading-tight">{name}</span>
          <span className="line-clamp-1 text-[10px] font-medium text-white/85">{line || "—"}</span>
        </span>
      </button>
      {(wish || onAdd) && (
        <div className="mt-auto flex w-full">
          {wish && <WishlistHeart entry={entry} label="Wishlist" className={seg} />}
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              aria-label="Add to my collection"
              className={`${seg} !font-semibold text-primary`}
            >
              <Plus className="size-3.5" />
              Add
            </button>
          )}
        </div>
      )}
    </article>
  );
}
