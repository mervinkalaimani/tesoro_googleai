import type { CatalogCar } from "@/lib/catalog";
import { parseDMY } from "@/lib/format";
import { isIso } from "@/lib/status";
import type { Diecast } from "@/lib/types";

/**
 * "For You": castings you do not have yet, picked from what you buy and what you like.
 *
 * What counts: your cars' brand, make, model, colour and series. What you bought in
 * the last four months counts three times what you bought before; a favourite adds
 * to it, and so does something on your wishlist. Each catalogue casting is scored on
 * how many of those it shares, and the strongest one or two are kept as the reason
 * printed on the card, so a suggestion always says why it is there.
 */
export type Suggestion = { car: CatalogCar; reason: string; score: number };

const RECENT_DAYS = 120;
const DAY = 86_400_000;
const norm = (v: string | null | undefined) => (v || "").trim().toLowerCase();

type Attr = "brand" | "make" | "model" | "colour" | "series";
/** How much each kind of match is worth: the model says more about taste than the colour. */
const COEF: Record<Attr, number> = { brand: 3, make: 2, model: 2.5, colour: 1, series: 1.2 };

type Seen = { label: string; weight: number; recent: number; owned: number };

/** "bought Ford recently" + "bought 39 Hot Wheels recently" reads as one: "bought Ford and 39 Hot Wheels recently". */
function joinReasons(parts: string[]): string {
  if (parts.length === 2) {
    const [a, b] = parts;
    const m = /^(bought) (.+) recently$/;
    const x = a.match(m);
    const y = b.match(m);
    if (x && y) return `bought ${x[2]} and ${y[2]} recently`;
  }
  return parts.join(" and ");
}

export function forYou(cars: Diecast[], catalog: CatalogCar[], limit = 12): Suggestion[] {
  const now = Date.now();
  const ownedIds = new Set(cars.map((c) => norm(c.catalogId)).filter(Boolean));
  const book: Record<Attr, Map<string, Seen>> = {
    brand: new Map(),
    make: new Map(),
    model: new Map(),
    colour: new Map(),
    series: new Map(),
  };
  const add = (
    attr: Attr,
    value: string | undefined,
    weight: number,
    recent: boolean,
    owned: boolean,
  ) => {
    const k = norm(value);
    if (!k || k === "na" || k === "-") return;
    const s = book[attr].get(k) ?? { label: (value || "").trim(), weight: 0, recent: 0, owned: 0 };
    s.weight += weight;
    if (recent) s.recent += 1;
    if (owned) s.owned += 1;
    book[attr].set(k, s);
  };

  let signals = 0;
  for (const c of cars) {
    const wished = isIso(c.status);
    const when = parseDMY(c.orderDate) ?? parseDMY(c.date);
    const recent = !wished && !!when && now - when.getTime() <= RECENT_DAYS * DAY;
    const w = (wished ? 1.5 : recent ? 3 : 1) + (c.favourite ? 2 : 0);
    signals += 1;
    for (const attr of Object.keys(COEF) as Attr[])
      add(attr, c[attr] as string | undefined, w, recent, !wished);
  }
  if (!signals) return [];

  const phrase = (attr: Attr, s: Seen): string => {
    switch (attr) {
      case "brand":
        return s.recent ? `bought ${s.recent} ${s.label} recently` : `collect ${s.label}`;
      case "make":
        return s.recent ? `bought ${s.label} recently` : `like ${s.label} cars`;
      case "model":
        return s.owned ? `have a ${s.label}` : `like the ${s.label}`;
      case "colour":
        return `like ${s.label.toLowerCase()} cars`;
      default:
        return `collect ${s.label}`;
    }
  };

  const scored: Suggestion[] = [];
  for (const c of catalog) {
    if (!c.car_id || ownedIds.has(norm(c.car_id))) continue;
    const hits: { attr: Attr; value: number; s: Seen }[] = [];
    for (const attr of Object.keys(COEF) as Attr[]) {
      const s = book[attr].get(norm(c[attr]));
      if (s) hits.push({ attr, value: COEF[attr] * Math.log1p(s.weight), s });
    }
    if (!hits.length) continue;
    hits.sort((a, b) => b.value - a.value);
    let score = hits.reduce((t, h) => t + h.value, 0);
    // A card with a photograph sells itself; one without is a last resort.
    if (!c.image_url) score *= 0.5;
    // A casting filed lately is worth a look even when it is a modest match.
    const added = c.created_at ? Date.parse(c.created_at) : NaN;
    if (!Number.isNaN(added) && now - added <= 45 * DAY) score += 0.8;
    // The reason names the most specific things that carried the match, not just the
    // biggest: "you have a Skyline" says more than "you collect Hot Wheels".
    const specific: Attr[] = ["model", "series", "make", "colour", "brand"];
    const top = hits
      .filter((h) => h.value >= hits[0].value * 0.4)
      .sort((a, b) => specific.indexOf(a.attr) - specific.indexOf(b.attr))
      .slice(0, 2);
    scored.push({
      car: c,
      score,
      reason: `Because you ${joinReasons(top.map((h) => phrase(h.attr, h.s)))}`,
    });
  }
  scored.sort((a, b) => b.score - a.score);

  // Variety: one per make and model, and no more than three of any one brand.
  const out: Suggestion[] = [];
  const models = new Set<string>();
  const brands = new Map<string, number>();
  for (const s of scored) {
    const m = `${norm(s.car.make)}|${norm(s.car.model)}`;
    const b = norm(s.car.brand);
    if (models.has(m) || (brands.get(b) ?? 0) >= 3) continue;
    models.add(m);
    brands.set(b, (brands.get(b) ?? 0) + 1);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}
