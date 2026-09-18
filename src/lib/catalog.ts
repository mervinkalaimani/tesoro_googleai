import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Diecast } from "@/lib/types";
import {
  catalogIdFor,
  setCatalogCodes,
  setCatalogIdEntries,
  setRawCodes,
  type CatalogCodeKind,
  type CatalogCodeRow,
} from "@/lib/car-id";
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
  /** Out in shops, or only open to pre-order so far. Absent reads as Released. */
  release_status?: ReleaseStatus;
  /** Normal, TH, STH or Chase. Absent reads as Normal. */
  rarity?: string;
  /** For a pre-order: when it is expected, "YYYY-MM-DD". */
  expected_date?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  /** Who last corrected the entry. Null when nobody has since it was filed. */
  updated_by?: string | null;
};

export type ReleaseStatus = "Released" | "Pre Order";

// v3: mix numbers left Sub Series, which changed 53 entry ids; an older cache
// would render the stale sub series until the fetch lands.
const CATALOG_STORAGE_KEY = "tesoro_car_catalog_cache.v3";
const CODES_STORAGE_KEY = "tesoro_catalog_codes_cache";
const RAW_CODES_STORAGE_KEY = "tesoro_raw_codes_cache";

const userHandleMap: Record<string, string> = {};

/** Preloads user_id handles for known auth_uids so creator IDs are human readable. */
export async function loadUserHandles(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.from("tesoro_users").select("auth_uid, user_id");
    if (data) {
      for (const row of data) {
        if (row.auth_uid && row.user_id) {
          userHandleMap[row.auth_uid] = row.user_id;
        }
      }
    }
  } catch (e) {
    // Ignore fetch failures
  }
  return userHandleMap;
}

/** Resolves an auth_uid or creator string to a clean user_id handle. */
export function resolveCatalogUserId(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return "system";
  const clean = raw.trim();
  if (userHandleMap[clean]) return userHandleMap[clean];
  // If it is a UUID:
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
    return userHandleMap[clean] || clean.slice(0, 8);
  }
  return clean;
}

/** Extracts unique catalog castings from any list of Diecast cars. */
export function extractCatalogFromCars(cars: Diecast[]): CatalogCar[] {
  const map = new Map<string, CatalogCar>();

  for (const car of cars) {
    if (!car.make && !car.model && !car.name) continue;
    const car_id = catalogIdFor(car);

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
  const car_id = catalogIdFor(car);
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
      if (Array.isArray(parsed) && parsed.length > 0) {
        setCatalogIdEntries(parsed);
        loadCachedCodes();
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to parse cached catalog from localStorage:", e);
  }

  const bundled = extractCatalogFromCars(rawDiecastData as unknown as Diecast[]);
  saveLocalCatalog(bundled);
  return bundled;
}

/** The codes behind the Car IDs, from tesoro_catalog_codes. */
async function fetchCatalogCodes(): Promise<void> {
  const rows: CatalogCodeRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const res = await supabase
      .from("tesoro_catalog_codes")
      .select("kind, parent_key, value_key, code")
      .order("kind")
      .order("parent_key")
      .order("code")
      .range(from, from + PAGE - 1);
    if (res.error) return;
    rows.push(
      ...(res.data ?? []).map((r) => ({ ...r, kind: r.kind as CatalogCodeKind })),
    );
    if (!res.data || res.data.length < PAGE) break;
  }
  setCatalogCodes(rows);
  try {
    localStorage.setItem(CODES_STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // The codes are read again on the next load.
  }
}

function loadCachedCodes() {
  try {
    const cached = localStorage.getItem(CODES_STORAGE_KEY);
    if (cached) setCatalogCodes(JSON.parse(cached) as CatalogCodeRow[]);
    const cachedRaw = localStorage.getItem(RAW_CODES_STORAGE_KEY);
    if (cachedRaw) setRawCodes(JSON.parse(cachedRaw) as RawCodeRow[]);
  } catch {
    // Codes still come back with the catalogue fetch.
  }
}

type RawCodeRow = { kind: "brand" | "assortment"; value_key: string; code: string };

/** The brand and assortment codes a Car ID is written from (tesoro_raw_codes). */
async function fetchRawCodes(): Promise<void> {
  const res = await supabase.from("tesoro_raw_codes").select("kind, value_key, code");
  if (res.error || !res.data) return;
  const rows = res.data.map((r) => ({ ...r, kind: r.kind as RawCodeRow["kind"] }));
  setRawCodes(rows);
  try {
    localStorage.setItem(RAW_CODES_STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // Read again on the next load.
  }
}

/** Caches catalog to localStorage. */
export function saveLocalCatalog(catalog: CatalogCar[]): void {
  setCatalogIdEntries(catalog);
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
    void loadUserHandles();
    void fetchCatalogCodes();
    void fetchRawCodes();
    // Paged: a single select stops at the API's 1,000-row cap, and the
    // catalogue is past that.
    const PAGE = 1000;
    const data: Database["public"]["Tables"]["tesoro_car_catalog"]["Row"][] = [];
    let error: { message: string } | null = null;
    for (let from = 0; ; from += PAGE) {
      const res = await supabase
        .from("tesoro_car_catalog")
        .select("*")
        .order("brand", { ascending: true })
        .order("make", { ascending: true })
        .order("model", { ascending: true })
        .order("car_id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (res.error) {
        error = res.error;
        break;
      }
      data.push(...(res.data ?? []));
      if (!res.data || res.data.length < PAGE) break;
    }

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
        release_status: row.release_status === "Pre Order" ? "Pre Order" : "Released",
        rarity: row.rarity || "Normal",
        expected_date: row.expected_date || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        created_by: row.created_by,
        updated_by: row.updated_by,
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
 * Files a casting in `tesoro_car_catalog`.
 *
 * By default only a casting the catalogue has not seen is added: an existing
 * entry is the catalogue's to describe, and saving a car never rewrites it.
 * `overwrite` is the admin edit — the database allows it for admins only, and
 * pushes the change into every car linked to the entry.
 */
export async function saveCatalogCarToSupabase(
  catalogCar: CatalogCar,
  { overwrite = false }: { overwrite?: boolean } = {},
): Promise<{ success: boolean; error?: string; saved?: CatalogCar }> {
  try {
    // 1. Update local cache immediately
    const local = getLocalCatalog();
    const idx = local.findIndex((c) => c.car_id === catalogCar.car_id);
    if (idx >= 0) {
      if (overwrite) {
        local[idx] = { ...local[idx], ...catalogCar, updated_at: new Date().toISOString() };
      }
    } else {
      local.unshift(catalogCar);
    }
    saveLocalCatalog(local);

    // 2. Persist to Supabase tesoro_car_catalog
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id ?? null;
    // created_by is a uuid column: a handle or "system" would fail the whole
    // write. The readable handle is resolved on display instead.
    const isUuid = (v?: string | null) =>
      !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    const effectiveCreatedBy = isUuid(catalogCar.created_by) ? catalogCar.created_by : userId;

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
      created_by: effectiveCreatedBy,
      updated_at: new Date().toISOString(),
      // Only on an edit. A fresh entry has a creator and no editor, and saying
      // it was "updated by" the person who filed it a second ago reads as a
      // change that never happened.
      ...(overwrite ? { updated_by: userId } : {}),
      ...(catalogCar.created_at ? { created_at: catalogCar.created_at } : {}),
      // Only when stated: saving a casting from Add a car must not reset a
      // pre-order back to the column's Released default.
      ...(catalogCar.release_status ? { release_status: catalogCar.release_status } : {}),
      ...(catalogCar.rarity ? { rarity: catalogCar.rarity } : {}),
      ...(catalogCar.expected_date !== undefined
        ? { expected_date: catalogCar.expected_date }
        : {}),
    };

    const { error } = await supabase
      .from("tesoro_car_catalog")
      .upsert(payload, { onConflict: "car_id", ignoreDuplicates: !overwrite });

    if (error) {
      console.warn("saveCatalogCarToSupabase warning:", error.message);
      return { success: false, error: error.message };
    }

    // What actually landed, so the list can show the new "Updated by" without
    // waiting for the next fetch to tell it something it already knows.
    return {
      success: true,
      saved: {
        ...catalogCar,
        created_by: effectiveCreatedBy,
        updated_at: payload.updated_at,
        ...(overwrite ? { updated_by: userId } : {}),
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * How many cars, across every collection, are linked to a catalogue entry.
 *
 * Owner only — it counts rows no single account can read — and the reason the
 * delete below can refuse before it is pressed. Returns null when the question
 * cannot be answered, which is not the same as zero and must never be treated
 * as "safe to remove".
 */
export async function catalogEntryUsage(carId: string): Promise<number | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("catalog_entry_usage", {
      _car_id: carId,
    });
    if (error) return null;
    return Number(data) || 0;
  } catch {
    return null;
  }
}

/**
 * Removes a casting from the catalogue.
 *
 * The rule — an entry any car is linked to cannot be removed — lives in the
 * database, not here: `delete_catalog_entry` counts and deletes in the one
 * statement, so the count cannot go stale between the check and the delete, and
 * a client that skipped the check would be refused anyway. `uses` comes back
 * when it declined, for a message that says why.
 */
export async function deleteCatalogCarFromSupabase(
  carId: string,
): Promise<{ deleted: boolean; uses: number; error?: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("delete_catalog_entry", {
      _car_id: carId,
    });
    if (error) return { deleted: false, uses: 0, error: error.message };

    const res = (data ?? {}) as { deleted?: boolean; uses?: number };
    if (res.deleted) {
      const clean = carId.trim().toUpperCase();
      saveLocalCatalog(getLocalCatalog().filter((c) => c.car_id.toUpperCase() !== clean));
    }
    return { deleted: Boolean(res.deleted), uses: Number(res.uses) || 0 };
  } catch (err) {
    return { deleted: false, uses: 0, error: (err as Error).message };
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

      // New castings only: existing entries are the catalogue's, not the seed's.
      const { error } = await supabase
        .from("tesoro_car_catalog")
        .upsert(rows, { onConflict: "car_id", ignoreDuplicates: true });

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
