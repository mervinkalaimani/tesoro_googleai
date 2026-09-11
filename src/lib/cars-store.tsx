import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Diecast } from "@/lib/types";
import { deriveMonth } from "@/lib/date-utils";
import { shippingIdFor, shippingInputsChanged } from "@/lib/shipping-id";
import { assignCarIds } from "@/lib/car-id";
import { sortCars } from "@/lib/status-order";
import { useAuth } from "@/lib/auth-store";
import { makeGuestCars } from "@/lib/guest-seed";
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

export type ShippingBatchUpdates = {
  status?: string;
  /** Arrival date. Set directly rather than inferred from the expected date. */
  date?: string;
  expectedDate?: string;
  transitInfo?: string;
  deliveryPartner?: string;
  trackingId?: string;
  /**
   * "settle" records the full cost as paid and zeroes the balance; "clear"
   * resets the paid amount to nothing. Left alone when absent.
   */
  payment?: "settle" | "clear";
};

/**
 * One reversible step. `before` is the affected cars exactly as they were, and
 * `created` lists ids that did not exist beforehand and so have to be removed
 * rather than restored.
 *
 * Held in memory only. Undo is for the mistake you just noticed, and an entry
 * that outlived a reload would be offering to reverse an edit against a
 * collection that has since moved on — including on another device.
 */
type UndoEntry = {
  id: number;
  label: string;
  before: Diecast[];
  created: string[];
};

/** Enough to walk back a bad run of edits; not a version history. */
const MAX_UNDO = 25;

export type ShippingBatchOptions = {
  /**
   * Leave cars already marked Available untouched. The caller decides, because
   * the caller is what the person is looking at: a batch dialog that says
   * "3 cars" has to update those three and no others. It used to say three and
   * quietly rewrite every delivered car sharing the ID.
   */
  excludeAvailable?: boolean;
  /** What the undo button should offer to reverse. Defaults to the batch ID. */
  label?: string;
};

type Ctx = {
  cars: Diecast[];
  addCar: (car: Diecast) => void;
  bulkAddCars: (cars: Diecast[]) => void;
  updateCar: (car: Diecast) => void;
  bulkUpdateCars: (cars: Diecast[]) => void;
  updateCarsByShippingId: (
    shippingId: string,
    updates: ShippingBatchUpdates,
    options?: ShippingBatchOptions,
  ) => Promise<number>;
  deleteCar: (id: string) => void;
  undo: () => void;
  /** What the next undo would reverse, or null when there is nothing to undo. */
  undoLabel: string | null;
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
  const { user, status: authStatus, isGuest } = useAuth();
  // Guests get their own namespace, so their edits never mix with a real
  // account's cache on a shared browser.
  const uid = isGuest ? "guest" : (user?.id ?? "anon");
  // The provider is mounted for signed-out visitors too, so every read is
  // gated on an approved session rather than on being rendered. A guest never
  // loads: their cars are generated, and Supabase would refuse them anyway.
  const canLoad = !isGuest && authStatus === "ready" && Boolean(user?.id);

  // Starts empty rather than from the bundled seed: a new account owns nothing
  // until Supabase says otherwise.
  const [base, setBase] = useState<Diecast[]>([]);
  const [overlay, setOverlay] = useState<Overlay>(EMPTY);
  /**
   * The overlay as it stands *now*, including writes made earlier in this same
   * tick. Every mutator builds its next overlay from here rather than from the
   * `overlay` its render closed over: two writes in one turn — adding cars to an
   * order and updating the rest of it, say — each started from the same stale
   * snapshot, so the second silently threw away the first.
   */
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const [hydrated, setHydrated] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState<"supabase" | "sheet">("supabase");
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);

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

      // A new car sits in `added` until its insert comes back from Supabase.
      // Once the row is in `base` the overlay copy is a second rendering of the
      // same record, so retire it on the same terms as an edit: the database
      // has to actually agree before the local copy is dropped.
      const added = prev.added.filter((car) => {
        const remote = byId.get(car.id);
        if (remote && savedFieldsMatch(remote, car)) {
          pruned++;
          return false;
        }
        return true;
      });

      // A tombstone only has to outlive the row it hides. Once the delete has
      // landed the id is gone from `base` too, and keeping the entry forever
      // just grows the overlay.
      const deleted = prev.deleted.filter((id) => {
        if (byId.has(id)) return true;
        pruned++;
        return false;
      });

      if (!pruned) return prev;
      const next = { added, updated, deleted };
      overlayRef.current = next;
      writeOverlay(uid, next);
      return next;
    });
  }, [uid, canLoad]);

  useEffect(() => {
    if (isGuest) {
      // Generated fresh per visit, then cached so a reload doesn't reshuffle
      // the demo out from under whoever is looking at it.
      const cached = readCache(uid);
      const cars = cached?.data?.length ? cached.data : makeGuestCars();
      setBase(cars);
      setOverlay(readOverlay(uid));
      const ts = cached?.ts ?? Date.now();
      setLastUpdated(ts);
      writeCache(uid, cars, ts);
      setHydrated(true);
      setRefreshing(false);
      return;
    }

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
  }, [loadData, uid, canLoad, isGuest]);

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
    const addedIds = new Set(overlay.added.map((c) => c.id));
    const merged: Diecast[] = [];
    for (const c of base) {
      if (del.has(c.id)) continue;
      // Belt and braces against the overlay and the database describing the
      // same car at once — an added row whose insert has landed but whose
      // overlay entry has not been pruned yet, or one carrying a local edit
      // that has not saved. Without this the id renders twice, and since both
      // rows address the same record, deleting either takes both away.
      if (addedIds.has(c.id)) continue;
      merged.push(overlay.updated[c.id] ?? c);
    }
    // Sorted once here so every view — dashboard, collection, inventory,
    // orders — sees the same status-then-insertion order.
    return sortCars([...overlay.added, ...merged]);
  }, [base, overlay, hydrated]);

  const commit = useCallback(
    (next: Overlay) => {
      // The ref moves first so a second write in the same tick sees this one.
      overlayRef.current = next;
      setOverlay(next);
      writeOverlay(uid, next);
    },
    [uid],
  );

  /**
   * The single door to the database. Guest Mode is entirely local, so it stops
   * here — every edit still lands in the overlay and survives a reload, but
   * nothing a guest does is ever written to Supabase.
   */
  const persist = useCallback(
    async (toSave: Diecast[], scope: string, report = true): Promise<{ error?: string }[]> => {
      if (isGuest) return [];
      return persistCars(toSave, scope, report);
    },
    [isGuest],
  );

  /**
   * Record how to reverse what is about to happen. Called before the mutation,
   * so `before` is genuinely the previous state.
   */
  const pushUndo = useCallback((label: string, before: Diecast[], created: string[] = []) => {
    if (!before.length && !created.length) return;
    setUndoStack((prev) =>
      [...prev, { id: Date.now() + prev.length, label, before, created }].slice(-MAX_UNDO),
    );
  }, []);

  /** Undoing is itself a write, so it must never record an entry of its own. */
  const undo = useCallback(() => {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;
    setUndoStack((prev) => prev.slice(0, -1));

    const baseIds = new Set(base.map((c) => c.id));
    const restoreIds = new Set(entry.before.map((c) => c.id));
    const dropIds = new Set(entry.created);

    // Rebuild the overlay in one pass rather than three, so the restore and the
    // removal cannot race each other through separate commits.
    const prev = overlayRef.current;
    const added = prev.added.filter((c) => !dropIds.has(c.id) && !restoreIds.has(c.id));
    const updated = { ...prev.updated };
    for (const id of dropIds) delete updated[id];

    for (const car of entry.before) {
      // A car the database has since forgotten — one being restored from a
      // delete after a refresh — has no row in `base` to sit on top of, so it
      // goes back as an addition instead of an edit.
      if (baseIds.has(car.id)) updated[car.id] = car;
      else added.unshift(car);
    }

    const deleted = prev.deleted
      .filter((id) => !restoreIds.has(id))
      .concat([...dropIds].filter((id) => baseIds.has(id) && !prev.deleted.includes(id)));

    commit({ added, updated, deleted });

    if (!isGuest) {
      // Upsert restores the row whether it was edited or deleted outright.
      if (entry.before.length) void persistCars(entry.before, "undo", true);
      for (const id of dropIds) {
        void deleteCarFromSupabase(id).then((res) => {
          if (res.success) return;
          console.error("Supabase undo delete failed:", res.error);
          toast.error("Undo did not reach the database", { description: res.error });
        });
      }
    }

    toast.success(`Undid ${entry.label}`);
  }, [undoStack, base, commit, isGuest]);

  const addCar = useCallback(
    (car: Diecast) => {
      // Both IDs are derived, never typed: the car ID from brand and
      // assortment, the shipping ID from seller and dates. The car ID is
      // assigned first so the shipping rank is computed against the final row.
      const [identified] = assignCarIds([car], cars);
      const next: Diecast = {
        ...identified,
        // A car that arrives already assigned to a batch — added from inside an
        // order — keeps that ID. Deriving one regardless would have numbered it
        // into a batch of its own and dropped it out of the order it was added
        // to. Everything else is numbered from the seller and the dates.
        shippingId:
          identified.shippingId?.trim() || shippingIdFor(identified, [...cars, identified]),
      };
      pushUndo(`adding “${next.name || next.model || "the car"}”`, [], [next.id]);
      const prev = overlayRef.current;
      commit({ ...prev, added: [next, ...prev.added] });
      void persist([next], "addCar");
    },
    [commit, cars, persist, pushUndo],
  );

  const bulkAddCars = useCallback(
    (newCars: Diecast[]) => {
      if (!newCars.length) return;
      // Numbered as a batch, so two cars sharing a brand and assortment cannot
      // both claim the same number. Rows that arrive with a real ID — a CSV
      // re-import, say — keep the one they came with.
      const identified = assignCarIds(newCars, cars);
      pushUndo(
        `adding ${identified.length} car${identified.length === 1 ? "" : "s"}`,
        [],
        identified.map((c) => c.id),
      );
      const prev = overlayRef.current;
      commit({ ...prev, added: [...identified, ...prev.added] });
      // Previously omitted entirely, so a bulk import lived in localStorage and
      // nowhere else.
      void persist(identified, "bulkAddCars");
    },
    [commit, persist, cars, pushUndo],
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

      if (prev) pushUndo(`editing “${prev.name || prev.model || "the car"}”`, [prev]);

      const prevOverlay = overlayRef.current;
      if (prevOverlay.added.some((a) => a.id === next.id)) {
        commit({
          ...prevOverlay,
          added: prevOverlay.added.map((a) => (a.id === next.id ? next : a)),
        });
      } else {
        commit({ ...prevOverlay, updated: { ...prevOverlay.updated, [next.id]: next } });
      }
      void persist([next], "updateCar");
    },
    [commit, cars, persist, pushUndo],
  );

  /** Applies rows to the local overlay only. Persistence is the caller's job. */
  const commitCars = useCallback(
    (updatedCars: Diecast[]) => {
      const prev = overlayRef.current;
      const updatedMap = { ...prev.updated };
      let addedList = [...prev.added];
      const addedIds = new Set(addedList.map((a) => a.id));

      for (const car of updatedCars) {
        if (addedIds.has(car.id)) {
          addedList = addedList.map((a) => (a.id === car.id ? car : a));
        } else {
          updatedMap[car.id] = car;
        }
      }
      commit({ ...prev, added: addedList, updated: updatedMap });
    },
    [commit],
  );

  const bulkUpdateCars = useCallback(
    (updatedCars: Diecast[]) => {
      if (!updatedCars.length) return;
      const byId = new Map(cars.map((c) => [c.id, c]));
      const before = updatedCars.map((c) => byId.get(c.id)).filter((c): c is Diecast => Boolean(c));
      pushUndo(`editing ${before.length} car${before.length === 1 ? "" : "s"}`, before);
      commitCars(updatedCars);
      void persist(updatedCars, "bulkUpdate");
    },
    [commitCars, persist, cars, pushUndo],
  );

  const updateCarsByShippingId = useCallback(
    async (
      shippingId: string,
      updates: ShippingBatchUpdates,
      options: ShippingBatchOptions = {},
    ): Promise<number> => {
      const cleanId = (shippingId || "").trim();
      if (!cleanId) return 0;

      const matched = cars.filter((c) => {
        if ((c.shippingId || "").trim().toLowerCase() !== cleanId.toLowerCase()) return false;
        if (options.excludeAvailable && (c.status || "").trim().toLowerCase() === "available") {
          return false;
        }
        return true;
      });
      if (matched.length === 0) return 0;

      const updatedCars: Diecast[] = matched.map((car) => {
        const next: Diecast = { ...car };
        if (updates.status !== undefined && updates.status !== "" && updates.status !== "keep") {
          next.status = updates.status;
          if (updates.status === "Available") {
            const arrDate =
              updates.date ||
              updates.expectedDate ||
              next.expectedDate ||
              next.date ||
              new Date().toISOString().slice(0, 10);
            next.date = arrDate;
            next.month = deriveMonth(arrDate) || next.month;
          }
        }
        // An explicit arrival date wins over anything inferred above.
        if (updates.date) {
          next.date = updates.date;
          next.month = deriveMonth(updates.date) || next.month;
        }
        if (updates.expectedDate !== undefined && updates.expectedDate !== "") {
          next.expectedDate = updates.expectedDate;
        }
        if (updates.payment === "settle") {
          next.paid = next.spent || 0;
          next.balance = 0;
          next.payment = "Paid";
        } else if (updates.payment === "clear") {
          next.paid = 0;
          next.balance = Math.max(0, next.spent || 0);
          next.payment = next.balance > 0 ? "Pending" : next.payment;
        }
        if (updates.transitInfo !== undefined) {
          next.transitInfo = updates.transitInfo.trim();
        }
        if (updates.deliveryPartner !== undefined) {
          next.deliveryPartner = updates.deliveryPartner.trim() || undefined;
        }
        if (updates.trackingId !== undefined) {
          next.trackingId = updates.trackingId.trim() || undefined;
        }
        return next;
      });

      pushUndo(options.label ?? `updating ${cleanId}`, matched);
      commitCars(updatedCars);

      // Awaited rather than fired and forgotten: both callers announce "updated
      // N cars" on the resolved value, so that claim has to be backed by the
      // database. Failures surface through their own error UI, not a toast.
      const failures = await persist(updatedCars, "updateCarsByShippingId", false);
      if (failures.length) {
        throw new Error(
          `${failures.length} of ${updatedCars.length} cars could not be saved: ${
            failures[0]?.error ?? "unknown error"
          }`,
        );
      }
      return updatedCars.length;
    },
    [cars, commitCars, persist, pushUndo],
  );

  const deleteCar = useCallback(
    (id: string) => {
      const existing = cars.find((c) => c.id === id);
      if (existing) {
        pushUndo(`deleting “${existing.name || existing.model || "the car"}”`, [existing]);
      }
      const prev = overlayRef.current;
      const { [id]: _drop, ...rest } = prev.updated;
      commit({
        ...prev,
        added: prev.added.filter((a) => a.id !== id),
        updated: rest,
        // The tombstone is recorded whichever half the car came from. A freshly
        // added car whose insert has already landed exists in `base` as well,
        // so dropping it from `added` alone would let the next refresh hand it
        // straight back.
        deleted: prev.deleted.includes(id) ? prev.deleted : [...prev.deleted, id],
      });
      if (isGuest) return;
      void deleteCarFromSupabase(id).then((res) => {
        if (res.success) return;
        console.error("Supabase deleteCar failed:", res.error);
        toast.error("Car was not deleted from the database", { description: res.error });
      });
    },
    [commit, isGuest, cars, pushUndo],
  );

  const undoLabel = undoStack.length ? undoStack[undoStack.length - 1].label : null;

  const resetOverlay = useCallback(() => {
    setUndoStack([]);
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
      if (isGuest) {
        return { success: false, count: 0, error: "Guest Mode is local only — sign in to sync." };
      }
      const res = await seedCarsToSupabase(cars, onProgress);
      if (res.success) {
        setSource("supabase");
      }
      return res;
    },
    [cars, isGuest],
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
      undo,
      undoLabel,
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
      undo,
      undoLabel,
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

/**
 * Kept apart from useCarsActions so the top bar's undo button re-renders on the
 * label changing without every dialog that writes cars re-rendering with it.
 */
export function useCarsUndo() {
  const v = useContext(CarsCtx);
  if (!v) throw new Error("useCarsUndo must be used inside <CarsProvider>");
  return { undo: v.undo, undoLabel: v.undoLabel };
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
    deliveryPartner: "",
    trackingId: "",
    balance: 0,
    chase: false,
    favourite: false,
    official: false,
    open: false,
    imageUrl: "",
  };
}
