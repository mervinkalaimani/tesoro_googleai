import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Home,
  Star,
  Boxes,
  Truck,
  Copy,
  Table,
  Eye,
  EyeOff,
  CalendarDays,
  ShoppingBag,
  Database,
} from "lucide-react";
import { filterRows } from "@/lib/search";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useCars, useCarsSource } from "@/lib/cars-store";
import { inrFull } from "@/lib/format";
import { useApp } from "@/lib/store";
import { useAuth } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";

/**
 * Where the collection is looked at, and nothing else.
 *
 * Settings and Admin used to end this list. They are not places you browse to —
 * they are the account, and the account is behind the avatar in the top bar
 * now, where every other application on the machine keeps it. Keeping a second
 * copy here meant two doors to the same room and no way to tell which was
 * canonical.
 */
const NAV = [
  { title: "Home", url: "/", icon: Home },
  { title: "Favourites", url: "/favourites", icon: Star },
  { title: "Collection", url: "/collection", icon: Boxes },
  { title: "My Orders", url: "/orders", icon: Truck },
  { title: "Pre-orders", url: "/preorders", icon: ShoppingBag },
  { title: "Habits", url: "/habits", icon: CalendarDays },
  { title: "Duplicates", url: "/duplicates", icon: Copy },
  { title: "Inventory", url: "/inventory", icon: Table },
] as const;

export function AppSidebar() {
  const allCars = useCars();
  const { hideInvestment, setHideInvestment, query } = useApp();
  const { isOwner, isGuest } = useAuth();
  const { source } = useCarsSource();
  const allMatching = useMemo(() => filterRows(allCars, query), [allCars, query]);
  const data = useMemo(
    () => allMatching.filter((r) => (r.status || "").trim().toLowerCase() !== "iso"),
    [allMatching],
  );
  const { isMobile, setOpenMobile } = useSidebar();
  const [localReveal, setLocalReveal] = useState(false);
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const stats = useMemo(() => {
    const total = data.length;
    const spent = data.reduce((s, r) => s + (r.spent || 0), 0);
    return { total, spent };
  }, [data]);

  const hidden = hideInvestment && !localReveal;

  return (
    <Sidebar collapsible="icon">
      {/* h-14 exactly, matching the top bar: the two rules either side of the
          sidebar's edge are one line across the whole application, and a header
          sized by its own contents lined up with nothing. */}
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-1">
          {/* The accent colour, behind a mark drawn white for exactly this.
              --sidebar-primary is the token Settings → Appearance rewrites when
              you pick a colour, so the logo changes with everything else that
              carries the accent instead of staying whatever it was built as. */}
          <div className="grid size-9 shrink-0 place-items-center rounded-md bg-sidebar-primary shadow-lg shadow-sidebar-primary/30">
            <img src="/tesoro_in_app_icon.svg" alt="" className="size-7" />
          </div>
          {/* "Personal collection" said nothing the rest of the screen does not
              — a subtitle under a one-word name. */}
          <div className="text-display min-w-0 truncate text-base font-semibold leading-tight group-data-[collapsible=icon]:hidden">
            Tesoro
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* No "Navigate" label. One group, and every item in it is a page —
            a heading over the only list on screen names nothing. */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => {
                const active = item.url === "/" ? pathname === "/" : pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link
                        to={item.url}
                        onClick={() => {
                          if (isMobile) setOpenMobile(false);
                        }}
                      >
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="space-y-3 px-1 py-2 group-data-[collapsible=icon]:hidden">
          {isGuest && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5">
              <div className="text-[10px] font-medium uppercase tracking-wider text-amber-500">
                Guest Mode
              </div>
              <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                Sample cars, stored only in this browser. Nothing is saved to the database.
              </p>
            </div>
          )}

          {/* Export and the CSV template have moved into the Add car dialog,
              alongside bulk entry and CSV upload — every way cars come in or go
              out, on one row. */}

          {/* Matches the Settings tab it links to: connection details are the
              owner's, not every admin's. */}
          {isOwner && (
            <div className="border-b border-sidebar-border pb-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Database
              </div>
              <Link
                to="/settings"
                className="mt-1 flex items-center gap-1.5 text-sm text-foreground transition-colors hover:text-primary"
                title="Supabase database settings"
              >
                <Database className="size-3.5 shrink-0 text-primary" />
                <span className="truncate text-xs">Supabase synced</span>
                <span
                  className={`ml-auto inline-block size-1.5 shrink-0 rounded-full ${
                    source === "supabase" ? "bg-emerald-500" : "bg-primary/80"
                  }`}
                />
              </Link>
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Total cars
            </div>
            <div className="text-display text-lg font-semibold tabular-nums">
              {stats.total.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total investment
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => {
                  if (hideInvestment) setLocalReveal((v) => !v);
                  else setHideInvestment(true);
                }}
                aria-label={hidden ? "Show investment" : "Hide investment"}
              >
                {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </Button>
            </div>
            <div className="text-display text-lg font-semibold tabular-nums">
              {hidden ? "••••••" : inrFull(stats.spent)}
            </div>
          </div>

          {/* Who is signed in, and signing out, are in the top bar now — behind
              the avatar in the far corner, which is where every other app on the
              machine keeps them. */}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
