import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Home,
  Star,
  Boxes,
  Truck,
  Copy,
  Car,
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
  SidebarGroupLabel,
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
import { HomeScreenMark } from "@/components/brand-mark";

const NAV_GROUPS = [
  {
    title: "My Cars",
    items: [
      { title: "My Cars", url: "/inventory", icon: Car },
      { title: "Favourites", url: "/favourites", icon: Star },
      { title: "Collection", url: "/collection", icon: Boxes },
    ],
  },
  {
    title: "My Orders",
    items: [
      { title: "My Orders", url: "/orders", icon: Truck },
      { title: "Pre Orders", url: "/preorders", icon: ShoppingBag },
      { title: "Duplicates", url: "/duplicates", icon: Copy },
    ],
  },
  {
    title: "Habit",
    items: [{ title: "Habit", url: "/habits", icon: CalendarDays }],
  },
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
      <SidebarHeader className="h-14 justify-center">
        <div className="flex items-center gap-2 px-1">
          <img src="/tesoro_app_icon_dark.svg" alt="" className="size-9 shrink-0" />
          {/* "Personal collection" said nothing the rest of the screen does not
              — a subtitle under a one-word name. */}
          <HomeScreenMark className="w-[76px] shrink-0 group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Home at the top */}
        <SidebarGroup className="pb-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/"}
                  tooltip="Home"
                  className="h-10 text-[14px] font-medium group-data-[collapsible=icon]:!size-9"
                >
                  <Link
                    to="/"
                    onClick={() => {
                      if (isMobile) setOpenMobile(false);
                    }}
                  >
                    <Home className="size-4.5" />
                    <span>Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Sections: My Cars, My Orders, Habit */}
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.title} className="py-1">
            <SidebarGroupLabel className="text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase">
              {group.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {group.items.map((item) => {
                  const active =
                    item.url === "/" ? pathname === "/" : pathname.startsWith(item.url);
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className="h-10 text-[14px] font-medium group-data-[collapsible=icon]:!size-9"
                      >
                        <Link
                          to={item.url}
                          onClick={() => {
                            if (isMobile) setOpenMobile(false);
                          }}
                        >
                          <item.icon className="size-4.5" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
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
