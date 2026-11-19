/** Read-side helpers over State: grouping offers by catalogue car, search, filters. */
import type { CatalogueItem, Listing, MarketEvent, SellerProfile, State } from "./types";

export const sellerOf = (s: State, userId: string): SellerProfile | undefined =>
  s.sellers.find((x) => x.userId === userId);
export const itemById = (s: State, id: string) => s.items.find((i) => i.id === id);
export const approved = (s: State) => s.items.filter((i) => i.review === "approved");

/** Offers a buyer can act on. Exact catalogue id only: a different scale or variant is a different car. */
export function itemOffers(s: State, itemId: string): Listing[] {
  return s.listings
    .filter((l) => l.itemId === itemId && l.status === "active" && l.quantity > 0)
    .sort((a, b) => a.pricePaise - b.pricePaise);
}

export const itemEvents = (s: State, itemId: string): MarketEvent[] =>
  s.events.filter((e) => e.itemId === itemId && e.status === "live");

export const liveEvents = (s: State) =>
  s.events.filter((e) => e.status === "live").sort((a, b) => a.endsAt - b.endsAt);

export type Filters = {
  q: string;
  scale: string;
  brand: string;
  series: string;
  assortment: string;
  origin: string;
  condition: string;
  min: string;
  max: string;
  location: string;
  stock: string;
  sale: string;
};
export const NO_FILTERS: Filters = {
  q: "",
  scale: "",
  brand: "",
  series: "",
  assortment: "",
  origin: "",
  condition: "",
  min: "",
  max: "",
  location: "",
  stock: "",
  sale: "",
};
export type Sort = "relevance" | "newest" | "price_asc" | "price_desc" | "ending";

export type Hit = {
  item: CatalogueItem;
  offers: Listing[];
  events: MarketEvent[];
  from: number | null;
  score: number;
};

export function search(s: State, f: Filters, sort: Sort): Hit[] {
  const tokens = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const min = f.min ? Number(f.min) * 100 : null;
  const max = f.max ? Number(f.max) * 100 : null;
  const hits: Hit[] = [];
  for (const item of approved(s)) {
    if (f.scale && item.scale !== f.scale) continue;
    if (f.brand && item.brand !== f.brand) continue;
    if (f.series && item.series !== f.series) continue;
    if (f.assortment && item.assortment !== f.assortment) continue;
    if (f.origin && item.origin !== f.origin) continue;
    let offers = itemOffers(s, item.id);
    const events = itemEvents(s, item.id);
    if (f.condition) offers = offers.filter((l) => l.condition === f.condition);
    if (min !== null) offers = offers.filter((l) => l.pricePaise >= min);
    if (max !== null) offers = offers.filter((l) => l.pricePaise <= max);
    if (f.location)
      offers = offers.filter((l) =>
        sellerOf(s, l.sellerId)?.location.toLowerCase().includes(f.location.toLowerCase()),
      );
    const filtered = !!(f.condition || min !== null || max !== null || f.location);
    if (filtered && !offers.length) continue;
    if (f.stock === "in" && !offers.length) continue;
    if (f.sale === "fixed" && !offers.length) continue;
    if ((f.sale === "auction" || f.sale === "raffle") && !events.some((e) => e.type === f.sale))
      continue;

    let score = 1;
    if (tokens.length) {
      const sellers = s.listings
        .filter((l) => l.itemId === item.id && l.status === "active")
        .map((l) => sellerOf(s, l.sellerId))
        .filter(Boolean)
        .map((x) => `${x!.storeName} ${x!.location}`);
      const head = [item.name, item.model, item.make, item.brand].join(" ").toLowerCase();
      const hay = [
        head,
        item.series,
        item.assortment,
        item.variant,
        item.colour,
        item.scale,
        item.code,
        item.year,
        ...item.aliases,
        ...sellers,
      ]
        .join(" ")
        .toLowerCase();
      if (!tokens.every((t) => hay.includes(t))) continue;
      score = tokens.reduce((n, t) => n + (head.includes(t) ? 3 : 1), 0);
    }
    hits.push({ item, offers, events, from: offers[0]?.pricePaise ?? null, score });
  }
  const end = (h: Hit) => Math.min(...h.events.map((e) => e.endsAt), Infinity);
  const cmp: Record<Sort, (a: Hit, b: Hit) => number> = {
    relevance: (a, b) => b.score - a.score || b.offers.length - a.offers.length,
    newest: (a, b) =>
      b.item.createdAt - a.item.createdAt ||
      Math.max(0, ...b.offers.map((l) => l.createdAt)) -
        Math.max(0, ...a.offers.map((l) => l.createdAt)),
    price_asc: (a, b) => (a.from ?? Infinity) - (b.from ?? Infinity),
    price_desc: (a, b) => (b.from ?? -1) - (a.from ?? -1),
    ending: (a, b) => end(a) - end(b),
  };
  return hits.sort(cmp[sort]);
}

export function facets(s: State) {
  const uniq = (pick: (i: CatalogueItem) => string) =>
    [...new Set(approved(s).map(pick).filter(Boolean))].sort();
  return {
    scale: uniq((i) => i.scale),
    brand: uniq((i) => i.brand),
    series: uniq((i) => i.series),
    assortment: uniq((i) => i.assortment),
    location: [...new Set(s.sellers.map((x) => x.location))].sort(),
  };
}
