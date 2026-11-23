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
export type Suggestion = {
  car: CatalogCar;
  reason: string;
  score: number;
  /** How many other collectors recently bought this casting, when anyone did. */
  others?: number;
  /** Liked for its own sake rather than for what it shares with you. */
  popularOnly?: boolean;
};

/** One casting as the shared recent-purchases list names it: same brand, make, model, variant, colour and series. */
export const castingKey = (c: {
  brand?: string;
  make?: string;
  model?: string;
  variant?: string;
  colour?: string;
  series?: string;
}) =>
  [c.brand, c.make, c.model, c.variant, c.colour, c.series]
    .map((v) => (v || "").trim().toLowerCase())
    .join("|");

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
  | "type"
  | "rarity";

type Def = {
  /** How much a match is worth: the model says more about taste than the year. */
  coef: number;
  car: (c: Diecast) => string | undefined;
  cat: (c: CatalogCar) => string | undefined;
  /** The reason, finishing "Because you …". */
  say: (label: string, owned: number, recent: number) => string;
};

const special = (r: string | undefined | null) => {
  const v = (r || "").trim();
  return v && v.toLowerCase() !== "normal" ? v : undefined;
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
  // Only the special ones say anything: "Normal" is what nearly every car is.
  rarity: {
    coef: 0.8,
    car: (c) => special(c.rarity),
    cat: (c) => special(c.rarity),
    say: (l) => `like ${l} cars`,
  },
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
  "rarity",
  "brand",
];

type Seen = { label: string; weight: number; owned: number; recent: number; n: number };

/**
 * One or two cars are not a taste: a single Mustang may be a one-off and a fantasy
 * car just a fantasy car. An attribute only counts once this many of your cars share it.
 */
const PATTERN = 3;
/** The attributes that say something on their own; colour, year, type and scale only add to these. */
const CORE: Attr[] = ["brand", "make", "model", "series", "subSeries", "assortment"];

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

/** "bought Ford recently" + "bought 3 Hot Wheels recently" reads as one: "bought Ford and 3 Hot Wheels recently". */
function joinReasons(parts: string[]): string {
  if (parts.length === 2) {
    const m = /^bought (.+) recently$/;
    const x = parts[0].match(m);
    const y = parts[1].match(m);
    if (x && y) return `bought ${x[1]} and ${y[1]} recently`;
  }
  return parts.join(" and ");
}

/** The ranked pool, best first. The caller pages through it and may reshuffle it (see `reshuffle`). */
export function forYou(
  cars: Diecast[],
  catalog: CatalogCar[],
  limit = 48,
  /** Other collectors' recent purchases, by `castingKey`: how many bought each. */
  popular: Map<string, number> = new Map(),
  /** Castings the person turned down: what they share is shown less. */
  disliked: CatalogCar[] = [],
  /** Castings the person asked for more of: what they share is shown more. */
  wanted: CatalogCar[] = [],
): Suggestion[] {
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
      const s = book[a].get(k) ?? {
        label: (value || "").trim(),
        weight: 0,
        owned: 0,
        recent: 0,
        n: 0,
      };
      s.weight += w;
      s.n += 1;
      if (!wished) s.owned += 1;
      if (recent) s.recent += 1;
      book[a].set(k, s);
    }
  }
  if (!cars.length) return [];

  // What the turned-down castings have in common, counted: each one is a vote against its
  // make, model, series and the like. A brand alone says little, so it counts for less.
  const against = Object.fromEntries(KEYS.map((k) => [k, new Map<string, number>()])) as Record<
    Attr,
    Map<string, number>
  >;
  for (const d of disliked) {
    for (const a of KEYS) {
      const k = norm(ATTRS[a].cat(d));
      if (k && k !== "na" && k !== "-") against[a].set(k, (against[a].get(k) ?? 0) + 1);
    }
  }

  const toward = Object.fromEntries(KEYS.map((k) => [k, new Map<string, number>()])) as Record<
    Attr,
    Map<string, number>
  >;
  for (const d of wanted) {
    for (const a of KEYS) {
      const k = norm(ATTRS[a].cat(d));
      if (k && k !== "na" && k !== "-") toward[a].set(k, (toward[a].get(k) ?? 0) + 1);
    }
  }

  const scored: Suggestion[] = [];
  for (const c of catalog) {
    if (!c.car_id || ownedIds.has(norm(c.car_id))) continue;
    const hits: { a: Attr; value: number; s: Seen }[] = [];
    for (const a of KEYS) {
      const s = book[a].get(norm(ATTRS[a].cat(c)));
      if (s && s.n >= PATTERN) hits.push({ a, value: ATTRS[a].coef * Math.log1p(s.weight), s });
    }
    const others = popular.get(castingKey(c)) ?? 0;
    // A pattern means a core attribute shared by several of your cars, not a stray match.
    if (!hits.some((h) => CORE.includes(h.a))) hits.length = 0;
    // Something you asked for more of can bring a casting up with nothing else behind it.
    const likedAlike = CORE.some((a) => toward[a].has(norm(ATTRS[a].cat(c))));
    if (!hits.length && !others && !likedAlike) continue;
    hits.sort((x, y) => y.value - x.value);
    let score = hits.reduce((t, h) => t + h.value, 0);
    // Many collectors buying the same casting is a reason of its own.
    if (others) score += 6 * Math.log1p(others);
    // Each match with something turned down takes away, more the more times it was.
    for (const a of KEYS) {
      const n = against[a].get(norm(ATTRS[a].cat(c))) ?? 0;
      if (n) score -= ATTRS[a].coef * (a === "brand" ? 1 : 1.5) * Math.log1p(n);
    }
    // And each match with something asked for adds, the same way.
    for (const a of KEYS) {
      const n = toward[a].get(norm(ATTRS[a].cat(c))) ?? 0;
      if (n) score += ATTRS[a].coef * (a === "brand" ? 1 : 1.5) * Math.log1p(n);
    }
    if (score <= 0) continue;
    // A card with a photograph sells itself; one without is a last resort.
    if (!c.image_url) score *= 0.5;
    // A casting filed lately is worth a look even when it is a modest match.
    const added = c.created_at ? Date.parse(c.created_at) : NaN;
    if (!Number.isNaN(added) && now - added <= 45 * 86_400_000) score += 0.8;
    // The reason names the most specific things that carried the match, not just the
    // biggest: "you have a Skyline" says more than "you collect Hot Wheels".
    const strong = hits.filter((h) => h.value >= (hits[0]?.value ?? 0) * 0.4);
    const top = strong
      // "Hot Wheels Premium" already says the brand: drop the bare brand beside it.
      .filter((h) => !(h.a === "brand" && strong.some((x) => x.a === "assortment")))
      .sort((x, y) => SPECIFIC.indexOf(x.a) - SPECIFIC.indexOf(y.a))
      .slice(0, 2);
    const taste = joinReasons(top.map((h) => ATTRS[h.a].say(h.s.label, h.s.owned, h.s.recent)));
    const crowd = others
      ? `${others} ${others === 1 ? "other has" : "others have"} recently purchased`
      : "";
    scored.push({
      car: c,
      score,
      others: others || undefined,
      popularOnly: !hits.length && !likedAlike,
      reason: taste
        ? `Because you ${taste}${crowd ? `, and ${crowd}` : ""}`
        : crowd
          ? `Because ${crowd}`
          : "Because you asked for more like this",
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
  // Popular castings that match nothing of yours would never outscore a taste match, yet
  // they are part of the point: bring the most bought of them in, a few places apart.
  const crowd = scored
    .filter((s) => s.popularOnly && !out.includes(s))
    .sort((a, b) => (b.others ?? 0) - (a.others ?? 0))
    .slice(0, 6);
  crowd.forEach((s, i) => out.splice(Math.min(2 + i * 5, out.length), 0, s));
  return out.slice(0, limit);
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
