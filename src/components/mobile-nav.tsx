import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Boxes,
  CalendarDays,
  Copy,
  Database,
  Eye,
  EyeOff,
  Home,
  LogOut,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Star,
  Table,
  Truck,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCars, useCarsSource } from "@/lib/cars-store";
import { useAuth, fullName } from "@/lib/auth-store";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import { inrFull } from "@/lib/format";

/**
 * The bar along the bottom of a phone.
 *
 * Four destinations and a way to everything else, which is the iOS shape and
 * the right one here: the sidebar is reachable on a phone only by swiping in
 * from the edge, so the pages people actually use were two gestures away. These
 * four are the ones worth a permanent thumb's reach; the rest live behind Menu.
 *
 * Glass, in the current iOS sense: a floating pill rather than a bar welded to
 * the bottom edge, translucent enough that the list keeps scrolling visibly
 * underneath it, blurred and saturated so the colour below reads as tint rather
 * than as clutter, with a hairline that is light on top and dark underneath.
 */
const TABS = [
  { title: "Home", url: "/", icon: Home },
  { title: "Favourites", url: "/favourites", icon: Star },
  { title: "Orders", url: "/orders", icon: Truck },
  { title: "Inventory", url: "/inventory", icon: Table },
] as const;

/** Pages behind Menu, in the order they are listed there. */
const MENU_NAV = [
  { title: "Collection", url: "/collection", icon: Boxes },
  { title: "Pre-orders", url: "/preorders", icon: ShoppingBag },
  { title: "Habits", url: "/habits", icon: CalendarDays },
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

/** One row in the menu sheet. */
function MenuLink({
  to,
  icon: Icon,
  children,
  onNavigate,
  tone = "default",
}: {
  to: string;
  icon: typeof Boxes;
  children: React.ReactNode;
  onNavigate: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
        tone === "danger"
          ? "text-rose-500 hover:bg-rose-500/10"
          : "text-foreground hover:bg-muted/60"
      }`}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      {children}
    </Link>
  );
}

export function MobileNav() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const { profile, isAdmin, isOwner, isGuest, signOut } = useAuth();
  const { hideInvestment, setHideInvestment, query } = useApp();
  const { source } = useCarsSource();
  const allCars = useCars();
  const [localReveal, setLocalReveal] = useState(false);

  const name = fullName(profile);
  const display = name || profile?.email_id || "Signed in";

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
  const menuActive = MENU_NAV.some((m) => isActive(pathname, m.url));

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div
          className="
            relative mx-3 mb-3 flex items-stretch gap-0.5 rounded-[1.75rem] p-1.5
            border border-black/10 bg-background/70 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.45)]
            backdrop-blur-2xl backdrop-saturate-150
            dark:border-white/10 dark:bg-background/60
            before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px
            before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent
            dark:before:via-white/20
          "
        >
          {TABS.map((t) => {
            const active = isActive(pathname, t.url);
            return (
              <Link
                key={t.url}
                to={t.url}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[1.25rem] px-1 py-1.5 transition-colors ${
                  active ? "bg-primary/12 text-primary" : "text-muted-foreground"
                }`}
              >
                <t.icon className={`size-5 ${active ? "stroke-[2.4]" : ""}`} />
                <span className="text-[10px] font-medium leading-none">{t.title}</span>
              </Link>
            );
          })}

          {/* The avatar is the icon. On a phone the account is the thing behind
              "everything else", so the face is a better label for this than a
              hamburger — and it is the only item here that is about you rather
              than about the cars. */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={`Menu — signed in as ${display}`}
            aria-expanded={menuOpen}
            className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[1.25rem] px-1 py-1.5 transition-colors ${
              menuOpen || menuActive ? "bg-primary/12 text-primary" : "text-muted-foreground"
            }`}
          >
            <Avatar className="size-5 border border-border">
              {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
              <AvatarFallback className="bg-muted text-[9px] font-semibold">
                {initialsOf(name, display)}
              </AvatarFallback>
            </Avatar>
            <span className="text-[10px] font-medium leading-none">Menu</span>
          </button>
        </div>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[88svh] overflow-y-auto rounded-t-3xl border-t border-border p-4 pb-8"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>

          {/* 1. Who you are, in a container of its own. */}
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 p-3">
            <Avatar className="size-11 border border-border">
              {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
              <AvatarFallback className="bg-muted text-sm font-semibold">
                {initialsOf(name, display)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{display}</div>
              {profile?.user_id && profile.user_id !== display && (
                <div className="truncate text-xs text-muted-foreground">{profile.user_id}</div>
              )}
            </div>
          </div>

          {/* 2. space — 3-6. the rest of the pages */}
          <div className="mt-4 space-y-0.5">
            {MENU_NAV.map((m) => (
              <MenuLink key={m.url} to={m.url} icon={m.icon} onNavigate={close}>
                {m.title}
              </MenuLink>
            ))}
          </div>

          {/* 7. space — 8. cars & investment, the pair that used to be readable
              only with the sidebar open, which on a phone is never. */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-border bg-muted/30 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total cars
              </div>
              <div className="text-display mt-0.5 text-lg font-semibold tabular-nums">
                {stats.total.toLocaleString()}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Investment
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="-mr-1 size-6 shrink-0"
                  onClick={() => {
                    if (hideInvestment) setLocalReveal((v) => !v);
                    else setHideInvestment(true);
                  }}
                  aria-label={hidden ? "Show investment" : "Hide investment"}
                >
                  {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </Button>
              </div>
              <div className="text-display mt-0.5 truncate text-lg font-semibold tabular-nums">
                {hidden ? "••••••" : inrFull(stats.spent)}
              </div>
            </div>
          </div>

          {/* 9. space — 10. database, the owner's only */}
          {isOwner && (
            <div className="mt-4">
              <Link
                to="/settings"
                onClick={close}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-muted/60"
              >
                <Database className="size-4 shrink-0 text-primary" />
                <span>Database</span>
                <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                  {source === "supabase" ? "Supabase synced" : "Local"}
                  <span
                    className={`inline-block size-1.5 rounded-full ${
                      source === "supabase" ? "bg-emerald-500" : "bg-primary/80"
                    }`}
                  />
                </span>
              </Link>
            </div>
          )}

          {/* 11-16. the account, each behind its own rule */}
          <div className="mt-2 border-t border-border pt-2">
            <MenuLink to="/settings" icon={Settings} onNavigate={close}>
              Settings
            </MenuLink>
          </div>

          {isAdmin && (
            <div className="mt-2 border-t border-border pt-2">
              <MenuLink to="/admin" icon={ShieldCheck} onNavigate={close}>
                Admin
              </MenuLink>
            </div>
          )}

          <div className="mt-2 border-t border-border pt-2">
            <button
              type="button"
              onClick={() => {
                close();
                void signOut();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-rose-500 transition-colors hover:bg-rose-500/10"
            >
              <LogOut className="size-4 shrink-0" />
              {isGuest ? "Leave demo" : "Logout"}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
