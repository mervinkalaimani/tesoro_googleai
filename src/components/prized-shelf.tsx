import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

/** The most cars the shelf ever cycles through. */
const MAX_SHELF = 10;

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
  { x: 0.55, scale: 0.8, turn: 32, z: -50, opacity: 1 },
  { x: 0.88, scale: 0.62, turn: 44, z: -100, opacity: 0.85 },
  { x: 1.0, scale: 0.46, turn: 50, z: -150, opacity: 0 },
];

/**
 * The wide variant is the old iOS music player's Cover Flow: the front car sits
 * toward the left with one car beside it, and the rest fan out to the right,
 * each one a little smaller and a little further turned away.
 */
const WIDE_LEFT = [
  { x: 0, scale: 1, turn: 0, z: 0, opacity: 1 },
  { x: 0.62, scale: 0.86, turn: 38, z: -50, opacity: 1 },
  { x: 0.95, scale: 0.7, turn: 45, z: -120, opacity: 0 },
];
const WIDE_PERSPECTIVE = 1500;
const WIDE_RIGHT = [
  { x: 0, scale: 1, turn: 0, z: 0, opacity: 1 },
  { x: 0.78, scale: 0.86, turn: 40, z: -50, opacity: 1 },
  { x: 0.98, scale: 0.8, turn: 42, z: -90, opacity: 1 },
  { x: 1.18, scale: 0.75, turn: 44, z: -130, opacity: 1 },
  { x: 1.38, scale: 0.7, turn: 46, z: -170, opacity: 1 },
  { x: 1.58, scale: 0.66, turn: 48, z: -210, opacity: 1 },
  { x: 1.78, scale: 0.62, turn: 50, z: -250, opacity: 1 },
  { x: 1.98, scale: 0.58, turn: 52, z: -290, opacity: 1 },
  { x: 2.18, scale: 0.54, turn: 54, z: -330, opacity: 1 },
  { x: 2.4, scale: 0.5, turn: 56, z: -370, opacity: 0 },
];

type Step = { x: number; scale: number; turn: number; z: number; opacity: number };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function PrizedCoverflow({
  cars,
  onOpen,
  wide = false,
}: {
  cars: Diecast[];
  onOpen: (c: Diecast) => void;
  wide?: boolean;
}) {
  const n = cars.length;
  const wrap = (i: number) => ((i % n) + n) % n;

  // The row turns on a continuous position, not a count of steps: `pos` is
  // which car is in front, fractions included, so a wheel, a trackpad or a finger
  // moves it exactly as far as it goes, and it settles on the nearest car once
  // the input stops. Every car's place is worked out from how far it is from `pos`.
  const [pos, setPos] = useState(0);
  const posRef = useRef(0);
  const targetRef = useRef(0);
  const raf = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(0);
  const hovering = useRef(false);

  const set = (v: number) => {
    posRef.current = v;
    setPos(v);
  };
  /** Glide to a position, easing out. A new target replaces one still moving. */
  const glideTo = (target: number) => {
    targetRef.current = target;
    cancelAnimationFrame(raf.current);
    const from = posRef.current;
    const t0 = performance.now();
    const ms = Math.min(900, 300 + Math.abs(target - from) * 110);
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      set(lerp(from, target, 1 - Math.pow(1 - t, 3)));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  /** Step by whole cars from wherever the row is heading. */
  const go = (by: number) => glideTo(Math.round(targetRef.current) + by);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Pixels of travel that bring the next car to the front.
  const PX_PER_CAR = wide ? 150 : 110;

  // The wide shelf turns by itself, one car at a time, and waits while the
  // pointer is on it.
  useEffect(() => {
    if (!wide) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const iv = window.setInterval(() => {
      if (!hovering.current && document.visibilityState === "visible") go(1);
    }, 4500);
    return () => window.clearInterval(iv);
  }, [wide, n]);

  // The row's width, so the wide fan can stretch to end exactly at its right edge.
  useEffect(() => {
    const el = box.current;
    if (!wide || !el) return;
    const ro = new ResizeObserver(() => setCw(el.clientWidth));
    ro.observe(el);
    setCw(el.clientWidth);
    return () => ro.disconnect();
  }, [wide]);

  // A trackpad's two-finger sideways swipe, a mouse's sideways wheel (or shift +
  // wheel) moves the row as it comes, on any screen size, and it settles when the
  // input stops. Vertical scrolling is left alone, so the page still scrolls past
  // it. A native listener, because React's wheel handler is passive and could not
  // stop the browser treating a sideways swipe as "go back".
  useEffect(() => {
    const el = box.current;
    if (!el || n < 2) return;
    let idle = 0;
    const onWheel = (e: WheelEvent) => {
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
      if (!sideways) return;
      e.preventDefault();
      cancelAnimationFrame(raf.current);
      const d = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      set(posRef.current + d / PX_PER_CAR);
      targetRef.current = posRef.current;
      window.clearTimeout(idle);
      idle = window.setTimeout(() => glideTo(Math.round(posRef.current)), 130);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.clearTimeout(idle);
    };
  }, [n, PX_PER_CAR]);

  // Dragging follows the finger, and lets go with the speed it had.
  const drag = useRef<{ x: number; pos: number; at: number; lastX: number; lastAt: number } | null>(
    null,
  );
  const moved = useRef(false);

  // Where a car at `d` cars from the front sits. Between whole cars it is blended
  // from the two either side, so the row moves smoothly rather than in steps.
  const rem =
    typeof document === "undefined"
      ? 16
      : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const cardW = 18 * rem;
  const rightCount = Math.max(1, Math.min(10, n) - 2);
  const wideX = (j: number) => {
    const last = WIDE_RIGHT[Math.min(rightCount, WIDE_RIGHT.length - 1)];
    // Where the last car's centre must be on screen for its right edge to meet the
    // row's edge; then back out the perspective, which draws far cars toward the
    // middle (PERSPECTIVE / (PERSPECTIVE + depth)).
    const screenCentre = cw - cardW * last.scale * 0.32 - 36;
    const shrink = WIDE_PERSPECTIVE / (WIDE_PERSPECTIVE + Math.abs(last.z));
    const lastCentre = cw / 2 + (screenCentre - cw / 2) / shrink;
    const lastX = (lastCentre - 0.3 * cw) / cardW;
    const x1 = WIDE_RIGHT[1].x;
    return rightCount <= 1 ? x1 : x1 + ((j - 1) * (lastX - x1)) / (rightCount - 1);
  };
  const stepOf = (side: number, j: number): Step => {
    const table = wide ? (side < 0 ? WIDE_LEFT : WIDE_RIGHT) : STEP;
    const e = table[Math.min(j, table.length - 1)];
    const x = wide && side > 0 && j >= 1 && cw > 0 ? wideX(j) : e.x;
    return { ...e, x, opacity: j > table.length - 1 ? 0 : e.opacity };
  };
  const styleAt = (d: number) => {
    const side = d < 0 ? -1 : 1;
    const m = Math.abs(d);
    const lo = Math.floor(m);
    const t = m - lo;
    const A = stepOf(side, lo);
    const B = stepOf(side, lo + 1);
    return {
      side,
      m,
      x: lerp(A.x, B.x, t),
      scale: lerp(A.scale, B.scale, t),
      turn: lerp(A.turn, B.turn, t),
      z: lerp(A.z, B.z, t),
      opacity: lerp(A.opacity, B.opacity, t),
    };
  };

  // Which cars to draw: a window round the front one, as wide as the fan.
  const base = Math.round(pos);
  const reach = wide ? Math.min(10, n) + 1 : Math.min(5, n) + 1;
  const behind = wide ? 2 : Math.floor(reach / 2) + 1;
  const offsets = Array.from({ length: reach + 2 }, (_, i) => i - behind);

  return (
    <div
      ref={box}
      className={cn(
        "relative select-none overflow-hidden",
        wide ? "mt-4 h-[27rem] [perspective:1500px]" : "mt-3 aspect-[100/62] [perspective:900px]",
      )}
      style={{ touchAction: "pan-y", overscrollBehaviorX: "contain" }}
      onPointerEnter={() => {
        hovering.current = true;
      }}
      onPointerLeave={() => {
        hovering.current = false;
      }}
      onPointerDown={(e) => {
        cancelAnimationFrame(raf.current);
        drag.current = {
          x: e.clientX,
          pos: posRef.current,
          at: Date.now(),
          lastX: e.clientX,
          lastAt: Date.now(),
        };
        moved.current = false;
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        if (Math.abs(e.clientX - d.x) > 8) moved.current = true;
        if (!moved.current) return;
        set(d.pos - (e.clientX - d.x) / PX_PER_CAR);
        targetRef.current = posRef.current;
        d.lastX = e.clientX;
        d.lastAt = Date.now();
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d || !moved.current) return;
        // Let go with the speed the finger had: a flick carries on past where it
        // was lifted, a slow drag settles on the nearest car.
        const dt = Math.max(1, Date.now() - d.lastAt + 16);
        const v = (d.lastX - e.clientX) / dt; // px per ms, positive = towards the next car
        const carry = (Date.now() - d.lastAt < 120 ? v : 0) * 220;
        glideTo(Math.round(posRef.current + carry / PX_PER_CAR));
      }}
      onPointerCancel={() => {
        drag.current = null;
        glideTo(Math.round(posRef.current));
      }}
    >
      {offsets.map((o) => {
        const idx = base + o;
        const car = cars[wrap(idx)];
        const st = styleAt(idx - pos);
        const name = car.name || `${car.make} ${car.model}`.trim() || "Unnamed car";
        const front = Math.max(0, 1 - st.m * 2);
        return (
          <button
            key={idx}
            type="button"
            title={name}
            tabIndex={o === 0 ? 0 : -1}
            onClick={() => {
              if (moved.current) return;
              if (idx === base) onOpen(car);
              else go(idx - base);
            }}
            className={cn(
              "absolute top-1/2 aspect-[534/658] overflow-hidden rounded-3xl border border-white/15 text-left shadow-[0_18px_40px_-14px_rgba(0,0,0,0.8)]",
              wide ? "w-[18rem]" : "w-[46%]",
            )}
            style={{
              left: wide ? "30%" : "50%",
              zIndex: 100 - Math.round(st.m * 10),
              opacity: st.opacity,
              pointerEvents: st.opacity < 0.05 ? "none" : undefined,
              transform: `translate(-50%, -50%) translateX(${st.side * st.x * 100}%) translateZ(${st.z}px) rotateY(${-st.side * st.turn}deg) scale(${st.scale})`,
              willChange: "transform, opacity",
            }}
          >
            <CarThumb car={car} className="absolute inset-0 size-full" />
            <div
              className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent"
              style={{ opacity: 0.6 + 0.4 * front }}
            />
            <CarMarks
              car={car}
              primary="chase"
              className="absolute right-2.5 top-2.5 rounded-full bg-black/60 px-1.5 py-1 backdrop-blur-sm"
              iconClassName="size-3.5"
            />
            <div className="absolute inset-x-0 bottom-0 p-2.5 text-white" style={{ opacity: front }}>
              <div className="line-clamp-2 text-xs font-semibold leading-tight sm:text-sm">{name}</div>
              <div className="truncate text-[10px] text-white/70 sm:text-xs">
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
    // No more than ten, however many qualify: the shelf is a window on the best
    // of them, and "View all" is the rest.
    return cars.slice(0, MAX_SHELF);
  }, [pool, phoneSeed]);

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
            <h2 className="text-display text-lg font-semibold">Prized possessions</h2>
            <p className="text-xs text-muted-foreground">Chase, STH, TH and favourites</p>
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

      <section className="hidden min-w-0 sm:block">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-display text-lg font-semibold">Prized possessions</h2>
            <p className="text-xs text-muted-foreground">Chase, STH, TH and favourites</p>
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

        <PrizedCoverflow cars={phoneCars} onOpen={open} wide />

        <div className="mt-3 flex items-center justify-end text-xs text-muted-foreground">
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
