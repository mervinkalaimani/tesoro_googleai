import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  ClipboardList,
  Gavel,
  Home,
  Library,
  Package,
  Search,
  Store,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";

import { HomeScreenMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { dateTime } from "../format";
import { api, run, useMarket, useMarketCatalogue, useMounted, useNow } from "../use-market";

const NAV_BUY = [
  { to: "/market", label: "Home", icon: Home, exact: true },
  { to: "/market/search", label: "Search", icon: Search },
  { to: "/market/events", label: "Events", icon: Gavel },
  { to: "/market/collection", label: "Collection", icon: Library },
  { to: "/market/orders", label: "Orders", icon: Package },
] as const;
const NAV_SELL = [
  { to: "/market/sell", label: "Dashboard", icon: Store, exact: true },
  { to: "/market/sell/listings", label: "Listings", icon: ClipboardList },
  { to: "/market/sell/orders", label: "Orders", icon: Package },
  { to: "/market/sell/events", label: "Events", icon: Gavel },
] as const;

/** Installable PWA: swap in the marketplace manifest and register its worker (scope /market). */
function usePwa() {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const prev = link?.getAttribute("href") ?? null;
    link?.setAttribute("href", "/market.webmanifest");
    if ("serviceWorker" in navigator && !import.meta.env.DEV)
      navigator.serviceWorker.register("/market-sw.js", { scope: "/market" }).catch(() => {});
    return () => {
      if (link && prev) link.setAttribute("href", prev);
    };
  }, []);
}

function Offline() {
  const [off, setOff] = useState(false);
  useEffect(() => {
    const sync = () => setOff(!navigator.onLine);
    sync();
    addEventListener("online", sync);
    addEventListener("offline", sync);
    return () => (removeEventListener("online", sync), removeEventListener("offline", sync));
  }, []);
  if (!off) return null;
  return (
    <p
      role="status"
      className="bg-amber-500/15 px-4 py-1.5 text-center text-xs text-amber-700 dark:text-amber-400"
    >
      You're offline. You can read what's already loaded, but orders, bids and shipping updates
      won't go through until you reconnect.
    </p>
  );
}

function Bell_() {
  const { s, me } = useMarket();
  const mounted = useMounted();
  const mine = me ? s.notifications.filter((n) => n.userId === me.id) : [];
  const unread = mine.filter((n) => !n.read).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          className="relative"
        >
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          {unread > 0 && (
            <button className="text-xs text-primary underline" onClick={() => api.markRead("all")}>
              Mark all read
            </button>
          )}
        </div>
        <ul className="max-h-80 overflow-auto">
          {!me && (
            <li className="p-4 text-sm text-muted-foreground">
              Sign in to see order and event updates.
            </li>
          )}
          {me && !mine.length && (
            <li className="p-4 text-sm text-muted-foreground">
              Nothing yet. Order, outbid and result updates appear here.
            </li>
          )}
          {mine.slice(0, 20).map((n) => (
            <li
              key={n.id}
              className={cn(
                "border-b border-border/60 px-3 py-2 text-sm last:border-0",
                !n.read && "bg-primary/5",
              )}
            >
              {n.href ? (
                <Link
                  to={n.href}
                  onClick={() => api.markRead(n.id)}
                  className="block hover:underline"
                >
                  {n.text}
                </Link>
              ) : (
                n.text
              )}
              {mounted && (
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {dateTime(n.at)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function MarketLayout() {
  usePwa();
  useMarketCatalogue();
  useNow(15_000); // closes due events even on pages that don't render a clock
  const { s, me } = useMarket();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const hasStore = !!me && s.sellers.some((x) => x.userId === me.id);
  const selling = !!me?.sellerMode && hasStore;
  const nav = selling ? NAV_SELL : NAV_BUY;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <p className="bg-primary/15 px-4 py-1 text-center text-[11px] text-foreground">
        Demo marketplace: seeded sellers and cars, simulated payments and shipping. Nothing here is
        charged or shipped.
      </p>
      <Offline />
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 md:gap-4">
          <Link
            to="/market"
            className="flex shrink-0 items-center gap-2"
            aria-label="Viiv Market home"
          >
            <HomeScreenMark className="size-7" />
            <span className="text-sm font-semibold tracking-tight">Market</span>
          </Link>
          <form
            role="search"
            className="relative min-w-0 flex-1 md:max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              void navigate({ to: "/market/search", search: { q } as never });
            }}
          >
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search cars, series, sellers"
              placeholder="Search make, model, series, seller…"
              className="h-10 w-full rounded-full border border-input bg-muted/40 pl-9 pr-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
            />
          </form>
          <nav className="ml-2 hidden items-center gap-1 md:flex" aria-label="Main">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: "exact" in n && n.exact }}
                className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "bg-muted text-foreground" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {hasStore && (
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={() => {
                  api.setSellerMode(!selling);
                  void navigate({ to: selling ? "/market" : "/market/sell" });
                }}
              >
                {selling ? "Switch to buying" : "Switch to selling"}
              </Button>
            )}
            <Bell_ />
            <Button asChild variant="ghost" size="icon" aria-label={me ? "Account" : "Sign in"}>
              <Link to={me ? "/market/account" : "/market/signin"}>
                <User />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Main"
      >
        <ul
          className="grid"
          style={{ gridTemplateColumns: `repeat(${nav.length + 1}, minmax(0, 1fr))` }}
        >
          {nav.map((n) => (
            <li key={n.to}>
              <Link
                to={n.to}
                activeOptions={{ exact: "exact" in n && n.exact }}
                className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground"
                activeProps={{ className: "text-primary font-medium" }}
              >
                <n.icon className="size-5" aria-hidden /> {n.label}
              </Link>
            </li>
          ))}
          <li>
            <Link
              to={me ? "/market/account" : "/market/signin"}
              className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground"
              activeProps={{ className: "text-primary font-medium" }}
            >
              <User className="size-5" aria-hidden /> {me ? "Account" : "Sign in"}
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}

export { run };
