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
import { deriveMonth } from "@/lib/date-utils";
import {
  fetchCarsFromSupabase,
  saveCarToSupabase,
  deleteCarFromSupabase,
  seedCarsToSupabase,
} from "@/lib/supabase-cars";

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
  bulkAddCars: (cars: Diecast[]) => void;
  updateCar: (car: Diecast) => void;
  bulkUpdateCars: (cars: Diecast[]) => void;
  updateCarsByShippingId: (
    shippingId: string,
    updates: { status?: string; expectedDate?: string; transitInfo?: string },
  ) => Promise<number>;
  deleteCar: (id: string) => void;
  resetOverlay: () => void;
  refresh: () => Promise<void>;
  syncAllToSupabase: (
    onProgress?: (inserted: number, total: number) => void,
  ) => Promise<{ success: boolean; count: number; error?: string }>;
  lastUpdated: number | null;
  refreshing: boolean;
  source: "supabase" | "sheet";
};

const CarsCtx = createContext<Ctx | null>(null);

export function CarsProvider({ children }: { children: ReactNode }) {
  const [base, setBase] = useState<Diecast[]>(seed as Diecast[]);
  const [overlay, setOverlay] = useState<Overlay>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState<"supabase" | "sheet">("sheet");

  const loadData = useCallback(async () => {
    // 1. Try Supabase tesoro_raw first
    const fromSupabase = await fetchCarsFromSupabase();
    if (fromSupabase && fromSupabase.length > 0) {
      setBase(fromSupabase);
      setSource("supabase");
      const ts = Date.now();
      setLastUpdated(ts);
      writeCache(fromSupabase, ts);
      return;
    }

    // 2. If Supabase is empty or unseeded, fall back to sheet
    const fromSheet = await fetchRawSheet();
    setBase(fromSheet);
    setSource("sheet");
    const ts = Date.now();
    setLastUpdated(ts);
    writeCache(fromSheet, ts);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setOverlay(readOverlay());
    const cached = readCache();
    if (cached) {
      setBase(cached.data);
      setLastUpdated(cached.ts);
    }
    setHydrated(true);
    setRefreshing(true);
    loadData()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  // Periodic refresh
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    let inFlight = false;
    const id = setInterval(() => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      loadData()
        .catch(() => {})
        .finally(() => {
          inFlight = false;
        });
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [hydrated, loadData]);

  // Listen to Supabase configuration changes
  useEffect(() => {
    const handleConfigChange = () => {
      setRefreshing(true);
      loadData()
        .catch(() => {})
        .finally(() => {
          setRefreshing(false);
        });
    };
    window.addEventListener("tesoro:supabase-config-changed", handleConfigChange);
    return () => {
      window.removeEventListener("tesoro:supabase-config-changed", handleConfigChange);
    };
  }, [loadData]);

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
      saveCarToSupabase(car).catch((err) => {
        console.warn("Supabase saveCar error:", err);
      });
    },
    [overlay, commit],
  );

  const bulkAddCars = useCallback(
    (newCars: Diecast[]) => {
      if (!newCars.length) return;
      commit({ ...overlay, added: [...newCars, ...overlay.added] });
    },
    [overlay, commit],
  );

  const updateCar = useCallback(
    (car: Diecast) => {
      if (overlay.added.some((a) => a.id === car.id)) {
        commit({ ...overlay, added: overlay.added.map((a) => (a.id === car.id ? car : a)) });
      } else {
        commit({ ...overlay, updated: { ...overlay.updated, [car.id]: car } });
      }
      saveCarToSupabase(car).catch((err) => {
        console.warn("Supabase saveCar error:", err);
      });
    },
    [overlay, commit],
  );

  const bulkUpdateCars = useCallback(
    (updatedCars: Diecast[]) => {
      if (!updatedCars.length) return;
      const updatedMap = { ...overlay.updated };
      let addedList = [...overlay.added];
      const addedIds = new Set(addedList.map((a) => a.id));

      for (const car of updatedCars) {
        if (addedIds.has(car.id)) {
          addedList = addedList.map((a) => (a.id === car.id ? car : a));
        } else {
          updatedMap[car.id] = car;
        }
        saveCarToSupabase(car).catch((err) => {
          console.warn("Supabase saveCar error in bulkUpdate:", err);
        });
      }
      commit({ ...overlay, added: addedList, updated: updatedMap });
    },
    [overlay, commit],
  );

  const updateCarsByShippingId = useCallback(
    async (
      shippingId: string,
      updates: { status?: string; expectedDate?: string; transitInfo?: string },
    ): Promise<number> => {
      const cleanId = (shippingId || "").trim();
      if (!cleanId) return 0;

      const matched = cars.filter(
        (c) => (c.shippingId || "").trim().toLowerCase() === cleanId.toLowerCase(),
      );
      if (matched.length === 0) return 0;

      const updatedCars: Diecast[] = matched.map((car) => {
        const next: Diecast = { ...car };
        if (updates.status !== undefined && updates.status !== "" && updates.status !== "keep") {
          next.status = updates.status;
          if (updates.status === "Available") {
            const arrDate =
              updates.expectedDate ||
              next.expectedDate ||
              next.date ||
              new Date().toISOString().slice(0, 10);
            next.date = arrDate;
            next.month = deriveMonth(arrDate) || next.month;
          }
        }
        if (updates.expectedDate !== undefined && updates.expectedDate !== "") {
          next.expectedDate = updates.expectedDate;
        }
        if (updates.transitInfo !== undefined) {
          next.transitInfo = updates.transitInfo.trim();
        }
        return next;
      });

      bulkUpdateCars(updatedCars);
      return updatedCars.length;
    },
    [cars, bulkUpdateCars],
  );

  const deleteCar = useCallback(
    (id: string) => {
      if (overlay.added.some((a) => a.id === id)) {
        commit({ ...overlay, added: overlay.added.filter((a) => a.id !== id) });
      } else {
        const { [id]: _drop, ...rest } = overlay.updated;
        commit({ ...overlay, updated: rest, deleted: [...overlay.deleted, id] });
      }
      deleteCarFromSupabase(id).catch((err) => {
        console.warn("Supabase deleteCar error:", err);
      });
    },
    [overlay, commit],
  );

  const resetOverlay = useCallback(() => {
    commit(EMPTY);
  }, [commit]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  const syncAllToSupabase = useCallback(
    async (onProgress?: (inserted: number, total: number) => void) => {
      const res = await seedCarsToSupabase(cars, onProgress);
      if (res.success) {
        setSource("supabase");
      }
      return res;
    },
    [cars],
  );

  const value = useMemo<Ctx>(
    () => ({
      cars,
      addCar,
      bulkAddCars,
      updateCar,
      bulkUpdateCars,
      updateCarsByShippingId,
      deleteCar,
      resetOverlay,
      refresh,
      syncAllToSupabase,
      lastUpdated,
      refreshing,
      source,
    }),
    [
      cars,
      addCar,
      bulkAddCars,
      updateCar,
      bulkUpdateCars,
      updateCarsByShippingId,
      deleteCar,
      resetOverlay,
      refresh,
      syncAllToSupabase,
      lastUpdated,
      refreshing,
      source,
    ],
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
  const {
    addCar,
    bulkAddCars,
    updateCar,
    bulkUpdateCars,
    updateCarsByShippingId,
    deleteCar,
    resetOverlay,
  } = v;
  return {
    addCar,
    bulkAddCars,
    updateCar,
    bulkUpdateCars,
    updateCarsByShippingId,
    deleteCar,
    resetOverlay,
  };
}

export function useCarsRefresh() {
  const v = useContext(CarsCtx);
  if (!v) throw new Error("useCarsRefresh must be used inside <CarsProvider>");
  const { refresh, lastUpdated, refreshing } = v;
  return { refresh, lastUpdated, refreshing };
}

export function useCarsSource() {
  const v = useContext(CarsCtx);
  if (!v) throw new Error("useCarsSource must be used inside <CarsProvider>");
  return { source: v.source, syncAllToSupabase: v.syncAllToSupabase };
}

export function makeBlankCar(): Diecast {
  const today = new Date();
  const yyyyMmDd = today.toISOString().slice(0, 10);
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
    size: "1:64",
    spent: 0,
    mrp: 0,
    shippingCost: 0,
    seller: "",
    status: "Available",
    payment: "Paid",
    paid: 0,
    date: yyyyMmDd,
    month,
    orderDate: yyyyMmDd,
    orderMonth: month,
    expectedDate: "",
    transitInfo: "",
    shippingId: "",
    balance: 0,
    chase: false,
    favourite: false,
    official: false,
    open: false,
    imageUrl: "",
  };
}
