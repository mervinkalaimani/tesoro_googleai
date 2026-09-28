/**
 * One logo per brand.
 *
 * Read by the catalogue, where the brand filter is a row of marks rather than a
 * dropdown of 52 names, and written in Settings → Advanced → Brand logos.
 *
 * Held at module level with a hook over the top, rather than in a provider: it
 * is one small row per brand, it changes when an admin uploads a file, and the
 * two places that read it are a page and a settings screen.
 */
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export type BrandLogo = { brand: string; label: string; image_url: string };

/** The key every lookup uses: one brand however it was spelled. */
export const brandKey = (v: string) => (v || "").trim().toLowerCase();

let cache: BrandLogo[] | null = null;
const waiting = new Set<(rows: BrandLogo[]) => void>();

export async function fetchBrandLogos(): Promise<BrandLogo[]> {
  const { data, error } = await supabase
    .from("tesoro_brand_logos")
    .select("brand, label, image_url");
  if (error) {
    // The table not existing yet is not worth a toast on every page load: the
    // filter simply shows names until the migration is run.
    console.warn("fetchBrandLogos failed:", error.message);
    return [];
  }
  cache = (data ?? []) as BrandLogo[];
  for (const fn of waiting) fn(cache);
  return cache;
}

/** The logos, loaded once per session. */
export function useBrandLogos(): BrandLogo[] {
  const [rows, setRows] = useState<BrandLogo[]>(cache ?? []);

  useEffect(() => {
    if (cache) {
      setRows(cache);
      return;
    }
    waiting.add(setRows);
    void fetchBrandLogos();
    return () => {
      waiting.delete(setRows);
    };
  }, []);

  return rows;
}

/** brand key → URL, for a page that has a brand and wants its mark. */
export function logoMap(rows: BrandLogo[]): Map<string, string> {
  return new Map(rows.map((r) => [r.brand, r.image_url]));
}

export async function setBrandLogo(brand: string, imageUrl: string): Promise<string | null> {
  const key = brandKey(brand);
  if (!key) return "That brand has no name.";
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("tesoro_brand_logos").upsert(
    {
      brand: key,
      label: brand.trim(),
      image_url: imageUrl,
      updated_by: auth?.user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "brand" },
  );
  if (error) return error.message;
  await fetchBrandLogos();
  return null;
}

/** Forgets the logo. The file itself is left in the bucket. */
export async function clearBrandLogo(brand: string): Promise<string | null> {
  const { error } = await supabase.from("tesoro_brand_logos").delete().eq("brand", brandKey(brand));
  if (error) return error.message;
  await fetchBrandLogos();
  return null;
}
