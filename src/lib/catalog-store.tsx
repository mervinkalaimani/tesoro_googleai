import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import {
  CatalogCar,
  fetchCatalogFromSupabase,
  getLocalCatalog,
  saveCatalogCarToSupabase,
  deleteCatalogCarFromSupabase,
  diecastToCatalogCar,
} from "@/lib/catalog";
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
  deleteCatalogCar: (carId: string) => Promise<{ deleted: boolean; uses: number }>;
  findMatchingInCatalog: (fields: CarIdFields) => CatalogCar | undefined;
  getCatalogCarById: (carId: string) => CatalogCar | undefined;
}

const CatalogContext = createContext<CatalogContextType | null>(null);

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [catalog, setCatalog] = useState<CatalogCar[]>(() => getLocalCatalog());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshCatalog = useCallback(async () => {
    setIsLoading(true);
    try {
      const remote = await fetchCatalogFromSupabase();
      setCatalog(remote);
    } catch (e) {
      console.warn("Failed to refresh catalog:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

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
          return next;
        }
        return [stored, ...prev];
      });
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
      return { deleted: false, uses: res.uses };
    }
    if (res.deleted) {
      const clean = carId.trim().toUpperCase();
      setCatalog((prev) => prev.filter((c) => c.car_id.toUpperCase() !== clean));
    }
    return { deleted: res.deleted, uses: res.uses };
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
