import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Boxes,
  CalendarDays,
  Copy,
  Home,
  Search,
  ShoppingBag,
  Star,
  Car,
  Truck,
} from "lucide-react";

import { useApp } from "@/lib/store";
import {
  MobileSearchBar,
  openSearch,
  useKeyboardInset,
  useSearchOpen,
} from "@/components/search-overlay";

/** Default tabs when on Home, Habits, or general root screens. */
const DEFAULT_TABS = [
  { title: "Home", url: "/", icon: Home },
  { title: "My Cars", url: "/inventory", icon: Car },
  { title: "My Orders", url: "/orders", icon: Truck },
  { title: "Habit", url: "/habits", icon: CalendarDays },
] as const;

/** Sub-tabs shown when navigating into My Cars. */
const INVENTORY_TABS = [
  { title: "My Cars", url: "/inventory", icon: Car },
  { title: "Favourites", url: "/favourites", icon: Star },
  { title: "Collection", url: "/collection", icon: Boxes },
] as const;

/** Sub-tabs shown when navigating into My Orders. */
const ORDERS_TABS = [
  { title: "My Orders", url: "/orders", icon: Truck },
  { title: "Pre Orders", url: "/preorders", icon: ShoppingBag },
  { title: "Duplicates", url: "/duplicates", icon: Copy },
] as const;

function isActive(pathname: string, url: string) {
  return url === "/" ? pathname === "/" : pathname.startsWith(url);
}

/** How long the bar stays small after the last downward scroll. */
const COMPACT_HOLD_MS = 1000;

/**
 * True while the page is being scrolled down, and for a second after: the
 * bar shrinks out of the way of what you are reading, then comes back. Small
 * jitters (a finger resting on the glass) don't count.
 */
function useScrollCompact(enabled: boolean) {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setCompact(false);
      return;
    }
    // iOS rubber-bands past the ends: pulled down at the top, scrollY goes
    // negative and then climbs back to 0, which reads as scrolling down.
    // Clamping to the real range turns the whole bounce into no movement at
    // all (and the same at the bottom).
    const clampedY = () => {
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      return Math.min(Math.max(window.scrollY, 0), max);
    };
    let lastY = clampedY();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Scroll events arrive faster than frames on a 120Hz screen; reading the
    // position once per frame keeps the handler off the scrolling thread's back.
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        check();
      });
    };
    const check = () => {
      const y = clampedY();
      const delta = y - lastY;
      if (Math.abs(delta) < 6) return;
      lastY = y;
      if (delta <= 0) return;
      setCompact(true);
      clearTimeout(timer);
      timer = setTimeout(() => setCompact(false), COMPACT_HOLD_MS);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [enabled]);

  return compact;
}

/** The frosted glass every piece of the bar is cut from. */
const GLASS = `pointer-events-auto relative border border-black/10 bg-background/80 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.4)]
  backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-background/70
  before:pointer-events-none before:absolute before:top-0 before:h-px
  before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent dark:before:via-white/20`;

const HOME_CIRCLE = `${GLASS} flex size-[58px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-full text-muted-foreground transition-all duration-200 before:inset-x-2 hover:text-foreground active:scale-95`;

function HomeCircle({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Link to="/" aria-label="Home" className={`${HOME_CIRCLE} ${className}`} style={style}>
      <Home className="size-5" />
      <span className="text-[10px] font-medium leading-none">Home</span>
    </Link>
  );
}

export function MobileNav() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { query, navAnimation } = useApp();
  const searchOpen = useSearchOpen();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const keyboard = useKeyboardInset(searchOpen);

  // Dynamic navbar mode derived from the active route
  const isInventoryMode =
    pathname.startsWith("/inventory") ||
    pathname.startsWith("/favourites") ||
    pathname.startsWith("/collection");

  const isOrdersMode =
    pathname.startsWith("/orders") ||
    pathname.startsWith("/preorders") ||
    pathname.startsWith("/duplicates");

  const navMode: "default" | "inventory" | "orders" = isInventoryMode
    ? "inventory"
    : isOrdersMode
      ? "orders"
      : "default";

  // Only a change of section animates — not the bar's first appearance. Once a
  // section has changed, each newly keyed pill plays its entrance on mount.
  const lastMode = useRef(navMode);
  const animate = useRef(false);
  if (lastMode.current !== navMode) {
    lastMode.current = navMode;
    animate.current = true;
  }
  const split = animate.current && navAnimation;

  // Settings → Display → Navbar animation switches this off.
  const compact = useScrollCompact(navAnimation && !searchOpen);
  const tabs =
    navMode === "default" ? DEFAULT_TABS : navMode === "inventory" ? INVENTORY_TABS : ORDERS_TABS;
  const filtering = query.trim().length > 0;
  const sectioned = navMode !== "default";

  return (
    <nav
      aria-label="Primary"
      // Above the suggestions' scrim while it is down, so the field stays usable.
      className={`pointer-events-none fixed inset-x-0 bottom-0 md:hidden ${drawerOpen ? "z-[60]" : "z-40"}`}
      // One fixed gap on all three sides, the same on every phone: it no
      // longer follows the home-indicator inset, so the bar sits in exactly
      // the same place everywhere. 16px clears the home line (a few pixels
      // tall, ~8px from the edge). While typing it rides on the keyboard.
      style={{ paddingBottom: 16 + keyboard, paddingLeft: "16px", paddingRight: "16px" }}
    >
      {/* Scrolling down shrinks the bar to 60% and drops it towards the home
          line; it grows back a second after the scrolling stops. Scaled
          from the bottom edge so it settles down rather than floating in
          mid-air. */}
      <div
        // will-change keeps the glass bar on its own compositor layer, so the
        // page scrolling under its blur is not repainted every frame.
        className="relative flex w-full origin-bottom items-center gap-2 transition-transform duration-300 ease-out will-change-transform motion-reduce:transition-none"
        style={{ transform: compact ? "translateY(6px) scale(0.6)" : undefined }}
      >
        {/* Inside a section Home is its own circle, and the section's pages
            split out of it. */}
        {sectioned && (
          <HomeCircle key={`home-${navMode}`} className={split ? "animate-nav-home" : ""} />
        )}

        <div
          key={navMode}
          className={`${GLASS} flex min-h-[58px] min-w-0 flex-1 items-stretch gap-1 rounded-[2.5rem] p-1.5 transition-[opacity,transform] duration-200 before:inset-x-4 ${
            split ? (sectioned ? "animate-nav-split" : "animate-nav-merge") : ""
          } ${searchOpen ? "pointer-events-none scale-95 opacity-0" : ""}`}
        >
          {tabs.map((t) => {
            const active = isActive(pathname, t.url);
            return (
              <Link
                key={t.url}
                to={t.url}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-1 flex-col items-center justify-center gap-1 rounded-[1.75rem] px-1 py-1.5 transition-colors ${
                  active
                    ? "bg-primary/12 font-semibold text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon className={`size-5 ${active ? "stroke-[2.4]" : ""}`} />
                <span className="truncate text-[10px] font-medium leading-none">{t.title}</span>
              </Link>
            );
          })}
        </div>

        {/* Search stands apart from the pages: it is not somewhere to go, it
            is a way of finding things wherever you are. */}
        <button
          type="button"
          onClick={openSearch}
          aria-label={filtering ? `Search — filtering by “${query}”` : "Search"}
          aria-expanded={searchOpen}
          className={`${GLASS} grid size-[58px] shrink-0 place-items-center rounded-full before:inset-x-2 active:scale-95 ${
            filtering ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
          style={{
            opacity: searchOpen ? 0 : 1,
            pointerEvents: searchOpen ? "none" : undefined,
            transition: searchOpen ? "opacity 60ms" : "opacity 120ms ease 260ms",
          }}
        >
          <Search className={`size-5 ${filtering ? "stroke-[2.4]" : ""}`} />
          {filtering && (
            <span
              aria-hidden
              className="absolute right-3.5 top-3.5 size-2 rounded-full border border-background bg-primary"
            />
          )}
        </button>

        {/* The search layer: Home on the left, the field filling the rest. It
            sits over the row and grows out of the search button. */}
        <div className="pointer-events-none absolute inset-0 flex items-center gap-2">
          {sectioned ? (
            // The section's Home circle is already in this spot.
            <span aria-hidden className="size-[58px] shrink-0" />
          ) : (
            <HomeCircle
              style={{
                pointerEvents: searchOpen ? "auto" : "none",
                opacity: searchOpen ? 1 : 0,
                transform: searchOpen ? "scale(1)" : "scale(0.6)",
                transition: searchOpen
                  ? "opacity 220ms ease 120ms, transform 380ms cubic-bezier(0.3,1.3,0.5,1) 120ms"
                  : "opacity 120ms ease, transform 160ms ease",
              }}
            />
          )}
          <MobileSearchBar onDrawerChange={setDrawerOpen} />
        </div>
      </div>
    </nav>
  );
}
