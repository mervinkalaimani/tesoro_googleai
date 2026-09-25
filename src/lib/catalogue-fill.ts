import type { CatalogCar } from "@/lib/catalog";

/**
 * What "Get from Catalogue" writes into the car form.
 *
 * Adding a car takes the catalogue's description automatically. An edit never
 * did, so a row filed before somebody corrected the entry kept the old
 * spelling for good — this is that correction, asked for rather than applied.
 *
 * Two of the fields are cleared rather than merged, which is the point of
 * pressing it. The row's name and price are what tell the propagate trigger to
 * leave it alone: a row matching the entry is one the catalogue keeps up to
 * date, and a row that differs has opted out. Taking the entry's figures puts
 * it back in.
 *
 * What you paid, who you bought it from and every date are not here at all.
 */
export type CatalogueFillFields = {
  brand: string;
  make: string;
  model: string;
  variant: string;
  colour: string;
  type: string;
  assortment: string;
  series: string;
  subSeries: string;
  carNumber: string;
  size: string;
  year: string;
  mrp: number | "";
  displayName: string;
  imageUrl: string;
};

export function catalogueFill<T extends CatalogueFillFields>(form: T, entry: CatalogCar): T {
  return {
    ...form,
    brand: entry.brand || form.brand,
    make: entry.make || form.make,
    model: entry.model || form.model,
    variant: entry.variant ?? form.variant,
    colour: entry.colour || form.colour,
    type: entry.type || form.type,
    assortment: entry.assortment || form.assortment,
    series: entry.series ?? form.series,
    subSeries: entry.sub_series ?? form.subSeries,
    carNumber: entry.car_number ?? form.carNumber,
    size: entry.size || form.size,
    year: entry.year || form.year,
    mrp: Number(entry.mrp) || "",
    displayName: entry.name || "",
    // The entry's photograph wins when it has one; yours stays when it does not.
    imageUrl: entry.image_url || form.imageUrl || "",
  };
}
