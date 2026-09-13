import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Diecast } from "@/lib/types";

/**
 * Cars from every account, for the Add a car search.
 *
 * Backed by the search_catalogue database function, which returns what a car
 * is — never what anyone paid for it, who sold it, when, or their photographs —
 * and only to approved accounts. Guests search their own demo data only.
 */

type CatalogueRow = {
  make: string | null;
  model: string | null;
  variant: string | null;
  year: string | null;
  colour: string | null;
  type: string | null;
  brand: string | null;
  assortment: string | null;
  series: string | null;
  sub_series: string | null;
  car_number: string | null;
  size: string | null;
  rarity: string | null;
  mrp: number | string | null;
  image_url: string | null;
  copies: number | string;
};

/** Only the catalogue fields are filled; everything about a purchase is blank. */
export type CatalogueCar = Pick<
  Diecast,
  | "make"
  | "model"
  | "variant"
  | "year"
  | "colour"
  | "type"
  | "brand"
  | "assortment"
  | "series"
  | "subSeries"
  | "carNumber"
  | "size"
  | "rarity"
  | "mrp"
  | "imageUrl"
  | "name"
  | "chase"
> & {
  /** How many cars across all accounts share this casting. Absent for your own. */
  copies?: number;
};

/** Same casting, same paint, same series: one suggestion. */
export const catalogueKey = (
  c: Pick<Diecast, "brand" | "make" | "model" | "variant" | "colour" | "series">,
) =>
  [c.brand, c.make, c.model, c.variant, c.colour, c.series]
    .map((v) => (v || "").trim().toLowerCase())
    .join("|");

function toCar(r: CatalogueRow): CatalogueCar {
  const s = (v: string | null) => (v ?? "").trim();
  const rarity = s(r.rarity) || "Normal";
  return {
    name: [s(r.year), s(r.make), s(r.model), s(r.variant)].filter(Boolean).join(" "),
    make: s(r.make),
    model: s(r.model),
    variant: s(r.variant),
    year: s(r.year).replace(/\.0+$/, ""),
    colour: s(r.colour),
    type: s(r.type),
    brand: s(r.brand),
    assortment: s(r.assortment),
    series: s(r.series),
    subSeries: s(r.sub_series),
    carNumber: s(r.car_number),
    size: s(r.size),
    rarity,
    chase: rarity !== "Normal",
    mrp: Number(r.mrp) || 0,
    imageUrl: s(r.image_url) || undefined,
    copies: Number(r.copies) || 1,
  };
}

/** Debounced search across all accounts. Empty while the query is under 2 characters. */
export function useCatalogueSearch(query: string, enabled: boolean) {
  const [state, setState] = useState<{ q: string; cars: CatalogueCar[]; loading: boolean }>({
    q: "",
    cars: [],
    loading: false,
  });

  const q = query.trim();

  useEffect(() => {
    if (!enabled || q.length < 2) {
      setState({ q, cars: [], loading: false });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, q, loading: true }));
    const timer = setTimeout(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("search_catalogue", { q, lim: 12 });
      if (cancelled) return;
      setState({
        q,
        cars: error ? [] : ((data ?? []) as CatalogueRow[]).map(toCar),
        loading: false,
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, enabled]);

  return state.q === q ? state : { q, cars: [], loading: enabled && q.length >= 2 };
}
