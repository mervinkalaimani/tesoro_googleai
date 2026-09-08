import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import seed from "@/data/diecast.json";
import type { Diecast } from "@/lib/types";
import { fetchRawSheet } from "@/lib/fetch-raw";

const LS_KEY = "dg.carsOverlay.v1";
const CACHE_KEY = "dg.carsCache.v3";
const TS_KEY = "dg.carsCache.ts.v3";

type Overlay = {
  added: Diecast[];
  updated: Record<string, Diecast>;
  deleted: string[];
};

const EMPTY: Overlay = { added: [], updated: {}, deleted: [] };

function readOverlay(): Overlay {
  if (typeof window === "undefined") return EMPTY;
  try {
    const v = window.localStorage.getItem(LS_KEY);
    if (!v) return EMPTY;
    const parsed = JSON.parse(v);
    return {
      added: Array.isArray(parsed.added) ? parsed.added : [],
      updated: parsed.updated && typeof parsed.updated === "object" ? parsed.updated : {},
      deleted: Array.isArray(parsed.deleted) ? parsed.deleted : [],
    };
  } catch {
    return EMPTY;
  }
}

function writeOverlay(o: Overlay) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(o));
  } catch (_error) {
    // Ignore storage write failures (e.g. storage full or restricted)
  }
}

function readCache(): { data: Diecast[]; ts: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const d = window.localStorage.getItem(CACHE_KEY);
    const t = window.localStorage.getItem(TS_KEY);
    if (!d || !t) return null;
    return { data: JSON.parse(d), ts: Number(t) };
  } catch {
    return null;
  }
}

function writeCache(data: Diecast[], ts: number) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(TS_KEY, String(ts));
  } catch (_error) {
    // Ignore storage write failures
  }
}

type Ctx = {
  cars: Diecast[];
  addCar: (car: Diecast) => void;
  updateCar: (car: Diecast) => void;
  deleteCar: (id: string) => void;
  resetOverlay: () => void;
  refresh: () => Promise<void>;
  lastUpdated: number | null;
  refreshing: boolean;
};

const CarsCtx = createContext<Ctx | null>(null);

export function CarsProvider({ children }: { children: ReactNode }) {
  const [base, setBase] = useState<Diecast[]>(seed as Diecast[]);
  const [overlay, setOverlay] = useState<Overlay>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setOverlay(readOverlay());
    const cached = readCache();
    if (cached) {
      setBase(cached.data);
      setLastUpdated(cached.ts);
    }
    setHydrated(true);
    if (!cached) {
      setRefreshing(true);
      fetchRawSheet()
        .then((data) => {
          if (cancelled) return;
          const ts = Date.now();
          setBase(data);
          setLastUpdated(ts);
          writeCache(data, ts);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setRefreshing(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-refresh from the RAW sheet every 5 seconds
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    let inFlight = false;
    const id = setInterval(() => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      fetchRawSheet()
        .then((data) => {
          if (cancelled) return;
          const ts = Date.now();
          setBase(data);
          setLastUpdated(ts);
          writeCache(data, ts);
        })
        .catch(() => {})
        .finally(() => {
          inFlight = false;
        });
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [hydrated]);

  const cars = useMemo<Diecast[]>(() => {
    if (!hydrated) return base;
    const del = new Set(overlay.deleted);
    const merged: Diecast[] = [];
    for (const c of base) {
      if (del.has(c.id)) continue;
      merged.push(overlay.updated[c.id] ?? c);
    }
    return [...overlay.added, ...merged];
  }, [base, overlay, hydrated]);

  const commit = useCallback((next: Overlay) => {
    setOverlay(next);
    writeOverlay(next);
  }, []);

  const addCar = useCallback(
    (car: Diecast) => {
      commit({ ...overlay, added: [car, ...overlay.added] });
    },
    [overlay, commit],
  );

  const updateCar = useCallback(
    (car: Diecast) => {
      if (overlay.added.some((a) => a.id === car.id)) {
        commit({ ...overlay, added: overlay.added.map((a) => (a.id === car.id ? car : a)) });
        return;
      }
      commit({ ...overlay, updated: { ...overlay.updated, [car.id]: car } });
    },
    [overlay, commit],
  );

  const deleteCar = useCallback(
    (id: string) => {
      if (overlay.added.some((a) => a.id === id)) {
        commit({ ...overlay, added: overlay.added.filter((a) => a.id !== id) });
        return;
      }
      const { [id]: _drop, ...rest } = overlay.updated;
      commit({ ...overlay, updated: rest, deleted: [...overlay.deleted, id] });
    },
    [overlay, commit],
  );

  const resetOverlay = useCallback(() => {
    commit(EMPTY);
  }, [commit]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchRawSheet();
      const ts = Date.now();
      setBase(data);
      setLastUpdated(ts);
      writeCache(data, ts);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      cars,
      addCar,
      updateCar,
      deleteCar,
      resetOverlay,
      refresh,
      lastUpdated,
      refreshing,
    }),
    [cars, addCar, updateCar, deleteCar, resetOverlay, refresh, lastUpdated, refreshing],
  );

  return <CarsCtx.Provider value={value}>{children}</CarsCtx.Provider>;
}

export function useCars(): Diecast[] {
  const v = useContext(CarsCtx);
  if (!v) throw new Error("useCars must be used inside <CarsProvider>");
  return v.cars;
}

export function useCarsActions() {
  const v = useContext(CarsCtx);
  if (!v) throw new Error("useCarsActions must be used inside <CarsProvider>");
  const { addCar, updateCar, deleteCar, resetOverlay } = v;
  return { addCar, updateCar, deleteCar, resetOverlay };
}

export function useCarsRefresh() {
  const v = useContext(CarsCtx);
  if (!v) throw new Error("useCarsRefresh must be used inside <CarsProvider>");
  const { refresh, lastUpdated, refreshing } = v;
  return { refresh, lastUpdated, refreshing };
}

export function makeBlankCar(): Diecast {
  const today = new Date();
  const iso = today.toLocaleDateString("en-GB");
  const month = today.toLocaleString("en-US", { month: "short", year: "numeric" });
  return {
    id: `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    make: "",
    model: "",
    variant: "",
    year: "",
    series: "",
    subSeries: "",
    carNumber: "",
    colour: "",
    type: "",
    brand: "",
    assortment: "",
    size: "",
    spent: 0,
    mrp: 0,
    seller: "",
    status: "Available",
    payment: "",
    paid: 0,
    date: iso,
    month,
    orderDate: iso,
    orderMonth: month,
    expectedDate: iso,
    transitInfo: "",
    shippingId: "",
    balance: 0,

    chase: false,
    favourite: false,
    official: false,
    open: false,
  };
}
