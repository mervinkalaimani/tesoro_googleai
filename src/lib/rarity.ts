import type { Diecast } from "@/lib/types";

/**
 * How rare a pull is, least to most — the order the details page cycles
 * through when the flame is tapped.
 *
 * TH and STH are Hot Wheels' Treasure Hunt and Super Treasure Hunt; Chase is
 * every other brand's limited run. "Normal" is the absence of all three and
 * never gets a mark.
 */
export const RARITIES = ["Normal", "TH", "STH", "Chase"] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_LABEL: Record<Rarity, string> = {
  Normal: "Normal",
  TH: "TH — Treasure Hunt",
  STH: "STH — Super Treasure Hunt",
  Chase: "Chase",
};

/** Flame colour per rarity. Normal has none. */
export const RARITY_FLAME: Record<Exclude<Rarity, "Normal">, string> = {
  TH: "fill-zinc-300 text-zinc-400",
  STH: "fill-amber-400 text-amber-500",
  Chase: "fill-red-500 text-red-500",
};

export function normaliseRarity(value: string | undefined | null): Rarity | null {
  const v = (value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, "");
  if (!v) return null;
  if (v === "normal" || v === "none" || v === "regular") return "Normal";
  if (v === "th" || v === "treasurehunt") return "TH";
  if (v === "sth" || v === "supertreasurehunt" || v === "supertreasure") return "STH";
  if (v === "chase") return "Chase";
  return null;
}

/**
 * A car's rarity. Rows from before the column existed only know `chase`, and
 * every one of those was a chase.
 */
export function rarityOf(car: Pick<Diecast, "rarity" | "chase">): Rarity {
  return normaliseRarity(car.rarity) ?? (car.chase ? "Chase" : "Normal");
}

/** A car with its rarity set, and the chase flag moved with it. */
export function withRarity<T extends Diecast>(car: T, rarity: Rarity): T {
  return { ...car, rarity, chase: rarity !== "Normal" };
}

export function nextRarity(current: Rarity): Rarity {
  return RARITIES[(RARITIES.indexOf(current) + 1) % RARITIES.length];
}

export const isRare = (car: Pick<Diecast, "rarity" | "chase">) => rarityOf(car) !== "Normal";
