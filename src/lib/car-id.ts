import type { Diecast } from "@/lib/types";

/**
 * Car IDs, derived rather than typed:
 *
 *   BRAND / ASSORTMENT / NNN
 *
 * where BRAND is the first three letters of the brand, ASSORTMENT is the first
 * three consonants of the assortment, and NNN counts cars already sharing that
 * pair. "Disney" + "Premium" gives DIS/PRM/001; "CCA" + "Box" gives CCA/BOX/001.
 *
 * The ID is a primary key — Supabase upserts resolve on ("user_id", "Car ID") —
 * so it is assigned once, when a car is created, and never re-derived. Editing a
 * car's brand would otherwise strand the original row and insert a second one
 * under the new ID.
 */

const VOWELS = "AEIOU";

/** Letters only, uppercased. Spaces, digits and punctuation never reach an ID. */
function letters(value: string | undefined): string {
  return (value ?? "").replace(/[^a-zA-Z]/g, "").toUpperCase();
}

/** "Disney" -> "DIS". Shorter brands return what they have. */
export function brandCode(brand: string | undefined): string {
  return letters(brand).slice(0, 3);
}

/**
 * "Premium" -> "PRM", dropping vowels. "Box" is the documented exception: it
 * keeps its vowel rather than collapsing to "BX".
 *
 * A word with fewer than three consonants falls back to its vowels to fill the
 * remaining places ("Pop" -> "PPO") rather than emitting a short code, so every
 * assortment produces an ID of the same shape.
 */
export function assortmentCode(assortment: string | undefined): string {
  const clean = letters(assortment);
  if (!clean) return "";
  if (clean === "BOX") return "BOX";

  const chars = [...clean];
  const consonants = chars.filter((c) => !VOWELS.includes(c));
  const vowels = chars.filter((c) => VOWELS.includes(c));
  return [...consonants, ...vowels].slice(0, 3).join("");
}

/**
 * True for an ID the app minted as a placeholder rather than one that carries
 * meaning. Used to tell a car that still needs an ID from one that arrived with
 * a real ID of its own — a CSV re-import, say, whose IDs must be left alone.
 */
export function isPlaceholderId(id: string | undefined): boolean {
  const v = (id ?? "").trim();
  return v === "" || /^user-/i.test(v);
}

/**
 * The ID `car` should carry, given the collection it is joining. Returns "" when
 * brand or assortment is missing, since neither half of the prefix can be
 * guessed — the caller keeps whatever placeholder the car already has.
 */
export function carIdFor(car: Diecast, all: Diecast[]): string {
  const brand = brandCode(car.brand);
  const assortment = assortmentCode(car.assortment);
  if (!brand || !assortment) return "";

  const prefix = `${brand}/${assortment}/`;
  const taken = new Set(all.map((c) => (c.id || "").trim().toUpperCase()));

  // Continue from the highest number in use rather than counting rows: a gap
  // left by a deleted car must not hand its number to the next one.
  let highest = 0;
  for (const id of taken) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > highest) highest = n;
  }

  let next = highest + 1;
  while (taken.has(`${prefix}${String(next).padStart(3, "0")}`)) next++;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

/**
 * Assign IDs to a batch of new cars, so two cars added together cannot land on
 * the same number. Cars that already carry a real ID keep it.
 */
export function assignCarIds(newCars: Diecast[], existing: Diecast[]): Diecast[] {
  const pool = [...existing];
  return newCars.map((car) => {
    if (!isPlaceholderId(car.id)) {
      pool.push(car);
      return car;
    }
    const id = carIdFor(car, pool);
    const next = id ? { ...car, id } : car;
    pool.push(next);
    return next;
  });
}
