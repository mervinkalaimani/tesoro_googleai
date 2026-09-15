import { supabase } from "@/integrations/supabase/client";
import type { Diecast } from "@/lib/types";
import { generateCatalogCarId, carIdFor, isPlaceholderId } from "@/lib/car-id";
import rawDiecastData from "@/data/diecast.json";

export type CatalogCar = {
  car_id: string;
  brand: string;
  make: string;
  model: string;
  assortment: string;
  series: string;
  sub_series: string;
  car_number: string;
  mrp: number;
  name: string;
  variant?: string;
  year?: string | null;
  colour?: string;
  type?: string;
  size?: string;
  image_url?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
};

const CATALOG_STORAGE_KEY = "tesoro_car_catalog_cache";

/** Extracts unique catalog castings from any list of Diecast cars. */
export function extractCatalogFromCars(cars: Diecast[]): CatalogCar[] {
  const map = new Map<string, CatalogCar>();

  for (const car of cars) {
    if (!car.make && !car.model && !car.name) continue;
    const car_id = isPlaceholderId(car.id)
      ? generateCatalogCarId(car)
      : car.id || generateCatalogCarId(car);

    if (!map.has(car_id)) {
      map.set(car_id, {
        car_id,
        brand: car.brand || "",
        make: car.make || "",
        model: car.model || "",
        assortment: car.assortment || "",
        series: car.series || "",
        sub_series: car.subSeries || "",
        car_number: car.carNumber || "",
        mrp: Number(car.mrp) || 0,
        name: car.name || `${car.make} ${car.model}`.trim(),
        variant: car.variant || "",
        year: car.year || "",
        colour: car.colour || "",
        type: car.type || "",
        size: car.size || "1:64",
        image_url: car.imageUrl || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  return Array.from(map.values());
}

/** Convert a Diecast item into a CatalogCar entry. */
export function diecastToCatalogCar(car: Diecast): CatalogCar {
  const car_id = isPlaceholderId(car.id)
    ? generateCatalogCarId(car)
    : car.id || generateCatalogCarId(car);
  return {
    car_id,
    brand: car.brand || "",
    make: car.make || "",
    model: car.model || "",
    assortment: car.assortment || "",
    series: car.series || "",
    sub_series: car.subSeries || "",
    car_number: car.carNumber || "",
    mrp: Number(car.mrp) || 0,
    name: car.name || `${car.make} ${car.model}`.trim(),
    variant: car.variant || "",
    year: car.year || "",
    colour: car.colour || "",
    type: car.type || "",
    size: car.size || "1:64",
    image_url: car.imageUrl || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** Reads cached catalog from localStorage, falling back to bundled sample catalog. */
export function getLocalCatalog(): CatalogCar[] {
  if (typeof window === "undefined") {
    return extractCatalogFromCars(rawDiecastData as unknown as Diecast[]);
  }

  try {
    const cached = localStorage.getItem(CATALOG_STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as CatalogCar[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn("Failed to parse cached catalog from localStorage:", e);
  }

  const bundled = extractCatalogFromCars(rawDiecastData as unknown as Diecast[]);
  saveLocalCatalog(bundled);
  return bundled;
}

/** Caches catalog to localStorage. */
export function saveLocalCatalog(catalog: CatalogCar[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog));
  } catch (e) {
    console.warn("Failed to cache catalog to localStorage:", e);
  }
}

/**
 * Fetches the entire car catalog from Supabase table `tesoro_car_catalog`.
 * Falls back to local cached catalog if table or network is unavailable.
 */
export async function fetchCatalogFromSupabase(): Promise<CatalogCar[]> {
  try {
    const { data, error } = await supabase
      .from("tesoro_car_catalog")
      .select("*")
      .order("brand", { ascending: true })
      .order("make", { ascending: true })
      .order("model", { ascending: true });

    if (error) {
      console.warn("Supabase fetch tesoro_car_catalog error:", error.message);
      return getLocalCatalog();
    }

    if (data && data.length > 0) {
      const formatted: CatalogCar[] = data.map((row) => ({
        car_id: row.car_id,
        brand: row.brand || "",
        make: row.make || "",
        model: row.model || "",
        assortment: row.assortment || "",
        series: row.series || "",
        sub_series: row.sub_series || "",
        car_number: row.car_number || "",
        mrp: Number(row.mrp) || 0,
        name: row.name || `${row.make} ${row.model}`.trim(),
        variant: row.variant || "",
        year: row.year || "",
        colour: row.colour || "",
        type: row.type || "",
        size: row.size || "1:64",
        image_url: row.image_url || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        created_by: row.created_by,
      }));
      saveLocalCatalog(formatted);
      return formatted;
    }

    return getLocalCatalog();
  } catch (err) {
    console.error("fetchCatalogFromSupabase failed:", err);
    return getLocalCatalog();
  }
}

/**
 * Upserts a car into `tesoro_car_catalog`.
 */
export async function saveCatalogCarToSupabase(
  catalogCar: CatalogCar,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Update local cache immediately
    const local = getLocalCatalog();
    const idx = local.findIndex((c) => c.car_id === catalogCar.car_id);
    if (idx >= 0) {
      local[idx] = { ...local[idx], ...catalogCar, updated_at: new Date().toISOString() };
    } else {
      local.unshift(catalogCar);
    }
    saveLocalCatalog(local);

    // 2. Persist to Supabase tesoro_car_catalog
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id ?? null;

    const payload = {
      car_id: catalogCar.car_id,
      brand: catalogCar.brand || "",
      make: catalogCar.make || "",
      model: catalogCar.model || "",
      assortment: catalogCar.assortment || "",
      series: catalogCar.series || "",
      sub_series: catalogCar.sub_series || "",
      car_number: catalogCar.car_number || "",
      mrp: Number(catalogCar.mrp) || 0,
      name: catalogCar.name || `${catalogCar.make} ${catalogCar.model}`.trim(),
      variant: catalogCar.variant || "",
      year: catalogCar.year || null,
      colour: catalogCar.colour || "",
      type: catalogCar.type || "",
      size: catalogCar.size || "1:64",
      image_url: catalogCar.image_url || null,
      created_by: userId,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("tesoro_car_catalog")
      .upsert(payload, { onConflict: "car_id" });

    if (error) {
      console.warn("saveCatalogCarToSupabase warning:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Batch seeds catalog cars to `tesoro_car_catalog`.
 */
export async function seedCatalogToSupabase(
  catalogCars: CatalogCar[],
  onProgress?: (inserted: number, total: number) => void,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id ?? null;

    const chunkSize = 100;
    let count = 0;

    for (let i = 0; i < catalogCars.length; i += chunkSize) {
      const slice = catalogCars.slice(i, i + chunkSize);
      const rows = slice.map((c) => ({
        car_id: c.car_id,
        brand: c.brand || "",
        make: c.make || "",
        model: c.model || "",
        assortment: c.assortment || "",
        series: c.series || "",
        sub_series: c.sub_series || "",
        car_number: c.car_number || "",
        mrp: Number(c.mrp) || 0,
        name: c.name || `${c.make} ${c.model}`.trim(),
        variant: c.variant || "",
        year: c.year || null,
        colour: c.colour || "",
        type: c.type || "",
        size: c.size || "1:64",
        image_url: c.image_url || null,
        created_by: userId,
      }));

      const { error } = await supabase
        .from("tesoro_car_catalog")
        .upsert(rows, { onConflict: "car_id" });

      if (error) {
        console.warn("seedCatalogToSupabase chunk warning:", error.message);
        return { success: false, count, error: error.message };
      }

      count += slice.length;
      if (onProgress) onProgress(count, catalogCars.length);
    }

    return { success: true, count };
  } catch (err) {
    return { success: false, count: 0, error: (err as Error).message };
  }
}
