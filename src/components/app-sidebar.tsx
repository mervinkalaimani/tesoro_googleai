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
  Download,
  FileText,
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
import { useExportScope } from "@/lib/export-scope";
import { ExportDialog } from "@/components/export-dialog";
import { CAR_CSV_COLUMNS } from "@/lib/car-columns";
import { downloadCsv, generateDiecastCsvTemplate } from "@/lib/csv";

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
  const { profile, isAdmin, isOwner, signOut, isGuest } = useAuth();
  const { source } = useCarsSource();
  const navItems = useMemo(() => (isAdmin ? [...NAV, ADMIN_NAV] : [...NAV]), [isAdmin]);
  const allMatching = useMemo(() => filterRows(allCars, query), [allCars, query]);
  const data = useMemo(
    () => allMatching.filter((r) => (r.status || "").trim().toLowerCase() !== "iso"),
    [allMatching],
  );
  const { isMobile, setOpenMobile } = useSidebar();
  const [localReveal, setLocalReveal] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  // Whatever list the page is showing, or the searched collection when it has
  // none of its own — the same rule the top bar's button followed.
  const scope = useExportScope();
  const exportRows = scope?.rows ?? allMatching;

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

          {/* Export and the CSV template used to sit in the top bar, where they
              took two of the five slots a phone has and neither is something you
              reach for mid-task. Export still follows the page you were on —
              the scope is published by the page, not by where the button is. */}
          <div className="space-y-1 border-b border-sidebar-border pb-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Data</div>
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              disabled={exportRows.length === 0}
              className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-xs text-foreground transition-colors hover:bg-sidebar-accent disabled:opacity-40"
              title={
                exportRows.length
                  ? `Export ${exportRows.length.toLocaleString()} cars${scope ? ` — ${scope.label}` : ""}`
                  : "Nothing to export yet"
              }
            >
              <FileText className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">Export{scope ? ` ${scope.label.toLowerCase()}` : ""}</span>
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                {exportRows.length.toLocaleString()}
              </span>
            </button>
            <button
              type="button"
              onClick={() => downloadCsv("template.csv", generateDiecastCsvTemplate())}
              className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-xs text-foreground transition-colors hover:bg-sidebar-accent"
              title="Download the CSV template"
            >
              <Download className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">CSV template</span>
            </button>
          </div>

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

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        name={scope?.name ?? "collection"}
        rows={exportRows}
        columns={CAR_CSV_COLUMNS}
        title={scope?.label ?? "Collection"}
        scopeLabel={query.trim() ? `matching “${query.trim()}”` : undefined}
        owner={fullName(profile) || undefined}
      />
    </Sidebar>
  );
}
