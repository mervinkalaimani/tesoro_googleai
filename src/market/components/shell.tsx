import { Link, Outlet, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Bell,
  ClipboardList,
  Gavel,
  Home,
  Package,
  Search,
  ShoppingCart,
  Store,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";

import { HomeScreenMark, MonogramMark } from "@/components/brand-mark";
import { AccountButton } from "@/components/account-button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { dateTime } from "../format";
import { useStoreEnabled } from "../enabled";
import { api, run, useMarket, useMounted, useNow } from "../use-market";

const NAV_BUY = [
  { to: "/market", label: "Home", icon: Home, exact: true },
  { to: "/market/search", label: "Search", icon: Search },
  { to: "/market/events", label: "Events", icon: Gavel },
  { to: "/market/orders", label: "Orders", icon: Package },
] as const;
const NAV_SELL = [
  { to: "/seller", label: "Dashboard", icon: Store, exact: true },
  { to: "/seller/catalogue", label: "Catalogue", icon: BookOpen },
  { to: "/seller/listings", label: "Listings", icon: ClipboardList },
  { to: "/seller/orders", label: "Orders", icon: Package },
  { to: "/seller/events", label: "Events", icon: Gavel },
] as const;

/** Offline shell for the store (scope /market). Installing is the Viiv app's own manifest. */
function usePwa() {
  useEffect(() => {
    if ("serviceWorker" in navigator && !import.meta.env.DEV)
      navigator.serviceWorker.register("/market-sw.js", { scope: "/market" }).catch(() => {});
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

function MarketApp() {
  usePwa();
  useNow(15_000); // closes due events even on pages that don't render a clock
  const { s, me } = useMarket();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const hasStore = !!me && s.sellers.some((x) => x.userId === me.id);
  const nav = NAV_BUY;

  return (
    <div className="bg-background">
      <p className="bg-primary/15 px-4 py-1 text-center text-[11px] text-foreground">
        Demo marketplace: seeded sellers and cars, simulated payments and shipping. Nothing here is
        charged or shipped.
      </p>
      <Offline />
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2.5 md:flex-nowrap md:gap-4">
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
          <nav
            className="order-last flex w-full items-center gap-1 overflow-x-auto md:order-none md:ml-2 md:w-auto"
            aria-label="Main"
          >
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: "exact" in n && n.exact }}
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "bg-muted text-foreground" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {hasStore && (
              <Button asChild variant="outline" size="sm" className="inline-flex">
                <Link to="/seller">Seller site</Link>
              </Button>
            )}
            <Bell_ />
            <Button asChild variant="ghost" size="icon" aria-label={me ? "Account" : "Sign in"}>
              <Link to={me ? "/market/account" : "/login"}>
                <User />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        <Outlet />
      </main>
    </div>
  );
}

export { run };

/** The store is off until it is switched on in Settings. */
export function MarketLayout() {
  const on = useStoreEnabled();
  if (on === null) return null; // not known yet (server render): show nothing rather than flash "off"
  if (!on)
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <ShoppingCart className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <h1 className="mt-3 text-xl font-semibold">VIIV Shop is off</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          It's in beta and switched off by default. Turn it on for your account in Settings.
        </p>
        <Button asChild className="mt-4">
          <Link to="/settings">Open Settings</Link>
        </Button>
      </div>
    );
  return <MarketApp />;
}

function SellerSidebar() {
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const close = () => isMobile && setOpenMobile(false);
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center">
        <Link
          to="/seller"
          aria-label="VIIV Seller"
          className="flex items-center gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <HomeScreenMark className="w-[72px] shrink-0 group-data-[collapsible=icon]:hidden" />
          <span className="text-sm font-semibold text-muted-foreground group-data-[collapsible=icon]:hidden">
            Seller
          </span>
          <MonogramMark className="hidden w-7 shrink-0 group-data-[collapsible=icon]:block" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {NAV_SELL.map((n) => (
                <SidebarMenuItem key={n.to}>
                  <SidebarMenuButton
                    asChild
                    tooltip={n.label}
                    isActive={
                      "exact" in n && n.exact
                        ? pathname === n.to
                        : pathname === n.to || pathname.startsWith(n.to + "/")
                    }
                    className="h-10 text-[14px] font-medium group-data-[collapsible=icon]:!size-9"
                  >
                    <Link to={n.to} onClick={close}>
                      <n.icon className="size-4.5" />
                      <span>{n.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="py-1">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="VIIV Shop"
                  className="h-10 text-[14px] font-medium"
                >
                  <Link to="/market" onClick={close}>
                    <ShoppingCart className="size-4.5" />
                    <span>VIIV Shop</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Back to Viiv"
                  className="h-10 text-[14px] font-medium"
                >
                  <Link to="/" onClick={close}>
                    <Home className="size-4.5" />
                    <span>Back to Viiv</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

/** Searches the catalogue for something to sell. */
function SellerSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className="relative min-w-0 max-w-md flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        void navigate({ to: "/seller/catalogue", search: { q } });
      }}
    >
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search the catalogue"
        placeholder="Search the catalogue to sell…"
        className="h-9 w-full rounded-full border border-input bg-muted/40 pl-9 pr-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
      />
    </form>
  );
}

const CRUMB: Record<string, [string, string]> = {
  catalogue: ["Catalogue", "/seller/catalogue"],
  listings: ["Listings", "/seller/listings"],
  listing: ["Listings", "/seller/listings"],
  orders: ["Orders", "/seller/orders"],
  events: ["Events", "/seller/events"],
  event: ["Events", "/seller/events"],
  setup: ["Store", "/seller/setup"],
};

/** Back button plus a trail (Seller › Listings › Edit), on every seller page but the dashboard. */
function Crumbs() {
  const router = useRouter();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [section, id] = path.split("/").filter(Boolean).slice(1);
  if (!section) return null;
  const [label, to] = CRUMB[section] ?? [section, path];
  const leaf = id ? (id === "new" ? "New" : "Edit") : null;
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Back"
        onClick={() => router.history.back()}
      >
        <ChevronLeft />
      </Button>
      <Link to="/seller" className="hover:text-foreground">
        Seller
      </Link>
      <ChevronRight className="size-3.5" />
      {leaf ? (
        <Link to={to} className="hover:text-foreground">
          {label}
        </Link>
      ) : (
        <span className="text-foreground">{label}</span>
      )}
      {leaf && (
        <>
          <ChevronRight className="size-3.5" />
          <span className="text-foreground">{leaf}</span>
        </>
      )}
    </nav>
  );
}

/** The seller site: its own frame (left nav, profile avatar), the same catalogue and data. */
export function SellerLayout() {
  usePwa();
  useNow(15_000);
  const on = useStoreEnabled();
  if (on === null) return null;
  if (!on)
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">The seller site is off</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          It runs on VIIV Shop (beta), which is switched off by default. Turn it on in Settings.
        </p>
        <Button asChild className="mt-4">
          <Link to="/settings">Open Settings</Link>
        </Button>
      </div>
    );
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <SellerSidebar />
        <SidebarInset className="min-w-0 flex-1">
          <header className="app-top-bar sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border/30 bg-background/30 px-3 backdrop-blur-xl">
            <SidebarTrigger />
            <SellerSearch />
            <div className="ml-auto flex items-center gap-1.5">
              <Bell_ />
              <AccountButton />
            </div>
          </header>
          <Offline />
          <main className="mx-auto w-full max-w-[1600px] space-y-3 p-3 md:p-6">
            <Crumbs />
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
