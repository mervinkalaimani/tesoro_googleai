/**
 * What a casting says about itself on a page anyone can read.
 *
 * Kept away from the route because all of it is decisions rather than markup:
 * what the tab says, what a search result shows underneath it, which photo may
 * be published, and whether there is enough purchase history to quote a price
 * without quoting a person.
 */
import { inrFull } from "@/lib/format";
import type { CatalogCar } from "@/lib/catalog";

/** What the database's public stats function returns, one row. */
export type CastingStats = {
  owners: number;
  copies: number;
  prices: number | null;
  paid_min: number | null;
  paid_max: number | null;
  last_seen: string | null;
};

const clean = (v: unknown): string => String(v ?? "").trim();

/** The casting's own name, falling back to make and model. */
export function castingName(c: Pick<CatalogCar, "name" | "make" | "model" | "variant">): string {
  return (
    clean(c.name) || [clean(c.make), clean(c.model), clean(c.variant)].filter(Boolean).join(" ")
  );
}

/**
 * The tab, and the blue line in a search result.
 *
 * Name first because that is what was typed into the search box; the brand and
 * the collector number after it, because two castings share a name often and a
 * number almost never.
 */
export function castingTitle(c: CatalogCar): string {
  const tail = [clean(c.brand), clean(c.assortment), clean(c.car_number)].filter(Boolean).join(" ");
  return [castingName(c), tail].filter(Boolean).join(" — ") + " | Tesoro";
}

/**
 * The grey line under it. A sentence rather than a list of fields: a search
 * result is read, and "Yellow · Construction Vehicle · 2024" is not read.
 */
export function castingDescription(c: CatalogCar): string {
  const name = castingName(c) || "This casting";
  const what = [clean(c.colour).toLowerCase(), clean(c.brand), clean(c.type)]
    .filter(Boolean)
    .join(" ");
  const series = clean(c.series);
  const number = clean(c.car_number);
  const year = clean(c.year);

  const bits = [`${name} is a ${what || "die-cast model"}`];
  if (series) bits.push(`from the ${series} series`);
  if (number) bits.push(`numbered ${number}`);
  if (year) bits.push(`released in ${year}`);
  return `${bits.join(", ")}. Catalogued on Tesoro.`;
}

/**
 * Whether a photo is ours to publish.
 *
 * Most of the catalogue's pictures were found on the die-cast wikis and stored
 * as links. Behind a login that is a bookmark; on an indexed page it is
 * somebody else's bandwidth serving somebody else's file. Only a copy on our
 * own storage goes out, and the backfill script is what makes copies.
 */
export function isPublishablePhoto(url: unknown): boolean {
  const u = clean(url);
  if (!u) return false;
  try {
    return new URL(u).hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

/**
 * "₹300–₹1,250 over 4 purchases · last seen Apr 2026", or null.
 *
 * Null covers both halves of the rule: the database withholds the numbers below
 * three independent buyers, and a band whose ends are equal says what one
 * person paid however many rows it counted.
 */
export function priceBand(s: CastingStats | null | undefined): string | null {
  if (!s || s.paid_min == null || s.paid_max == null || !s.prices) return null;
  if (s.paid_min === s.paid_max) return null;
  const range = `${inrFull(s.paid_min)}–${inrFull(s.paid_max)}`;
  const over = `over ${s.prices} ${s.prices === 1 ? "purchase" : "purchases"}`;
  return s.last_seen ? `${range} ${over} · last seen ${s.last_seen}` : `${range} ${over}`;
}

/** "3 collectors here own one", or null when nobody does. */
export function ownersLine(s: CastingStats | null | undefined): string | null {
  if (!s || !s.owners) return null;
  const who = `${s.owners} ${s.owners === 1 ? "collector" : "collectors"} here`;
  const copies = s.copies > s.owners ? ` — ${s.copies} copies between them` : "";
  return `${who} own${s.owners === 1 ? "s" : ""} one${copies}`;
}
