import { useMemo, useState } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { isCarMatchingCatalog, type CatalogCar } from "@/lib/catalog";
import { useCars, useCarsActions } from "@/lib/cars-store";
import { useAddToIso } from "@/lib/quick-iso";
import { isIso } from "@/lib/status";

/** The ring and specks that fly out of a heart as it pops. */
export function HeartBurst() {
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full border-2 border-red-400"
        style={{ animation: "heart-ring 0.6s ease-out forwards" }}
      />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <span
          key={a}
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -ml-[3px] -mt-[3px] size-1.5 rounded-full bg-red-400"
          style={{ ["--a" as string]: `${a}deg`, animation: "heart-speck 0.6s ease-out forwards" }}
        />
      ))}
    </>
  );
}

/** The wish for this casting, when it is on the list. */
export function useWishFor(entry: CatalogCar) {
  const cars = useCars();
  return useMemo(
    () => cars.find((c) => isIso(c.status) && isCarMatchingCatalog(c, entry)) ?? null,
    [cars, entry],
  );
}

/**
 * The heart laid over the bottom corner of a shelf card. Empty, a tap puts the casting on the
 * ISO list; filled, it is on the list already, and a tap asks before taking it off.
 */
export function WishlistHeart({
  entry,
  above = false,
  className,
}: {
  entry: CatalogCar;
  /** Sit on top of the + at the bottom corner; without a + the heart takes its place. */
  above?: boolean;
  className?: string;
}) {
  const wish = useWishFor(entry);
  const cars = useCars();
  const addToIso = useAddToIso();
  const { deleteCar } = useCarsActions();
  const [asking, setAsking] = useState(false);
  const [popped, setPopped] = useState(false);
  const on = Boolean(wish);
  // A car you already own is not one to look for.
  const owned = useMemo(
    () => cars.some((c) => !isIso(c.status) && isCarMatchingCatalog(c, entry)),
    [cars, entry],
  );
  if (owned && !on) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (on) return setAsking(true);
          addToIso(entry);
          setPopped(true);
          window.setTimeout(() => setPopped(false), 600);
        }}
        aria-pressed={on}
        aria-label={on ? "On your wishlist: tap to take it off" : "Add to my ISO list"}
        title={on ? "On your wishlist" : "Add to my ISO list"}
        className={
          className ??
          `absolute right-2 ${above ? "bottom-11" : "bottom-2"} grid size-7 cursor-pointer place-items-center rounded-full border border-white/50 bg-white/25 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_4px_12px_rgba(0,0,0,0.25)] backdrop-blur-md transition-colors hover:bg-white/35`
        }
      >
        {popped && <HeartBurst />}
        <Heart
          className={on ? "size-4 fill-red-500 text-red-500" : "size-4"}
          style={popped ? { animation: "heart-pop 0.6s ease-out" } : undefined}
        />
      </button>
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="text-lg font-semibold">Take this off your wishlist?</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{entry.name}</span> stays in the
            catalogue. You are only saying you have stopped looking for it.
          </DialogDescription>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setAsking(false)}>
              Keep it
            </Button>
            <Button
              type="button"
              className="bg-rose-600 text-white hover:bg-rose-600/90"
              onClick={() => {
                if (wish) deleteCar(wish.id);
                setAsking(false);
                toast.success("Off your wishlist", {
                  description: "Undo in the top bar brings it back.",
                });
              }}
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
