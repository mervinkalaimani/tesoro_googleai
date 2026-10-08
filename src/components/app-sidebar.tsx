import { isIso } from "@/lib/status";
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
  Store,
  Database,
  Lock,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { useCatalog } from "@/lib/catalog-store";
import { isPackMember, packMemberIds } from "@/lib/pack";
import { inrFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { openProDialog } from "@/components/pro-dialog";
import { paidPlanOf, planIncludes, type PaidPlan } from "@/lib/tiers";
import { useApp } from "@/lib/store";
import { useAuth } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { HomeScreenMark, MonogramMark } from "@/components/brand-mark";

const NAV_GROUPS: {
  title: string;
  items: { title: string; url: string; icon: LucideIcon; needs?: PaidPlan }[];
}[] = [
  {
    title: "My Cars",
    items: [
      { title: "My Cars", url: "/inventory", icon: Car },
      { title: "Favourites", url: "/favourites", icon: Star, needs: "pro" },
      { title: "Collection", url: "/collection", icon: Boxes, needs: "pro" },
    ],
  },
  {
    title: "My Orders",
    items: [
      { title: "My Orders", url: "/orders", icon: Truck, needs: "plus" },
      { title: "Pre Orders", url: "/preorders", icon: ShoppingBag, needs: "pro" },
      { title: "Duplicates", url: "/duplicates", icon: Copy, needs: "pro" },
    ],
  },
  {
    title: "Habit",
    items: [
      { title: "Habit", url: "/habits", icon: CalendarDays, needs: "pro" },
      { title: "Sellers", url: "/sellers", icon: Store, needs: "pro" },
    ],
  },
];

export function AppSidebar() {
  const allCars = useCars();
  const { hideInvestment, setHideInvestment, query } = useApp();
  const { isOwner, isGuest, plan, profile } = useAuth();
  const { source } = useCarsSource();
  const allMatching = useMemo(() => filterRows(allCars, query), [allCars, query]);
  const { packMembers } = useCatalog();
  const memberIds = useMemo(() => packMemberIds(packMembers), [packMembers]);
  // A car that only comes inside a box is not a separate thing you bought. The
  // box carries the count and the money; counting its five castings as well
  // would say you own six things and spent the price twice.
  const data = useMemo(
    () => allMatching.filter((r) => !isIso(r.status) && !isPackMember(r, memberIds)),
    [allMatching, memberIds],
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
        <div className="flex items-center px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          {/* The wordmark when there is room for it, the single mark when there
              is not. Never both: beside each other they were two logos for one
              application. */}
          <HomeScreenMark className="w-[84px] shrink-0 group-data-[collapsible=icon]:hidden" />
          <MonogramMark className="hidden w-7 shrink-0 group-data-[collapsible=icon]:block" />
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
                  const active = pathname.startsWith(item.url);
                  const locked = item.needs !== undefined && !planIncludes(plan, item.needs);
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
                          <item.icon className={cn("size-4.5", locked && "opacity-50")} />
                          <span className={cn(locked && "opacity-50")}>{item.title}</span>
                          {locked && <Lock className="ml-auto size-3.5 text-muted-foreground" />}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        {/* Only for somebody who could act on it, and only where there is
            room for words: the collapsed rail is icons, and a bare sparkle
            there would say nothing. */}
        {paidPlanOf(profile) !== "pro" && !isGuest && (
          // Sticky to the foot of the scrolling column: the sections above it
          // are a list that grows, and an upsell that scrolls away is one that
          // is only there for people who were not reading anything.
          <div className="sticky bottom-0 z-10 mt-auto bg-sidebar px-2 pb-2 pt-2 group-data-[collapsible=icon]:hidden">
            <button
              type="button"
              onClick={() => openProDialog()}
              className="group/pro relative block w-full rounded-xl text-left"
            >
              {/* The frame, as a masked ring on one element: it takes the
                  button’s own radius, so there is nothing for a second curve
                  to disagree with. */}
              <span aria-hidden className="pro-sheen pointer-events-none absolute inset-0" />
              <span className="relative flex items-center gap-2 rounded-xl px-2.5 py-2 transition-colors group-hover/pro:bg-sidebar-accent">
                <Sparkles className="size-3.5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">Subscribe now</span>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              </span>
            </button>
          </div>
        )}
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
