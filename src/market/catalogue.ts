/** The Viiv catalogue (CatalogCar) as the market sees it: one item per catalogue car_id. */
import type { CatalogCar } from "@/lib/catalog";

import type { CatalogueItem, Origin } from "./types";

/**
 * ponytail: the catalogue has no country-of-origin column. These brands are
 * marked Indian as a placeholder; replace with the catalogue's own field.
 */
const INDIAN_BRANDS = new Set(["CCA", "Pop Race"]);

export function fromCatalogCar(
  c: CatalogCar,
  source: CatalogueItem["source"] = "viiv-catalogue",
): CatalogueItem {
  const scale = (c.size || "1:64").replace(/^'/, "");
  return {
    id: c.car_id,
    code: c.car_id,
    name: c.name || `${c.make} ${c.model}`.trim(),
    brand: c.brand,
    make: c.make,
    model: c.model,
    scale,
    series: c.series,
    assortment: c.assortment,
    variant: c.variant ?? "",
    colour: c.colour || "Unknown",
    year: c.year ?? "",
    manufacturer: c.brand,
    origin: (INDIAN_BRANDS.has(c.brand) ? "Indian" : "Imported") as Origin,
    aliases: [c.make, c.model, c.sub_series, c.car_number].filter(Boolean),
    mrpPaise: Math.round((Number(c.mrp) || 0) * 100),
    imageUrl: c.image_url ?? null,
    source,
    review: "approved",
    createdAt: Date.parse(c.created_at ?? "") || 0,
  };
}

/** Window event: a car made in the market, for the catalogue's in-memory list (demo mode only). */
export const MARKET_CAR_EVENT = "viiv-market:catalog-car";
