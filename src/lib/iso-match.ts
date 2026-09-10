import type { Diecast } from "@/lib/types";

/**
 * Spotting a car you are already hunting for, while you type it in.
 *
 * The ISO list is what someone is In Search Of. Cataloguing a new arrival is
 * exactly the moment those entries matter and exactly the moment nobody thinks
 * to go and look at them — so the form looks for you. Three fields agreeing is
 * enough to be worth mentioning and rare enough not to nag: the same make and
 * brand alone will not do it, but add a matching series or model and you are
 * almost certainly holding something off the list, or something from the same
 * run as the rest of it.
 */

export const ISO_MATCH_FIELDS = [
  "make",
  "model",
  "variant",
  "series",
  "subSeries",
  "brand",
  "assortment",
] as const;

export type IsoMatchField = (typeof ISO_MATCH_FIELDS)[number];

/** How many of the seven have to agree before a suggestion is offered. */
export const ISO_MATCH_THRESHOLD = 3;

export type IsoMatch = {
  car: Diecast;
  /** Which fields agreed — shown, so the suggestion explains itself. */
  matched: IsoMatchField[];
};

const norm = (v: string | undefined | null) => (v ?? "").trim().toLowerCase();

export const isIsoStatus = (status: string | undefined | null) => norm(status) === "iso";

/**
 * Fields that describe the *casting*, ranked by how much they narrow things
 * down. Two cars sharing a model are far more likely to be the same car than
 * two sharing an assortment everything in the list belongs to, and the
 * suggestions are ordered accordingly.
 */
const SPECIFICITY: Record<IsoMatchField, number> = {
  model: 5,
  variant: 4,
  subSeries: 3,
  series: 3,
  make: 2,
  brand: 1,
  assortment: 1,
};

const weigh = (matched: IsoMatchField[]) => matched.reduce((s, f) => s + SPECIFICITY[f], 0);

/**
 * ISO entries that share at least `ISO_MATCH_THRESHOLD` fields with what has
 * been typed so far, best match first.
 *
 * A blank field on either side never counts as agreement — otherwise every
 * half-filled form would match every sparse ISO row on the strength of what
 * neither of them says.
 */
export function isoMatchesFor(
  cars: Diecast[],
  draft: Partial<Record<IsoMatchField, string>>,
  options: { excludeId?: string; limit?: number } = {},
): IsoMatch[] {
  const { excludeId, limit = 8 } = options;

  const wanted = ISO_MATCH_FIELDS.map((f) => [f, norm(draft[f])] as const).filter(
    ([, v]) => v !== "",
  );
  // Nothing can reach the threshold before three fields have been typed at all.
  if (wanted.length < ISO_MATCH_THRESHOLD) return [];

  const out: IsoMatch[] = [];
  for (const car of cars) {
    if (!isIsoStatus(car.status)) continue;
    if (excludeId && car.id === excludeId) continue;

    const matched: IsoMatchField[] = [];
    for (const [field, value] of wanted) {
      if (norm(car[field]) === value) matched.push(field);
    }
    if (matched.length >= ISO_MATCH_THRESHOLD) out.push({ car, matched });
  }

  return out
    .sort(
      (a, b) =>
        b.matched.length - a.matched.length ||
        weigh(b.matched) - weigh(a.matched) ||
        (a.car.name || "").localeCompare(b.car.name || ""),
    )
    .slice(0, limit);
}
