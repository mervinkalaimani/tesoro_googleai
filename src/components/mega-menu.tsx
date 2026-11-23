import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  CalendarDays,
  ChevronDown,
  Copy,
  LayoutDashboard,
  LayoutGrid,
  Plus,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { HomeScreenMark } from "@/components/brand-mark";
import { openProDialog } from "@/components/pro-dialog";
import { ADD_CAR_EVENT } from "@/lib/add-car-event";
import { useAuth } from "@/lib/auth-store";
import { bulkDraftHasContent, carDraftHasContent } from "@/lib/draft-content";
import { BULK_DRAFT_KEY, CAR_DRAFT_KEY, readDraft } from "@/lib/form-draft";
import { usePersona } from "@/lib/persona";
import { paidPlanOf, planIncludes, type PaidPlan } from "@/lib/tiers";
import { cn } from "@/lib/utils";
import { useStoreEnabled } from "@/market/enabled";

type Item = { title: string; url: string; icon: LucideIcon; needs?: PaidPlan };

/** Everything the left panel held, grouped the way it was. Home, My Cars, My Orders and the Catalogue are in the bar itself. */
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "My Cars",
    items: [
      { title: "Favourites", url: "/favourites", icon: Star, needs: "pro" },
      { title: "Collection", url: "/collection", icon: Boxes, needs: "pro" },
    ],
  },
  {
    title: "My Orders",
    items: [
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

function Entry({
  to,
  search,
  icon: Icon,
  active,
  children,
  onNavigate,
}: {
  to: string;
  search?: Record<string, string>;
  icon: LucideIcon;
  active?: boolean;
  children: React.ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to}
      search={search as never}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[14px] font-medium transition-colors hover:bg-primary/10",
        active ? "bg-primary/10 text-primary" : "text-foreground",
      )}
    >
      <Icon className="size-4.5 shrink-0" />
      <span className="min-w-0 truncate">{children}</span>
    </Link>
  );
}

/**
 * The menu that replaces the left panel: one button in the top bar opens a wide pane of glass
 * under it with every section laid out at once. Desktop only; a phone has the bottom bar.
 */
export function MegaMenu() {
  const { isAdmin, isGuest, plan, profile } = useAuth();
  const { persona } = usePersona();
  const storeOn = useStoreEnabled() === true;
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pendingDraft, setPendingDraft] = useState(false);

  // An unfinished car or table waiting to be picked up.
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

  // Closes on a page change, a click outside, or Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.needs === undefined || planIncludes(plan, i.needs)),
  })).filter((g) => g.items.length > 0);

  return (
    <div ref={ref} className="hidden items-center gap-2 md:flex">
      <Link to="/" aria-label="VIIV home" className="shrink-0">
        <HomeScreenMark className="w-[76px]" />
      </Link>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          "relative inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors hover:bg-primary/10",
          open ? "bg-primary/10 text-primary" : "text-foreground",
        )}
      >
        <LayoutGrid className="size-4" />
        Menu
        <ChevronDown
          className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")}
        />
        {pendingDraft && (
          <span
            aria-label="Unfinished car saved"
            className="absolute right-1 top-1 size-2.5 rounded-full border-2 border-background bg-amber-400"
          />
        )}
      </button>

      {/* In the body, not in the bar: the bar is itself glass, and a pane inside it can only blur the
          bar, not the page under it. */}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed inset-x-0 top-14 z-50 px-4 pt-2 animate-in fade-in slide-in-from-top-1 duration-200"
          >
            <div className="card-elevated glass-pane mx-auto grid max-w-5xl gap-x-8 gap-y-6 p-6 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
              {/* What you came to do. */}
              <div className="space-y-2">
                <div className="px-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Start
                </div>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    window.dispatchEvent(new Event(ADD_CAR_EVENT));
                  }}
                  className="relative flex w-full items-center gap-2.5 rounded-xl bg-primary px-3 py-2.5 text-[14px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Plus className="size-4.5" />
                  Add car
                  {pendingDraft && (
                    <span
                      aria-label="Unfinished car saved"
                      className="absolute right-2.5 top-2.5 size-2.5 rounded-full border-2 border-primary bg-amber-400"
                    />
                  )}
                </button>
                <Entry
                  to="/settings"
                  icon={Settings}
                  active={pathname.startsWith("/settings")}
                  onNavigate={close}
                >
                  Settings
                </Entry>
                {storeOn && (
                  <Entry
                    to="/market"
                    icon={ShoppingCart}
                    active={pathname.startsWith("/market")}
                    onNavigate={close}
                  >
                    VIIV Shop
                  </Entry>
                )}
              </div>

              {groups.map((g) => (
                <div key={g.title} className="space-y-1">
                  <div className="px-2.5 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {g.title}
                  </div>
                  {g.items.map((i) => (
                    <Entry
                      key={i.url}
                      to={i.url}
                      icon={i.icon}
                      active={pathname.startsWith(i.url)}
                      onNavigate={close}
                    >
                      {i.title}
                    </Entry>
                  ))}
                </div>
              ))}

              {isAdmin && persona === "admin" && (
                <div className="space-y-1">
                  <div className="px-2.5 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Admin
                  </div>
                  <Entry
                    to="/dashboard"
                    icon={LayoutDashboard}
                    active={pathname === "/dashboard"}
                    onNavigate={close}
                  >
                    Admin Dashboard
                  </Entry>
                  <Entry
                    to="/settings"
                    search={{ tab: "advanced" }}
                    icon={Wrench}
                    onNavigate={close}
                  >
                    Admin Console
                  </Entry>
                </div>
              )}

              {/* Only for somebody who could act on it. */}
              {paidPlanOf(profile) !== "pro" && !isGuest && (
                <div className="space-y-1">
                  <div className="px-2.5 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Plan
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      openProDialog();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[14px] font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    <Sparkles className="size-4.5 shrink-0" />
                    Subscribe now
                  </button>
                </div>
              )}

              {isGuest && (
                <div className="col-span-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  <div className="text-xs font-medium uppercase tracking-wider text-amber-600">
                    Guest mode
                  </div>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                    Sample cars, stored only in this browser. Nothing is saved to the database.
                  </p>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
