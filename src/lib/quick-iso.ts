import { toast } from "sonner";

import { catalogCarToDiecast, type CatalogCar } from "@/lib/catalog";
import { makeBlankCar, useCarsActions } from "@/lib/cars-store";

/**
 * Put a casting on the ISO (wishlist) list in one tap: no form, no page. It is a car you
 * are looking for, so there is no price, seller or payment to say.
 */
export function useAddToIso() {
  const { addCar } = useCarsActions();
  return (entry: CatalogCar) => {
    const car = catalogCarToDiecast(entry);
    const saved = addCar({
      ...makeBlankCar(),
      ...car,
      // Numbered by the store, which can see the whole collection.
      id: "",
      catalogId: entry.car_id,
      status: "ISO",
      mrp: Number(entry.mrp) || 0,
    });
    // Null means the free limit refused it, and the toast has already said so.
    if (saved) toast.success("Added to your ISO list", { description: car.name });
    return saved;
  };
}
