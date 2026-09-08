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

type Theme = "light" | "dark";
export type AccentColor = "crimson" | "blue" | "emerald" | "violet" | "amber";

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
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  accentColor: AccentColor;
  setAccentColor: (a: AccentColor) => void;
  hideInvestment: boolean;
  setHideInvestment: (b: boolean) => void;
  transitEtaDays: number;
  setTransitEtaDays: (n: number) => void;
};

const AppCtx = createContext<AppState | null>(null);

function isAccentColor(value: unknown): value is AccentColor {
  return typeof value === "string" && ACCENT_OPTIONS.some((option) => option.value === value);
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const [theme, setThemeState] = useState<Theme>("dark");
  const [accentColor, setAccentColorState] = useState<AccentColor>("crimson");
  const [hideInvestment, setHideInvestmentState] = useState(true);
  const [transitEtaDays, setTransitEtaDaysState] = useState(21);

  // Load from localStorage on mount (avoids SSR hydration mismatch)
  useEffect(() => {
    const t = readLS<Theme>("dg.theme", "dark");
    const a = readLS<AccentColor>("dg.accentColor", "crimson");
    const h = readLS<boolean>("dg.hideInvestment", true);
    const e = readLS<number>("dg.transitEta", 21);
    setThemeState(t);
    setAccentColorState(isAccentColor(a) ? a : "crimson");
    setHideInvestmentState(h);
    setTransitEtaDaysState(e);
    applyTheme(t);
    applyAccent(isAccentColor(a) ? a : "crimson");

    // Then sync the accent colour from the shared cloud setting (cross-device)
    let cancelled = false;
    supabase
      .from("app_settings")
      .select("accent_color")
      .eq("id", "global")
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const remote = data.accent_color;
        if (isAccentColor(remote)) {
          setAccentColorState(remote);
          applyAccent(remote);
          try {
            localStorage.setItem("dg.accentColor", JSON.stringify(remote));
          } catch (_error) {
            // Ignore storage write failures
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem("dg.theme", JSON.stringify(t));
    applyTheme(t);
  }, []);

  const setAccentColor = useCallback((a: AccentColor) => {
    setAccentColorState(a);
    localStorage.setItem("dg.accentColor", JSON.stringify(a));
    applyAccent(a);
    void supabase
      .from("app_settings")
      .upsert({ id: "global", accent_color: a, updated_at: new Date().toISOString() });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const setHideInvestment = useCallback((b: boolean) => {
    setHideInvestmentState(b);
    localStorage.setItem("dg.hideInvestment", JSON.stringify(b));
  }, []);

  const setTransitEtaDays = useCallback((n: number) => {
    setTransitEtaDaysState(n);
    localStorage.setItem("dg.transitEta", JSON.stringify(n));
  }, []);

  const value = useMemo<AppState>(
    () => ({
      query,
      setQuery,
      theme,
      setTheme,
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
      setTheme,
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
