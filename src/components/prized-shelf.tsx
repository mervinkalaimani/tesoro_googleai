import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Flame, Gem, Star } from "lucide-react";

import type { Diecast } from "@/lib/types";
import { rarityOf, RARITY_FLAME } from "@/lib/rarity";
import { CarMarks, FAVOURITE_COLOUR } from "@/components/car-marks";
import { CarThumb } from "@/components/car-thumb";
import { useCarDrawer } from "@/components/car-details-drawer";
import { cn } from "@/lib/utils";

/**
 * The cars worth showing off: chase, STH, TH and favourites, mixed into one shelf.
 *
 * Same four groups, same tests, as the Favourites page — this is its front
 * window, not a second opinion on what counts. No prices: it is a shelf to
 * look at, not a ledger. Five cars at a time, drawn at random and re-drawn in
 * a different arrangement every few seconds, so a long shelf gets its turn;
 * "View all" is the rest.
 */
type Shelf = "chase" | "sth" | "th" | "favourite";

const SHELVES: {
  key: Shelf;
  label: string;
  has: (c: Diecast) => boolean;
  icon: typeof Flame;
  colour: string;
}[] = [
  {
    key: "chase",
    label: "Chase",
    has: (c) => rarityOf(c) === "Chase",
    icon: Flame,
    colour: RARITY_FLAME.Chase,
  },
  {
    key: "sth",
    label: "STH",
    has: (c) => rarityOf(c) === "STH",
    icon: Flame,
    colour: RARITY_FLAME.STH,
  },
  {
    key: "th",
    label: "TH",
    has: (c) => rarityOf(c) === "TH",
    icon: Flame,
    colour: RARITY_FLAME.TH,
  },
  {
    key: "favourite",
    label: "Favourites",
    has: (c) => Boolean(c.favourite),
    icon: Star,
    colour: FAVOURITE_COLOUR,
  },
];

const SHOWN = 5;
const ROTATE_MS = 9000;

/** Small seeded generator, so one seed gives one arrangement. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The arrangements that close up with no hole, by how many cars there are.
 * `grid` is the desktop grid; `first` is what the lead tile does in it. On a
 * phone every one of them is two columns.
 */
const LAYOUTS: Record<number, { grid: string; first: string }[]> = {
  5: [
    {
      grid: "sm:h-72 sm:grid-cols-[1.25fr_1fr_1fr] sm:grid-rows-2",
      first: "sm:col-span-1 sm:row-span-2",
    },
    {
      grid: "sm:h-72 sm:grid-cols-[1fr_1fr_1.25fr] sm:grid-rows-2",
      first: "sm:col-start-3 sm:row-start-1 sm:row-span-2",
    },
    { grid: "sm:h-72 sm:grid-cols-4 sm:grid-rows-2", first: "sm:col-span-2 sm:row-span-2" },
    {
      grid: "sm:h-72 sm:grid-cols-4 sm:grid-rows-2",
      first: "sm:col-start-3 sm:col-span-2 sm:row-start-1 sm:row-span-2",
    },
    { grid: "sm:h-72 sm:grid-rows-1 sm:grid-cols-5", first: "sm:col-span-1 sm:row-span-1" },
  ],
  4: [
    { grid: "sm:h-72 sm:grid-rows-1 sm:grid-cols-4", first: "sm:col-span-1 sm:row-span-1" },
    { grid: "sm:h-72 sm:grid-cols-2 sm:grid-rows-2", first: "sm:col-span-1 sm:row-span-1" },
  ],
  3: [
    {
      grid: "sm:h-72 sm:grid-cols-[1.25fr_1fr] sm:grid-rows-2",
      first: "sm:col-span-1 sm:row-span-2",
    },
    {
      grid: "sm:h-72 sm:grid-cols-[1fr_1.25fr] sm:grid-rows-2",
      first: "sm:col-start-2 sm:row-start-1 sm:row-span-2",
    },
    { grid: "sm:h-72 sm:grid-rows-1 sm:grid-cols-3", first: "sm:col-span-1 sm:row-span-1" },
  ],
  2: [
    { grid: "sm:h-72 sm:grid-rows-1 sm:grid-cols-2", first: "sm:col-span-1 sm:row-span-1" },
    {
      grid: "sm:h-72 sm:grid-rows-1 sm:grid-cols-[1.5fr_1fr]",
      first: "sm:col-span-1 sm:row-span-1",
    },
  ],
  1: [{ grid: "sm:h-72 sm:grid-rows-1 sm:grid-cols-1", first: "sm:col-span-1 sm:row-span-1" }],
};

export function PrizedShelf({ rows, showEmpty }: { rows: Diecast[]; showEmpty: boolean }) {
  const { open } = useCarDrawer();
  // 0 until mounted, then random: the server and the first client render agree,
  // and only then does the shuffle start.
  const [seed, setSeed] = useState(0);
  useEffect(() => {
    setSeed(Math.floor(Math.random() * 1e9) + 1);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") setSeed(Math.floor(Math.random() * 1e9) + 1);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, []);

  // One pool, every kind mixed: a car that is both a chase and a favourite is
  // one car, not two. The counts are a legend, not a control.
  const counts = useMemo(
    () => SHELVES.map((sh) => ({ ...sh, n: rows.filter(sh.has).length })).filter((g) => g.n > 0),
    [rows],
  );
  const pool = useMemo(() => rows.filter((c) => SHELVES.some((sh) => sh.has(c))), [rows]);

  const { top, layout } = useMemo(() => {
    const rand = rng(seed);
    const cars = [...pool];
    // Fisher–Yates, and the first five are the ones on show.
    for (let i = cars.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [cars[i], cars[j]] = [cars[j], cars[i]];
    }
    const picked = (seed === 0 ? pool : cars).slice(0, SHOWN);
    const options = LAYOUTS[picked.length] ?? LAYOUTS[1];
    return { top: picked, layout: options[Math.floor(rand() * options.length)] };
  }, [pool, seed]);

  if (pool.length === 0) {
    if (!showEmpty) return null;
    return (
      <section className="card-elevated p-5">
        <Eyebrow />
        <p className="mt-2 text-sm text-muted-foreground">
          No chase, STH, TH or favourite cars yet. Mark one and it will be shown here.
        </p>
      </section>
    );
  }

  const more = pool.length - top.length;

  return (
    <section className="card-elevated min-w-0 p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow />
          <div className="mt-1 text-2xl font-semibold tracking-tight">
            {pool.length} prized {pool.length === 1 ? "car" : "cars"}
          </div>
        </div>
        {/* Icon and number only, on the right; the label is the tooltip. */}
        <div className="flex shrink-0 items-center gap-3 pt-0.5 text-sm">
          {counts.map((g) => {
            const Icon = g.icon;
            return (
              <span
                key={g.key}
                title={`${g.n} ${g.label}`}
                aria-label={`${g.n} ${g.label}`}
                className="inline-flex items-center gap-1"
              >
                <Icon className={cn("size-4", g.colour)} />
                <span className="font-semibold tabular-nums">{g.n}</span>
              </span>
            );
          })}
        </div>
      </div>

      <div
        key={seed}
        className={cn(
          // Fixed height, so the section is the same size whatever is drawn.
          // On a phone that is a short 2 x 2 block: one big car and two small.
          "mt-3 grid h-60 grid-cols-2 grid-rows-2 gap-2.5 duration-500 animate-in fade-in",
          layout.grid,
        )}
      >
        {top.map((c, i) => {
          const name = c.name || `${c.make} ${c.model}`.trim() || "Unnamed car";
          const first = i === 0;
          return (
            <button
              key={(c.id || "") + i}
              type="button"
              onClick={() => open(c)}
              title={name}
              className={cn(
                "group relative min-h-0 overflow-hidden rounded-xl border border-border/60 text-left",
                // Phone shows three cars at most; the rest are for wider screens.
                i >= 3 && "max-sm:hidden",
                first
                  ? cn(
                      top.length >= 3
                        ? "row-span-2"
                        : top.length === 2
                          ? "row-span-2"
                          : "col-span-2 row-span-2",
                      layout.first,
                    )
                  : top.length < 3 && "row-span-2 sm:col-span-1 sm:row-span-1",
              )}
            >
              <CarThumb car={c} className="absolute inset-0 size-full" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
              <CarMarks
                car={c}
                primary="chase"
                className="absolute right-2.5 top-2.5 rounded-full bg-black/60 px-1.5 py-1 backdrop-blur-sm"
                iconClassName="size-3.5"
              />
              <div className="absolute inset-x-0 bottom-0 p-2.5 text-white">
                <div
                  className={cn(
                    "line-clamp-2 font-semibold leading-tight",
                    first ? "text-base" : "text-[13px]",
                  )}
                >
                  {name}
                </div>
                <div className="truncate text-[11px] text-white/70">
                  {[c.brand, c.assortment].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{more > 0 ? `+${more} more` : ""}</span>
        <Link
          to="/favourites"
          className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
        >
          View all <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}

function Eyebrow() {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
      <Gem className="size-3.5" />
      Prized possessions
    </div>
  );
}
