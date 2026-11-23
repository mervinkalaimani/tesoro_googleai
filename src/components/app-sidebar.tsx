import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Home,
  LayoutDashboard,
  Wrench,
  Star,
  Boxes,
  Truck,
  Copy,
  Car,
  CalendarDays,
  ShoppingBag,
  ShoppingCart,
  BookOpen,
  Plus,
  Store,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { useStoreEnabled } from "@/market/enabled";
import { openProDialog } from "@/components/pro-dialog";
import { paidPlanOf, planIncludes, type PaidPlan } from "@/lib/tiers";
import { useAuth } from "@/lib/auth-store";
import { usePersona } from "@/lib/persona";
import { HomeScreenMark, MonogramMark } from "@/components/brand-mark";
import { ADD_CAR_EVENT } from "@/components/top-bar";
import { BULK_DRAFT_KEY, CAR_DRAFT_KEY, readDraft } from "@/lib/form-draft";
import { bulkDraftHasContent, carDraftHasContent } from "@/lib/draft-content";

/** Below the sections, above the totals: the store and the shared catalogue. */
const SHOP_LINKS: { title: string; url: string; icon: LucideIcon; store?: boolean }[] = [
  { title: "VIIV Shop", url: "/market", icon: ShoppingCart, store: true },
];

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
      { title: "Pre-orders", url: "/preorders", icon: ShoppingBag, needs: "pro" },
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
  const { isAdmin, isGuest, plan, profile } = useAuth();
  const { persona } = usePersona();
  const { isMobile, setOpenMobile } = useSidebar();
  const storeOn = useStoreEnabled() === true;
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  // An unfinished car or table waiting to be picked up, as the top bar's button used to say.
  const [pendingDraft, setPendingDraft] = useState(false);
  useEffect(() => {
    const check = () =>
      setPendingDraft(
        carDraftHasContent(readDraft(CAR_DRAFT_KEY)) ||
          bulkDraftHasContent(readDraft(BULK_DRAFT_KEY)),
      );
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    const id = window.setInterval(check, 4000);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(id);
    };
  }, []);

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
        {/* What you came to do: add a car, or look one up. Above Home. */}
        <SidebarGroup className="pb-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Add car"
                  onClick={() => {
                    if (isMobile) setOpenMobile(false);
                    window.dispatchEvent(new Event(ADD_CAR_EVENT));
                  }}
                  className="relative h-10 bg-primary text-[14px] font-semibold text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground group-data-[collapsible=icon]:!size-9"
                >
                  <Plus className="size-4.5" />
                  <span>Add car</span>
                  {pendingDraft && (
                    <span
                      aria-label="Unfinished car saved"
                      className="absolute right-2 top-2 size-2.5 rounded-full border-2 border-sidebar bg-amber-400"
                    />
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/catalog")}
                  tooltip="Catalogue"
                  className="h-10 text-[14px] font-medium group-data-[collapsible=icon]:!size-9"
                >
                  <Link
                    to="/catalog"
                    onClick={() => {
                      if (isMobile) setOpenMobile(false);
                    }}
                  >
                    <BookOpen className="size-4.5" />
                    <span>Catalogue</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Home */}
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
        {NAV_GROUPS.map((g) => ({
          ...g,
          // Items the plan doesn't include are left out, not shown locked.
          items: g.items.filter((i) => i.needs === undefined || planIncludes(plan, i.needs)),
        }))
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <SidebarGroup key={group.title} className="py-1">
              <SidebarGroupLabel className="text-xs font-semibold tracking-wider text-muted-foreground/80 uppercase">
                {group.title}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {group.items.map((item) => {
                    const active = pathname.startsWith(item.url);
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
        {/* Last, and separate. Everything above is the reader's own
            collection; these two are everybody else's accounts and the
            install's own settings, which is a different subject and belongs
            under its own heading rather than tucked beside Home. */}
        {isAdmin && persona === "admin" && (
          <SidebarGroup className="py-1">
            <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/dashboard"}
                    tooltip="Admin Dashboard"
                    className="h-9 text-[14px] font-medium group-data-[collapsible=icon]:!size-9"
                  >
                    <Link
                      to="/dashboard"
                      onClick={() => {
                        if (isMobile) setOpenMobile(false);
                      }}
                    >
                      <LayoutDashboard className="size-4.5" />
                      <span>Admin Dashboard</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    tooltip="Admin Console"
                    className="h-9 text-[14px] font-medium group-data-[collapsible=icon]:!size-9"
                  >
                    <Link
                      to="/settings"
                      search={{ tab: "advanced" }}
                      onClick={() => {
                        if (isMobile) setOpenMobile(false);
                      }}
                    >
                      <Wrench className="size-4.5" />
                      <span>Admin Console</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup className="py-1">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {SHOP_LINKS.filter((l) => !l.store || storeOn).map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.url)}
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
                      <span className="flex items-center gap-1.5">
                        {item.store ? (
                          <>
                            <HomeScreenMark className="w-10" /> Shop
                          </>
                        ) : (
                          item.title
                        )}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="space-y-3 px-1 py-2 group-data-[collapsible=icon]:hidden">
          {isGuest && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5">
              <div className="text-xs font-medium uppercase tracking-wider text-amber-500">
                Guest Mode
              </div>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                Sample cars, stored only in this browser. Nothing is saved to the database.
              </p>
            </div>
          )}

          {/* Export and the CSV template have moved into the Add car dialog,
              alongside bulk entry and CSV upload — every way cars come in or go
              out, on one row. */}

          {/* Who is signed in, and signing out, are in the top bar now — behind
              the avatar in the far corner, which is where every other app on the
              machine keeps them. */}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
