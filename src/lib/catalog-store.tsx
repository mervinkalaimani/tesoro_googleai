import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  CatalogCar,
  fetchCatalogFromSupabase,
  getLocalCatalog,
  saveCatalogCarToSupabase,
  deleteCatalogCarFromSupabase,
  fetchPackMembers,
  savePackMembers,
  diecastToCatalogCar,
  saveLocalCatalog,
} from "@/lib/catalog";
import {
  startCatalogRealtimeListener,
  syncCatalogCarToUserCars,
  CATALOG_SYNC_EVENT,
} from "@/lib/catalog-sync";
import { findCatalogEntry, type CarIdFields } from "@/lib/car-id";
import type { Diecast } from "@/lib/types";
import { toast } from "sonner";

interface CatalogContextType {
  catalog: CatalogCar[];
  isLoading: boolean;
  refreshCatalog: () => Promise<void>;
  addCatalogCar: (car: CatalogCar) => Promise<boolean>;
  /** Admin only: rewrites an entry, and with it every car linked to it. */
  updateCatalogCar: (car: CatalogCar) => Promise<boolean>;
  /**
   * Owner only: removes an entry no car is linked to. `uses` says how many
   * are when it refused.
   */
  deleteCatalogCar: (carId: string) => Promise<{ deleted: boolean; uses: number; packs: number }>;
  /** What is in each box: pack car_id to its members, in order. */
  packMembers: Record<string, string[]>;
  /** Admin only: replaces the contents of one box. */
  setPackMembers: (packCarId: string, memberCarIds: string[]) => Promise<boolean>;
  findMatchingInCatalog: (fields: CarIdFields) => CatalogCar | undefined;
  getCatalogCarById: (carId: string) => CatalogCar | undefined;
}

const CatalogContext = createContext<CatalogContextType | null>(null);

/** Shortest gap between two visibility-triggered catalogue reads. */
const VISIBILITY_REFETCH_GAP_MS = 30_000;

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [catalog, setCatalog] = useState<CatalogCar[]>(() => getLocalCatalog());
  const [packMembers, setPackMembersState] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);

  /** When the catalogue was last read, so returning to the tab cannot loop. */
  const lastFetchRef = useRef(0);

  const refreshCatalog = useCallback(async () => {
    setIsLoading(true);
    lastFetchRef.current = Date.now();
    try {
      // Both together: what the entries are, and what is in the boxes among
      // them. A pack rendered before its contents arrive is a pack that flashes
      // "0 cars" on the way in.
      const [remote, members] = await Promise.all([fetchCatalogFromSupabase(), fetchPackMembers()]);
      setCatalog(remote);
      setPackMembersState(members);
    } catch (e) {
      console.warn("Failed to refresh catalog:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  /**
   * Fetch it again when you come back to the tab.
   *
   * The catalogue used to be read once, on mount, and then left — on the
   * strength of the realtime subscription below. That subscription has never
   * delivered anything: tesoro_car_catalog is not in the supabase_realtime
   * publication, so the channel opens, subscribes and stays silent. Cars
   * re-read every 15 seconds and so looked fine; the catalogue a desktop tab
   * had been holding since the morning did not, and photos added from a phone
   * were invisible on the other machine until it was reloaded by hand.
   *
   * On visibility rather than on a timer because that is when it matters —
   * you pick the machine up — and 1,400 rows is not something to fetch every
   * fifteen seconds. The gate keeps alt-tabbing from becoming a fetch loop.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchRef.current < VISIBILITY_REFETCH_GAP_MS) return;
      void refreshCatalog();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshCatalog]);

  useEffect(() => {
    // Start real-time Supabase subscription on tesoro_car_catalog
    const unsubscribe = startCatalogRealtimeListener((updatedCar) => {
      setCatalog((prev) => {
        const cleanId = updatedCar.car_id.trim().toUpperCase();
        const idx = prev.findIndex((c) => c.car_id.trim().toUpperCase() === cleanId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...updatedCar };
          saveLocalCatalog(next);
          return next;
        }
        const next = [updatedCar, ...prev];
        saveLocalCatalog(next);
        return next;
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleCatalogCarUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const updatedCar = detail?.catalogCar as CatalogCar | undefined;
      if (!updatedCar?.car_id) return;
      const cleanId = updatedCar.car_id.trim().toUpperCase();

      setCatalog((prev) => {
        let changed = false;
        const next = prev.map((c) => {
          if (c.car_id.trim().toUpperCase() === cleanId) {
            changed = true;
            return { ...c, ...updatedCar };
          }
          return c;
        });
        if (changed) {
          saveLocalCatalog(next);
          return next;
        }
        return prev;
      });
    };

    window.addEventListener(CATALOG_SYNC_EVENT, handleCatalogCarUpdated);
    return () => {
      window.removeEventListener(CATALOG_SYNC_EVENT, handleCatalogCarUpdated);
    };
  }, []);

  useEffect(() => {
    const handleImageSynced = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.catalogId || !detail?.imageUrl) return;
      const cleanCatId = String(detail.catalogId).trim().toUpperCase();
      const newUrl = String(detail.imageUrl).trim();

      setCatalog((prev) => {
        let changed = false;
        const next = prev.map((c) => {
          if (c.car_id.toUpperCase() === cleanCatId && c.image_url !== newUrl) {
            changed = true;
            return { ...c, image_url: newUrl, updated_at: new Date().toISOString() };
          }
          return c;
        });
        if (changed) {
          saveLocalCatalog(next);
          return next;
        }
        return prev;
      });
    };

    window.addEventListener("tesoro:image-synced", handleImageSynced);
    return () => {
      window.removeEventListener("tesoro:image-synced", handleImageSynced);
    };
  }, []);

  const writeCatalogCar = useCallback(async (car: CatalogCar, overwrite: boolean) => {
    const res = await saveCatalogCarToSupabase(car, { overwrite });
    if (res.success) {
      // The row as written, not as asked for: it carries who edited it and when.
      const stored = res.saved ?? car;
      setCatalog((prev) => {
        const idx = prev.findIndex((c) => c.car_id === car.car_id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = stored;
          saveLocalCatalog(next);
          return next;
        }
        const next = [stored, ...prev];
        saveLocalCatalog(next);
        return next;
      });

      // Instantly propagate catalogue edits to all user collections and pre-orders
      if (overwrite) {
        void syncCatalogCarToUserCars(stored);
      }

      return true;
    } else {
      toast.error(`Could not save to catalog: ${res.error || "Unknown error"}`);
      return false;
    }
  }, []);
  const addCatalogCar = useCallback(
    (car: CatalogCar) => writeCatalogCar(car, false),
    [writeCatalogCar],
  );
  const updateCatalogCar = useCallback(
    (car: CatalogCar) => writeCatalogCar(car, true),
    [writeCatalogCar],
  );

  const deleteCatalogCar = useCallback(async (carId: string) => {
    const res = await deleteCatalogCarFromSupabase(carId);
    if (res.error) {
      toast.error(`Could not remove the casting: ${res.error}`);
      return { deleted: false, uses: res.uses, packs: res.packs };
    }
    if (res.deleted) {
      const clean = carId.trim().toUpperCase();
      setCatalog((prev) => prev.filter((c) => c.car_id.toUpperCase() !== clean));
      // A removed pack takes its membership with it in the database; drop it
      // here too so the list does not go on describing a box that is gone.
      setPackMembersState((prev) => {
        const next = { ...prev };
        delete next[carId];
        return next;
      });
    }
    return { deleted: res.deleted, uses: res.uses, packs: res.packs };
  }, []);

  const setPackMembers = useCallback(async (packCarId: string, memberCarIds: string[]) => {
    const res = await savePackMembers(packCarId, memberCarIds);
    if (!res.success) {
      toast.error(`Could not save what is in the pack: ${res.error || "Unknown error"}`);
      return false;
    }
    setPackMembersState((prev) => ({ ...prev, [packCarId]: memberCarIds }));
    return true;
  }, []);

  const findMatchingInCatalog = useCallback(
    (fields: CarIdFields): CatalogCar | undefined => {
      // The ID no longer spells the casting out, so it is matched on its fields.
      const entry = findCatalogEntry(fields);
      return entry ? catalog.find((c) => c.car_id === entry.car_id) : undefined;
    },
    [catalog],
  );

  const getCatalogCarById = useCallback(
    (carId: string): CatalogCar | undefined => {
      if (!carId) return undefined;
      const clean = carId.trim().toUpperCase();
      return catalog.find((c) => c.car_id.toUpperCase() === clean);
    },
    [catalog],
  );

  const value = useMemo(
    () => ({
      catalog,
      isLoading,
      refreshCatalog,
      addCatalogCar,
      updateCatalogCar,
      deleteCatalogCar,
      packMembers,
      setPackMembers,
      findMatchingInCatalog,
      getCatalogCarById,
    }),
    [
      catalog,
      isLoading,
      refreshCatalog,
      addCatalogCar,
      updateCatalogCar,
      deleteCatalogCar,
      packMembers,
      setPackMembers,
      findMatchingInCatalog,
      getCatalogCarById,
    ],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogContextType {
  const ctx = useContext(CatalogContext);
  if (!ctx) {
    throw new Error("useCatalog must be used within a CatalogProvider");
  }
  return ctx;
}
