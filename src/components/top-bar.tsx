import { startTransition, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useStoreEnabled } from "@/market/enabled";
import {
  BookOpen,
  Boxes,
  CalendarDays,
  Car,
  ChevronDown,
  Copy,
  Plus,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store,
  Truck,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { createPortal } from "react-dom";
import { ADD_CAR_EVENT } from "@/lib/add-car-event";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCars, useCarsRefresh, useCarsUndo } from "@/lib/cars-store";
import { useAuth } from "@/lib/auth-store";
import { planIncludes, type PaidPlan } from "@/lib/tiers";
import { openProDialog } from "@/components/pro-dialog";
import { useCatalog } from "@/lib/catalog-store";
import type { Diecast } from "@/lib/types";
import { HomeScreenMark } from "@/components/brand-mark";
import { SearchBox } from "@/components/search-box";
import { NotificationCenter } from "@/components/notification-center";
import { WhatsNewStar } from "@/components/whats-new";
import { AccountButton } from "@/components/account-button";
import { CarFormDialog } from "@/components/car-form-dialog";
import { UploadCarsDialog } from "@/components/upload-cars-dialog";
import { BulkAddCarsDialog } from "@/components/bulk-add-cars-dialog";
import { BULK_DRAFT_KEY, CAR_DRAFT_KEY, readDraft } from "@/lib/form-draft";
import { bulkDraftHasContent, carDraftHasContent } from "@/lib/draft-content";

/** Fired by the sidebar's Add car button; the top bar owns the dialogs it opens. */
export { ADD_CAR_EVENT } from "@/lib/add-car-event";

type NavLink = { title: string; url: string; icon: LucideIcon; needs?: PaidPlan };
type NavTab = {
  title: string;
  url: string;
  /** Paths that make this tab the page you are on. */
  match: string[];
  needs?: PaidPlan;
  /** Only while the VIIV Shop is switched on for this account. */
  shop?: boolean;
  /** What opens under the tab. */
  items?: NavLink[];
};

const TABS: NavTab[] = [
  { title: "Home", url: "/", match: ["/"] },
  {
    title: "My Cars",
    url: "/inventory",
    match: ["/inventory", "/favourites", "/collection"],
    items: [
      { title: "My Cars", url: "/inventory", icon: Car },
      { title: "Favourites", url: "/favourites", icon: Star, needs: "pro" },
      { title: "Collection", url: "/collection", icon: Boxes, needs: "pro" },
    ],
  },
  {
    title: "My Orders",
    url: "/orders",
    match: ["/orders", "/preorders", "/duplicates"],
    needs: "plus",
    items: [
      { title: "My Orders", url: "/orders", icon: Truck, needs: "plus" },
      { title: "Pre-orders", url: "/preorders", icon: ShoppingBag, needs: "pro" },
      { title: "Duplicates", url: "/duplicates", icon: Copy, needs: "pro" },
    ],
  },
  {
    title: "Habit",
    url: "/habits",
    match: ["/habits", "/sellers"],
    needs: "pro",
    items: [
      { title: "Habit", url: "/habits", icon: CalendarDays, needs: "pro" },
      { title: "Sellers", url: "/sellers", icon: Store, needs: "pro" },
    ],
  },
  { title: "Catalogue", url: "/catalog", match: ["/catalog"] },
  { title: "VIIV Shop", url: "/market", match: ["/market"], shop: true },
];

/** The pane that opens under a tab: a pane of glass in the page body, so it can blur what is under it. */
function TabMenu({
  tab,
  items,
  active,
  pathname,
}: {
  tab: NavTab;
  items: NavLink[];
  active: boolean;
  pathname: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const [pos, setPos] = useState<{ left: number } | null>(null);

  const show = () => {
    window.clearTimeout(timer.current);
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left - 14 });
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPos(null), 140);
  };
  useEffect(() => setPos(null), [pathname]);
  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPos(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pos]);

  return (
    <div
      ref={wrapRef}
      data-active={active ? "true" : undefined}
      className="relative flex items-stretch"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <Link
        to={tab.url}
        aria-current={active ? "page" : undefined}
        aria-haspopup="true"
        aria-expanded={pos !== null}
        className={cn(
          "flex items-center gap-1 text-[15px] transition-colors",
          active
            ? "font-semibold text-foreground"
            : "font-medium text-muted-foreground hover:text-foreground",
        )}
      >
        {tab.title}
        <ChevronDown
          className={cn("size-3 opacity-60 transition-transform duration-200", pos && "rotate-180")}
        />
      </Link>
      {pos &&
        createPortal(
          <div
            className="fixed top-14 z-50 pt-1.5 animate-in fade-in slide-in-from-top-1 duration-150"
            style={{ left: pos.left }}
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            <div className="card-elevated glass-pane min-w-52 space-y-0.5 p-2">
              {items.map((i) => (
                <Link
                  key={i.url}
                  to={i.url}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[14px] font-medium transition-colors hover:bg-primary/10",
                    pathname.startsWith(i.url) ? "bg-primary/10 text-primary" : "text-foreground",
                  )}
                >
                  <i.icon className="size-4.5 shrink-0" />
                  {i.title}
                </Link>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * The tabs in the middle of the bar on a desktop. Where a tab has pages under it, hovering it opens
 * them; the plan decides which are there. A phone has the bottom bar for these.
 */
function DesktopNav() {
  const { plan } = useAuth();
  const storeOn = useStoreEnabled() === true;
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const tabs = TABS.filter(
    (t) => (!t.needs || planIncludes(plan, t.needs)) && (!t.shop || storeOn),
  ).map((t) => ({
    tab: t,
    items: (t.items ?? []).filter((i) => !i.needs || planIncludes(plan, i.needs)),
    on: t.match.some((m) => (m === "/" ? pathname === "/" : pathname.startsWith(m))),
  }));
  // One line that slides to the page you are on, rather than a line that appears under it: where
  // it is and how wide, measured off the active tab.
  const navRef = useRef<HTMLElement>(null);
  const [line, setLine] = useState<{ left: number; width: number } | null>(null);
  const [armed, setArmed] = useState(false);
  const active = tabs.find((t) => t.on)?.tab.url ?? "";
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const el = nav.querySelector<HTMLElement>("[data-active='true']");
      // Out to the half-way point between this tab and the next on each side.
      const half = parseFloat(getComputedStyle(nav).columnGap || "0") / 2;
      setLine(el ? { left: el.offsetLeft - half, width: el.offsetWidth + half * 2 } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [active, plan, storeOn]);
  // Slide only once it has somewhere to slide from: the first paint just puts it there.
  useEffect(() => {
    const id = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <nav
      ref={navRef}
      aria-label="Main"
      className="relative hidden items-stretch gap-7 self-stretch md:flex"
    >
      {tabs.map(({ tab, items, on }) =>
        items.length > 1 ? (
          <TabMenu key={tab.url} tab={tab} items={items} active={on} pathname={pathname} />
        ) : (
          <div
            key={tab.url}
            data-active={on ? "true" : undefined}
            className="relative flex items-stretch"
          >
            <Link
              to={tab.url}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex items-center text-[15px] transition-colors",
                on
                  ? "font-semibold text-foreground"
                  : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.title}
            </Link>
          </div>
        ),
      )}
      {/* In the theme colour, on the bar's own bottom edge. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -bottom-px h-0.5 rounded-full bg-primary",
          armed && "transition-[left,width,opacity] duration-300 ease-out",
          line ? "opacity-100" : "opacity-0",
        )}
        style={{ left: line?.left ?? 0, width: line?.width ?? 0 }}
      />
    </nav>
  );
}

/** How long the undo button stays on screen after the edit it would reverse. */
const UNDO_WINDOW_MS = 30_000;

export function TopBar() {
  const { undo, undoLabel, undoAt } = useCarsUndo();
  const { carCeiling } = useAuth();
  const storeOn = useStoreEnabled() === true;
  const allCars = useCars();
  /** At the ceiling this plan has. The database refuses the row anyway. */
  const atCarLimit = carCeiling !== null && allCars.length >= carCeiling;
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSeed, setBulkSeed] = useState<Diecast[] | undefined>(undefined);
  const [uploadOpen, setUploadOpen] = useState(false);
  /** Which unfinished thing is waiting: a single car, a bulk table, or neither. */
  const [pendingDraft, setPendingDraft] = useState<"car" | "bulk" | null>(null);

  const openAdd = () => {
    // A free collection at its ceiling is told here rather than after the form has been filled in:
    // the database would refuse the row either way. The catalogue is untouched by this.
    if (atCarLimit) {
      openProDialog("Max cars reached for your plan");
      return;
    }
    // In a transition, so the press is not what pays for the form: mounting Add a car is a quarter
    // of a second of work, and doing it inside the click handler made the tap itself block.
    startTransition(() => {
      if (pendingDraft === "bulk") setBulkOpen(true);
      else setAddOpen(true);
    });
  };
  // The sidebar's Add car button asks for the same dialogs; they live here.
  const openAddRef = useRef(openAdd);
  openAddRef.current = openAdd;
  useEffect(() => {
    const on = () => openAddRef.current();
    window.addEventListener(ADD_CAR_EVENT, on);
    return () => window.removeEventListener(ADD_CAR_EVENT, on);
  }, []);
  const [fresh, setFresh] = useState(false);

  // A tab that was evicted mid-form comes back to the inventory, not to the
  // dialog, so the rescued draft needs saying so — otherwise it is safe but
  // invisible, and the person concludes their typing was lost after all.
  // Re-read after each dialog closes and whenever the tab is looked at again.
  useEffect(() => {
    // Which door the badge points at, if either. A draft with nothing typed in
    // it does not count -- see draft-content.ts for why one can exist at all.
    const check = () => {
      const car = carDraftHasContent(readDraft(CAR_DRAFT_KEY));
      const bulk = bulkDraftHasContent(readDraft(BULK_DRAFT_KEY));
      setPendingDraft(car ? "car" : bulk ? "bulk" : null);
    };
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [addOpen, bulkOpen]);

  // Restarts on every edit, and survives a remount mid-window by timing from
  // when the edit happened rather than from when this effect ran.
  useEffect(() => {
    if (!undoAt) {
      setFresh(false);
      return;
    }
    const left = UNDO_WINDOW_MS - (Date.now() - undoAt);
    if (left <= 0) {
      setFresh(false);
      return;
    }
    setFresh(true);
    const id = window.setTimeout(() => setFresh(false), left);
    return () => window.clearTimeout(id);
  }, [undoAt]);

  return (
    <header className="app-top-bar sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border/30 bg-background/30 px-3 backdrop-blur-xl">
      {/* Desktop only. The bottom bar carries every destination the sidebar
          holds, so on a phone this opened a second copy of the navigation that
          was already under your thumb. Swiping in from the edge still works for
          anyone who has learned it. */}
      <Link to="/" aria-label="VIIV home" className="hidden shrink-0 md:block">
        <HomeScreenMark className="w-[84px]" />
      </Link>
      {/* An invisible divider: room between the wordmark and the tabs, and the tabs and the search. */}
      <span aria-hidden className="mx-3 hidden h-6 w-px md:block" />
      <DesktopNav />
      <span aria-hidden className="mx-3 hidden h-6 w-px md:block" />
      {/* The search bar follows the tabs. A phone searches from the bottom bar. */}
      <SearchBox className="hidden max-w-md md:block" />
      {/* A phone's wordmark. On a desktop it sits in front of the menu button. */}
      <Link to="/" aria-label="VIIV home" className="shrink-0 md:hidden">
        <HomeScreenMark className="w-[80px]" />
      </Link>
      <div className="ml-auto flex items-center gap-1.5">
        {/* Only while it means something: it shows itself when there is
            something to reverse and withdraws half a minute later. */}
        {undoLabel && fresh && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 animate-in fade-in slide-in-from-right-2"
            onClick={undo}
            title={`Undo ${undoLabel}`}
            aria-label={`Undo ${undoLabel}`}
          >
            <Undo2 className="size-4" /> <span className="hidden sm:inline">Undo</span>
          </Button>
        )}

        {/* Before the search: what you came to do. */}
        <Button
          onClick={openAdd}
          aria-label="Add car"
          className="relative hidden h-9 gap-1.5 rounded-full px-3.5 md:inline-flex"
          title={
            pendingDraft === "bulk"
              ? "You have an unfinished table of cars — pick up where you left off"
              : pendingDraft === "car"
                ? "You have an unfinished car — pick up where you left off"
                : "Add car"
          }
        >
          <Plus className="size-4.5" />
          Add car
          {pendingDraft && (
            <span
              aria-label="Unfinished car saved"
              className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-background bg-amber-400"
            />
          )}
        </Button>
        <WhatsNewStar />
        <NotificationCenter />
        {/* Reading right to left from the corner: who you are, then the thing
            you came to do. +, catalog, and avatar buttons share identical size with an additional 2pt spacing on desktop */}
        <div className="flex items-center gap-1.5 md:gap-2.5">
          <Button
            size="icon"
            // The badge says "pick up where you left off", so the button has to
            // go where the work is: a bulk table is not reachable from the
            // single-car form, and clicking + used to open a blank one and
            // leave the badge lit for ever.
            onClick={openAdd}
            aria-label="Add car"
            // Round and wordless where the bar is tight; named where there is
            // room for it. Two unlabelled icons side by side is a guess, and
            // the desktop bar has the width to say which is which.
            className="relative flex size-9 shrink-0 items-center justify-center rounded-full p-0 max-md:order-3 md:hidden"
            title={
              pendingDraft === "bulk"
                ? "You have an unfinished table of cars — pick up where you left off"
                : pendingDraft === "car"
                  ? "You have an unfinished car — pick up where you left off"
                  : "Add car"
            }
          >
            <Plus className="size-4.5" />
            <span className="max-md:sr-only">Add car</span>
            {pendingDraft && (
              <span
                aria-label="Unfinished car saved"
                className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-background bg-amber-400"
              />
            )}
          </Button>
          {/* Below md the sidebar is hidden, so the shop is one tap here. The catalogue sits beside
              Add car on every width. */}
          {storeOn && (
            <Button
              asChild
              variant="outline"
              size="icon"
              className="size-9 rounded-full max-md:order-2 md:hidden"
              title="VIIV Shop"
            >
              <Link to="/market" aria-label="VIIV Shop">
                <ShoppingCart className="size-4.5" />
              </Link>
            </Button>
          )}
          <Button
            asChild
            variant="outline"
            size="icon"
            className="size-9 rounded-full max-md:order-1 md:hidden"
            title="Catalogue"
          >
            <Link to="/catalog" aria-label="Catalogue">
              <BookOpen className="size-4.5" />
              <span className="max-md:sr-only">Catalogue</span>
            </Link>
          </Button>
          {/* On a phone the order reads: catalogue, shop, add car, then you. */}
          <div className="flex items-center max-md:order-4 md:order-3">
            <AccountButton />
          </div>
        </div>
      </div>
      <CarFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        mode="add"
        // Hand off rather than stack dialogs: close the wizard, open bulk —
        // carrying the ISO matches across when that is what sent us here.
        onSwitchToBulk={(seed) => {
          setBulkSeed(seed);
          setAddOpen(false);
          setBulkOpen(true);
        }}
      />
      <BulkAddCarsDialog
        open={bulkOpen}
        onOpenChange={(v) => {
          setBulkOpen(v);
          // The seed belongs to one visit; reopening bulk on its own should
          // find the table as it was left, not those cars again.
          if (!v) setBulkSeed(undefined);
        }}
        seed={bulkSeed}
        // CSV is a batch, so it is offered where batches are.
        onSwitchToUpload={() => {
          setBulkOpen(false);
          setUploadOpen(true);
        }}
      />
      <UploadCarsDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </header>
  );
}
