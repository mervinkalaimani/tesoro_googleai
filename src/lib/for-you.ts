import type { CatalogCar } from "@/lib/catalog";
import { parseDMY } from "@/lib/format";
import { isIso } from "@/lib/status";
import type { Diecast } from "@/lib/types";

/**
 * "For You": castings you do not have yet, picked from what you own and what you like.
 *
 * Every car you have counts, whenever you bought it: its brand, make, model, colour,
 * series, sub series, assortment, scale, year and type. A favourite counts for more,
 * and so does something on your wishlist. Each catalogue casting is scored on how many
 * of those it shares, and the most specific ones are kept as the reason printed on the
 * card, so a suggestion always says why it is there.
 */
export type Suggestion = { car: CatalogCar; reason: string; score: number };

const norm = (v: string | null | undefined) => (v || "").trim().toLowerCase();

type Attr =
  | "brand"
  | "make"
  | "model"
  | "colour"
  | "series"
  | "subSeries"
  | "assortment"
  | "size"
  | "year"
  | "type";

type Def = {
  /** How much a match is worth: the model says more about taste than the year. */
  coef: number;
  car: (c: Diecast) => string | undefined;
  cat: (c: CatalogCar) => string | undefined;
  /** The reason, finishing "Because you …". */
  say: (label: string, owned: number, recent: number) => string;
};

const ATTRS: Record<Attr, Def> = {
  brand: {
    coef: 3,
    car: (c) => c.brand,
    cat: (c) => c.brand,
    say: (l, _o, r) =>
      r > 1 ? `bought ${r} ${l} recently` : r ? `bought ${l} recently` : `collect ${l}`,
  },
  make: {
    coef: 2,
    car: (c) => c.make,
    cat: (c) => c.make,
    say: (l, _o, r) => (r ? `bought ${l} recently` : `like ${l} cars`),
  },
  model: {
    coef: 2.5,
    car: (c) => c.model,
    cat: (c) => c.model,
    say: (l, o) => (o ? `have a ${l}` : `like the ${l}`),
  },
  colour: {
    coef: 1,
    car: (c) => c.colour,
    cat: (c) => c.colour,
    say: (l) => `like ${l.toLowerCase()} cars`,
  },
  series: { coef: 1.2, car: (c) => c.series, cat: (c) => c.series, say: (l) => `collect ${l}` },
  subSeries: {
    coef: 1,
    car: (c) => c.subSeries,
    cat: (c) => c.sub_series,
    say: (l) => `collect ${l}`,
  },
  // An assortment belongs to a brand: Hot Wheels Premium is not Matchbox Premium, so
  // the two are one thing here and the reason names them together.
  assortment: {
    coef: 1.4,
    car: (c) => (c.assortment ? `${c.brand} ${c.assortment}`.trim() : undefined),
    cat: (c) => (c.assortment ? `${c.brand} ${c.assortment}`.trim() : undefined),
    say: (l) => `buy ${l}`,
  },
  size: { coef: 0.8, car: (c) => c.size, cat: (c) => c.size, say: (l) => `collect ${l} scale` },
  year: {
    coef: 0.6,
    car: (c) => c.year,
    cat: (c) => c.year ?? undefined,
    say: (l) => `like ${l} models`,
  },
  type: { coef: 0.6, car: (c) => c.type, cat: (c) => c.type, say: (l) => `like ${l}` },
};
const KEYS = Object.keys(ATTRS) as Attr[];
/** When a reason names two things, the narrower one comes first. */
const SPECIFIC: Attr[] = [
  "model",
  "subSeries",
  "series",
  "make",
  "assortment",
  "colour",
  "type",
  "size",
  "year",
  "brand",
];

type Seen = { label: string; weight: number; owned: number; recent: number };

/** When a car was bought: its order date, else the day it landed. */
const boughtOn = (c: Diecast) => parseDMY(c.orderDate) ?? parseDMY(c.date);

/** How far back "recent" can reach, at the most. */
export const MAX_WINDOW_DAYS = 60;
const WINDOWS = [14, 30, 45, MAX_WINDOW_DAYS];
/** Enough purchases for a window to say something about taste. */
const ENOUGH = 8;

const boughtWithin = (cars: Diecast[], days: number, now: number) =>
  cars.filter((c) => {
    if (isIso(c.status)) return false;
    const d = boughtOn(c);
    return !!d && now - d.getTime() <= days * 86_400_000 && d.getTime() <= now;
  });

/**
 * The window that counts as "recent", chosen from how much you have been buying: the
 * shortest of 2, 4½, 6½ weeks or two months that holds enough purchases to go on,
 * and two months, the most it ever reaches, when even that is thin.
 */
export function purchaseStats(cars: Diecast[], now = Date.now()) {
  const days = WINDOWS.find((d) => boughtWithin(cars, d, now).length >= ENOUGH) ?? MAX_WINDOW_DAYS;
  const count = boughtWithin(cars, days, now).length;
  return { days, count, perWeek: count / (days / 7), perMonth: count / (days / 30.44) };
}

/** The ranked pool, best first. The caller pages through it and may reshuffle it (see `reshuffle`). */
export function forYou(cars: Diecast[], catalog: CatalogCar[], limit = 48): Suggestion[] {
  const now = Date.now();
  const { days } = purchaseStats(cars, now);
  const recentIds = new Set(boughtWithin(cars, days, now).map((c) => c.id));
  const ownedIds = new Set(cars.map((c) => norm(c.catalogId)).filter(Boolean));
  const book = Object.fromEntries(KEYS.map((k) => [k, new Map<string, Seen>()])) as Record<
    Attr,
    Map<string, Seen>
  >;

  for (const c of cars) {
    const wished = isIso(c.status);
    const recent = recentIds.has(c.id);
    // What you bought lately says most about what you want now, a wishlist car next.
    const w = (wished ? 1.5 : recent ? 3 : 1) + (c.favourite ? 2 : 0);
    for (const a of KEYS) {
      const value = ATTRS[a].car(c);
      const k = norm(value);
      if (!k || k === "na" || k === "-") continue;
      const s = book[a].get(k) ?? { label: (value || "").trim(), weight: 0, owned: 0, recent: 0 };
      s.weight += w;
      if (!wished) s.owned += 1;
      if (recent) s.recent += 1;
      book[a].set(k, s);
    }
  }
  if (!cars.length) return [];

  const scored: Suggestion[] = [];
  for (const c of catalog) {
    if (!c.car_id || ownedIds.has(norm(c.car_id))) continue;
    const hits: { a: Attr; value: number; s: Seen }[] = [];
    for (const a of KEYS) {
      const s = book[a].get(norm(ATTRS[a].cat(c)));
      if (s) hits.push({ a, value: ATTRS[a].coef * Math.log1p(s.weight), s });
    }
    if (!hits.length) continue;
    hits.sort((x, y) => y.value - x.value);
    let score = hits.reduce((t, h) => t + h.value, 0);
    // A card with a photograph sells itself; one without is a last resort.
    if (!c.image_url) score *= 0.5;
    // A casting filed lately is worth a look even when it is a modest match.
    const added = c.created_at ? Date.parse(c.created_at) : NaN;
    if (!Number.isNaN(added) && now - added <= 45 * 86_400_000) score += 0.8;
    // The reason names the most specific things that carried the match, not just the
    // biggest: "you have a Skyline" says more than "you collect Hot Wheels".
    const strong = hits.filter((h) => h.value >= hits[0].value * 0.4);
    const top = strong
      // "Hot Wheels Premium" already says the brand: drop the bare brand beside it.
      .filter((h) => !(h.a === "brand" && strong.some((x) => x.a === "assortment")))
      .sort((x, y) => SPECIFIC.indexOf(x.a) - SPECIFIC.indexOf(y.a))
      .slice(0, 2);
    scored.push({
      car: c,
      score,
      reason: `Because you ${top.map((h) => ATTRS[h.a].say(h.s.label, h.s.owned, h.s.recent)).join(" and ")}`,
    });
  }
  scored.sort((a, b) => b.score - a.score);

  // Variety: one per make and model, and no more than ten of any one brand in the pool.
  const out: Suggestion[] = [];
  const models = new Set<string>();
  const brands = new Map<string, number>();
  for (const s of scored) {
    const m = `${norm(s.car.make)}|${norm(s.car.model)}`;
    const b = norm(s.car.brand);
    if (models.has(m) || (brands.get(b) ?? 0) >= 10) continue;
    models.add(m);
    brands.set(b, (brands.get(b) ?? 0) + 1);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * A different ordering of the same pool: each score is nudged by a seeded random
 * factor, so a refresh brings other castings up without ever promoting a poor match.
 * Seed 0 is the plain ranking.
 */
export function reshuffle(pool: Suggestion[], seed: number): Suggestion[] {
  if (!seed) return pool;
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return pool
    .map((s) => ({ s, k: s.score * (0.55 + 0.45 * rand()) }))
    .sort((x, y) => y.k - x.k)
    .map((x) => x.s);
}
