import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  LayoutDashboard,
  Star,
  Boxes,
  Truck,
  Copy,
  Table,
  Settings,
  Eye,
  EyeOff,
  CalendarDays,
  ShoppingBag,
  ShieldCheck,
  LogOut,
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
import { useAuth, fullName } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";

const NAV = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Favourites", url: "/favourites", icon: Star },
  { title: "Collection", url: "/collection", icon: Boxes },
  { title: "My Orders", url: "/orders", icon: Truck },
  { title: "Pre-orders", url: "/preorders", icon: ShoppingBag },
  { title: "Habits", url: "/habits", icon: CalendarDays },
  { title: "Duplicates", url: "/duplicates", icon: Copy },
  { title: "Inventory", url: "/inventory", icon: Table },
  { title: "Settings", url: "/settings", icon: Settings },
] as const;

const ADMIN_NAV = { title: "Admin", url: "/admin", icon: ShieldCheck } as const;

export function AppSidebar() {
  const allCars = useCars();
  const { hideInvestment, setHideInvestment, query } = useApp();
  const { profile, isAdmin, signOut } = useAuth();
  const { source } = useCarsSource();
  const navItems = useMemo(() => (isAdmin ? [...NAV, ADMIN_NAV] : [...NAV]), [isAdmin]);
  const data = useMemo(
    () => filterRows(allCars, query).filter((r) => (r.status || "").trim().toLowerCase() !== "iso"),
    [allCars, query],
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
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-1 py-2">
          <div className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Boxes className="size-5" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="text-display text-base font-semibold leading-tight">Tesoro</div>
            <div className="truncate text-xs text-muted-foreground">Personal collection</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigate</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
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
          {isAdmin && (
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

          <div className="flex items-center justify-between gap-2 border-t border-sidebar-border pt-3">
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">
                {fullName(profile) || profile?.email_id || "Signed in"}
              </div>
              <div className="truncate text-[10px] text-muted-foreground">
                {profile?.user_id || profile?.email_id}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => void signOut()}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-3.5" />
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
