import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Diecast } from "@/lib/types";
import { deriveMonth } from "@/lib/date-utils";
import { shippingIdFor, shippingInputsChanged } from "@/lib/shipping-id";
import { sortCars } from "@/lib/status-order";
import { useAuth } from "@/lib/auth-store";
import { toast } from "sonner";
import {
  fetchCarsFromSupabase,
  saveCarToSupabase,
  deleteCarFromSupabase,
  seedCarsToSupabase,
  savedFieldsMatch,
} from "@/lib/supabase-cars";

/**
 * The Supabase helpers resolve with `{ success: false, error }` rather than
 * rejecting, so the `.catch()` handlers these calls used to carry were dead
 * code: a rejected write left no trace anywhere. Combined with the overlay
 * masking `base`, that let the app show an edit as applied for as long as
 * localStorage survived while the row never actually moved.
 */
function reportSaveFailure(scope: string, failures: { error?: string }[], total: number) {
  if (!failures.length) return;
  const first = failures[0]?.error ?? "unknown error";
  console.error(`Supabase ${scope} failed (${failures.length}/${total}):`, first);
  toast.error(
    failures.length === total
      ? "Change was not saved to the database"
      : `${failures.length} of ${total} changes were not saved`,
    { description: first },
  );
}

async function persistCars(
  cars: Diecast[],
  scope: string,
  report = true,
): Promise<{ error?: string }[]> {
  const results = await Promise.all(cars.map((c) => saveCarToSupabase(c)));
  const failures = results.filter((r) => !r.success);
  if (report) reportSaveFailure(scope, failures, cars.length);
  else if (failures.length) console.error(`Supabase ${scope} failed:`, failures[0]?.error);
  return failures;
}

// Collections are cached in localStorage, so every key is namespaced by user id:
// two accounts on the same browser must never see each other's cars.
const lsKey = (uid: string) => `dg.carsOverlay.v2.${uid}`;
const cacheKey = (uid: string) => `dg.carsCache.v4.${uid}`;
const tsKey = (uid: string) => `dg.carsCache.ts.v4.${uid}`;

type Overlay = {
  added: Diecast[];
  updated: Record<string, Diecast>;
  deleted: string[];
};

const EMPTY: Overlay = { added: [], updated: {}, deleted: [] };

function readOverlay(uid: string): Overlay {
  if (typeof window === "undefined") return EMPTY;
  try {
    const v = window.localStorage.getItem(lsKey(uid));
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

function writeOverlay(uid: string, o: Overlay) {
  try {
    localStorage.setItem(lsKey(uid), JSON.stringify(o));
  } catch (_error) {
    // Ignore storage write failures (e.g. storage full or restricted)
  }
}

function readCache(uid: string): { data: Diecast[]; ts: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const d = window.localStorage.getItem(cacheKey(uid));
    const t = window.localStorage.getItem(tsKey(uid));
    if (!d || !t) return null;
    return { data: JSON.parse(d), ts: Number(t) };
  } catch {
    return null;
  }
}

function writeCache(uid: string, data: Diecast[], ts: number) {
  try {
    localStorage.setItem(cacheKey(uid), JSON.stringify(data));
    localStorage.setItem(tsKey(uid), String(ts));
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
  const { user, status: authStatus } = useAuth();
  const uid = user?.id ?? "anon";
  // The provider is mounted for signed-out visitors too, so every read is
  // gated on an approved session rather than on being rendered.
  const canLoad = authStatus === "ready" && Boolean(user?.id);

  // Starts empty rather than from the bundled seed: a new account owns nothing
  // until Supabase says otherwise.
  const [base, setBase] = useState<Diecast[]>([]);
  const [overlay, setOverlay] = useState<Overlay>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState<"supabase" | "sheet">("supabase");

  const loadData = useCallback(async () => {
    if (!canLoad) return;

    // Supabase is the only source now. The previous Google Sheet fallback was
    // a single shared document, so serving it to a signed-in user would hand
    // them somebody else's collection.
    const fromSupabase = await fetchCarsFromSupabase();
    if (!fromSupabase) return;

    setBase(fromSupabase);
    setSource("supabase");
    const ts = Date.now();
    setLastUpdated(ts);
    writeCache(uid, fromSupabase, ts);

    // Retire overlay entries the database has caught up with. The overlay
    // unconditionally wins over `base`, so without this an edit stays "applied"
    // in this browser forever — including one whose write failed, which is how a
    // whole shipment could read as Available here and Transit everywhere else.
    setOverlay((prev) => {
      const byId = new Map(fromSupabase.map((c) => [c.id, c]));
      const updated: Record<string, Diecast> = {};
      let pruned = 0;
      for (const [id, car] of Object.entries(prev.updated)) {
        const remote = byId.get(id);
        if (remote && savedFieldsMatch(remote, car)) {
          pruned++;
          continue;
        }
        updated[id] = car;
      }
      if (!pruned) return prev;
      const next = { ...prev, updated };
      writeOverlay(uid, next);
      return next;
    });
  }, [uid, canLoad]);

  useEffect(() => {
    if (!canLoad) {
      setBase([]);
      setOverlay(EMPTY);
      setLastUpdated(null);
      setHydrated(false);
      return;
    }

    let cancelled = false;
    setOverlay(readOverlay(uid));
    const cached = readCache(uid);
    setBase(cached?.data ?? []);
    setLastUpdated(cached?.ts ?? null);
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
  }, [loadData, uid, canLoad]);

  // Periodic refresh
  useEffect(() => {
    if (!hydrated || !canLoad) return;
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
  }, [hydrated, loadData, canLoad]);

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
    if (!hydrated) return sortCars(base);
    const del = new Set(overlay.deleted);
    const merged: Diecast[] = [];
    for (const c of base) {
      if (del.has(c.id)) continue;
      merged.push(overlay.updated[c.id] ?? c);
    }
    // Sorted once here so every view — dashboard, collection, inventory,
    // orders — sees the same status-then-insertion order.
    return sortCars([...overlay.added, ...merged]);
  }, [base, overlay, hydrated]);

  const commit = useCallback(
    (next: Overlay) => {
      setOverlay(next);
      writeOverlay(uid, next);
    },
    [uid],
  );

  const addCar = useCallback(
    (car: Diecast) => {
      // Shipping IDs are derived from seller and dates, never typed.
      const next: Diecast = { ...car, shippingId: shippingIdFor(car, [...cars, car]) };
      commit({ ...overlay, added: [next, ...overlay.added] });
      void persistCars([next], "addCar");
    },
    [overlay, commit, cars],
  );

  const bulkAddCars = useCallback(
    (newCars: Diecast[]) => {
      if (!newCars.length) return;
      commit({ ...overlay, added: [...newCars, ...overlay.added] });
      // Previously omitted entirely, so a bulk import lived in localStorage and
      // nowhere else.
      void persistCars(newCars, "bulkAddCars");
    },
    [overlay, commit],
  );

  const updateCar = useCallback(
    (car: Diecast) => {
      // Only re-derive when the inputs actually moved: recomputing on every
      // edit could silently renumber an existing shipment, since the rank
      // depends on the rest of the collection.
      const prev = cars.find((c) => c.id === car.id);
      const needsId = !car.shippingId?.trim() || (prev && shippingInputsChanged(prev, car));
      const next: Diecast = needsId
        ? {
            ...car,
            shippingId: shippingIdFor(
              car,
              cars.map((c) => (c.id === car.id ? car : c)),
            ),
          }
        : car;

      if (overlay.added.some((a) => a.id === next.id)) {
        commit({ ...overlay, added: overlay.added.map((a) => (a.id === next.id ? next : a)) });
      } else {
        commit({ ...overlay, updated: { ...overlay.updated, [next.id]: next } });
      }
      void persistCars([next], "updateCar");
    },
    [overlay, commit, cars],
  );

  /** Applies rows to the local overlay only. Persistence is the caller's job. */
  const commitCars = useCallback(
    (updatedCars: Diecast[]) => {
      const updatedMap = { ...overlay.updated };
      let addedList = [...overlay.added];
      const addedIds = new Set(addedList.map((a) => a.id));

      for (const car of updatedCars) {
        if (addedIds.has(car.id)) {
          addedList = addedList.map((a) => (a.id === car.id ? car : a));
        } else {
          updatedMap[car.id] = car;
        }
      }
      commit({ ...overlay, added: addedList, updated: updatedMap });
    },
    [overlay, commit],
  );

  const bulkUpdateCars = useCallback(
    (updatedCars: Diecast[]) => {
      if (!updatedCars.length) return;
      commitCars(updatedCars);
      void persistCars(updatedCars, "bulkUpdate");
    },
    [commitCars],
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

      commitCars(updatedCars);

      // Awaited rather than fired and forgotten: both callers announce "updated
      // N cars" on the resolved value, so that claim has to be backed by the
      // database. Failures surface through their own error UI, not a toast.
      const failures = await persistCars(updatedCars, "updateCarsByShippingId", false);
      if (failures.length) {
        throw new Error(
          `${failures.length} of ${updatedCars.length} cars could not be saved: ${
            failures[0]?.error ?? "unknown error"
          }`,
        );
      }
      return updatedCars.length;
    },
    [cars, commitCars],
  );

  const deleteCar = useCallback(
    (id: string) => {
      if (overlay.added.some((a) => a.id === id)) {
        commit({ ...overlay, added: overlay.added.filter((a) => a.id !== id) });
      } else {
        const { [id]: _drop, ...rest } = overlay.updated;
        commit({ ...overlay, updated: rest, deleted: [...overlay.deleted, id] });
      }
      void deleteCarFromSupabase(id).then((res) => {
        if (res.success) return;
        console.error("Supabase deleteCar failed:", res.error);
        toast.error("Car was not deleted from the database", { description: res.error });
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
