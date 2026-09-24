import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";

/** What the person chose. "system" hands the decision to the operating system. */
export type ThemePreference = "light" | "dark" | "system";
/** What actually gets painted, once "system" has been resolved. */
export type Theme = "light" | "dark";

export type AccentColor = "crimson" | "blue" | "emerald" | "violet" | "amber";

export const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Auto" },
];

export const ACCENT_OPTIONS: { value: AccentColor; label: string }[] = [
  { value: "crimson", label: "Crimson" },
  { value: "blue", label: "Blue" },
  { value: "emerald", label: "Emerald" },
  { value: "violet", label: "Violet" },
  { value: "amber", label: "Amber" },
];

export type FontSizePreference = "-2" | "-1" | "0" | "+1" | "+2";

export const FONT_SIZE_OPTIONS: {
  value: FontSizePreference;
  label: string;
  description: string;
}[] = [
  { value: "-2", label: "-2 pt", description: "Compact · 2 points smaller (Default)" },
  { value: "-1", label: "-1 pt", description: "Slightly smaller · 1 point smaller" },
  { value: "0", label: "Default", description: "Standard · Original 12 pt scale" },
  { value: "+1", label: "+1 pt", description: "Slightly larger · 1 point larger" },
  { value: "+2", label: "+2 pt", description: "Large · 2 points larger" },
];

/**
 * When the home page shows "Arriving soon".
 *
 * "auto" is the useful one: the section is a stand-in, filling the gap left by
 * Recently added and New Pre Orders on a quiet week rather than competing with
 * them on a busy one. The other two are there because a preference that can
 * only mean one thing is not a preference.
 */
export type ArrivingSoonPreference = "auto" | "always" | "never" | "custom";

export const ARRIVING_SOON_OPTIONS: { value: ArrivingSoonPreference; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "always", label: "Always" },
  { value: "never", label: "Never" },
  { value: "custom", label: "Custom" },
];

function isArrivingSoonPreference(value: unknown): value is ArrivingSoonPreference {
  return value === "auto" || value === "always" || value === "never" || value === "custom";
}

/**
 * How far ahead "Arriving soon" looks when the preference is "custom".
 *
 * Auto and Always use a month, which is the horizon a pre-order lives on. The
 * custom window is for the other way of reading the section — not "what is
 * coming" but "what lands this week" — so it starts at three days.
 */
export const ARRIVING_WINDOW_OPTIONS: { value: string; label: string }[] = [
  { value: "3", label: "3 days" },
  { value: "7", label: "1 week" },
  { value: "14", label: "2 weeks" },
  { value: "30", label: "1 month" },
];

export const ARRIVING_WINDOW_DEFAULT = 3;

function isArrivingWindow(value: unknown): value is number {
  return ARRIVING_WINDOW_OPTIONS.some((o) => Number(o.value) === value);
}

/**
 * Whose released pre-orders the home page bothers you about.
 *
 * "All" is the shelf as news — anything the catalogue says has started
 * arriving, whoever ordered it. "Mine" narrows it to castings you are actually
 * waiting on, which is the only version that ever asks something of you. The
 * bell is unaffected either way: a pre-order of yours that has shipped is your
 * business whatever this says.
 */
export type ReleasedPreference = "all" | "mine" | "none";

export const RELEASED_OPTIONS: { value: ReleasedPreference; label: string }[] = [
  { value: "all", label: "All PO" },
  { value: "mine", label: "My PO" },
  { value: "none", label: "None" },
];

function isReleasedPreference(value: unknown): value is ReleasedPreference {
  return value === "all" || value === "mine" || value === "none";
}

type AppState = {
  query: string;
  setQuery: (q: string) => void;
  /** Resolved light/dark — what the page is currently wearing. */
  theme: Theme;
  /** The stored choice, which may be "system". */
  themePreference: ThemePreference;
  setThemePreference: (t: ThemePreference) => void;
  /** Cycles light → dark → auto. */
  toggleTheme: () => void;
  accentColor: AccentColor;
  setAccentColor: (a: AccentColor) => void;
  /** Global font size adjustment: -2pt (default), -1pt, 0 (standard), +1pt, +2pt */
  fontSize: FontSizePreference;
  setFontSize: (s: FontSizePreference) => void;
  hideInvestment: boolean;
  setHideInvestment: (b: boolean) => void;
  transitEtaDays: number;
  setTransitEtaDays: (n: number) => void;
  /** Phone only: the bottom bar shrinks while scrolling down. Per device. */
  navAnimation: boolean;
  setNavAnimation: (b: boolean) => void;
  /** When the home page shows the "Arriving soon" shelf. */
  arrivingSoon: ArrivingSoonPreference;
  setArrivingSoon: (p: ArrivingSoonPreference) => void;
  /** How many days ahead it looks, once the preference is "custom". */
  arrivingDays: number;
  setArrivingDays: (n: number) => void;
  /** Whose newly released pre-orders the "Recently Released" shelf shows. */
  releasedShelf: ReleasedPreference;
  setReleasedShelf: (p: ReleasedPreference) => void;
  /** Whether the home page shows what you added in the last few days. */
  showRecentlyAdded: boolean;
  setShowRecentlyAdded: (b: boolean) => void;
  /** Whether it shows what other collectors have just pre-ordered. */
  showNewPreorders: boolean;
  setShowNewPreorders: (b: boolean) => void;
};

const AppCtx = createContext<AppState | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function isAccentColor(value: unknown): value is AccentColor {
  return typeof value === "string" && ACCENT_OPTIONS.some((option) => option.value === value);
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function isFontSizePreference(value: unknown): value is FontSizePreference {
  return value === "-2" || value === "-1" || value === "0" || value === "+1" || value === "+2";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function applyAccent(accent: AccentColor) {
  document.documentElement.dataset.accent = accent;
}

function applyFontSize(size: FontSizePreference) {
  document.documentElement.dataset.fontSize = size;
}

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    if (v === null) return fallback;
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode and full quotas both land here; the in-memory value still holds.
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>("dark");
  const [systemTheme, setSystemTheme] = useState<Theme>("dark");
  const [accentColor, setAccentColorState] = useState<AccentColor>("crimson");
  const [fontSize, setFontSizeState] = useState<FontSizePreference>("0");
  const [hideInvestment, setHideInvestmentState] = useState(true);
  const [transitEtaDays, setTransitEtaDaysState] = useState(21);
  const [navAnimation, setNavAnimationState] = useState(true);
  const [arrivingSoon, setArrivingSoonState] = useState<ArrivingSoonPreference>("auto");
  const [arrivingDays, setArrivingDaysState] = useState(ARRIVING_WINDOW_DEFAULT);
  const [releasedShelf, setReleasedShelfState] = useState<ReleasedPreference>("all");
  const [showRecentlyAdded, setShowRecentlyAddedState] = useState(true);
  const [showNewPreorders, setShowNewPreordersState] = useState(true);
  // The server renders with the defaults above while the inline boot script in
  // __root.tsx has already painted the stored ones. Nothing is applied to the
  // document until this flips, so the first client render cannot undo it.
  const [hydrated, setHydrated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const theme: Theme = themePreference === "system" ? systemTheme : themePreference;

  // Load from localStorage on mount (avoids SSR hydration mismatch)
  useEffect(() => {
    const storedTheme = readLS<unknown>("dg.theme", "dark");
    const storedAccent = readLS<unknown>("dg.accentColor", "crimson");
    const storedFontSize = readLS<unknown>("dg.fontSize", "0");
    setThemePreferenceState(isThemePreference(storedTheme) ? storedTheme : "dark");
    setAccentColorState(isAccentColor(storedAccent) ? storedAccent : "crimson");
    setFontSizeState(isFontSizePreference(storedFontSize) ? storedFontSize : "0");
    setHideInvestmentState(readLS<boolean>("dg.hideInvestment", true));
    setTransitEtaDaysState(readLS<number>("dg.transitEta", 21));
    setNavAnimationState(readLS<boolean>("dg.navAnimation", true));
    const storedArriving = readLS<unknown>("dg.arrivingSoon", "auto");
    setArrivingSoonState(isArrivingSoonPreference(storedArriving) ? storedArriving : "auto");
    const storedDays = readLS<unknown>("dg.arrivingDays", ARRIVING_WINDOW_DEFAULT);
    setArrivingDaysState(isArrivingWindow(storedDays) ? storedDays : ARRIVING_WINDOW_DEFAULT);
    const storedReleased = readLS<unknown>("dg.releasedShelf", "all");
    setReleasedShelfState(isReleasedPreference(storedReleased) ? storedReleased : "all");
    setShowRecentlyAddedState(readLS<boolean>("dg.showRecentlyAdded", true));
    setShowNewPreordersState(readLS<boolean>("dg.showNewPreorders", true));
    setHydrated(true);
  }, []);

  // Follow the OS while "system" is selected. The listener stays attached
  // regardless: a person who switches to Auto at 6pm should not have to reload
  // for the evening change to reach them.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(DARK_QUERY);
    const sync = () => setSystemTheme(mq.matches ? "dark" : "light");
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (hydrated) applyTheme(theme);
  }, [hydrated, theme]);

  useEffect(() => {
    if (hydrated) applyAccent(accentColor);
  }, [hydrated, accentColor]);

  useEffect(() => {
    if (hydrated) applyFontSize(fontSize);
  }, [hydrated, fontSize]);

  // Track the signed-in account rather than reading the session once: the first
  // render usually happens before Supabase has restored it, and switching
  // accounts on a shared browser has to swap the appearance with them.
  useEffect(() => {
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUserId(session?.user?.id ?? null);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user?.id ?? null);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Pull this account's appearance from the cloud so a choice made on one device
  // shows up on the next.
  useEffect(() => {
    if (!hydrated || !userId) return;
    let active = true;

    const pull = async () => {
      // "*" rather than naming the columns: a deploy that lands before the
      // theme migration does would otherwise fail the whole query on the
      // unknown column, taking the accent colour down with it.
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (!active || error || !data) return;

      if (isAccentColor(data.accent_color)) {
        setAccentColorState(data.accent_color);
        writeLS("dg.accentColor", data.accent_color);
      }
      // A null theme means no device has chosen yet, so whatever this browser
      // already had stays — a server default must not overwrite a real choice.
      if (isThemePreference(data.theme)) {
        setThemePreferenceState(data.theme);
        writeLS("dg.theme", data.theme);
      }
    };

    void pull();

    // Returning to the tab is the cheapest moment to notice a change made
    // elsewhere. It costs one small query and covers the phone/desktop handoff
    // these settings exist for, without holding a realtime subscription open.
    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hydrated, userId]);

  // Both columns go up together. The row is normally created at signup, but an
  // upsert that named only one of them would reset the other to its default on
  // the day it has to insert instead.
  const pushSettings = useCallback(
    (accent: AccentColor, preference: ThemePreference) => {
      if (!userId) return;
      const base = { user_id: userId, accent_color: accent, updated_at: new Date().toISOString() };
      void (async () => {
        const { error } = await supabase
          .from("app_settings")
          .upsert({ ...base, theme: preference });
        // Same guard as the read: until the theme migration is applied the
        // column is not there, and the accent colour still has to save.
        if (error) await supabase.from("app_settings").upsert(base);
      })();
    },
    [userId],
  );

  const setThemePreference = useCallback(
    (t: ThemePreference) => {
      setThemePreferenceState(t);
      writeLS("dg.theme", t);
      pushSettings(accentColor, t);
    },
    [accentColor, pushSettings],
  );

  const setAccentColor = useCallback(
    (a: AccentColor) => {
      setAccentColorState(a);
      writeLS("dg.accentColor", a);
      pushSettings(a, themePreference);
    },
    [themePreference, pushSettings],
  );

  const toggleTheme = useCallback(() => {
    const order: ThemePreference[] = ["light", "dark", "system"];
    const next = order[(order.indexOf(themePreference) + 1) % order.length];
    setThemePreference(next);
  }, [themePreference, setThemePreference]);

  const setHideInvestment = useCallback((b: boolean) => {
    setHideInvestmentState(b);
    writeLS("dg.hideInvestment", b);
  }, []);

  const setTransitEtaDays = useCallback((n: number) => {
    setTransitEtaDaysState(n);
    writeLS("dg.transitEta", n);
  }, []);

  const setNavAnimation = useCallback((b: boolean) => {
    setNavAnimationState(b);
    writeLS("dg.navAnimation", b);
  }, []);

  const setArrivingSoon = useCallback((p: ArrivingSoonPreference) => {
    setArrivingSoonState(p);
    writeLS("dg.arrivingSoon", p);
  }, []);

  const setArrivingDays = useCallback((n: number) => {
    setArrivingDaysState(n);
    writeLS("dg.arrivingDays", n);
  }, []);

  const setReleasedShelf = useCallback((p: ReleasedPreference) => {
    setReleasedShelfState(p);
    writeLS("dg.releasedShelf", p);
  }, []);

  const setShowRecentlyAdded = useCallback((b: boolean) => {
    setShowRecentlyAddedState(b);
    writeLS("dg.showRecentlyAdded", b);
  }, []);

  const setShowNewPreorders = useCallback((b: boolean) => {
    setShowNewPreordersState(b);
    writeLS("dg.showNewPreorders", b);
  }, []);

  const setFontSize = useCallback((s: FontSizePreference) => {
    setFontSizeState(s);
    writeLS("dg.fontSize", s);
    applyFontSize(s);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      query,
      setQuery,
      theme,
      themePreference,
      setThemePreference,
      toggleTheme,
      accentColor,
      setAccentColor,
      fontSize,
      setFontSize,
      hideInvestment,
      setHideInvestment,
      transitEtaDays,
      setTransitEtaDays,
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
    }),
    [
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
      query,
      theme,
      themePreference,
      setThemePreference,
      toggleTheme,
      accentColor,
      setAccentColor,
      fontSize,
      setFontSize,
      hideInvestment,
      setHideInvestment,
      transitEtaDays,
      setTransitEtaDays,
    ],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(AppCtx);
  if (!v) throw new Error("useApp must be used inside <AppProvider>");
  return v;
}
