import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Palette,
  Bell,
  Wrench,
  Database,
  LogOut,
  ShieldCheck,
  RotateCcw,
  Check,
  Search,
  Image as ImageIcon,
  Home,
  PackageCheck,
  Sparkles,
  LifeBuoy,
  FileText,
  Scale,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  ACCENT_OPTIONS,
  THEME_OPTIONS,
  FONT_SIZE_OPTIONS,
  ARRIVING_SOON_OPTIONS,
  ARRIVING_WINDOW_OPTIONS,
  ARRIVING_WINDOW_DEFAULT,
  RELEASED_OPTIONS,
  useApp,
  type AccentColor,
  type FontSizePreference,
} from "@/lib/store";
import {
  getSearchEngine,
  setSearchEngine,
  SEARCH_ENGINES,
  type SearchEngine,
} from "@/lib/car-image-search";
import { SegmentControl } from "@/components/segment-control";
import { CataloguePhotos } from "@/components/catalogue-photos";
import { HelpDoc } from "@/components/help-doc";
import { SplashMark } from "@/components/brand-mark";
import { HELP_BLURBS, HELP_TITLES } from "@/lib/help-content";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AccountCard } from "@/components/account-card";
import { AdminPushCard } from "@/components/admin-push-card";
import { FavouriteDetector } from "@/components/favourite-detector";
import { IdRebuild } from "@/components/shipping-id-rebuild";
import { OAuthProvidersCard } from "@/components/oauth-providers-card";
import { SupabaseSyncCard } from "@/components/supabase-sync-card";
import { useAuth, fullName } from "@/lib/auth-store";
import { useCarsSource } from "@/lib/cars-store";

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => {
    return {
      tab: typeof search.tab === "string" ? search.tab : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Settings | Tesoro" },
      {
        name: "description",
        content:
          "Configure diecast dashboard Supabase database connection, URLs, table names, theme, and settings.",
      },
      { property: "og:title", content: "Settings | Tesoro" },
      {
        property: "og:description",
        content:
          "Configure diecast dashboard Supabase database connection, URLs, table names, theme, and settings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

type SettingsView =
  | "root"
  | "account"
  | "display"
  | "notifications"
  | "diagnostics"
  | "database"
  | "search_engine"
  | "catalogue_photos"
  | "homepage"
  | "advanced"
  | "help"
  | "help_privacy"
  | "help_terms"
  | "help_contact";

/**
 * The release, and only the release. Anything a build stamps on after the
 * version — a commit, a run number, a timestamp — is for whoever is reading
 * the logs, not for the person looking at Settings.
 */
const APP_VERSION = (import.meta.env.VITE_APP_VERSION || "0.8.0 (alpha)").split("+")[0].trim();

function parseTab(tab?: string): SettingsView {
  if (!tab) return "root";
  const t = tab.toLowerCase().trim();
  if (t === "account" || t === "profile") return "account";
  if (t === "display" || t === "preferences" || t === "appearance") return "display";
  if (t === "notifications" || t === "alerts") return "notifications";
  if (t === "diagnostics" || t === "diag") return "diagnostics";
  if (t === "database" || t === "supabase" || t === "db") return "database";
  if (t === "search_engine" || t === "search-engine" || t === "search") return "search_engine";
  if (t === "catalogue_photos" || t === "photos") return "catalogue_photos";
  if (t === "homepage" || t === "home") return "homepage";
  if (t === "advanced") return "advanced";
  if (t === "help" || t === "support") return "help";
  if (t === "help_privacy" || t === "privacy") return "help_privacy";
  if (t === "help_terms" || t === "terms") return "help_terms";
  if (t === "help_contact" || t === "contact") return "help_contact";
  return "root";
}

function initialsOf(name: string, fallback: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return (fallback.trim()[0] || "?").toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function SettingsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [view, setView] = useState<SettingsView>(() => parseTab(search.tab));
  const [selectedEngine, setSelectedEngine] = useState<SearchEngine>(() => getSearchEngine());

  // Synchronize with URL search param
  useEffect(() => {
    setView(parseTab(search.tab));
  }, [search.tab]);

  const changeView = (next: SettingsView) => {
    setView(next);
    void navigate({
      search: next === "root" ? {} : { tab: next },
      replace: true,
    });
  };

  const {
    theme,
    themePreference,
    setThemePreference,
    accentColor,
    setAccentColor,
    fontSize,
    setFontSize,
    hideInvestment,
    setHideInvestment,
    navAnimation,
    setNavAnimation,
    arrivingSoon,
    setArrivingSoon,
    arrivingDays,
    setArrivingDays,
    releasedShelf,
    setReleasedShelf,
    showRecentlyAdded,
    setShowRecentlyAdded,
    showNewPreorders,
    setShowNewPreorders,
  } = useApp();
  const { profile, isGuest, isOwner, isAdmin, signOut } = useAuth();
  const { source } = useCarsSource();

  const name = fullName(profile);
  const display = name || profile?.email_id || "Your Account";
  const initials = initialsOf(name, display);

  // Notification Preferences (persisted in localStorage)
  const [notifyDeliveries, setNotifyDeliveries] = useState(() => {
    try {
      const v = localStorage.getItem("tesoro_notify_deliveries");
      return v === null ? true : JSON.parse(v);
    } catch {
      return true;
    }
  });

  const [notifyDelayed, setNotifyDelayed] = useState(() => {
    try {
      const v = localStorage.getItem("tesoro_notify_delayed");
      return v === null ? true : JSON.parse(v);
    } catch {
      return true;
    }
  });

  const [notifyPreorders, setNotifyPreorders] = useState(() => {
    try {
      const v = localStorage.getItem("tesoro_notify_preorders");
      return v === null ? true : JSON.parse(v);
    } catch {
      return true;
    }
  });

  const [notifyToasts, setNotifyToasts] = useState(() => {
    try {
      const v = localStorage.getItem("tesoro_notify_toasts");
      return v === null ? true : JSON.parse(v);
    } catch {
      return true;
    }
  });

  const updateNotifyPref = (
    key: string,
    val: boolean,
    setter: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    setter(val);
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {
      // ignore
    }
  };

  const resetDismissedNotices = () => {
    try {
      const uid = profile?.auth_uid || profile?.user_id || "guest";
      localStorage.removeItem(`dg.notifyDismissed.${uid}`);
      localStorage.removeItem(`dg.deliveryToastDay.${uid}`);
      toast.success("Dismissed notifications reset", {
        description: "Hidden notices will appear again in the notification center.",
      });
    } catch {
      toast.error("Could not reset dismissed notices");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success(isGuest ? "Left demo mode" : "Signed out successfully");
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 md:py-8">
      {/* ========================================================================= */}
      {/* ROOT SETTINGS SCREEN (Apple Inset Grouped Table View)                    */}
      {/* ========================================================================= */}
      {view === "root" && (
        <div className="space-y-6">
          {/* Header */}
          <div className="px-1">
            <h1 className="text-display text-2xl font-bold tracking-tight md:text-3xl">Settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your profile, preferences, and diecast collection system.
            </p>
          </div>

          {/* Top Account Card (Separate Apple ID style card) */}
          <button
            type="button"
            onClick={() => changeView("account")}
            className="group flex w-full items-center gap-4 rounded-2xl border border-border/80 bg-card p-4 text-left shadow-xs transition-all hover:border-border hover:bg-muted/30 active:scale-[0.995]"
          >
            <Avatar className="size-14 border border-border/80 shadow-xs">
              {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
              <AvatarFallback className="bg-muted text-base font-semibold text-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                  {display}
                </span>
                {isOwner && (
                  <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    Owner
                  </span>
                )}
                {!isOwner && isAdmin && (
                  <span className="shrink-0 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-500">
                    Admin
                  </span>
                )}
                {isGuest && (
                  <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                    Demo
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {profile?.email_id ||
                  (isGuest ? "Sample data · Stored locally" : "Account & Security")}
              </p>
            </div>

            <ChevronRight className="size-5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </button>

          {/* Grouped General Settings Card */}
          <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
            {/* HOMEPAGE — above Display, because it is about what you see
                first rather than how the whole app looks. */}
            <button
              type="button"
              onClick={() => changeView("homepage")}
              className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-b from-emerald-500 to-teal-600 text-white shadow-xs">
                <Home className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[15px] font-medium text-foreground">Homepage</span>
                <p className="text-xs text-muted-foreground">
                  Which shelves the home page shows &amp; how far ahead it looks
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
            </button>

            {/* DISPLAY */}
            <button
              type="button"
              onClick={() => changeView("display")}
              className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-xs">
                <Palette className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[15px] font-medium text-foreground">Display</span>
                <p className="text-xs text-muted-foreground">
                  Theme mode, accent colour, text size &amp; investment privacy
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
            </button>

            {/* NOTIFICATIONS */}
            <button
              type="button"
              onClick={() => changeView("notifications")}
              className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-b from-rose-500 to-red-600 text-white shadow-xs">
                <Bell className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[15px] font-medium text-foreground">Notifications</span>
                <p className="text-xs text-muted-foreground">
                  Shipment arrivals, delay alerts &amp; release launch notices
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
            </button>
          </div>

          {/* ADVANCED — the owner's card. Search engine, diagnostics, users,
              catalogue photos and the database connection all used to sit in
              the general list or an admin card beside it, which put five
              things nobody else can act on in front of everybody. */}
          {isOwner && (
            <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
              <button
                type="button"
                onClick={() => changeView("advanced")}
                className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-b from-slate-500 to-slate-700 text-white shadow-xs">
                  <Wrench className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[15px] font-medium text-foreground">Advanced</span>
                  <p className="text-xs text-muted-foreground">
                    Search engine, diagnostics, users, catalogue photos &amp; database
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </button>
            </div>
          )}

          {/* HELP — everybody's, unlike Advanced. The policy has to be
              readable by the people it is about, and the phone number is no
              use to the one person who already knows it. */}
          <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
            <button
              type="button"
              onClick={() => changeView("help")}
              className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-b from-cyan-500 to-sky-600 text-white shadow-xs">
                <LifeBuoy className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[15px] font-medium text-foreground">Help</span>
                <p className="text-xs text-muted-foreground">
                  Privacy policy, terms &amp; conditions and how to reach us
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </button>
          </div>

          {/* Sign Out Card (Moved here from the main menu, Apple style) */}
          <div className="space-y-1.5 pt-2">
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="flex w-full items-center justify-center gap-2 px-4 py-3.5 text-[15px] font-semibold text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/15"
              >
                <LogOut className="size-4" />
                {isGuest ? "Leave Demo Mode" : "Log Out"}
              </button>
            </div>
          </div>

          {/* The mark the app opens on, at the end of the page it closes on.
              Well clear of Log Out: a signature under a destructive button is
              a thing to mis-tap, and the space is what says the page is over. */}
          <footer className="flex flex-col items-center gap-3 pb-2 pt-14 text-center text-xs text-muted-foreground">
            <SplashMark className="w-40 opacity-80" />
            <div className="space-y-1">
              <p>© Mervin K</p>
              <p>Crafted with love from Chennai</p>
              <p>Version {APP_VERSION}</p>
            </div>
          </footer>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBPAGE 1: ACCOUNT (With Back Button to Settings)                         */}
      {/* ========================================================================= */}
      {view === "account" && (
        <div className="space-y-5">
          <SubpageHeader title="Account" onBack={() => changeView("root")} />

          <AccountCard />

          {/* In Apple Settings, Sign Out is also at the very bottom of Apple ID */}
          <div className="pt-2">
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="flex w-full items-center justify-center gap-2 px-4 py-3.5 text-[15px] font-semibold text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/15"
              >
                <LogOut className="size-4" />
                {isGuest ? "Leave Demo Mode" : "Log Out"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBPAGE 2: DISPLAY                                                        */}
      {/* ========================================================================= */}
      {view === "display" && (
        <div className="space-y-6">
          <SubpageHeader title="Display" onBack={() => changeView("root")} />

          {/* Appearance Group */}
          <div className="space-y-1.5">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Appearance
            </div>
            <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[15px] font-medium text-foreground">Theme</div>
                  <div className="text-xs text-muted-foreground">
                    {themePreference === "system"
                      ? `Matching your system theme (currently ${theme}).`
                      : "Choose between light, dark, or system preference."}
                  </div>
                </div>
                <SegmentControl
                  value={themePreference}
                  onChange={setThemePreference}
                  options={THEME_OPTIONS}
                  fill
                  className="h-9 text-sm sm:w-auto"
                />
              </div>

              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[15px] font-medium text-foreground">Accent Colour</div>
                  <div className="text-xs text-muted-foreground">
                    Colour applied to buttons, active navigation, and charts.
                  </div>
                </div>
                <Select value={accentColor} onValueChange={(v) => setAccentColor(v as AccentColor)}>
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCENT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-4 p-4">
                <div>
                  <div className="text-[15px] font-medium text-foreground">Smaller Fonts</div>
                  <div className="text-xs text-muted-foreground">
                    Reduce application text size across all views.
                  </div>
                </div>
                <Switch
                  checked={fontSize === "-2"}
                  onCheckedChange={(checked) => setFontSize(checked ? "-2" : "0")}
                />
              </div>

              {/* Phones only: the bottom bar is a phone thing. */}
              <div className="flex items-center justify-between gap-4 p-4 md:hidden">
                <div>
                  <div className="text-[15px] font-medium text-foreground">Navbar Animation</div>
                  <div className="text-xs text-muted-foreground">
                    Shrink the bottom bar while scrolling down.
                  </div>
                </div>
                <Switch checked={navAnimation} onCheckedChange={setNavAnimation} />
              </div>
            </div>
          </div>

          {/* Privacy Group */}
          <div className="space-y-1.5">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Privacy
            </div>
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[15px] font-medium text-foreground">
                    Hide Investment Value
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Mask the total expenditure figures across dashboard cards and sidebar until
                    tapped.
                  </div>
                </div>
                <Switch checked={hideInvestment} onCheckedChange={setHideInvestment} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBPAGE: HOMEPAGE                                                         */}
      {/* ========================================================================= */}
      {view === "homepage" && (
        <div className="space-y-6">
          <SubpageHeader title="Homepage" onBack={() => changeView("root")} />

          {/* Released pre-orders */}
          <div className="space-y-1.5">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Released PO
            </div>
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
              <div className="flex flex-col gap-3">
                <div>
                  <div className="text-[15px] font-medium text-foreground">
                    Pre-orders that have been released
                  </div>
                  <div className="text-xs text-muted-foreground">
                    A casting is marked released the first time anybody&rsquo;s copy of it arrives.{" "}
                    {releasedShelf === "all"
                      ? "Every casting that has started arriving, whoever ordered it."
                      : releasedShelf === "mine"
                        ? "Only castings you are waiting on yourself."
                        : "The shelf is hidden."}{" "}
                    Either way, a pre-order of yours that ships still reaches the notification bell
                    — that one has a seller to contact and usually a balance to settle.
                  </div>
                </div>
                <SegmentControl
                  value={releasedShelf}
                  onChange={setReleasedShelf}
                  options={RELEASED_OPTIONS}
                  fill
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Arriving soon — moved here from Display, where it sat under a
              "Home" heading inside a page about theme and text size. */}
          <div className="space-y-1.5">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Arriving Soon
            </div>
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[15px] font-medium text-foreground">Arriving Soon</div>
                  <div className="text-xs text-muted-foreground">
                    {arrivingSoon === "auto"
                      ? "Shown only on a week with nothing recently added and no new pre-orders."
                      : arrivingSoon === "always"
                        ? "Always shown, alongside Recently added and New Pre Orders."
                        : arrivingSoon === "custom"
                          ? "Always shown, over the window you pick below."
                          : "Hidden."}{" "}
                    Cars due in your hands within{" "}
                    {arrivingSoon === "custom" ? arrivingDays : ARRIVING_WINDOW_DEFAULT} days.
                  </div>
                </div>
                <SegmentControl
                  value={arrivingSoon}
                  onChange={setArrivingSoon}
                  options={ARRIVING_SOON_OPTIONS}
                  fill
                  className="h-9 text-sm sm:w-auto"
                />
              </div>

              {arrivingSoon === "custom" && (
                <div className="flex flex-col gap-2 border-t border-border/60 px-4 pb-4 pt-3">
                  <div className="text-xs font-medium text-muted-foreground">How far ahead</div>
                  <SegmentControl
                    value={String(arrivingDays)}
                    onChange={(v) => setArrivingDays(Number(v))}
                    options={ARRIVING_WINDOW_OPTIONS}
                    fill
                    className="h-9 text-sm"
                  />
                </div>
              )}
            </div>
          </div>

          {/* The other two shelves. Switches rather than a segment each,
              because there is nothing to choose: they are on or they are not. */}
          <div className="space-y-1.5">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Other shelves
            </div>
            <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
              <div className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="text-[15px] font-medium text-foreground">Recently added</div>
                  <div className="text-xs text-muted-foreground">
                    Cars you logged in the last few days, above the transit tracker.
                  </div>
                </div>
                <Switch checked={showRecentlyAdded} onCheckedChange={setShowRecentlyAdded} />
              </div>

              <div className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="text-[15px] font-medium text-foreground">New Pre Orders</div>
                  <div className="text-xs text-muted-foreground">
                    What other collectors have pre-ordered in the last three days, ready to add.
                  </div>
                </div>
                <Switch checked={showNewPreorders} onCheckedChange={setShowNewPreorders} />
              </div>
            </div>
            <p className="px-1 pt-1 text-[11px] text-muted-foreground">
              Switching one off also makes Arriving Soon&rsquo;s &ldquo;Auto&rdquo; treat it as
              empty, so the shelf still stands in on a quiet week.
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBPAGE: ADVANCED (owner only)                                            */}
      {/* ========================================================================= */}
      {view === "advanced" && isOwner && (
        <div className="space-y-6">
          <SubpageHeader title="Advanced" onBack={() => changeView("root")} />
          <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
            {/* SEARCH ENGINE */}
            <button
              type="button"
              onClick={() => changeView("search_engine")}
              className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-b from-sky-500 to-blue-600 text-white shadow-xs">
                <Search className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[15px] font-medium text-foreground">Search Engine</span>
                <p className="text-xs text-muted-foreground">
                  Web image lookup provider for car photos &amp; casting specs
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
            </button>

            {/* DIAGNOSTICS */}
            <button
              type="button"
              onClick={() => changeView("diagnostics")}
              className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-b from-indigo-500 to-purple-600 text-white shadow-xs">
                <Wrench className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[15px] font-medium text-foreground">Diagnostics</span>
                <p className="text-xs text-muted-foreground">
                  Shipping ID consistency, order dates &amp; duplicate checker
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
            </button>
            {/* USERS */}
            <Link
              to="/admin"
              className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-b from-amber-500 to-amber-600 text-white shadow-xs">
                <ShieldCheck className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[15px] font-medium text-foreground">Users</span>
                <p className="text-xs text-muted-foreground">
                  Account approvals, access &amp; roles
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
            </Link>
            {/* CATALOGUE PHOTOS */}
            <button
              type="button"
              onClick={() => changeView("catalogue_photos")}
              className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-b from-violet-500 to-purple-600 text-white shadow-xs">
                <ImageIcon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[15px] font-medium text-foreground">Catalogue Photos</span>
                <p className="text-xs text-muted-foreground">
                  Every casting with a box for its picture, for filling in a run of them
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </button>

            {/* DB CONNECTION (Moved into Admin) */}
            <button
              type="button"
              onClick={() => changeView("database")}
              className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-b from-emerald-500 to-teal-600 text-white shadow-xs">
                <Database className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[15px] font-medium text-foreground">DB Connection</span>
                <p className="text-xs text-muted-foreground">
                  Cloud Supabase synchronization, credentials &amp; login providers
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 font-medium">
                  <span
                    className={`inline-block size-2 rounded-full ${
                      source === "supabase"
                        ? "bg-emerald-500 shadow-xs shadow-emerald-500/50"
                        : "bg-primary"
                    }`}
                  />
                  {source === "supabase" ? "Synced" : "Local"}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
            </button>
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* SUBPAGE: HELP                                                             */}
      {/* ========================================================================= */}
      {view === "help" && (
        <div className="space-y-6">
          <SubpageHeader title="Help" onBack={() => changeView("root")} />
          <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
            {(
              [
                ["help_privacy", "privacy", FileText, "from-indigo-500 to-violet-600"],
                ["help_terms", "terms", Scale, "from-amber-500 to-orange-600"],
                ["help_contact", "contact", MessageCircle, "from-emerald-500 to-teal-600"],
              ] as const
            ).map(([target, key, Icon, tint]) => (
              <button
                key={key}
                type="button"
                onClick={() => changeView(target)}
                className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
              >
                <div
                  className={`flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-b ${tint} text-white shadow-xs`}
                >
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[15px] font-medium text-foreground">
                    {HELP_TITLES[key]}
                  </span>
                  <p className="text-xs text-muted-foreground">{HELP_BLURBS[key]}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </button>
            ))}
          </div>
          <p className="px-1 text-[11px] text-muted-foreground">
            Tesoro {APP_VERSION} · a personal project, not a company.
          </p>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBPAGE: HELP DOCUMENTS                                                   */}
      {/* ========================================================================= */}
      {(view === "help_privacy" || view === "help_terms" || view === "help_contact") && (
        <div className="space-y-6">
          <SubpageHeader
            title={
              HELP_TITLES[
                view === "help_privacy" ? "privacy" : view === "help_terms" ? "terms" : "contact"
              ]
            }
            onBack={() => changeView("help")}
            backLabel="Help"
          />
          <HelpDoc
            docKey={
              view === "help_privacy" ? "privacy" : view === "help_terms" ? "terms" : "contact"
            }
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBPAGE 3: NOTIFICATIONS                                                  */}
      {/* ========================================================================= */}
      {view === "notifications" && (
        <div className="space-y-6">
          <SubpageHeader title="Notifications" onBack={() => changeView("root")} />

          {/* Admin: push to this device when someone new asks to join */}
          {(isAdmin || isOwner) && !isGuest && (
            <div className="space-y-1.5">
              <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Admin
              </div>
              <AdminPushCard />
            </div>
          )}

          {/* Delivery Alerts */}
          <div className="space-y-1.5">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Deliveries &amp; Shipments
            </div>
            <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
              <div className="flex items-center justify-between gap-4 p-4">
                <div>
                  <div className="text-[15px] font-medium text-foreground">
                    Deliveries Due Today
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Highlight packages scheduled to arrive today in the top navigation bell.
                  </div>
                </div>
                <Switch
                  checked={notifyDeliveries}
                  onCheckedChange={(val) =>
                    updateNotifyPref("tesoro_notify_deliveries", val, setNotifyDeliveries)
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-4 p-4">
                <div>
                  <div className="text-[15px] font-medium text-foreground">
                    Delayed Shipment Alerts
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Flag shipments in transit that have passed their expected delivery date.
                  </div>
                </div>
                <Switch
                  checked={notifyDelayed}
                  onCheckedChange={(val) =>
                    updateNotifyPref("tesoro_notify_delayed", val, setNotifyDelayed)
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-4 p-4">
                <div>
                  <div className="text-[15px] font-medium text-foreground">
                    Pre-order Launch Reminders
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Show upcoming casting release launches within 10 days of arrival.
                  </div>
                </div>
                <Switch
                  checked={notifyPreorders}
                  onCheckedChange={(val) =>
                    updateNotifyPref("tesoro_notify_preorders", val, setNotifyPreorders)
                  }
                />
              </div>
            </div>
          </div>

          {/* In-App Alerts */}
          <div className="space-y-1.5">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Banner Alerts
            </div>
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[15px] font-medium text-foreground">
                    Daily Toast Notifications
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Display an on-screen toast popup when you open the app if parcels are arriving
                    today.
                  </div>
                </div>
                <Switch
                  checked={notifyToasts}
                  onCheckedChange={(val) =>
                    updateNotifyPref("tesoro_notify_toasts", val, setNotifyToasts)
                  }
                />
              </div>
            </div>
          </div>

          {/* Notification Management */}
          <div className="space-y-1.5">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              History &amp; Dismissals
            </div>
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[15px] font-medium text-foreground">
                    Reset Dismissed Notices
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Unhide any notifications you previously swiped away or cleared.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetDismissedNotices}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/60 px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted active:scale-95"
                >
                  <RotateCcw className="size-3.5" />
                  Reset Dismissed
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBPAGE 4: DIAGNOSTICS                                                    */}
      {/* ========================================================================= */}
      {view === "diagnostics" && (
        <div className="space-y-6">
          <SubpageHeader title="Diagnostics" onBack={() => changeView("root")} />

          <div className="space-y-1.5">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Data Health &amp; Identifiers
            </div>
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-xs">
              <p className="mb-4 text-xs text-muted-foreground">
                Run automated consistency checks on your diecast records, carrier tracking numbers,
                and collection integrity.
              </p>
              <div className="space-y-4">
                <IdRebuild kind="shipping" />
                <div className="border-t border-border/60" />
                <IdRebuild kind="order" />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Collection Integrity
            </div>
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-xs">
              <FavouriteDetector />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBPAGE 5: DB CONNECTION                                                  */}
      {/* ========================================================================= */}
      {view === "catalogue_photos" && (
        <div className="space-y-6">
          <SubpageHeader title="Catalogue Photos" onBack={() => changeView("root")} />
          {isAdmin ? (
            <CataloguePhotos />
          ) : (
            <p className="rounded-2xl border border-border/80 bg-card p-6 text-center text-sm text-muted-foreground shadow-xs">
              The catalogue is shared, so only an admin can change its photos.
            </p>
          )}
        </div>
      )}

      {view === "database" && (
        <div className="space-y-6">
          <SubpageHeader title="DB Connection" onBack={() => changeView("root")} />

          {/* Connection Status Banner */}
          <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`flex size-10 items-center justify-center rounded-xl ${
                    source === "supabase"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  <Database className="size-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {source === "supabase" ? "Connected to Supabase" : "Local Browser Database"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {source === "supabase"
                      ? "Your collection records are synced in real-time to PostgreSQL cloud."
                      : "Operating in offline local cache mode."}
                  </div>
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  source === "supabase"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    source === "supabase" ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
                  }`}
                />
                {source === "supabase" ? "Live Cloud" : "Local Only"}
              </span>
            </div>
          </div>

          {/* Database Configuration */}
          {isOwner ? (
            <div className="space-y-6">
              <div className="space-y-1.5">
                <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Authentication &amp; Social Logins
                </div>
                <div className="overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-xs">
                  <OAuthProvidersCard />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Supabase Synchronization
                </div>
                <SupabaseSyncCard />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/80 bg-card p-6 text-center shadow-xs">
              <ShieldCheck className="mx-auto size-10 text-muted-foreground/60" />
              <h3 className="mt-2 text-base font-semibold text-foreground">Owner Configuration</h3>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                Database connection endpoints, API keys, and table configurations are managed by the
                collection owner. Contact the administrator to modify database settings.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBPAGE: SEARCH ENGINE                                                    */}
      {/* ========================================================================= */}
      {view === "search_engine" && (
        <div className="space-y-6">
          <SubpageHeader title="Search Engine" onBack={() => changeView("root")} />

          <div className="space-y-1.5">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Web Image Lookup Provider
            </div>
            <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
              {SEARCH_ENGINES.map((engine) => {
                const isSelected = selectedEngine === engine.value;
                return (
                  <button
                    key={engine.value}
                    type="button"
                    onClick={() => {
                      setSelectedEngine(engine.value);
                      setSearchEngine(engine.value);
                      toast.success(`Search engine set to ${engine.label}`);
                    }}
                    className="flex w-full items-start justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-medium text-foreground">
                          {engine.label}
                        </span>
                        {engine.value === "bing" && (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            Recommended
                          </span>
                        )}
                        {engine.value === "auto" && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            Smart Fallback
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{engine.description}</p>
                    </div>
                    <div className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border mt-0.5">
                      {isSelected && <div className="size-2.5 rounded-full bg-primary" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Apple-style subpage navigation bar with back arrow */
function SubpageHeader({
  title,
  onBack,
  backLabel = "Settings",
}: {
  title: string;
  onBack: () => void;
  /** Where Back actually goes, for the pages that are two levels down. */
  backLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 rounded-lg py-1 pr-2 text-[15px] font-medium text-primary transition-opacity hover:opacity-75 active:opacity-50"
      >
        <ChevronLeft className="size-5 -ml-1" />
        <span>{backLabel}</span>
      </button>

      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>

      {/* Placeholder to keep title optically centered */}
      <div className="w-16" aria-hidden="true" />
    </div>
  );
}
