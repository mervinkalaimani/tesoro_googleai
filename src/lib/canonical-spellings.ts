import type { Diecast } from "@/lib/types";

/**
 * One spelling per name.
 *
 * Typed-in names drift: "KA Diecast", "KA diecast" and "Ka  diecast " are the
 * same seller, but every filter, group and count that compares strings treats
 * them as three. Rather than teach each of those places to compare loosely, the
 * collection is normalised once, where it is assembled: every variant of a name
 * takes the spelling of the earliest car that used it.
 *
 * "Earliest" is the lowest serial number — the order the collection was
 * catalogued in — so the spelling does not flip as new cars arrive.
 *
 * Status and payment are left alone on purpose: code branches on their exact
 * values ("Available"), and a first entry typed "available" would break it.
 */
const FIELDS = [
  "seller",
  "brand",
  "make",
  "model",
  "variant",
  "colour",
  "type",
  "assortment",
  "series",
  "subSeries",
  "size",
  "deliveryPartner",
] as const satisfies readonly (keyof Diecast)[];

type Field = (typeof FIELDS)[number];

/** Case, and runs of whitespace, are not part of a name. */
export function spellingKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function canonicaliseSpellings(cars: Diecast[]): Diecast[] {
  if (cars.length === 0) return cars;

  const ordered = [...cars].sort(
    (a, b) => (a.sno ?? Number.MAX_SAFE_INTEGER) - (b.sno ?? Number.MAX_SAFE_INTEGER),
  );

  const first = new Map<Field, Map<string, string>>();
  for (const field of FIELDS) first.set(field, new Map());
  for (const car of ordered) {
    for (const field of FIELDS) {
      const raw = car[field];
      if (typeof raw !== "string" || !raw.trim()) continue;
      const seen = first.get(field)!;
      const key = spellingKey(raw);
      if (!seen.has(key)) seen.set(key, raw.trim().replace(/\s+/g, " "));
    }
  }

  // Only cars that actually change get a new object, so everything memoised on
  // a car's identity keeps working for the other fourteen hundred.
  return cars.map((car) => {
    let next: Diecast | null = null;
    for (const field of FIELDS) {
      const raw = car[field];
      if (typeof raw !== "string" || !raw.trim()) continue;
      const canonical = first.get(field)!.get(spellingKey(raw));
      if (canonical !== undefined && canonical !== raw) {
        next ??= { ...car };
        (next as Record<Field, string | undefined>)[field] = canonical;
      }
    }
    return next ?? car;
  });
}
