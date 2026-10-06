import { useMemo, type ReactNode } from "react";

import { CarsCtx, type CarsContextValue } from "@/lib/cars-store";
import { makeGuestCars } from "@/lib/guest-seed";

/**
 * A collection that is not anybody's, so a locked section can be shown working.
 *
 * The seven Pro sections all read the same thing — `useCars()` — and nothing
 * else. So the way to show what Favourites looks like is not to draw a picture
 * of Favourites: it is to run the real Favourites over cars that belong to
 * nobody. The demo seed already exists for guest mode and is exactly that.
 *
 * Every write is a no-op. The preview is behind `pointer-events-none` as well,
 * but a panel that could call `addCar` if it ever got a click is one bug away
 * from writing a sample car into somebody's collection.
 */
export function SampleCars({ children }: { children: ReactNode }) {
  const value = useMemo<CarsContextValue>(() => {
    // A fixed seed, so the preview does not reshuffle itself on every render.
    let n = 1;
    const rand = () => {
      n = (n * 1103515245 + 12345) % 2147483648;
      return n / 2147483648;
    };
    const cars = makeGuestCars(rand);
    const noop = () => {};
    return {
      cars,
      addCar: () => null,
      bulkAddCars: () => [],
      updateCar: noop,
      bulkUpdateCars: noop,
      updateCarsByShippingId: async () => 0,
      deleteCar: noop,
      renumberShippingIds: async () => 0,
      renumberOrderIds: async () => 0,
      shippingIdDrift: () => [],
      undo: noop,
      undoLabel: null,
      undoAt: null,
      resetOverlay: noop,
      refresh: async () => {},
      syncAllToSupabase: async () => ({ success: false, count: 0 }),
      lastUpdated: null,
      refreshing: false,
      source: "supabase",
    };
  }, []);

  return <CarsCtx.Provider value={value}>{children}</CarsCtx.Provider>;
}
