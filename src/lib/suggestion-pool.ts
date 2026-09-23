import { useMemo } from "react";
import { useCars } from "@/lib/cars-store";
import { useCatalog } from "@/lib/catalog-store";
import { catalogCarToDiecast } from "@/lib/catalog";
import type { Diecast } from "@/lib/types";

/**
 * What the form offers you, drawn from everybody's cars rather than your own.
 *
 * Every dropdown in the add form — make, model, variant, year, colour, type,
 * brand, assortment, scale, and the retail prices a brand and assortment go
 * for — used to be built from `useCars()`, which is your collection and
 * nobody else's. That works once you have a thousand cars and is empty on the
 * day you sign up: the first person to add a Mini GT got no help at all, and
 * every list was a blank box with a text cursor in it.
 *
 * The catalogue is the shared half. 1,480 castings, filed by everyone, already
 * carrying exactly these fields. Pooling it with your own rows means a new
 * account opens the same form already knowing that Mini GT does Blister and
 * Box, and that a Hot Wheels mainline is ₹179.
 *
 * Your own rows come first so that, where the two disagree, your spelling is
 * the one ranked highest — the option lists are frequency-ordered and the
 * catalogue would otherwise outvote you 1,480 to one.
 *
 * Not pooled: seller and what you paid. Who you buy from is yours, and so is
 * the price you got.
 */
export function useSuggestionPool(): Diecast[] {
  const mine = useCars();
  const { catalog } = useCatalog();
  return useMemo(() => [...mine, ...catalog.map(catalogCarToDiecast)], [mine, catalog]);
}
