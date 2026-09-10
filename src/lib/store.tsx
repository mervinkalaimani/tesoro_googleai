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
  hideInvestment: boolean;
  setHideInvestment: (b: boolean) => void;
  transitEtaDays: number;
  setTransitEtaDays: (n: number) => void;
};

const AppCtx = createContext<AppState | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function isAccentColor(value: unknown): value is AccentColor {
  return typeof value === "string" && ACCENT_OPTIONS.some((option) => option.value === value);
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function applyAccent(accent: AccentColor) {
  document.documentElement.dataset.accent = accent;
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
  const [hideInvestment, setHideInvestmentState] = useState(true);
  const [transitEtaDays, setTransitEtaDaysState] = useState(21);
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
    setThemePreferenceState(isThemePreference(storedTheme) ? storedTheme : "dark");
    setAccentColorState(isAccentColor(storedAccent) ? storedAccent : "crimson");
    setHideInvestmentState(readLS<boolean>("dg.hideInvestment", true));
    setTransitEtaDaysState(readLS<number>("dg.transitEta", 21));
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
      hideInvestment,
      setHideInvestment,
      transitEtaDays,
      setTransitEtaDays,
    }),
    [
      query,
      theme,
      themePreference,
      setThemePreference,
      toggleTheme,
      accentColor,
      setAccentColor,
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
