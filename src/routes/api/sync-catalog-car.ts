import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface SyncCatalogPayload {
  catalog_id: string;
  catalog_car: {
    car_id: string;
    brand?: string;
    make?: string;
    model?: string;
    assortment?: string;
    series?: string;
    sub_series?: string;
    car_number?: string;
    mrp?: number;
    name?: string;
    variant?: string;
    year?: string | null;
    colour?: string;
    type?: string;
    size?: string;
    image_url?: string | null;
    release_status?: string;
    rarity?: string;
    expected_date?: string | null;
    is_multipack?: boolean;
    pack_size?: number | null;
  };
  source?: string;
}

async function handler({ request }: { request: Request }) {
  try {
    const SUPABASE_URL =
      (process.env["SUPABASE_URL"] && !process.env["SUPABASE_URL"].includes("pllpyzsfuhpsmqbxgarw")
        ? process.env["SUPABASE_URL"]
        : null) || "https://matekrbcflojjooswoha.supabase.co";
    const supabaseKey =
      process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
      process.env["SUPABASE_PUBLISHABLE_KEY"] ||
      process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
      "sb_publishable_t8mahOsDrNTnt-YeFGkgTA_ugnPJrpu";

    const client = createClient(SUPABASE_URL, supabaseKey);

    const body: SyncCatalogPayload = await request.json();
    const { catalog_id, catalog_car, source } = body;

    const cleanCatalogId = catalog_id?.trim() || catalog_car?.car_id?.trim();
    if (!cleanCatalogId) {
      return json({ success: false, error: "catalog_id is required" }, 400);
    }

    // Prepare unified fields to update in tesoro_raw
    const rawUpdate: Record<string, unknown> = {};

    if (catalog_car.name) rawUpdate["Name"] = catalog_car.name;
    else if (catalog_car.make && catalog_car.model) {
      rawUpdate["Name"] = `${catalog_car.make} ${catalog_car.model}`.trim();
    }
    if (catalog_car.make) rawUpdate["Make"] = catalog_car.make;
    if (catalog_car.model) rawUpdate["Model"] = catalog_car.model;
    if (catalog_car.variant !== undefined) rawUpdate["Variant"] = catalog_car.variant;
    if (catalog_car.year !== undefined) rawUpdate["Year"] = catalog_car.year;
    if (catalog_car.type !== undefined) rawUpdate["Type"] = catalog_car.type;
    if (catalog_car.series !== undefined) rawUpdate["Series"] = catalog_car.series;
    if (catalog_car.sub_series !== undefined) rawUpdate["Sub Series"] = catalog_car.sub_series;
    if (catalog_car.car_number !== undefined) rawUpdate["Car Number"] = catalog_car.car_number;
    if (catalog_car.colour !== undefined) rawUpdate["Colour"] = catalog_car.colour;
    if (catalog_car.brand !== undefined) rawUpdate["Brand"] = catalog_car.brand;
    if (catalog_car.assortment !== undefined) rawUpdate["Assortment"] = catalog_car.assortment;
    if (catalog_car.size !== undefined) rawUpdate["Size"] = catalog_car.size;
    if (catalog_car.mrp !== undefined && Number(catalog_car.mrp) > 0) {
      rawUpdate["MRP"] = Number(catalog_car.mrp);
    }
    if (catalog_car.image_url !== undefined) {
      rawUpdate["Image URL"] = catalog_car.image_url;
    }
    if (catalog_car.rarity !== undefined) {
      rawUpdate["Rarity"] = catalog_car.rarity;
      rawUpdate["Chase"] = catalog_car.rarity !== "Normal";
    }

    let updatedRawCount = 0;

    // 1. Update tesoro_raw by Catalog ID or Car ID matching this catalog ID
    if (Object.keys(rawUpdate).length > 0) {
      const { error: rawErr, count } = await client
        .from("tesoro_raw")
        .update(rawUpdate, { count: "exact" })
        .or(`"Catalog ID".ilike.${cleanCatalogId},"Car ID".ilike.${cleanCatalogId}`);

      if (!rawErr && typeof count === "number") {
        updatedRawCount = count;
      } else if (rawErr) {
        console.warn("tesoro_raw sync error:", rawErr.message);
      }
    }

    // 2. Pre-orders: if expected_date is set in catalogue, update Expected Date
    // for all pre-order items matching this catalog ID
    let updatedPreOrders = 0;
    if (catalog_car.expected_date) {
      const { error: poErr, count: poCount } = await client
        .from("tesoro_raw")
        .update({ "Expected Date": catalog_car.expected_date }, { count: "exact" })
        .or(`"Catalog ID".ilike.${cleanCatalogId},"Car ID".ilike.${cleanCatalogId}`)
        .ilike("Status", "%pre%order%");

      if (!poErr && typeof poCount === "number") {
        updatedPreOrders = poCount;
      }
    }

    // 3. Fallback: if Make and Model are present, also sync any unlinked rows with matching make and model
    if (catalog_car.make && catalog_car.model) {
      const { count: matchCount } = await client
        .from("tesoro_raw")
        .update(
          {
            "Catalog ID": cleanCatalogId,
            ...(catalog_car.image_url ? { "Image URL": catalog_car.image_url } : {}),
          },
          { count: "exact" },
        )
        .ilike("Make", catalog_car.make)
        .ilike("Model", catalog_car.model)
        .is("Catalog ID", null);

      if (typeof matchCount === "number" && matchCount > 0) {
        updatedRawCount += matchCount;
      }
    }

    return json({
      success: true,
      catalog_id: cleanCatalogId,
      updated_raw_count: updatedRawCount,
      updated_preorders_count: updatedPreOrders,
      source: source || "catalog_edit",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync error";
    console.error("sync-catalog-car error:", err);
    return json({ success: false, error: message }, 500);
  }
}

export const Route = createFileRoute("/api/sync-catalog-car")({
  server: {
    handlers: {
      POST: handler,
    },
  },
});
