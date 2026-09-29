/**
 * The free-text vocabulary: brands, makes, models, colours.
 *
 * Unlike assortments there is no table behind these — a brand exists because a
 * casting spells it. So the list is whatever the catalogue contains, and the
 * only edit that makes sense is a rename, which is also how two spellings
 * become one: rename "Hot Wheels" to "Hotwheels" and there is one brand.
 *
 * The rename itself is a security-definer RPC, because it rewrites cars that
 * belong to other people.
 */
import { supabase } from "@/integrations/supabase/client";
import type { CatalogCar } from "@/lib/catalog";

export type MetaField = "brand" | "make" | "model" | "colour" | "type" | "series";

export const META_LABEL: Record<MetaField, string> = {
  brand: "Brands",
  make: "Makes",
  model: "Models",
  colour: "Colours",
  type: "Types",
  series: "Series",
};

const GET: Record<MetaField, (c: CatalogCar) => string | null | undefined> = {
  brand: (c) => c.brand,
  make: (c) => c.make,
  model: (c) => c.model,
  colour: (c) => c.colour,
  type: (c) => c.type,
  series: (c) => c.series,
};

export type MetaValue = { key: string; label: string; count: number };

/**
 * Every spelling of one field in the catalogue, commonest first.
 *
 * Case and spacing are not part of a name, so "acrylic case" and "Acrylic Case"
 * are one row — labelled with whichever spelling more entries use, which is the
 * one worth keeping when you merge them.
 */
export function metaValues(catalog: CatalogCar[], field: MetaField): MetaValue[] {
  const spellings = new Map<string, Map<string, number>>();

  for (const c of catalog) {
    const raw = (GET[field](c) || "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase().replace(/\s+/g, " ");
    const at = spellings.get(key) ?? new Map<string, number>();
    at.set(raw, (at.get(raw) ?? 0) + 1);
    spellings.set(key, at);
  }

  return [...spellings.entries()]
    .map(([key, forms]) => {
      let label = "";
      let best = -1;
      let count = 0;
      for (const [form, n] of forms) {
        count += n;
        if (n > best) {
          best = n;
          label = form;
        }
      }
      return { key, label, count };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export async function renameMetaValue(
  field: MetaField,
  from: string,
  to: string,
): Promise<{ moved: number } | { error: string }> {
  if (!to.trim()) return { error: "A name cannot be blank." };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("tesoro_rename_field", {
    _field: field,
    _from: from,
    _to: to,
  });
  if (error) return { error: error.message };
  return { moved: Number(data) || 0 };
}
