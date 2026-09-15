import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  CalendarDays,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Home,
  Settings,
  ShoppingBag,
  Star,
  Table,
  Truck,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCars } from "@/lib/cars-store";
import { useAuth, fullName } from "@/lib/auth-store";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import { inrFull } from "@/lib/format";

/** Default tabs when on Home, Habits, or general root screens. */
const DEFAULT_TABS = [
  { title: "Home", url: "/", icon: Home },
  { title: "Inventory", url: "/inventory", icon: Table },
  { title: "Orders", url: "/orders", icon: Truck },
  { title: "Habit", url: "/habits", icon: CalendarDays },
] as const;

/** Sub-tabs shown when navigating into Inventory. */
const INVENTORY_TABS = [
  { title: "Inventory", url: "/inventory", icon: Table },
  { title: "Favourites", url: "/favourites", icon: Star },
  { title: "Collections", url: "/collection", icon: Boxes },
] as const;

/** Sub-tabs shown when navigating into Orders. */
const ORDERS_TABS = [
  { title: "Orders", url: "/orders", icon: Truck },
  { title: "Pre-orders", url: "/preorders", icon: ShoppingBag },
  { title: "Duplicates", url: "/duplicates", icon: Copy },
] as const;

/** "Mervin Kalaimani" -> "MK"; a single name gives one letter. */
function initialsOf(name: string, fallback: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return (fallback.trim()[0] || "?").toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
    let lastY = window.scrollY;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      const y = window.scrollY;
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
      clearTimeout(timer);
    };
  }, [enabled]);

  return compact;
}

export function MobileNav() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const { profile, isAdmin, isOwner, isGuest } = useAuth();
  const { hideInvestment, setHideInvestment, query } = useApp();
  const allCars = useCars();
  const [localReveal, setLocalReveal] = useState(false);

  const name = fullName(profile);
  const display = name || profile?.email_id || "Signed in";

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

  // ISO rows are wishlist entries, not cars owned — the same exclusion the
  // sidebar's totals make.
  const stats = useMemo(() => {
    const rows = filterRows(allCars, query).filter(
      (r) => (r.status || "").trim().toLowerCase() !== "iso",
    );
    return {
      total: rows.length,
      spent: rows.reduce((s, r) => s + (r.spent || 0), 0),
    };
  }, [allCars, query]);

  const hidden = hideInvestment && !localReveal;
  const close = () => setMenuOpen(false);
  const compact = useScrollCompact(!menuOpen);

  return (
    <>
      <nav
        aria-label="Primary"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:hidden"
        // One fixed gap on all three sides, the same on every phone: it no
        // longer follows the home-indicator inset, so the bar sits in exactly
        // the same place everywhere. 16px clears the home line (a few pixels
        // tall, ~8px from the edge). The bar's own height is untouched.
        style={{ paddingBottom: "16px", paddingLeft: "16px", paddingRight: "16px" }}
      >
        {/* Scrolling down shrinks the bar to 60% and drops it towards the home
            line; it grows back a second after the scrolling stops. Scaled
            from the bottom edge so it settles down rather than floating in
            mid-air. */}
        <div
          className="origin-bottom transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: compact ? "translateY(6px) scale(0.6)" : undefined }}
        >
          {navMode === "default" ? (
            /* ===================================================================== */
            /* 1. DEFAULT NAVBAR: Home, Inventory, Orders, Habit, Menu               */
            /* ===================================================================== */
            <div
              className="
              pointer-events-auto relative flex min-h-[62px] items-stretch gap-1 rounded-[2.5rem] p-1.5
              border border-black/10 bg-background/80 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.4)]
              backdrop-blur-2xl backdrop-saturate-150
              dark:border-white/10 dark:bg-background/70
              before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px
              before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent
              dark:before:via-white/20
              transition-all duration-300 ease-out
            "
            >
              {DEFAULT_TABS.map((t) => {
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

              {/* Menu button */}
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label={`Menu — signed in as ${display}`}
                aria-expanded={menuOpen}
                className={`relative flex flex-1 flex-col items-center justify-center gap-1 rounded-[1.75rem] px-1 py-1.5 transition-colors ${
                  menuOpen
                    ? "bg-primary/12 font-semibold text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="relative size-6 overflow-hidden rounded-full border border-border/80 shadow-xs">
                  <Avatar className="size-full rounded-full border-0">
                    {profile?.avatar_url ? (
                      <AvatarImage
                        src={profile.avatar_url}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : null}
                    <AvatarFallback className="size-full bg-primary/20 text-[9px] font-bold">
                      {initialsOf(name, display)}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <span
                  className="text-[10px] font-bold leading-none select-none text-neutral-900 dark:text-neutral-100"
                  style={{
                    WebkitTextStroke: "0.5px #ffffff",
                    paintOrder: "stroke fill",
                  }}
                >
                  Menu
                </span>
              </button>
            </div>
          ) : (
            /* ===================================================================== */
            /* 2. DYNAMIC NAVBAR: [ Home Circle ]  [ Sub-Section ]  [ Menu Circle ]   */
            /* ===================================================================== */
            <div className="flex w-full items-center gap-2 transition-all duration-300 ease-out">
              {/* Separate Circle for Home */}
              <Link
                to="/"
                aria-label="Home"
                className="
                pointer-events-auto relative flex size-[58px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-full
                border border-black/10 bg-background/80 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.4)]
                backdrop-blur-2xl backdrop-saturate-150
                dark:border-white/10 dark:bg-background/70
                text-muted-foreground transition-all duration-200 hover:text-foreground active:scale-95
                before:pointer-events-none before:absolute before:inset-x-2 before:top-0 before:h-px
                before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent
                dark:before:via-white/20
              "
              >
                <Home className="size-5" />
                <span className="text-[10px] font-medium leading-none">Home</span>
              </Link>

              {/* Middle Dynamic Section Pill */}
              <div
                className="
                pointer-events-auto relative flex min-h-[58px] flex-1 min-w-0 items-stretch gap-1 rounded-[2.5rem] p-1.5
                border border-black/10 bg-background/80 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.4)]
                backdrop-blur-2xl backdrop-saturate-150
                dark:border-white/10 dark:bg-background/70
                before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px
                before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent
                dark:before:via-white/20
                transition-all duration-300 ease-out
              "
              >
                {(navMode === "inventory" ? INVENTORY_TABS : ORDERS_TABS).map((t) => {
                  const active = isActive(pathname, t.url);
                  return (
                    <Link
                      key={t.url}
                      to={t.url}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex flex-1 flex-col items-center justify-center gap-1 rounded-[1.75rem] px-1 py-1 transition-colors ${
                        active
                          ? "bg-primary/12 font-semibold text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <t.icon className={`size-5 ${active ? "stroke-[2.4]" : ""}`} />
                      <span className="truncate text-[10px] font-medium leading-none">
                        {t.title}
                      </span>
                    </Link>
                  );
                })}
              </div>

              {/* Separate Circle for Menu — Avatar photo fills the circle with white-stroked Menu text */}
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label={`Menu — signed in as ${display}`}
                aria-expanded={menuOpen}
                className={`
                pointer-events-auto relative flex size-[58px] shrink-0 flex-col items-center justify-end overflow-hidden rounded-full
                border border-black/15 bg-background/80 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.4)]
                backdrop-blur-2xl backdrop-saturate-150
                dark:border-white/20 dark:bg-background/70
                transition-all duration-200 active:scale-95
                ${menuOpen ? "ring-2 ring-primary ring-offset-1" : ""}
              `}
              >
                <Avatar className="absolute inset-0 size-full rounded-full border-0">
                  {profile?.avatar_url ? (
                    <AvatarImage
                      src={profile.avatar_url}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : null}
                  <AvatarFallback className="size-full bg-primary/20 text-xs font-bold text-foreground">
                    {initialsOf(name, display)}
                  </AvatarFallback>
                </Avatar>

                {/* Bottom vignette so text remains crisp and readable over any avatar */}
                <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

                {/* Menu text with white stroke */}
                <span
                  className="relative z-10 pb-1 text-[10px] font-extrabold tracking-tight text-neutral-950 select-none drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
                  style={{
                    WebkitTextStroke: "0.75px #ffffff",
                    paintOrder: "stroke fill",
                  }}
                >
                  Menu
                </span>
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* ===================================================================== */}
      {/* MENU SHEET: User details, Cars list, Cost details, Settings           */}
      {/* ===================================================================== */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85svh] overflow-y-auto rounded-t-[2.5rem] border-t border-border p-4 pb-[max(2rem,calc(env(safe-area-inset-bottom)+1rem))]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>

          {/* 1. User Details */}
          <div className="flex items-center gap-3.5 rounded-2xl border border-border/80 bg-muted/40 p-3.5 shadow-xs">
            <Avatar className="size-12 border border-border shadow-xs">
              {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
              <AvatarFallback className="bg-muted text-sm font-semibold">
                {initialsOf(name, display)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">{display}</span>
                {isOwner && (
                  <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                    Owner
                  </span>
                )}
                {!isOwner && isAdmin && (
                  <span className="shrink-0 rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-medium text-sky-500">
                    Admin
                  </span>
                )}
                {isGuest && (
                  <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-500">
                    Demo
                  </span>
                )}
              </div>
              {profile?.email_id && (
                <div className="truncate text-xs text-muted-foreground">{profile.email_id}</div>
              )}
            </div>
          </div>

          {/* 2. Cars list & Cost details */}
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Link
              to="/inventory"
              onClick={close}
              className="group block rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-colors hover:bg-muted/40 active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Cars list
                </div>
                <Table className="size-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
              </div>
              <div className="text-display mt-1 text-xl font-bold tabular-nums text-foreground">
                {stats.total.toLocaleString()}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">View diecast inventory</div>
            </Link>

            <div className="rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs">
              <div className="flex items-center justify-between gap-1">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Cost details
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="-mr-1 size-6 shrink-0"
                  onClick={() => {
                    if (hideInvestment) setLocalReveal((v) => !v);
                    else setHideInvestment(true);
                  }}
                  aria-label={hidden ? "Show cost details" : "Hide cost details"}
                >
                  {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </Button>
              </div>
              <div className="text-display mt-1 truncate text-xl font-bold tabular-nums text-foreground">
                {hidden ? "••••••" : inrFull(stats.spent)}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">Total spent on cars</div>
            </div>
          </div>

          {/* 3. Settings */}
          <div className="mt-3 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
            <Link
              to="/settings"
              onClick={close}
              className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 active:bg-muted/60"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                <Settings className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">Settings</div>
                <div className="text-xs text-muted-foreground">
                  Account, display, notifications &amp; admin controls
                </div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
