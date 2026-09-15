import type { Diecast } from "@/lib/types";

/**
 * -----------------------------------------------------------------------------
 * Tesoro Car Catalog ID Generator
 *
 * Every diecast casting receives a globally unique, deterministic Car ID
 * generated strictly from its 8 core manufacturing and release specifications:
 *
 *   1. Brand (e.g. HW, MBX, MGT, KH, INNO, DIS)
 *   2. Make (e.g. PORSCHE, NISSAN, CHEVROLET)
 *   3. Model (e.g. 911GT3RS, SKYLINE, SILVERADO)
 *   4. Assortment (e.g. MNL, PRM, BSC, CC, BLVD)
 *   5. Series (e.g. HWEXOTICS, TOONED, FACTORYFRESH)
 *   6. Sub Series (e.g. 2OF10, HWGETAWAY, 02-05)
 *   7. Car Number (e.g. 042-250, 2024, 42)
 *   8. MRP (e.g. M179, M549, M0)
 *
 * Format:
 *   [BRAND]-[MAKE]-[MODEL]-[ASST]-[SERIES]-[SUBSERIES]-[CARNUM]-[MRP]
 *
 * Because this Car ID is deterministic and unique to the car's specifications,
 * identical castings share the exact same catalog Car ID. In the raw table
 * (tesoro_raw), this ID is reused across multiple instances or purchases,
 * avoiding duplication of car specifications in the main table.
 * -----------------------------------------------------------------------------
 */

export type CarIdFields = {
  brand?: string | null;
  make?: string | null;
  model?: string | null;
  assortment?: string | null;
  series?: string | null;
  subSeries?: string | null;
  carNumber?: string | null;
  mrp?: number | string | null;
};

const BRAND_MAP: Record<string, string> = {
  "HOT WHEELS": "HW",
  HOTWHEELS: "HW",
  MATCHBOX: "MBX",
  "MINI GT": "MGT",
  MINIGT: "MGT",
  "KAIDO HOUSE": "KH",
  KAIDOHOUSE: "KH",
  INNO64: "INNO",
  "INNO 64": "INNO",
  "POP RACE": "POPR",
  POPRACE: "POPR",
  TOMICA: "TOM",
  MAJORETTE: "MAJ",
  GREENLIGHT: "GL",
  "TARMAC WORKS": "TW",
  TARMACWORKS: "TW",
  DISNEY: "DIS",
  MAISTO: "MAI",
  BBURAGO: "BBUR",
  "TAKARA TOMY": "TOMY",
  TAKARATOMY: "TOMY",
  GCD: "GCD",
  "GCD MODEL": "GCD",
  JADA: "JADA",
  SIKU: "SIKU",
  THOMAS: "THOM",
  CCA: "CCA",
};

const ASSORTMENT_MAP: Record<string, string> = {
  MAINLINE: "MNL",
  PREMIUM: "PRM",
  BASIC: "BSC",
  "CAR CULTURE": "CC",
  BOULEVARD: "BLVD",
  BOX: "BOX",
  BLISTER: "BLST",
  REPLICA: "REPL",
  "5 PACK": "5PK",
  "10 PACK": "10PK",
};

/** Normalizes a text string into an alphanumeric, uppercase, hyphen-delimited token. */
export function sanitizeToken(
  str: string | null | undefined,
  maxLen = 16,
  fallback = "NA",
): string {
  if (!str) return fallback;
  const cleaned = String(str)
    .trim()
    .toUpperCase()
    .replace(/[/]/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned ? cleaned.slice(0, maxLen) : fallback;
}

/** Standardizes Brand into a concise, recognizable uppercase code. */
export function brandCode(brand: string | null | undefined): string {
  if (!brand) return "GEN";
  const upper = brand.trim().toUpperCase();
  if (BRAND_MAP[upper]) return BRAND_MAP[upper];
  const cleaned = upper.replace(/[^A-Z0-9]/g, "");
  return cleaned ? cleaned.slice(0, 6) : "GEN";
}

/** Standardizes Assortment into a concise, recognizable uppercase code. */
export function assortmentCode(assortment: string | null | undefined): string {
  if (!assortment) return "STD";
  const upper = assortment.trim().toUpperCase();
  if (ASSORTMENT_MAP[upper]) return ASSORTMENT_MAP[upper];
  const cleaned = upper.replace(/[^A-Z0-9]/g, "");
  return cleaned ? cleaned.slice(0, 6) : "STD";
}

/**
 * Generates a unique, deterministic Car ID using:
 * Brand, Make, Model, Assortment, Series, Sub Series, Car Number, MRP.
 */
export function generateCatalogCarId(car: CarIdFields): string {
  const brand = brandCode(car.brand);
  const make = sanitizeToken(car.make, 12, "GEN");
  const model = sanitizeToken(car.model, 16, "CAR");
  const asst = assortmentCode(car.assortment);
  const series = sanitizeToken(car.series, 14, "STD");
  const subSeries = sanitizeToken(car.subSeries, 12, "NA");
  const carNumber = sanitizeToken(car.carNumber, 12, "NA");
  const mrpNum = Math.round(Number(car.mrp) || 0);
  const mrp = `M${mrpNum}`;

  return `${brand}-${make}-${model}-${asst}-${series}-${subSeries}-${carNumber}-${mrp}`;
}

/**
 * True for an ID the app minted as a temporary placeholder rather than one that carries
 * real catalog meaning.
 */
export function isPlaceholderId(id: string | undefined | null): boolean {
  const v = (id ?? "").trim();
  return (
    v === "" ||
    /^user-/i.test(v) ||
    /^car-/i.test(v) ||
    /^guest-/i.test(v) ||
    /^temp-/i.test(v) ||
    /^draft-/i.test(v)
  );
}

/**
 * Checks if a string conforms to the catalog unique Car ID pattern.
 */
export function isCatalogCarId(id: string | undefined | null): boolean {
  if (!id) return false;
  // Brand-Make-Model-Asst-Series-SubSeries-CarNum-M{mrp}
  return /^[A-Z0-9]+-[A-Z0-9-]+-[A-Z0-9-]+-[A-Z0-9]+-[A-Z0-9-]+-[A-Z0-9-]+-[A-Z0-9-]+-M\d+$/i.test(
    id.trim(),
  );
}

/**
 * Derives the unique Car ID for a diecast item. If the car already has a valid catalog
 * Car ID or legacy ID, it preserves it; otherwise it derives the unique Car ID using
 * Brand, Make, Model, Assortment, Series, Sub Series, Car Number, MRP.
 *
 * If a matching car with identical 8 fields exists in the existing collection or catalog,
 * its exact ID is reused to prevent duplicate records in the raw table.
 */
export function carIdFor(car: Diecast | CarIdFields, existingCars: Diecast[] = []): string {
  // If the car has a non-placeholder ID, reuse it
  const currentId = "id" in car ? car.id : "";
  if (currentId && !isPlaceholderId(currentId)) {
    return currentId.trim();
  }

  // If a car in existing collection matches all 8 attributes, reuse its ID directly!
  const targetBrand = (car.brand || "").trim().toLowerCase();
  const targetMake = (car.make || "").trim().toLowerCase();
  const targetModel = (car.model || "").trim().toLowerCase();
  const targetAsst = (car.assortment || "").trim().toLowerCase();
  const targetSeries = (car.series || "").trim().toLowerCase();
  const targetSubSeries = (car.subSeries || "").trim().toLowerCase();
  const targetCarNum = (car.carNumber || "").trim().toLowerCase();
  const targetMrp = Math.round(Number(car.mrp) || 0);

  if (targetMake || targetModel) {
    const match = existingCars.find((existing) => {
      if (isPlaceholderId(existing.id)) return false;
      return (
        (existing.brand || "").trim().toLowerCase() === targetBrand &&
        (existing.make || "").trim().toLowerCase() === targetMake &&
        (existing.model || "").trim().toLowerCase() === targetModel &&
        (existing.assortment || "").trim().toLowerCase() === targetAsst &&
        (existing.series || "").trim().toLowerCase() === targetSeries &&
        (existing.subSeries || "").trim().toLowerCase() === targetSubSeries &&
        (existing.carNumber || "").trim().toLowerCase() === targetCarNum &&
        Math.round(Number(existing.mrp) || 0) === targetMrp
      );
    });

    if (match && match.id) {
      return match.id.trim();
    }
  }

  // Generate the new unique catalog Car ID
  return generateCatalogCarId(car);
}

/**
 * Assigns unique catalog IDs to a batch of new cars, ensuring that identical castings
 * reuse the exact same catalog Car ID to eliminate duplication in the raw table.
 */
export function assignCarIds(newCars: Diecast[], existing: Diecast[] = []): Diecast[] {
  const pool = [...existing];
  return newCars.map((car) => {
    if (car.id && !isPlaceholderId(car.id)) {
      pool.push(car);
      return car;
    }
    const id = carIdFor(car, pool);
    const next = id ? { ...car, id } : car;
    pool.push(next);
    return next;
  });
}
