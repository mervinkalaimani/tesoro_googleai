/**
 * The assortments that are boxes rather than single cars.
 *
 * "5 Pack" is not a kind of packaging a casting comes in, it is five castings
 * in one product — and the form asked, every time, whether a thing called
 * 5 Pack was a multipack and how many cars were in it. The name already says
 * both.
 *
 * Diorama is the one with no number: they come as a scene with a car in it and
 * the count varies, so it is a box whose size is still a question.
 */

/** Case, spacing and punctuation are not part of the name. */
const key = (v: string | null | undefined) =>
  (v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();

/** null means "a box, but nobody can say how many from the name alone". */
const PACKS: Record<string, number | null> = {
  diorama: null,
  "2pack": 2,
  "3pack": 3,
  "4pack": 4,
  "5pack": 5,
  "6pack": 6,
  "10pack": 10,
  teamtransport: 2,
  superrigs: 2,
};

/** Whether this assortment names a box, and how many cars it says are in it. */
export function packFromAssortment(
  assortment: string | null | undefined,
): { isPack: true; size: number | null } | null {
  const k = key(assortment);
  if (!k || !(k in PACKS)) return null;
  return { isPack: true, size: PACKS[k] };
}

/** Whether this assortment is one of the box names at all. */
export const isPackAssortment = (assortment: string | null | undefined) =>
  packFromAssortment(assortment) !== null;
