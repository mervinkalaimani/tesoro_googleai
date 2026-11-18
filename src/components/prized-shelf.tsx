import { useEffect, useMemo, useRef, useState } from "react";
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

/**
 * The phone's shelf: a coverflow. Five cars on a curve, the middle one largest
 * and each step outwards smaller and turned further away, with a swipe to bring
 * the next one to the middle. A tap on the middle car opens it; a tap on one of
 * the others brings it to the middle.
 */
const STEP = [
  // How far from the middle, in card widths; its scale; its turn away; its depth.
  // The middle card is 58% of the row, so all five show: the pair either side
  // tuck in under its edges, and the outer pair peek out beyond them, the whole
  // fan reaching the page padding and no further.
  { x: 0, scale: 1, turn: 0, z: 0, opacity: 1 },
  { x: 0.3, scale: 0.82, turn: 32, z: -50, opacity: 1 },
  { x: 0.66, scale: 0.66, turn: 44, z: -100, opacity: 0.85 },
  { x: 0.76, scale: 0.5, turn: 50, z: -150, opacity: 0 },
];

function PrizedCoverflow({ cars, onOpen }: { cars: Diecast[]; onOpen: (c: Diecast) => void }) {
  const n = cars.length;
  const [mid, setMid] = useState(0);
  const start = useRef<{ x: number; at: number } | null>(null);
  const moved = useRef(false);

  const span = Math.min(5, n);
  const first = -Math.floor((span - 1) / 2);
  // With enough cars, one more either side waits just out of sight, so a car
  // slides in from the edge rather than appearing.
  const extra = n >= 7 ? 1 : 0;
  const offsets = Array.from({ length: span + extra * 2 }, (_, i) => first - extra + i);
  const wrap = (i: number) => ((i % n) + n) % n;

  const go = (by: number) => setMid((m) => wrap(m + by));

  // A fast swipe runs through several cars, one after another, so the row turns
  // like a wheel that was flicked rather than jumping. How far depends on how
  // far the finger went and how fast.
  const timers = useRef<number[]>([]);
  const stopTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => stopTimers, []);
  const flick = (dir: 1 | -1, steps: number) => {
    stopTimers();
    for (let i = 0; i < steps; i++) {
      // Each step a little slower than the last, so the wheel winds down.
      const at = i * 70 + i * i * 12;
      timers.current.push(window.setTimeout(() => go(dir), at));
    }
  };

  return (
    <div
      className="relative mt-3 aspect-[100/71.5] select-none overflow-hidden [perspective:900px]"
      style={{ touchAction: "pan-y" }}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, at: Date.now() };
        moved.current = false;
      }}
      onPointerMove={(e) => {
        if (start.current && Math.abs(e.clientX - start.current.x) > 8) moved.current = true;
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        if (Math.abs(dx) <= 32) return;
        const speed = Math.abs(dx) / Math.max(1, Date.now() - s.at); // px per ms
        const steps = Math.min(
          7,
          1 + Math.floor(Math.abs(dx) / 150) + Math.floor(Math.max(0, speed - 0.6) * 4),
        );
        flick(dx < 0 ? 1 : -1, steps);
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
    >
      {offsets.map((o) => {
        const car = cars[wrap(mid + o)];
        const a = Math.min(Math.abs(o), 3);
        const side = Math.sign(o);
        const st = STEP[a];
        const name = car.name || `${car.make} ${car.model}`.trim() || "Unnamed car";
        return (
          <button
            key={wrap(mid + o)}
            type="button"
            title={name}
            tabIndex={o === 0 ? 0 : -1}
            onClick={() => {
              if (moved.current) return;
              if (o === 0) onOpen(car);
              else go(o);
            }}
            className="absolute left-1/2 top-1/2 aspect-[534/658] w-[58%] overflow-hidden rounded-3xl border border-white/15 text-left shadow-[0_18px_40px_-14px_rgba(0,0,0,0.8)] transition-[transform,opacity] duration-500 ease-out motion-reduce:transition-none"
            style={{
              zIndex: 10 - a,
              opacity: st.opacity,
              pointerEvents: a === 3 ? "none" : undefined,
              transform: `translate(-50%, -50%) translateX(${side * st.x * 100}%) translateZ(${st.z}px) rotateY(${-side * st.turn}deg) scale(${st.scale})`,
            }}
          >
            <CarThumb car={car} className="absolute inset-0 size-full" />
            <div
              className={cn(
                "absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent transition-opacity duration-500",
                o === 0 ? "opacity-100" : "opacity-60",
              )}
            />
            <CarMarks
              car={car}
              primary="chase"
              className="absolute right-2.5 top-2.5 rounded-full bg-black/60 px-1.5 py-1 backdrop-blur-sm"
              iconClassName="size-3.5"
            />
            <div
              className={cn(
                "absolute inset-x-0 bottom-0 p-3 text-white transition-opacity duration-300",
                o === 0 ? "opacity-100" : "opacity-0",
              )}
            >
              <div className="line-clamp-2 text-base font-semibold leading-tight">{name}</div>
              <div className="truncate text-xs text-white/70">
                {[car.brand, car.assortment].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

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

  // The phone's order is fixed once it has mounted — a coverflow that reshuffled
  // under your thumb would be no use — and random only so the first car varies.
  const [phoneSeed, setPhoneSeed] = useState(0);
  useEffect(() => setPhoneSeed(Math.floor(Math.random() * 1e9) + 1), []);

  // One pool, every kind mixed: a car that is both a chase and a favourite is
  // one car, not two. The counts are a legend, not a control.
  const counts = useMemo(
    () => SHELVES.map((sh) => ({ ...sh, n: rows.filter(sh.has).length })).filter((g) => g.n > 0),
    [rows],
  );
  const pool = useMemo(() => rows.filter((c) => SHELVES.some((sh) => sh.has(c))), [rows]);

  const phoneCars = useMemo(() => {
    const rand = rng(phoneSeed);
    const cars = [...pool];
    if (phoneSeed !== 0) {
      for (let i = cars.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [cars[i], cars[j]] = [cars[j], cars[i]];
      }
    }
    return cars;
  }, [pool, phoneSeed]);

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

  const legend = (
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
  );

  return (
    <>
      {/* PHONE: no frame, a taller shelf, and the cars on a curve. */}
      <section className="min-w-0 pb-4 sm:hidden">
        <div className="flex items-start justify-between gap-3 px-1">
          <div className="min-w-0">
            <Eyebrow />
            <div className="mt-1 text-2xl font-semibold tracking-tight">
              {pool.length} prized {pool.length === 1 ? "car" : "cars"}
            </div>
          </div>
          {legend}
        </div>
        <PrizedCoverflow cars={phoneCars} onOpen={open} />
        <div className="flex items-center justify-end px-1 text-xs text-muted-foreground">
          <Link
            to="/favourites"
            className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
          >
            View all <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </section>

      <section className="card-elevated hidden min-w-0 p-4 [--frame-gap:1rem] sm:block md:p-5 md:[--frame-gap:1.25rem]">
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
                  "group relative min-h-0 overflow-hidden rounded-[calc(1.5rem-var(--frame-gap))] border border-border/60 text-left",
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
    </>
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
