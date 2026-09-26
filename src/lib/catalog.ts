import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Diecast } from "@/lib/types";
import type { CatalogueCar } from "@/lib/catalogue-search";
import {
  catalogIdFor,
  setCatalogCodes,
  setCatalogIdEntries,
  setRawCodes,
  type CatalogCodeKind,
  type CatalogCodeRow,
} from "@/lib/car-id";
import rawDiecastData from "@/data/diecast.json";
import { syncCatalogCarToUserCars } from "@/lib/catalog-sync";

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
  /**
   * When this casting stopped being a pre-order — set by the database the first
   * time anybody moves their copy off PO.
   *
   * Null for everything released before that existed, which is why "Recently
   * released" reads this rather than release_status on its own: the status says
   * a casting is out, only the timestamp says it is news.
   */
  released_at?: string | null;
  /** Normal, TH, STH or Chase. Absent reads as Normal. */
  rarity?: string;
  /** For a pre-order: when it is expected, "YYYY-MM-DD". */
  expected_date?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  /** Who last corrected the entry. Null when nobody has since it was filed. */
  updated_by?: string | null;
  /**
   * This entry is a box of cars rather than one casting — a 5-pack, a Team
   * Transport pair. What is in it lives in tesoro_catalog_pack_members, and the
   * cars inside are ordinary catalogue entries in their own right.
   */
  is_multipack?: boolean;
  /**
   * How many cars the box holds as sold. Kept apart from the member count so a
   * part-filled pack can still say "3 of 5 listed".
   */
  pack_size?: number | null;
};

export type ReleaseStatus = "Released" | "Pre Order";

// v3: mix numbers left Sub Series, which changed 53 entry ids; an older cache
// would render the stale sub series until the fetch lands.
const CATALOG_STORAGE_KEY = "tesoro_car_catalog_cache.v3";
const CODES_STORAGE_KEY = "tesoro_catalog_codes_cache";
const RAW_CODES_STORAGE_KEY = "tesoro_raw_codes_cache";

const userHandleMap: Record<string, string> = {};
const userFirstNameMap: Record<string, string> = {};

/** Preloads user first names and user_id handles for known users so creator IDs are human readable. */
export async function loadUserHandles(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.from("tesoro_users").select("auth_uid, user_id, first_name");
    if (data) {
      for (const row of data) {
        const fName = (row.first_name || "").trim();
        const uId = (row.user_id || "").trim();
        if (row.auth_uid) {
          if (uId) userHandleMap[row.auth_uid] = uId;
          if (fName) userFirstNameMap[row.auth_uid] = fName;
        }
        if (uId) {
          userHandleMap[uId] = uId;
          if (fName) userFirstNameMap[uId] = fName;
        }
      }
    }
  } catch (e) {
    // Ignore fetch failures
  }
  return userFirstNameMap;
}

/** Resolves an auth_uid or creator string to the user's First Name (or falls back to handle/ID). */
export function resolveCatalogUserFirstName(raw: string | null | undefined): string {
  return resolveCatalogUserId(raw);
}

/** Resolves an auth_uid or creator string to a clean first name or user handle. */
export function resolveCatalogUserId(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return "System";
  const clean = raw.trim();
  if (userFirstNameMap[clean]) return userFirstNameMap[clean];
  if (userHandleMap[clean]) return userHandleMap[clean];
  const lower = clean.toLowerCase();
  for (const [k, v] of Object.entries(userFirstNameMap)) {
    if (k.toLowerCase() === lower) return v;
  }
  for (const [k, v] of Object.entries(userHandleMap)) {
    if (k.toLowerCase() === lower) return v;
  }
  // If it is a UUID:
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
    return clean.slice(0, 8);
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

/**
 * A catalogue entry as the Add a car form wants it: camelCase, and carrying the
 * entry's id so the car it fills in is pointed at the right casting.
 */
/**
 * Everything about a catalogue entry that somebody might search it by, as one
 * lowercase string.
 *
 * The pickers used to look at six fields — name, make, model, variant, brand,
 * series — which is fine until the car you are hunting for is the red one, or
 * #23, or the only 1:43 in the pack. Every field a person can read off the card
 * is in here, and the ID, because pasting one in is the fastest way to find an
 * exact entry. What is left out is what nobody searches by: the photograph's
 * URL, the timestamps, who edited it.
 */
export function catalogSearchText(c: CatalogCar): string {
  return [
    c.car_id,
    c.name,
    c.make,
    c.model,
    c.variant,
    c.year,
    c.colour,
    c.type,
    c.brand,
    c.assortment,
    c.series,
    c.sub_series,
    c.car_number,
    c.size,
    c.rarity,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Every word has to be in there somewhere, in any order: "red skyline". */
export function catalogMatches(c: CatalogCar, words: string[]): boolean {
  const hay = catalogSearchText(c);
  return words.every((w) => hay.includes(w));
}

export function catalogCarToCatalogueCar(c: CatalogCar): CatalogueCar {
  return {
    name: c.name || `${c.make} ${c.model}`.trim(),
    make: c.make,
    model: c.model,
    variant: c.variant || "",
    year: (c.year || "").replace(/\.0+$/, ""),
    colour: c.colour || "",
    type: c.type || "",
    brand: c.brand,
    assortment: c.assortment,
    series: c.series,
    subSeries: c.sub_series,
    carNumber: c.car_number,
    size: c.size || "1:64",
    rarity: c.rarity || "Normal",
    chase: (c.rarity || "Normal") !== "Normal",
    mrp: c.mrp,
    imageUrl: c.image_url || undefined,
    catalogId: c.car_id,
  };
}

/**
 * A catalogue entry shaped as a car, for the components that draw cars — the
 * thumbnail, the sub-line, the details drawer. It is not an owned row and has
 * no id of its own beyond the catalogue's, so it must not be saved.
 *
 * Lived in catalog.tsx until the details drawer needed it too.
 */
export function catalogCarToDiecast(c: CatalogCar): Diecast {
  return {
    id: c.car_id,
    name: c.name || `${c.make} ${c.model}`.trim(),
    make: c.make,
    model: c.model,
    variant: c.variant || "",
    year: c.year || "",
    colour: c.colour || "",
    type: c.type || "",
    brand: c.brand,
    assortment: c.assortment,
    series: c.series,
    subSeries: c.sub_series,
    carNumber: c.car_number,
    size: c.size || "1:64",
    mrp: c.mrp,
    spent: c.mrp,
    imageUrl: c.image_url || undefined,
    rarity: c.rarity || "Normal",
    chase: (c.rarity || "Normal") !== "Normal",
  } as unknown as Diecast;
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
    rows.push(...(res.data ?? []).map((r) => ({ ...r, kind: r.kind as CatalogCodeKind })));
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
        // Cast because the generated Supabase types predate this column. The
        // select is `*`, so the value is there; regenerating the whole types
        // file for one field would be a far bigger diff than the field.
        released_at: (row as { released_at?: string | null }).released_at ?? null,
        rarity: row.rarity || "Normal",
        expected_date: row.expected_date || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        created_by: row.created_by,
        updated_by: row.updated_by,
        is_multipack: Boolean(row.is_multipack),
        pack_size: row.pack_size ?? null,
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
      // Only when stated, for the same reason release_status is: saving a
      // casting from Add a car must not quietly un-flag a pack.
      ...(catalogCar.is_multipack !== undefined ? { is_multipack: catalogCar.is_multipack } : {}),
      ...(catalogCar.pack_size !== undefined ? { pack_size: catalogCar.pack_size } : {}),
      ...(catalogCar.created_at ? { created_at: catalogCar.created_at } : {}),
      // Only when stated: saving a casting from Add a car must not reset a
      // pre-order back to the column's Released default.
      ...(catalogCar.release_status ? { release_status: catalogCar.release_status } : {}),
      ...(catalogCar.rarity ? { rarity: catalogCar.rarity } : {}),
      ...(catalogCar.expected_date !== undefined
        ? { expected_date: catalogCar.expected_date }
        : {}),
      // Same rule again: only when stated. The database sets this itself the
      // first time a casting is marked Released, and Add a car saving an entry
      // it did not change must not wipe that.
      ...(catalogCar.released_at !== undefined ? { released_at: catalogCar.released_at } : {}),
    };

    const { error } = await supabase
      .from("tesoro_car_catalog")
      .upsert(payload, { onConflict: "car_id", ignoreDuplicates: !overwrite });

    if (error) {
      console.warn("saveCatalogCarToSupabase warning:", error.message);
      return { success: false, error: error.message };
    }

    // Auto-sync casting data to all users' cars and pre-orders
    if (overwrite) {
      void syncCatalogCarToUserCars(catalogCar);
    } else if (catalogCar.image_url !== undefined) {
      void syncCatalogImageToCars(catalogCar);
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
 * Automatically syncs an image from the catalogue to all cars belonging to that casting
 * across users' collections and the database.
 */
export async function syncCatalogImageToCars(catalogCar: CatalogCar): Promise<void> {
  const imageUrl = catalogCar.image_url?.trim() || null;
  const catalogId = catalogCar.car_id.trim();
  if (!catalogId) return;

  // 1. Notify client-side stores instantly
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("tesoro:image-synced", {
        detail: {
          catalogId,
          imageUrl,
          catalogCar,
          source: "catalog",
        },
      }),
    );
  }

  // 2. Direct Supabase update to tesoro_raw (table for user cars)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("tesoro_raw") as any)
      .update({ "Image URL": imageUrl })
      .or(`"Catalog ID".ilike.${catalogId},"Car ID".ilike.${catalogId}`);
  } catch (e) {
    console.warn("Direct tesoro_raw sync warning:", e);
  }

  // 3. Invoke backend endpoint to ensure service-role execution across all user collections
  try {
    void fetch("/api/sync-images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        catalog_id: catalogId,
        image_url: imageUrl,
        source: "catalog",
        make: catalogCar.make,
        model: catalogCar.model,
        variant: catalogCar.variant,
        series: catalogCar.series,
      }),
    }).catch(() => {});
  } catch {
    // Non-blocking
  }
}

/**
 * Automatically syncs an image from a user's car to the shared catalogue and
 * other cars of that casting.
 */
export async function syncUserCarImageToCatalog(car: Diecast, imageUrl: string): Promise<void> {
  const cleanImage = imageUrl?.trim() || null;
  if (!cleanImage) return;

  const catalogId = (car.catalogId || catalogIdFor(car) || "").trim();
  if (!catalogId) return;

  // 1. Update local catalogue cache immediately — but only when the casting has
  //    no picture at all. This runs on *every* car save, so writing it
  //    unconditionally meant the last person to photograph their copy decided
  //    what the casting looks like for everyone.
  const local = getLocalCatalog();
  const idx = local.findIndex((c) => c.car_id.toUpperCase() === catalogId.toUpperCase());
  const entryHadPhoto = idx >= 0 && Boolean((local[idx].image_url || "").trim());
  if (entryHadPhoto) return;
  if (idx >= 0) {
    local[idx] = { ...local[idx], image_url: cleanImage, updated_at: new Date().toISOString() };
    saveLocalCatalog(local);
  }

  // 2. Notify client-side stores instantly
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("tesoro:image-synced", {
        detail: {
          catalogId,
          imageUrl: cleanImage,
          car,
          source: "user_car",
        },
      }),
    );
  }

  // 3. Update tesoro_car_catalog in Supabase, and only where it is still blank.
  //    `is` rather than a read-then-write: two people photographing the same
  //    casting at once would both read null and both write, and the second would
  //    win for no reason.
  try {
    await supabase
      .from("tesoro_car_catalog")
      .update({ image_url: cleanImage, updated_at: new Date().toISOString() })
      .eq("car_id", catalogId)
      .or("image_url.is.null,image_url.eq.");
  } catch (e) {
    console.warn("Supabase tesoro_car_catalog image update warning:", e);
  }

  // Step 4 used to write this photo over the "Image URL" of every row sharing
  // the casting — yours and, where RLS allowed, other people's. It is gone. A
  // row's photo belongs to the row; a row with none reads the catalogue's at
  // display time (tesoroRawToDiecast), so nothing needs copying into it.

  // 5. Invoke backend endpoint for cross-user persistence
  try {
    void fetch("/api/sync-images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        catalog_id: catalogId,
        image_url: cleanImage,
        source: "user_car",
        make: car.make,
        model: car.model,
        variant: car.variant,
        series: car.series,
      }),
    }).catch(() => {});
  } catch {
    // Non-blocking
  }
}

/**
 * What is in every box, as one map from pack to its members in order.
 *
 * Fetched whole and separately rather than joined into the catalogue read: the
 * catalogue is paged a thousand rows at a time and only a few dozen of its
 * entries are packs, so a join would carry the cost on every page for nothing.
 * Membership is small enough to arrive in one go.
 */
export async function fetchPackMembers(): Promise<Record<string, string[]>> {
  try {
    const { data, error } = await supabase
      .from("tesoro_catalog_pack_members")
      .select("pack_car_id, member_car_id, position")
      .order("pack_car_id", { ascending: true })
      .order("position", { ascending: true });

    if (error) {
      console.warn("fetchPackMembers warning:", error.message);
      return {};
    }

    const out: Record<string, string[]> = {};
    for (const row of data ?? []) {
      (out[row.pack_car_id] ??= []).push(row.member_car_id);
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Replaces what is in a box.
 *
 * Delete-then-insert rather than a diff: a pack holds a handful of cars whose
 * order is part of the answer, and working out which rows moved is more code
 * than rewriting five of them. Admin only, which the database enforces.
 */
export async function savePackMembers(
  packCarId: string,
  memberCarIds: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error: clearError } = await supabase
      .from("tesoro_catalog_pack_members")
      .delete()
      .eq("pack_car_id", packCarId);
    if (clearError) return { success: false, error: clearError.message };

    const rows = memberCarIds
      .map((id) => id.trim())
      .filter(Boolean)
      .map((member_car_id, position) => ({ pack_car_id: packCarId, member_car_id, position }));

    if (rows.length === 0) return { success: true };

    const { error } = await supabase.from("tesoro_catalog_pack_members").insert(rows);
    if (error) return { success: false, error: error.message };
    return { success: true };
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
): Promise<{ deleted: boolean; uses: number; packs: number; error?: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("delete_catalog_entry", {
      _car_id: carId,
    });
    if (error) return { deleted: false, uses: 0, packs: 0, error: error.message };

    const res = (data ?? {}) as { deleted?: boolean; uses?: number; packs?: number };
    if (res.deleted) {
      const clean = carId.trim().toUpperCase();
      saveLocalCatalog(getLocalCatalog().filter((c) => c.car_id.toUpperCase() !== clean));
    }
    return {
      deleted: Boolean(res.deleted),
      uses: Number(res.uses) || 0,
      // A casting inside a box is in use the same way a casting somebody owns
      // is: the pack would be left claiming contents it no longer has.
      packs: Number(res.packs) || 0,
    };
  } catch (err) {
    return { deleted: false, uses: 0, packs: 0, error: (err as Error).message };
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

export type CatalogCarOwner = {
  auth_uid: string;
  user_id: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name: string;
  date_added: string;
  /**
   * Which box theirs came in. The same casting is often catalogued twice — a
   * Blister and a Qube Carz, a Mainline and a 5 Pack — and "who owns this" is
   * a different answer for each, so an owner carries the one they bought.
   */
  assortment?: string;
};

/** Same casting, different box: brand, make, model, variant, colour and year. */
const castingKey = (c: CatalogCar) =>
  [c.brand, c.make, c.model, c.variant, c.colour, c.year]
    .map((v) => (v || "").trim().toLowerCase())
    .join("|");

/**
 * Every catalogue entry for the casting this one is, its own first.
 *
 * Two entries that differ only by assortment are one casting sold in two
 * packages, and the details page has to be able to say so: each carries its own
 * ID, its own filing date and its own owners.
 */
export function castingSiblings(entry: CatalogCar, catalog: CatalogCar[]): CatalogCar[] {
  const key = castingKey(entry);
  const rest = catalog.filter((c) => c.car_id !== entry.car_id && castingKey(c) === key);
  if (rest.length === 0) return [entry];
  rest.sort((a, b) => (a.assortment || "").localeCompare(b.assortment || ""));
  return [entry, ...rest];
}

/**
 * Who owns any of these entries, each row carrying the one they own.
 *
 * Somebody with both the Blister and the Qube Carz is two rows and one person,
 * which is what the list and the count respectively want to say.
 */
export async function getCastingOwners(
  entries: CatalogCar[],
  optionsFor: (entry: CatalogCar) => CatalogCarOwnerOptions,
): Promise<CatalogCarOwner[]> {
  const lists = await Promise.all(
    entries.map(async (entry) =>
      (await getCatalogCarOwners(entry.car_id, optionsFor(entry))).map((owner) => ({
        ...owner,
        assortment: entry.assortment || "",
      })),
    ),
  );

  const seen = new Set<string>();
  const out: CatalogCarOwner[] = [];
  for (const owner of lists.flat()) {
    const key = `${owner.auth_uid}@${owner.assortment}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(owner);
  }
  return out;
}

/** How many people, however many boxes they own it in. */
export function ownerCount(owners: CatalogCarOwner[]): number {
  return new Set(owners.map((o) => o.auth_uid)).size;
}

export type CatalogCarOwnerOptions = {
  catalogCar?: CatalogCar | null;
  isOwned?: boolean;
  currentUser?: {
    uid: string;
    email?: string | null;
    profile?: {
      user_id?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      created_at?: string | null;
    } | null;
  } | null;
  userCar?: Diecast | null;
};

/**
 * Fetches the list of users who have added a given casting to their collection.
 * Admin only. Tries database RPC `catalog_car_owners` first, then direct table query,
 * API route, and current user collection state.
 */
export async function getCatalogCarOwners(
  carId: string,
  options?: CatalogCarOwnerOptions,
): Promise<CatalogCarOwner[]> {
  const cleanId = (carId || "").trim();
  const ownersMap = new Map<string, CatalogCarOwner>();

  if (cleanId) {
    try {
      // 1. Database RPC
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("catalog_car_owners", {
        _car_id: cleanId,
      });

      if (!error && Array.isArray(data) && data.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.forEach((row: any) => {
          const parts = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
          const uid = row.auth_uid || row.user_id;
          if (uid) {
            ownersMap.set(uid, {
              auth_uid: row.auth_uid,
              user_id: row.user_id || "",
              first_name: row.first_name || null,
              last_name: row.last_name || null,
              display_name: parts || row.user_id || "Collector",
              date_added: row.date_added || "—",
            });
          }
        });
      }
    } catch {
      // ignore
    }

    // 2. Direct Supabase query if RPC yielded no results
    if (ownersMap.size === 0) {
      try {
        let { data: rawCars } = await supabase
          .from("tesoro_raw")
          .select('user_id, "Date", "O_Date", "Catalog ID", "Car ID", Make, Model, Brand')
          .or(`"Catalog ID".ilike.${cleanId},"Car ID".ilike.${cleanId}`);

        if (
          (!rawCars || rawCars.length === 0) &&
          options?.catalogCar?.make &&
          options?.catalogCar?.model
        ) {
          const { data: byModel } = await supabase
            .from("tesoro_raw")
            .select('user_id, "Date", "O_Date", "Catalog ID", "Car ID", Make, Model, Brand')
            .ilike("Make", options.catalogCar.make)
            .ilike("Model", options.catalogCar.model);
          if (byModel && byModel.length > 0) {
            rawCars = options.catalogCar.brand
              ? byModel.filter(
                  (c: { Brand?: string | null }) =>
                    !c.Brand || c.Brand.toLowerCase() === options.catalogCar?.brand?.toLowerCase(),
                )
              : byModel;
          }
        }

        if (rawCars && rawCars.length > 0) {
          const userDateMap = new Map<string, string>();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const r of rawCars as any[]) {
            if (!r.user_id) continue;
            const d = (r.Date || r.O_Date || "").trim();
            const existing = userDateMap.get(r.user_id);
            if (!existing || (d && d > existing)) {
              userDateMap.set(r.user_id, d || existing || "—");
            }
          }
          const uids = Array.from(userDateMap.keys());
          if (uids.length > 0) {
            const { data: usersData } = await supabase
              .from("tesoro_users")
              .select("auth_uid, user_id, first_name, last_name, created_at")
              .in("auth_uid", uids);

            for (const u of usersData ?? []) {
              if (!u.auth_uid) continue;
              const parts = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
              const rawDate = userDateMap.get(u.auth_uid);
              const createdAt = u.created_at
                ? new Date(u.created_at).toISOString().slice(0, 10)
                : "—";
              ownersMap.set(u.auth_uid, {
                auth_uid: u.auth_uid,
                user_id: u.user_id || "",
                first_name: u.first_name || null,
                last_name: u.last_name || null,
                display_name: parts || u.user_id || "Collector",
                date_added: rawDate && rawDate !== "—" ? rawDate : createdAt,
              });
            }
          }
        }
      } catch (err) {
        console.warn("Direct tesoro_raw query failed:", err);
      }
    }

    // 3. Server route fallback if still empty
    if (ownersMap.size === 0) {
      try {
        const urlParams = new URLSearchParams({ car_id: cleanId });
        if (options?.catalogCar?.make) urlParams.set("make", options.catalogCar.make);
        if (options?.catalogCar?.model) urlParams.set("model", options.catalogCar.model);
        if (options?.catalogCar?.brand) urlParams.set("brand", options.catalogCar.brand);
        const res = await fetch(`/api/catalog-owners?${urlParams.toString()}`);
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.owners)) {
            for (const o of json.owners) {
              const uid = o.auth_uid || o.user_id;
              if (uid && !ownersMap.has(uid)) {
                ownersMap.set(uid, o);
              }
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // 4. Current user ownership: if current user owns this car, ensure they are in the list
  if (options?.isOwned || options?.userCar) {
    const cu = options?.currentUser;
    const uid = cu?.uid || cu?.profile?.user_id || "current-user";
    const existing = ownersMap.get(uid);
    if (!existing) {
      const profile = cu?.profile;
      const parts = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
      const userDate =
        options.userCar?.date ||
        options.userCar?.orderDate ||
        (profile?.created_at ? new Date(profile.created_at).toISOString().slice(0, 10) : "—");
      ownersMap.set(uid, {
        auth_uid: uid,
        user_id: profile?.user_id || cu?.email?.split("@")[0] || "You",
        first_name: profile?.first_name || null,
        last_name: profile?.last_name || null,
        display_name: parts || profile?.user_id || cu?.email?.split("@")[0] || "You",
        date_added: userDate || "—",
      });
    }
  }

  return Array.from(ownersMap.values()).sort((a, b) =>
    (b.date_added || "").localeCompare(a.date_added || ""),
  );
}

/**
 * Checks if a Diecast car from the user's collection matches a catalog car.
 * Handles exact IDs, calculated catalog IDs, and fuzzy matching for make/model/series/brand.
 */
export function isCarMatchingCatalog(
  c: Diecast | null | undefined,
  catalogCar: CatalogCar | null | undefined,
): boolean {
  if (!c || !catalogCar) return false;

  // 1. Direct ID matches (unless colour or variant explicitly conflict)
  const catId = (catalogCar.car_id || "").trim().toUpperCase();
  if (catId) {
    const cCol = (c.colour || "").trim().toLowerCase();
    const catCol = (catalogCar.colour || "").trim().toLowerCase();
    const colorsConflict = Boolean(cCol && catCol && cCol !== catCol);

    if (!colorsConflict) {
      if ((c.catalogId || "").trim().toUpperCase() === catId) return true;
      if ((c.id || "").trim().toUpperCase() === catId) return true;
      if ((c.carId || "").trim().toUpperCase() === catId) return true;
      try {
        if (catalogIdFor(c).toUpperCase() === catId) return true;
      } catch {
        // ignore
      }
    }
  }

  // 2. Normalize helper: strip non-alphanumeric, remove leading apostrophes ('18 -> 18)
  const norm = (s: string | null | undefined) =>
    (s || "")
      .toLowerCase()
      .replace(/['"’`]/g, "")
      .replace(/[^a-z0-9]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const cBrand = norm(c.brand);
  const catBrand = norm(catalogCar.brand);

  // If brands are specified on both and differ, they don't match
  if (cBrand && catBrand && cBrand !== catBrand) {
    return false;
  }

  const cMake = norm(c.make);
  const catMake = norm(catalogCar.make);
  const cModel = norm(c.model);
  const catModel = norm(catalogCar.model);
  const cName = norm(c.name || `${c.make || ""} ${c.model || ""}`);
  const catName = norm(catalogCar.name || `${catalogCar.make || ""} ${catalogCar.model || ""}`);

  // Check make compatibility
  const makeMatch =
    !cMake || !catMake || cMake === catMake || catName.includes(cMake) || cName.includes(catMake);

  if (!makeMatch) return false;

  // Check model / name match
  const modelMatch =
    (cModel &&
      catModel &&
      (cModel === catModel || cModel.includes(catModel) || catModel.includes(cModel))) ||
    (cName &&
      catName &&
      (cName === catName || cName.includes(catName) || catName.includes(cName))) ||
    (cModel && catName.includes(cModel)) ||
    (catModel && cName.includes(catModel));

  if (!modelMatch) return false;

  // Check series / assortment: if one is Tuning and brand is CCA, or matching series/assortment
  const cSeries = norm(c.series);
  const cAssort = norm(c.assortment);
  const catSeries = norm(catalogCar.series);

  // If catalog specifies series, check if user's car has that anywhere in series/assortment/name
  if (catSeries && catSeries !== "all" && catSeries !== "none") {
    const userHasSeries =
      !cSeries ||
      cSeries === catSeries ||
      cAssort === catSeries ||
      cName.includes(catSeries) ||
      catName.includes(cSeries);
    if (!userHasSeries) return false;
  }

  /**
   * Word-wise agreement, so one side may be the fuller spelling of the other.
   * "Red" and "Spectraflame Red" are the same colour said two ways; "White"
   * and "Yellow" are not. Compared as words rather than as substrings, because
   * "red" is inside "predator" and that is not a colour anyone meant.
   *
   * A field only speaks when both sides state it: half the catalogue says
   * nothing about a variant, and silence is not disagreement.
   */
  const agrees = (a: string, b: string) => {
    if (!a || !b || a === b) return true;
    const A = new Set(a.split(" "));
    const B = new Set(b.split(" "));
    const [few, many] = A.size <= B.size ? [A, B] : [B, A];
    for (const word of few) if (!many.has(word)) return false;
    return true;
  };

  // What actually separates one catalogue entry from another once the make,
  // model and series agree. Without these a white Supra matched the yellow one
  // and the catalogue marked both of them owned.
  if (!agrees(norm(c.colour), norm(catalogCar.colour))) return false;
  if (!agrees(norm(c.variant), norm(catalogCar.variant))) return false;
  if (!agrees(cAssort, norm(catalogCar.assortment))) return false;

  return true;
}

/** Who holds the cars a merge would move, and how many each. */
export type MergePreview = {
  cars: number;
  owners: { user_id: string; cars: number }[];
  packs: number;
};

/** Admin only: what merging these entries away would touch. */
export async function catalogMergePreview(dropIds: string[]): Promise<MergePreview> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("catalog_merge_preview", {
    _drop_ids: dropIds,
  });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Partial<MergePreview>;
  return { cars: Number(d.cars) || 0, owners: d.owners ?? [], packs: Number(d.packs) || 0 };
}

/**
 * Admin only: move every car off the listed entries onto the one being kept,
 * then remove them. Only rows pointing at a listed entry are touched.
 */
export async function mergeCatalogEntries(
  keepId: string,
  dropIds: string[],
): Promise<{ merged: number; cars: number; members: number; packs: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("merge_catalog_entries", {
    _keep_id: keepId,
    _drop_ids: dropIds,
  });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    merged: Number(d.merged) || 0,
    cars: Number(d.cars) || 0,
    members: Number(d.members) || 0,
    packs: Number(d.packs) || 0,
  };
}
