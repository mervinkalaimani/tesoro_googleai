import { SUMMARY_ITEMS } from "@/lib/summary-cards";
import { USE_CASES, uses } from "@/lib/use-cases";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeading } from "@/components/page-header";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Palette,
  Bell,
  Compass,
  Wrench,
  Database,
  LogOut,
  ShieldCheck,
  RotateCcw,
  Check,
  Search,
  Image as ImageIcon,
  Home,
  History,
  PackageCheck,
  ShoppingCart,
  Sparkles,
  LifeBuoy,
  Lightbulb,
  Bug,
  CreditCard,
  FileText,
  Scale,
  MessageCircle,
  Layers,
  KeyRound,
  Tag,
} from "lucide-react";
import { toast } from "sonner";

import {
  ACCENT_OPTIONS,
  themeOptionsFor,
  FONT_SIZE_OPTIONS,
  ARRIVING_SOON_OPTIONS,
  PRIZED_OPTIONS,
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
import { CyclePill, SegmentControl } from "@/components/segment-control";
import { useShopMode } from "@/lib/deployment-settings";
import { useIsMobile } from "@/hooks/use-mobile";
import { CataloguePhotos } from "@/components/catalogue-photos";
import { MetadataEditor } from "@/components/metadata-editor";
import { DeleteMyData } from "@/components/delete-my-data";
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
import { TierAvatar } from "@/components/tier-avatar";
import { AccountCard } from "@/components/account-card";
import { ChangeLog } from "@/components/change-log";
import { useCarDrawer } from "@/components/car-details-drawer";
import { FeedbackPanel } from "@/components/feedback-panel";
import { PlanSummary, SubscriptionPanel } from "@/components/subscription-panel";
import { AdminPushCard } from "@/components/admin-push-card";
import { FavouriteDetector } from "@/components/favourite-detector";
import { IdRebuild } from "@/components/shipping-id-rebuild";
import { OAuthProvidersCard } from "@/components/oauth-providers-card";
import { SupabaseSyncCard } from "@/components/supabase-sync-card";
import { WhatsNewList } from "@/components/whats-new";
import { LATEST_BUILD } from "@/lib/whats-new";
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
      { title: "Settings | VIIV" },
      {
        name: "description",
        content:
          "Configure diecast dashboard Supabase database connection, URLs, table names, theme, and settings.",
      },
      { property: "og:title", content: "Settings | VIIV" },
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
  | "subscription"
  | "feature_request"
  | "report_bug"
  | "display"
  | "notifications"
  | "privacy"
  | "onboarding"
  | "diagnostics"
  | "database"
  | "auth_providers"
  | "search_engine"
  | "metadata"
  | "homepage"
  | "advanced"
  | "whats_new"
  | "activity"
  | "help"
  | "help_privacy"
  | "help_terms"
  | "help_contact";

/**
 * The release, and only the release. Anything a build stamps on after the
 * version — a commit, a run number, a timestamp — is for whoever is reading
 * the logs, not for the person looking at Settings.
 */
const APP_VERSION = (import.meta.env.VITE_APP_VERSION || "0.9.0 (beta)").split("+")[0].trim();

function parseTab(tab?: string): SettingsView {
  if (!tab) return "root";
  const t = tab.toLowerCase().trim();
  if (t === "account" || t === "profile") return "account";
  if (t === "admin_console" || t === "admin-console" || t === "console") return "advanced";
  if (t === "feature_request" || t === "feature" || t === "request") return "feature_request";
  if (t === "report_bug" || t === "bug" || t === "report") return "report_bug";
  if (t === "subscription" || t === "subscriptions" || t === "plan" || t === "billing") {
    return "subscription";
  }
  if (t === "display" || t === "preferences" || t === "appearance") return "display";
  if (t === "notifications" || t === "alerts") return "notifications";
  if (t === "privacy") return "privacy";
  if (t === "onboarding") return "onboarding";
  if (t === "diagnostics" || t === "diag") return "diagnostics";
  if (t === "database" || t === "supabase" || t === "db") return "database";
  if (t === "auth_providers" || t === "auth" || t === "logins" || t === "providers") {
    return "auth_providers";
  }
  if (t === "search_engine" || t === "search-engine" || t === "search") return "search_engine";
  // The three screens these named are tabs of one editor now, so the old
  // links still land on it.
  if (
    t === "metadata" ||
    t === "catalogue_photos" ||
    t === "photos" ||
    t === "assortments" ||
    t === "assortment" ||
    t === "brand_logos" ||
    t === "brands" ||
    t === "logos"
  ) {
    return "metadata";
  }
  if (t === "homepage" || t === "home") return "homepage";
  if (t === "advanced") return "advanced";
  if (t === "activity" || t === "log" || t === "activity_log" || t === "history") return "activity";
  if (t === "whats_new" || t === "whatsnew" || t === "changelog" || t === "updates") {
    return "whats_new";
  }
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
  // OLED is a phone's option: a backlit panel saves nothing on a black pixel,
  // so the choice is not offered on a screen that cannot use it.
  const isPhone = useIsMobile();
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

  // On a wide screen the list stays on the left and the page opens beside it, so there is
  // always one open: Account until something else is picked.
  const page: SettingsView = !isPhone && view === "root" ? "account" : view;
  const section: SettingsView =
    page.startsWith("help") || page === "feature_request" || page === "report_bug"
      ? "help"
      : ["diagnostics", "metadata", "auth_providers", "database", "search_engine"].includes(page)
        ? "advanced"
        : page;

  const {
    theme,
    themePreference,
    setThemePreference,
    accentColor,
    showGlow,
    setShowGlow,
    setAccentColor,
    hideInvestment,
    setHideInvestment,
    hideCost,
    setHideCost,
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
    showForYou,
    setShowForYou,
    showCarsDue,
    setShowCarsDue,
    carsDueTotal,
    setCarsDueTotal,
    prizedShelf,
    setPrizedShelf,
    summaryCards,
    setSummaryCards,
    useCases,
    setUseCases,
    hiddenSummary,
    setSummaryCardShown,
  } = useApp();
  const { profile, isGuest, isOwner, isAdmin, signOut } = useAuth();
  const shop = useShopMode();
  const drawer = useCarDrawer();
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
    // No bold type anywhere on Settings: titles included, whichever shared component draws them.
    <div className="mx-auto max-w-[1600px] space-y-3 p-3 md:grid md:h-[calc(100vh-7rem)] md:grid-cols-[30%_minmax(0,1fr)] md:gap-6 md:space-y-0 md:p-6 [&_h1]:!font-medium [&_h2]:!font-medium [&_h3]:!font-medium">
      {/* ========================================================================= */}
      {/* ROOT SETTINGS SCREEN (Apple Inset Grouped Table View)                    */}
      {/* ========================================================================= */}
      {(view === "root" || !isPhone) && (
        <div className="space-y-6 md:flex md:h-full md:min-h-0 md:flex-col md:space-y-0">
          <div className="md:shrink-0">
            <PageHeading title="Settings" />
          </div>
          <div className="space-y-6 md:-mx-6 md:min-h-0 md:flex-1 md:overflow-y-auto md:px-6 md:pb-8 md:pt-2">
            {/* Top Account Card (Separate Apple ID style card) */}
            <button
              type="button"
              onClick={() => changeView("account")}
              data-active={section === "account"}
              className="md:data-[active=true]:bg-primary/12 group flex w-full items-center gap-4 card-elevated p-4 text-left transition-all hover:bg-primary/[0.06] active:scale-[0.995]"
            >
              <TierAvatar
                url={profile?.avatar_url}
                initials={initials}
                className="size-14 border border-border/80 shadow-xs"
                fallbackClassName="bg-muted text-base font-medium text-foreground"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-base font-medium text-foreground">{display}</span>
                  {isOwner && (
                    <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Owner
                    </span>
                  )}
                  {!isOwner && isAdmin && (
                    <span className="shrink-0 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-500">
                      Admin
                    </span>
                  )}
                  {isGuest && (
                    <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500">
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

            {!isGuest && (
              <button
                type="button"
                onClick={() => changeView("subscription")}
                data-active={section === "subscription"}
                className="md:data-[active=true]:bg-primary/12 group flex w-full items-center gap-3.5 card-elevated px-4 py-3.5 text-left transition-all hover:bg-primary/[0.06] active:scale-[0.995]"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white [&_svg]:fill-white">
                  <Sparkles className="size-4" />
                </div>
                <span className="min-w-0 flex-1 text-[15px] font-medium text-foreground">
                  Subscription
                </span>
                <span className="shrink-0 text-right text-xs text-muted-foreground">
                  <PlanSummary />
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </button>
            )}

            {/* Grouped General Settings Card */}
            <div className="divide-y divide-border/60 overflow-hidden card-elevated">
              {/* HOMEPAGE — above Display, because it is about what you see
                first rather than how the whole app looks. */}
              <button
                type="button"
                onClick={() => changeView("homepage")}
                data-active={section === "homepage"}
                className="md:data-[active=true]:bg-primary/12 group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-primary/[0.06] active:bg-primary/12"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white [&_svg]:fill-white">
                  <Home className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[15px] font-medium text-foreground">Homepage</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
              </button>

              {/* DISPLAY */}
              <button
                type="button"
                onClick={() => changeView("display")}
                data-active={section === "display"}
                className="md:data-[active=true]:bg-primary/12 group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-primary/[0.06] active:bg-primary/12"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white [&_svg]:fill-white">
                  <Palette className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[15px] font-medium text-foreground">Display</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
              </button>

              {/* NOTIFICATIONS */}
              <button
                type="button"
                onClick={() => changeView("notifications")}
                data-active={section === "notifications"}
                className="md:data-[active=true]:bg-primary/12 group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-primary/[0.06] active:bg-primary/12"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white [&_svg]:fill-white">
                  <Bell className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[15px] font-medium text-foreground">Notifications</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
              </button>

              {/* PRIVACY */}
              <button
                type="button"
                onClick={() => changeView("privacy")}
                data-active={section === "privacy"}
                className="md:data-[active=true]:bg-primary/12 group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-primary/[0.06] active:bg-primary/12"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white [&_svg]:fill-white">
                  <ShieldCheck className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[15px] font-medium text-foreground">Privacy</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
              </button>

              {/* ONBOARDING — what you told VIIV you use it for */}
              <button
                type="button"
                onClick={() => changeView("onboarding")}
                data-active={section === "onboarding"}
                className="md:data-[active=true]:bg-primary/12 group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-primary/[0.06] active:bg-primary/12"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white [&_svg]:fill-white">
                  <Compass className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[15px] font-medium text-foreground">Onboarding</span>
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
              <div className="divide-y divide-border/60 overflow-hidden card-elevated">
                <button
                  type="button"
                  onClick={() => changeView("advanced")}
                  data-active={section === "advanced"}
                  className="md:data-[active=true]:bg-primary/12 group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-primary/[0.06] active:bg-primary/12"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white [&_svg]:fill-white">
                    <Wrench className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[15px] font-medium text-foreground">Admin Console</span>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </button>
              </div>
            )}

            {/* HELP — everybody's, unlike the Admin Console. The policy has to be
              readable by the people it is about, and the phone number is no
              use to the one person who already knows it. */}
            <div className="divide-y divide-border/60 overflow-hidden card-elevated">
              <button
                type="button"
                onClick={() => changeView("help")}
                data-active={section === "help"}
                className="md:data-[active=true]:bg-primary/12 group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-primary/[0.06] active:bg-primary/12"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white [&_svg]:fill-white">
                  <LifeBuoy className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[15px] font-medium text-foreground">Help</span>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </button>

              {/* ACTIVITY — who changed what, on which car, and when. */}
              <button
                type="button"
                onClick={() => changeView("activity")}
                data-active={section === "activity"}
                className="md:data-[active=true]:bg-primary/12 group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-primary/[0.06] active:bg-primary/12"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white [&_svg]:fill-white">
                  <History className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[15px] font-medium text-foreground">Activity log</span>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </button>

              {/* WHAT'S NEW — the permanent home of the changelog. The mark in the
                top bar shows the last two builds and then removes itself. */}
              <button
                type="button"
                onClick={() => changeView("whats_new")}
                data-active={section === "whats_new"}
                className="md:data-[active=true]:bg-primary/12 group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-primary/[0.06] active:bg-primary/12"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white [&_svg]:fill-white">
                  <Sparkles className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[15px] font-medium text-foreground">What&apos;s new</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="tabular-nums">Build {LATEST_BUILD}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
              </button>
            </div>

            {/* Sign Out Card (Moved here from the main menu, Apple style) */}
            <div className="space-y-1.5 pt-2">
              <div className="overflow-hidden card-elevated">
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="flex w-full items-center justify-center gap-2 px-4 py-3.5 text-[15px] font-medium text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/15"
                >
                  <LogOut className="size-4" />
                  {isGuest ? "Leave Demo Mode" : "Log Out"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="min-w-0 md:-mx-6 md:h-full md:overflow-y-auto md:px-6 md:pb-8">
        {/* ========================================================================= */}
        {/* SUBPAGE 1: ACCOUNT (With Back Button to Settings)                         */}
        {/* ========================================================================= */}
        {page === "feature_request" && (
          <div className="space-y-4">
            <SubpageHeader title="Feature request" onBack={() => changeView("help")} />
            <FeedbackPanel kind="feature" />
          </div>
        )}

        {page === "report_bug" && (
          <div className="space-y-4">
            <SubpageHeader title="Report a bug" onBack={() => changeView("help")} />
            <FeedbackPanel kind="bug" />
          </div>
        )}

        {page === "subscription" && (
          <div className="space-y-4">
            <SubpageHeader title="Subscription" onBack={() => changeView("root")} />
            <SubscriptionPanel />
          </div>
        )}

        {page === "account" && (
          <div className="space-y-5">
            <SubpageHeader title="Account" onBack={() => changeView("root")} />

            <AccountCard />

            {/* Guest mode has nothing of its own to delete. The owner does, but
              deleting it would leave the catalogue with nobody to keep it, so
              the card says so rather than hiding. */}
            {!isGuest && <DeleteMyData blocked={isOwner} />}

            {/* In Apple Settings, Sign Out is also at the very bottom of Apple ID */}
            <div className="pt-2">
              <div className="overflow-hidden card-elevated">
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="flex w-full items-center justify-center gap-2 px-4 py-3.5 text-[15px] font-medium text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/15"
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
        {page === "display" && (
          <div className="space-y-6">
            <SubpageHeader title="Display" onBack={() => changeView("root")} />

            {/* Appearance Group */}
            <div className="space-y-1.5">
              <div className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Appearance
              </div>
              <div className="divide-y divide-border/60 overflow-hidden card-elevated">
                <div className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="text-[15px] font-medium text-foreground">Theme</div>
                    <div className="text-xs text-muted-foreground">
                      {themePreference === "system"
                        ? `Matching your system (${theme}).`
                        : "Light, dark, or match your system."}
                    </div>
                  </div>
                  <div className="shrink-0 [&_.cycle-info]:hidden">
                    <SegmentControl
                      value={themePreference}
                      onChange={setThemePreference}
                      options={themeOptionsFor(isPhone)}
                      className="h-9 text-sm sm:w-auto"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="text-[15px] font-medium text-foreground">Accent Colour</div>
                    <div className="text-xs text-muted-foreground">
                      Buttons, charts and the logo.
                    </div>
                  </div>
                  <div className="shrink-0 [&_.cycle-info]:hidden">
                    <SegmentControl
                      value={accentColor}
                      onChange={(v) => setAccentColor(v as AccentColor)}
                      options={ACCENT_OPTIONS}
                      className="h-9 text-sm sm:w-auto"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="text-[15px] font-medium text-foreground">Background glow</div>
                    <div className="text-xs text-muted-foreground">
                      A soft glow in your accent colour behind the app.
                    </div>
                  </div>
                  <Switch checked={showGlow} onCheckedChange={setShowGlow} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBPAGE: HOMEPAGE                                                         */}
        {/* ========================================================================= */}
        {page === "homepage" && (
          <div className="space-y-6">
            <SubpageHeader title="Homepage" onBack={() => changeView("root")} />

            {/* The row of counts at the top. A master switch, and — once it is on —
              every card in it, each with its own. */}
            <div className="space-y-1.5">
              <div className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Summary cards
              </div>
              <div className="divide-y divide-border/60 overflow-hidden card-elevated">
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-medium text-foreground">
                      Show summary cards
                    </div>
                    <div className="text-xs text-muted-foreground">
                      The row of counts at the top of the home page.
                    </div>
                  </div>
                  <Switch checked={summaryCards} onCheckedChange={setSummaryCards} />
                </div>
                {summaryCards &&
                  SUMMARY_ITEMS.map((item) => (
                    <div
                      key={item.key}
                      title={item.hint}
                      className="flex items-center justify-between gap-4 px-4 py-2.5 pl-6"
                    >
                      <div className="min-w-0 text-sm font-medium text-foreground">
                        {item.label}
                      </div>
                      <Switch
                        checked={!hiddenSummary.includes(item.key)}
                        onCheckedChange={(on) => setSummaryCardShown(item.key, on)}
                      />
                    </div>
                  ))}
              </div>
              {summaryCards && (
                <p className="px-1 pt-1 text-xs text-muted-foreground">
                  A card with nothing to count stays out of the way, even when it is switched on.
                </p>
              )}
            </div>

            {/* The shelves under the summary cards, one line each: the name, and
              its control on the right. The longer explanations are tooltips, and
              what a mode means is said by its own label. */}
            <div className="space-y-1.5">
              <div className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Shelves
              </div>
              <div className="divide-y divide-border/60 overflow-hidden card-elevated">
                <div
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                  title="Your chase, STH, TH and favourite cars. Auto shows it once you own one."
                >
                  <div className="text-[15px] font-medium text-foreground">Prized possessions</div>
                  <SegmentControl
                    value={prizedShelf}
                    onChange={setPrizedShelf}
                    options={PRIZED_OPTIONS}
                    className="h-9 text-sm sm:w-auto"
                  />
                </div>

                <div
                  className="flex items-center justify-between gap-4 px-4 py-2.5"
                  title="Cars picked for you from the catalogue."
                >
                  <div className="text-[15px] font-medium text-foreground">For you</div>
                  <Switch checked={showForYou} onCheckedChange={setShowForYou} />
                </div>

                <div
                  className="flex items-center justify-between gap-4 px-4 py-2.5"
                  title="Cars due this month (or next), by car, seller or order ID, with what you owe."
                >
                  <div className="text-[15px] font-medium text-foreground">Cars Due</div>
                  <Switch checked={showCarsDue} onCheckedChange={setShowCarsDue} />
                </div>
                {showCarsDue && (
                  <div className="flex items-center justify-between gap-4 px-4 py-2.5 pl-6">
                    <div className="text-sm font-medium text-foreground">Total row</div>
                    <Switch checked={carsDueTotal} onCheckedChange={setCarsDueTotal} />
                  </div>
                )}

                <div
                  className="flex items-center justify-between gap-4 px-4 py-2.5"
                  title="Cars you logged in the last few days, above the transit tracker."
                >
                  <div className="text-[15px] font-medium text-foreground">Recently added</div>
                  <Switch checked={showRecentlyAdded} onCheckedChange={setShowRecentlyAdded} />
                </div>

                <div
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                  title={`Cars due in your hands within ${
                    arrivingSoon === "custom" ? arrivingDays : ARRIVING_WINDOW_DEFAULT
                  } days. Auto shows it only on a week with nothing recently added and no new pre-orders.`}
                >
                  <div className="text-[15px] font-medium text-foreground">Arriving soon</div>
                  <SegmentControl
                    value={arrivingSoon}
                    onChange={setArrivingSoon}
                    options={ARRIVING_SOON_OPTIONS}
                    className="h-9 text-sm sm:w-auto"
                  />
                </div>
                {arrivingSoon === "custom" && (
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5 pl-6">
                    <div className="text-sm text-muted-foreground">How far ahead</div>
                    <SegmentControl
                      value={String(arrivingDays)}
                      onChange={(v) => setArrivingDays(Number(v))}
                      options={ARRIVING_WINDOW_OPTIONS}
                      className="h-9 text-sm sm:w-auto"
                    />
                  </div>
                )}

                <div
                  className="flex items-center justify-between gap-4 px-4 py-2.5"
                  title="What other collectors have pre-ordered in the last three days, ready to add."
                >
                  <div className="text-[15px] font-medium text-foreground">New pre-orders</div>
                  <Switch checked={showNewPreorders} onCheckedChange={setShowNewPreorders} />
                </div>

                <div
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                  title="A casting is marked released the first time anybody’s copy of it arrives. A pre-order of yours that ships still reaches the notification bell either way."
                >
                  <div className="text-[15px] font-medium text-foreground">Released PO</div>
                  <SegmentControl
                    value={releasedShelf}
                    onChange={setReleasedShelf}
                    options={RELEASED_OPTIONS}
                    className="h-9 text-sm sm:w-auto"
                  />
                </div>
              </div>
              <p className="px-1 pt-1 text-xs text-muted-foreground">
                Switching a shelf off also makes Arriving soon&rsquo;s &ldquo;Auto&rdquo; treat it
                as empty.
              </p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBPAGE: ADVANCED (owner only)                                            */}
        {/* ========================================================================= */}
        {page === "advanced" && isOwner && (
          <div className="space-y-6">
            <SubpageHeader title="Admin Console" onBack={() => changeView("root")} />
            <div className="divide-y divide-border/60 overflow-hidden card-elevated">
              {/* SEARCH ENGINE */}
              <button
                type="button"
                onClick={() => changeView("search_engine")}
                className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-primary/[0.06] active:bg-primary/12"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white [&_svg]:fill-white">
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
                className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-primary/[0.06] active:bg-primary/12"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white [&_svg]:fill-white">
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
                className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-primary/[0.06] active:bg-primary/12"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white [&_svg]:fill-white">
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
              {/* PRO USERS */}
              <Link
                to="/subscriptions"
                className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-primary/[0.06] active:bg-primary/12"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white [&_svg]:fill-white">
                  <Sparkles className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[15px] font-medium text-foreground">Subscriptions</span>
                  <p className="text-xs text-muted-foreground">Plans, length &amp; what is owed</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
              </Link>
              {/* VIIV SHOP (beta): who can see it. One setting for every account. */}
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-3.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white [&_svg]:fill-white">
                  <ShoppingCart className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[15px] font-medium text-foreground">VIIV Shop (beta)</span>
                  <p className="text-xs text-muted-foreground">
                    {shop.mode === "off" && "Off for everyone."}
                    {shop.mode === "testing" && "On for admins, Mr VIIV and you only."}
                    {shop.mode === "everyone" && "On for every account."}
                  </p>
                </div>
                <CyclePill
                  value={shop.mode}
                  disabled={!shop.loaded}
                  onChange={(v) => {
                    void shop.save(v).then((res) => {
                      if (res.error) {
                        toast.error("Could not save that", { description: res.error });
                        return;
                      }
                      toast.success(
                        v === "off"
                          ? "VIIV Shop is off for everyone"
                          : v === "testing"
                            ? "VIIV Shop is on for testing only"
                            : "VIIV Shop is on for everyone",
                      );
                    });
                  }}
                  options={[
                    { value: "off", label: "Off" },
                    { value: "testing", label: "For testing only" },
                    { value: "everyone", label: "Everyone" },
                  ]}
                />
              </div>
              {/* RAZORPAY & PRICES */}
              <Link
                to="/subscriptions"
                search={{ tab: "payment" }}
                className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-primary/[0.06] active:bg-primary/12"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white [&_svg]:fill-white">
                  <CreditCard className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[15px] font-medium text-foreground">Payments</span>
                  <p className="text-xs text-muted-foreground">
                    Razorpay, the payment QR, prices &amp; what they earn
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </Link>
              {/* METADATA EDITOR */}
              <button
                type="button"
                onClick={() => changeView("metadata")}
                className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-primary/[0.06] active:bg-primary/12"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white [&_svg]:fill-white">
                  <Layers className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[15px] font-medium text-foreground">Metadata editor</span>
                  <p className="text-xs text-muted-foreground">
                    Brands, makes, models, colours, assortments, catalogue entries &amp; logos
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </button>

              {/* AUTHENTICATION — its own screen. Which buttons appear on the
                login page has nothing to do with which database is behind it,
                and it was living inside the connection settings. */}
              <button
                type="button"
                onClick={() => changeView("auth_providers")}
                className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-primary/[0.06] active:bg-primary/12"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white [&_svg]:fill-white">
                  <KeyRound className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[15px] font-medium text-foreground">Authentication</span>
                  <p className="text-xs text-muted-foreground">
                    Which sign-in methods and social logins the login page offers
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </button>

              {/* DB CONNECTION (Moved into Admin) */}
              <button
                type="button"
                onClick={() => changeView("database")}
                className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-primary/[0.06] active:bg-primary/12"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white [&_svg]:fill-white">
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
        {page === "help" && (
          <div className="space-y-6">
            <SubpageHeader title="Help" onBack={() => changeView("root")} />

            {/* Two cards, because they are two different acts. The first pair
              sends us something and expects an answer; the rest is reading.
              In one list the policies made the box you type into look like
              another document. */}
            {(
              [
                [
                  "say",
                  [
                    [
                      "feature_request",
                      "Feature request",
                      "Tell us what you would like VIIV to do",
                      Lightbulb,
                    ],
                    [
                      "report_bug",
                      "Report a bug",
                      "Something that does not work the way it should",
                      Bug,
                    ],
                  ],
                ],
                [
                  "read",
                  [
                    ["help_privacy", HELP_TITLES.privacy, HELP_BLURBS.privacy, FileText],
                    ["help_terms", HELP_TITLES.terms, HELP_BLURBS.terms, Scale],
                    ["help_contact", HELP_TITLES.contact, HELP_BLURBS.contact, MessageCircle],
                  ],
                ],
              ] as const
            ).map(([group, items]) => (
              <div key={group} className="divide-y divide-border/60 overflow-hidden card-elevated">
                {items.map(([target, label, blurb, Icon]) => (
                  <button
                    key={target}
                    type="button"
                    onClick={() => changeView(target)}
                    className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-primary/[0.06] active:bg-primary/12"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white [&_svg]:fill-white">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[15px] font-medium text-foreground">{label}</span>
                      <p className="text-xs text-muted-foreground">{blurb}</p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </button>
                ))}
              </div>
            ))}
            <p className="px-1 text-xs text-muted-foreground">
              VIIV {APP_VERSION} · a personal project, not a company.
            </p>
            {/* The mark the app opens on, centred at the foot of Help. */}
            <footer className="flex flex-col items-center gap-3 pb-2 pt-10 text-center text-xs text-muted-foreground">
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
        {/* SUBPAGE: HELP DOCUMENTS                                                   */}
        {/* ========================================================================= */}
        {(page === "help_privacy" || page === "help_terms" || page === "help_contact") && (
          <div className="space-y-6">
            <SubpageHeader
              title={
                HELP_TITLES[
                  page === "help_privacy" ? "privacy" : page === "help_terms" ? "terms" : "contact"
                ]
              }
              onBack={() => changeView("help")}
              backLabel="Help"
            />
            <HelpDoc
              docKey={
                page === "help_privacy" ? "privacy" : page === "help_terms" ? "terms" : "contact"
              }
            />
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBPAGE: WHAT IS NEW                                                     */}
        {/* ========================================================================= */}
        {page === "activity" && (
          <div className="space-y-5">
            <SubpageHeader title="Activity log" onBack={() => changeView("root")} />
            <ChangeLog openCar={(car) => drawer.open(car)} />
            <p className="px-1 text-xs text-muted-foreground">
              Every change to your cars, orders and catalogue entries, newest first: what it was,
              what it became, and who did it.
            </p>
          </div>
        )}

        {page === "whats_new" && (
          <div className="space-y-5">
            <SubpageHeader title="What's new" onBack={() => changeView("root")} />
            <p className="text-xs text-muted-foreground">
              Every build, newest first. The build number rises with every change that goes in, so
              two screens can be told apart. A filled dot is one worth knowing about.
            </p>
            <WhatsNewList />
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBPAGE: ONBOARDING                                                       */}
        {/* ========================================================================= */}
        {page === "onboarding" && (
          <div className="space-y-6">
            <SubpageHeader title="Onboarding" onBack={() => changeView("root")} />

            {/* What VIIV is used for: asked once after sign-in, changed here. The
              details that are not ticked are left off the screen, not deleted. */}
            <div className="space-y-1.5">
              <div className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                What you use VIIV for
              </div>
              <div className="divide-y divide-border/60 overflow-hidden card-elevated">
                {USE_CASES.map((u) => (
                  <div
                    key={u.key}
                    title={u.hint}
                    className="flex items-center justify-between gap-4 px-4 py-2.5"
                  >
                    <div className="text-[15px] font-medium text-foreground">{u.label}</div>
                    <Switch
                      checked={uses(useCases, u.key)}
                      onCheckedChange={(on) => {
                        const now = useCases ?? USE_CASES.map((x) => x.key);
                        setUseCases(
                          on ? [...new Set([...now, u.key])] : now.filter((k) => k !== u.key),
                        );
                      }}
                    />
                  </div>
                ))}
              </div>
              <p className="px-1 pt-1 text-xs text-muted-foreground">
                Only these details are shown on the home page and in each car. Nothing is deleted.
              </p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBPAGE: PRIVACY                                                          */}
        {/* ========================================================================= */}
        {page === "privacy" && (
          <div className="space-y-6">
            <SubpageHeader title="Privacy" onBack={() => changeView("root")} />
            <div className="space-y-1.5">
              <div className="divide-y divide-border/60 overflow-hidden card-elevated">
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="text-[15px] font-medium text-foreground">
                    Hide investment value
                  </div>
                  <Switch checked={hideInvestment} onCheckedChange={setHideInvestment} />
                </div>
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="text-[15px] font-medium text-foreground">
                    Hide cost information
                  </div>
                  <Switch checked={hideCost} onCheckedChange={setHideCost} />
                </div>
              </div>
              <p className="px-1 pt-1 text-xs text-muted-foreground">
                Hide investment value masks the total expenditure figures across the dashboard cards
                and sidebar until tapped. Hide cost information hides what you paid for every car,
                across the app. MRP and catalogue prices stay visible.
              </p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBPAGE 3: NOTIFICATIONS                                                  */}
        {/* ========================================================================= */}
        {page === "notifications" && (
          <div className="space-y-6">
            <SubpageHeader title="Notifications" onBack={() => changeView("root")} />

            {/* Admin: push to this device when someone new asks to join */}
            {(isAdmin || isOwner) && !isGuest && (
              <div className="space-y-1.5">
                <div className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Admin
                </div>
                <AdminPushCard />
              </div>
            )}

            {/* Delivery Alerts */}
            <div className="space-y-1.5">
              <div className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Deliveries &amp; Shipments
              </div>
              <div className="divide-y divide-border/60 overflow-hidden card-elevated">
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
              <div className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Banner Alerts
              </div>
              <div className="overflow-hidden card-elevated">
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="text-[15px] font-medium text-foreground">
                    Daily toast notifications
                  </div>
                  <Switch
                    checked={notifyToasts}
                    onCheckedChange={(val) =>
                      updateNotifyPref("tesoro_notify_toasts", val, setNotifyToasts)
                    }
                  />
                </div>
              </div>
              <p className="px-1 pt-1 text-xs text-muted-foreground">
                Display an on-screen toast popup when you open the app if parcels are arriving
                today.
              </p>
            </div>

            {/* Notification Management */}
            <div className="space-y-1.5">
              <div className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                History &amp; Dismissals
              </div>
              <div className="overflow-hidden card-elevated">
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="text-[15px] font-medium text-foreground">
                    Reset dismissed notices
                  </div>
                  <button
                    type="button"
                    onClick={resetDismissedNotices}
                    className="glass-btn inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors active:scale-95"
                  >
                    <RotateCcw className="size-3.5" />
                    Reset
                  </button>
                </div>
              </div>
              <p className="px-1 pt-1 text-xs text-muted-foreground">
                Unhide any notifications you previously swiped away or cleared.
              </p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBPAGE 4: DIAGNOSTICS                                                    */}
        {/* ========================================================================= */}
        {page === "diagnostics" && (
          <div className="space-y-6">
            <SubpageHeader
              title="Diagnostics"
              onBack={() => changeView("advanced")}
              backLabel="Admin Console"
            />

            <div className="space-y-1.5">
              <div className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Data Health &amp; Identifiers
              </div>
              <div className="overflow-hidden card-elevated p-5">
                <p className="mb-4 text-xs text-muted-foreground">
                  Run automated consistency checks on your diecast records, carrier tracking
                  numbers, and collection integrity.
                </p>
                <div className="space-y-4">
                  <IdRebuild kind="shipping" />
                  <div className="border-t border-border/60" />
                  <IdRebuild kind="order" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Collection Integrity
              </div>
              <div className="overflow-hidden card-elevated p-5">
                <FavouriteDetector />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBPAGE 5: DB CONNECTION                                                  */}
        {/* ========================================================================= */}
        {page === "metadata" && (
          <div className="space-y-6">
            <SubpageHeader
              title="Metadata editor"
              onBack={() => changeView("advanced")}
              backLabel="Admin Console"
            />
            {isAdmin ? (
              <MetadataEditor />
            ) : (
              <p className="card-elevated p-6 text-center text-sm text-muted-foreground">
                The catalogue is shared by everybody, so only an admin can change it.
              </p>
            )}
          </div>
        )}

        {page === "auth_providers" && isOwner && (
          <div className="space-y-5">
            <SubpageHeader
              title="Authentication"
              onBack={() => changeView("advanced")}
              backLabel="Admin Console"
            />
            <div className="overflow-hidden card-elevated p-5">
              <OAuthProvidersCard />
            </div>
          </div>
        )}

        {page === "database" && (
          <div className="space-y-6">
            <SubpageHeader
              title="DB Connection"
              onBack={() => changeView("advanced")}
              backLabel="Admin Console"
            />

            {/* Connection Status Banner */}
            <div className="card-elevated p-4">
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
                    <div className="text-sm font-medium text-foreground">
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
                  <div className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Supabase Synchronization
                  </div>
                  <SupabaseSyncCard />
                </div>
              </div>
            ) : (
              <div className="card-elevated p-6 text-center">
                <ShieldCheck className="mx-auto size-10 text-muted-foreground/60" />
                <h3 className="mt-2 text-base font-medium text-foreground">Owner Configuration</h3>
                <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                  Database connection endpoints, API keys, and table configurations are managed by
                  the collection owner. Contact the administrator to modify database settings.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBPAGE: SEARCH ENGINE                                                    */}
        {/* ========================================================================= */}
        {page === "search_engine" && (
          <div className="space-y-6">
            <SubpageHeader
              title="Search Engine"
              onBack={() => changeView("advanced")}
              backLabel="Admin Console"
            />

            <div className="space-y-1.5">
              <div className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Web Image Lookup Provider
              </div>
              <div className="divide-y divide-border/60 overflow-hidden card-elevated">
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
                      className="flex w-full items-start justify-between gap-4 p-4 text-left transition-colors hover:bg-primary/[0.06] active:bg-primary/12"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[15px] font-medium text-foreground">
                            {engine.label}
                          </span>
                          {engine.value === "bing" && (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              Recommended
                            </span>
                          )}
                          {engine.value === "auto" && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
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
    // Beside the list the page needs no title or Back: the list says where you are. Pages two
    // levels down keep theirs, because Back there goes to a page, not to the list.
    <div
      className={`flex items-center justify-between border-b border-border/60 pb-3 md:sticky md:top-0 md:z-10 md:backdrop-blur-xl md:pt-1 ${backLabel === "Settings" ? "md:hidden" : ""}`}
    >
      <button
        type="button"
        onClick={onBack}
        className={`inline-flex items-center gap-1 rounded-lg py-1 pr-2 text-[15px] font-medium text-primary transition-opacity hover:opacity-75 active:opacity-50`}
      >
        <ChevronLeft className="size-5 -ml-1" />
        <span>{backLabel}</span>
      </button>

      <h2 className="text-lg font-medium tracking-tight text-foreground">{title}</h2>

      {/* Placeholder to keep title optically centered */}
      <div className="w-16" aria-hidden="true" />
    </div>
  );
}
