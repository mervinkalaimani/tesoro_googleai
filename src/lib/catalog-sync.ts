import { supabase } from "@/integrations/supabase/client";
import type { CatalogCar } from "@/lib/catalog";
import type { Diecast } from "@/lib/types";
import { isCarMatchingCatalog } from "@/lib/catalog";
import { isPreOrder } from "@/lib/status-order";

export const CATALOG_SYNC_EVENT = "tesoro:catalog-car-updated";
export const CATALOG_BROADCAST_CHANNEL = "tesoro_catalog_realtime_broadcast";

/** Cross-tab broadcast channel for instantaneous multi-tab sync */
let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
  try {
    broadcastChannel = new BroadcastChannel(CATALOG_BROADCAST_CHANNEL);
  } catch {
    broadcastChannel = null;
  }
}

/**
 * Updates an individual Diecast user car instance using the latest attributes
 * from its corresponding catalogue casting.
 */
export function applyCatalogToCar(
  car: Diecast,
  cat: CatalogCar,
): { car: Diecast; changed: boolean } {
  let changed = false;

  const newName = cat.name || `${cat.make} ${cat.model}`.trim() || car.name;
  const newMake = cat.make || car.make;
  const newModel = cat.model || car.model;
  const newVariant = cat.variant !== undefined ? cat.variant : car.variant;
  const newYear = cat.year !== undefined && cat.year !== null ? cat.year : car.year;
  const newColour = cat.colour || car.colour;
  const newType = cat.type || car.type;
  const newBrand = cat.brand || car.brand;
  const newSeries = cat.series || car.series;
  const newSubSeries = cat.sub_series !== undefined ? cat.sub_series : car.subSeries;
  const newCarNumber = cat.car_number !== undefined ? cat.car_number : car.carNumber;
  const newAssortment = cat.assortment || car.assortment;
  const newSize = cat.size || car.size || "1:64";
  // The catalogue's MRP is the reference price, for somebody meeting this
  // casting for the first time. A row that already carries one carries the
  // owner's, which an edit to the shared entry has no business rewriting.
  const newMrp = car.mrp || Number(cat.mrp) || 0;
  const newImageUrl =
    cat.image_url !== undefined && cat.image_url !== null ? cat.image_url : car.imageUrl;
  const newRarity = cat.rarity || car.rarity || "Normal";
  const newChase = newRarity !== "Normal";

  // Pre-order expected arrival sync: only update if car is in pre-order state
  const isPO = isPreOrder(car.status) || car.status?.toLowerCase().includes("pre");
  let newExpectedDate = car.expectedDate;
  if (isPO && cat.expected_date) {
    if (car.expectedDate !== cat.expected_date) {
      newExpectedDate = cat.expected_date;
      changed = true;
    }
  }

  if (
    car.name !== newName ||
    car.make !== newMake ||
    car.model !== newModel ||
    car.variant !== newVariant ||
    car.year !== newYear ||
    car.colour !== newColour ||
    car.type !== newType ||
    car.brand !== newBrand ||
    car.series !== newSeries ||
    car.subSeries !== newSubSeries ||
    car.carNumber !== newCarNumber ||
    car.assortment !== newAssortment ||
    car.size !== newSize ||
    car.mrp !== newMrp ||
    (newImageUrl && car.imageUrl !== newImageUrl) ||
    car.rarity !== newRarity ||
    car.chase !== newChase ||
    (cat.car_id && car.catalogId !== cat.car_id)
  ) {
    changed = true;
  }

  if (!changed) return { car, changed: false };

  const updatedCar: Diecast = {
    ...car,
    catalogId: cat.car_id || car.catalogId,
    name: newName,
    make: newMake,
    model: newModel,
    variant: newVariant,
    year: newYear,
    colour: newColour,
    type: newType,
    brand: newBrand,
    series: newSeries,
    subSeries: newSubSeries,
    carNumber: newCarNumber,
    assortment: newAssortment,
    size: newSize,
    mrp: newMrp,
    imageUrl: newImageUrl || car.imageUrl,
    rarity: newRarity,
    chase: newChase,
    expectedDate: newExpectedDate,
  };

  return { car: updatedCar, changed: true };
}

/**
 * Checks whether a given user car (collection item or pre-order) matches
 * the specified catalogue car.
 */
export function isCarInstanceOfCatalog(car: Diecast, cat: CatalogCar): boolean {
  if (!car || !cat) return false;
  // If colours or variants conflict, they are different releases/castings
  const carCol = (car.colour || "").trim().toLowerCase();
  const catCol = (cat.colour || "").trim().toLowerCase();
  if (carCol && catCol && carCol !== catCol) return false;
  const carVar = (car.variant || "").trim().toLowerCase();
  const catVar = (cat.variant || "").trim().toLowerCase();
  if (carVar && catVar && carVar !== catVar) return false;

  const cleanCatId = (cat.car_id || "").trim().toUpperCase();
  if (cleanCatId) {
    if ((car.catalogId || "").trim().toUpperCase() === cleanCatId) return true;
    if ((car.id || "").trim().toUpperCase() === cleanCatId) return true;
  }
  return isCarMatchingCatalog(car, cat);
}

export interface SyncCatalogOptions {
  syncDatabase?: boolean;
  source?: "catalog_edit" | "realtime_event" | "api";
}

/**
 * Synchronizes an edited catalogue car to all instances in user collections
 * and pre-orders instantly.
 *
 * 1. Broadcasts the change to React stores via DOM event & BroadcastChannel.
 * 2. Updates local storage caches.
 * 3. Persists updates to tesoro_raw via client query and backend API.
 */
export async function syncCatalogCarToUserCars(
  catalogCar: CatalogCar,
  options: SyncCatalogOptions = {},
): Promise<{ success: boolean; affectedCars?: number }> {
  const { syncDatabase = true, source = "catalog_edit" } = options;
  if (!catalogCar?.car_id) return { success: false };

  const catalogId = catalogCar.car_id.trim();

  // 1. Dispatch custom event for in-page React stores
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(CATALOG_SYNC_EVENT, {
        detail: {
          catalogId,
          catalogCar,
          source,
          timestamp: Date.now(),
        },
      }),
    );

    // Also dispatch image-synced event for existing listeners
    if (catalogCar.image_url) {
      window.dispatchEvent(
        new CustomEvent("tesoro:image-synced", {
          detail: {
            catalogId,
            imageUrl: catalogCar.image_url,
            catalogCar,
            source: "catalog",
          },
        }),
      );
    }
  }

  // 2. Cross-tab synchronization via BroadcastChannel
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({
        type: CATALOG_SYNC_EVENT,
        catalogId,
        catalogCar,
        source,
        timestamp: Date.now(),
      });
    } catch {
      // Ignore broadcast errors
    }
  }

  // 3. Database persistence to tesoro_raw
  if (syncDatabase) {
    // 3a. Direct Supabase update from current client
    try {
      const updatePayload: Record<string, unknown> = {
        Name: catalogCar.name || `${catalogCar.make} ${catalogCar.model}`.trim(),
        Make: catalogCar.make,
        Model: catalogCar.model,
        Variant: catalogCar.variant || "",
        Year: catalogCar.year || null,
        Type: catalogCar.type || "",
        Series: catalogCar.series || "",
        "Sub Series": catalogCar.sub_series || "",
        "Car Number": catalogCar.car_number || "",
        Colour: catalogCar.colour || "",
        Brand: catalogCar.brand || "",
        Assortment: catalogCar.assortment || "",
        Size: catalogCar.size || "1:64",
        MRP: Number(catalogCar.mrp) || 0,
        Rarity: catalogCar.rarity || "Normal",
        Chase: catalogCar.rarity ? catalogCar.rarity !== "Normal" : false,
      };

      // "Image URL" is deliberately not in this payload. Propagating the
      // catalogue's descriptive columns is this function's job — they describe
      // the casting, so they are the same for everyone who owns one. The photo
      // is not: people upload their own, and stamping the catalogue's over the
      // top of them wiped work they had done. A row without one falls back to
      // the catalogue when it is read, so nothing is lost by leaving it out.

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("tesoro_raw") as any)
        .update(updatePayload)
        .or(`"Catalog ID".ilike.${catalogId},"Car ID".ilike.${catalogId}`);

      // If pre-order has an expected date, update pre-order rows
      if (catalogCar.expected_date) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("tesoro_raw") as any)
          .update({ "Expected Date": catalogCar.expected_date })
          .or(`"Catalog ID".ilike.${catalogId},"Car ID".ilike.${catalogId}`)
          .ilike("Status", "%pre%order%");
      }
    } catch (err) {
      console.warn("[catalog-sync] Client-side tesoro_raw sync warning:", err);
    }

    // 3b. Trigger background server API endpoint to guarantee service-level
    // updates across all user collections and pre-orders.
    try {
      void fetch("/api/sync-catalog-car", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          catalog_id: catalogId,
          catalog_car: catalogCar,
          source,
        }),
      }).catch((err) => {
        console.warn("[catalog-sync] Background server sync warning:", err);
      });
    } catch {
      // Non-blocking
    }
  }

  return { success: true };
}

/**
 * Starts a real-time event listener subscribing to Supabase Realtime changes
 * on the `tesoro_car_catalog` table.
 *
 * When an entry is updated (by admin or background service), it immediately
 * updates all matching cars across user collections and pre-orders.
 */
export function startCatalogRealtimeListener(
  onUpdate?: (updatedCar: CatalogCar) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  let channel: ReturnType<typeof supabase.channel> | null = null;

  try {
    const channelName = `tesoro_catalog_realtime_${Math.random().toString(36).slice(2, 7)}`;
    channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tesoro_car_catalog",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
            const row = payload.new;
            if (!row || !row.car_id) return;

            const catalogCar: CatalogCar = {
              car_id: row.car_id,
              brand: row.brand || "",
              make: row.make || "",
              model: row.model || "",
              assortment: row.assortment || "",
              series: row.series || "",
              sub_series: row.sub_series || "",
              car_number: row.car_number || "",
              mrp: Number(row.mrp) || 0,
              name: row.name || `${row.make} ${row.model}`.trim(),
              variant: row.variant || "",
              year: row.year || "",
              colour: row.colour || "",
              type: row.type || "",
              size: row.size || "1:64",
              image_url: row.image_url || null,
              release_status: row.release_status === "Pre Order" ? "Pre Order" : "Released",
              rarity: row.rarity || "Normal",
              expected_date: row.expected_date || null,
              created_at: row.created_at,
              updated_at: row.updated_at,
              created_by: row.created_by,
              updated_by: row.updated_by,
              is_multipack: Boolean(row.is_multipack),
              pack_size: row.pack_size ?? null,
            };

            // Propagate through local sync utility (without re-triggering db sync loop)
            void syncCatalogCarToUserCars(catalogCar, {
              syncDatabase: false,
              source: "realtime_event",
            });

            if (onUpdate) {
              try {
                onUpdate(catalogCar);
              } catch (e) {
                console.error("[catalog-sync] onUpdate callback error:", e);
              }
            }
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Real-time connected
        }
      });
  } catch (err) {
    console.warn("[catalog-sync] Failed to initialize Supabase Realtime channel:", err);
  }

  // Cross-tab message listener
  const handleBroadcastMessage = (event: MessageEvent) => {
    if (event.data?.type === CATALOG_SYNC_EVENT && event.data.catalogCar) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(CATALOG_SYNC_EVENT, {
            detail: event.data,
          }),
        );
      }
      if (onUpdate) {
        onUpdate(event.data.catalogCar);
      }
    }
  };

  if (broadcastChannel) {
    broadcastChannel.addEventListener("message", handleBroadcastMessage);
  }

  // Teardown
  return () => {
    if (channel) {
      try {
        void supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    }
    if (broadcastChannel) {
      broadcastChannel.removeEventListener("message", handleBroadcastMessage);
    }
  };
}

/**
 * Generates the PostgreSQL trigger SQL to create in Supabase SQL editor
 * for database-native instant updates.
 */
export function generateSupabaseTriggerSql(): string {
  return `-- ====================================================================
-- Tesoro Database Trigger: Auto-sync tesoro_car_catalog to tesoro_raw
-- When an entry in tesoro_car_catalog is edited, update all matching cars
-- in user collections and pre-orders instantly.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.sync_catalog_to_user_cars()
RETURNS TRIGGER AS $$
BEGIN
  -- Update all user collection and pre-order rows matching this catalogue entry
  UPDATE public.tesoro_raw
  SET
    "Name" = COALESCE(NEW.name, "Name"),
    "Make" = COALESCE(NEW.make, "Make"),
    "Model" = COALESCE(NEW.model, "Model"),
    "Variant" = COALESCE(NEW.variant, "Variant"),
    "Year" = COALESCE(NEW.year, "Year"),
    "Type" = COALESCE(NEW.type, "Type"),
    "Series" = COALESCE(NEW.series, "Series"),
    "Sub Series" = COALESCE(NEW.sub_series, "Sub Series"),
    "Car Number" = COALESCE(NEW.car_number, "Car Number"),
    "Colour" = COALESCE(NEW.colour, "Colour"),
    "Brand" = COALESCE(NEW.brand, "Brand"),
    "Assortment" = COALESCE(NEW.assortment, "Assortment"),
    "Size" = COALESCE(NEW.size, "Size"),
    "MRP" = CASE WHEN NEW.mrp > 0 THEN NEW.mrp ELSE "MRP" END,
    "Image URL" = COALESCE(NEW.image_url, "Image URL"),
    "Rarity" = COALESCE(NEW.rarity, "Rarity"),
    "Chase" = (NEW.rarity IS NOT NULL AND NEW.rarity <> 'Normal'),
    "Expected Date" = CASE
      WHEN NEW.expected_date IS NOT NULL AND (LOWER(COALESCE("Status", '')) LIKE '%pre%order%' OR "Status" = 'PO')
      THEN NEW.expected_date
      ELSE "Expected Date"
    END
  WHERE
    "Catalog ID" ILIKE NEW.car_id
    OR "Car ID" ILIKE NEW.car_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to tesoro_car_catalog on UPDATE
DROP TRIGGER IF EXISTS trg_catalog_car_sync ON public.tesoro_car_catalog;
CREATE TRIGGER trg_catalog_car_sync
AFTER UPDATE ON public.tesoro_car_catalog
FOR EACH ROW
EXECUTE FUNCTION public.sync_catalog_to_user_cars();
`;
}
