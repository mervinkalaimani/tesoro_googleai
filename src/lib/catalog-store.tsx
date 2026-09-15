import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import {
  CatalogCar,
  fetchCatalogFromSupabase,
  getLocalCatalog,
  saveCatalogCarToSupabase,
  diecastToCatalogCar,
} from "@/lib/catalog";
import { generateCatalogCarId, isPlaceholderId, CarIdFields } from "@/lib/car-id";
import type { Diecast } from "@/lib/types";
import { toast } from "sonner";

interface CatalogContextType {
  catalog: CatalogCar[];
  isLoading: boolean;
  refreshCatalog: () => Promise<void>;
  addCatalogCar: (car: CatalogCar) => Promise<boolean>;
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

  const addCatalogCar = useCallback(async (car: CatalogCar): Promise<boolean> => {
    const res = await saveCatalogCarToSupabase(car);
    if (res.success) {
      setCatalog((prev) => {
        const idx = prev.findIndex((c) => c.car_id === car.car_id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = car;
          return next;
        }
        return [car, ...prev];
      });
      return true;
    } else {
      toast.error(`Could not save to catalog: ${res.error || "Unknown error"}`);
      return false;
    }
  }, []);

  const findMatchingInCatalog = useCallback(
    (fields: CarIdFields): CatalogCar | undefined => {
      const targetBrand = (fields.brand || "").trim().toLowerCase();
      const targetMake = (fields.make || "").trim().toLowerCase();
      const targetModel = (fields.model || "").trim().toLowerCase();
      const targetAsst = (fields.assortment || "").trim().toLowerCase();
      const targetSeries = (fields.series || "").trim().toLowerCase();
      const targetSubSeries = (fields.subSeries || "").trim().toLowerCase();
      const targetCarNum = (fields.carNumber || "").trim().toLowerCase();
      const targetMrp = Math.round(Number(fields.mrp) || 0);

      // Fast check: if generated ID matches directly
      const generatedId = generateCatalogCarId(fields);
      const byId = catalog.find((c) => c.car_id.toUpperCase() === generatedId.toUpperCase());
      if (byId) return byId;

      // Check by attribute matching
      return catalog.find((c) => {
        return (
          c.brand.trim().toLowerCase() === targetBrand &&
          c.make.trim().toLowerCase() === targetMake &&
          c.model.trim().toLowerCase() === targetModel &&
          c.assortment.trim().toLowerCase() === targetAsst &&
          c.series.trim().toLowerCase() === targetSeries &&
          c.sub_series.trim().toLowerCase() === targetSubSeries &&
          c.car_number.trim().toLowerCase() === targetCarNum &&
          Math.round(Number(c.mrp) || 0) === targetMrp
        );
      });
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
      findMatchingInCatalog,
      getCatalogCarById,
    }),
    [catalog, isLoading, refreshCatalog, addCatalogCar, findMatchingInCatalog, getCatalogCarById],
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
