import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface SyncPayload {
  catalog_id?: string;
  image_url: string | null;
  source: "catalog" | "user_car";
  make?: string;
  model?: string;
  variant?: string;
  series?: string;
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

    const body: SyncPayload = await request.json();
    const { catalog_id, image_url, source, make, model } = body;

    const cleanImage = image_url?.trim() || null;
    const cleanCatalogId = catalog_id?.trim() || "";

    let updatedCatalog = 0;
    let updatedRaw = 0;

    // 1. If we have a catalog ID, update tesoro_car_catalog
    if (cleanCatalogId) {
      const { error: catErr, count } = await client
        .from("tesoro_car_catalog")
        .update({ image_url: cleanImage, updated_at: new Date().toISOString() })
        .eq("car_id", cleanCatalogId);

      if (!catErr && count !== null) {
        updatedCatalog = count;
      }
    } else if (make && model) {
      // Find matching catalog ID by make and model
      const { data: matchedCats } = await client
        .from("tesoro_car_catalog")
        .select("car_id")
        .ilike("make", make)
        .ilike("model", model)
        .limit(1);

      if (matchedCats && matchedCats.length > 0) {
        const foundId = matchedCats[0].car_id;
        await client
          .from("tesoro_car_catalog")
          .update({ image_url: cleanImage, updated_at: new Date().toISOString() })
          .eq("car_id", foundId);
      }
    }

    // 2. Update tesoro_raw (users' cars)
    if (cleanCatalogId) {
      // Update any row where Catalog ID or Car ID matches
      const { error: rawErr, count } = await client
        .from("tesoro_raw")
        .update({ "Image URL": cleanImage })
        .or(`"Catalog ID".ilike.${cleanCatalogId},"Car ID".ilike.${cleanCatalogId}`);

      if (!rawErr && count !== null) {
        updatedRaw = count;
      }
    }

    // Fallback: Also update matching Make and Model in tesoro_raw if provided
    if (make && model) {
      const { error: makeModelErr } = await client
        .from("tesoro_raw")
        .update({ "Image URL": cleanImage })
        .ilike("Make", make)
        .ilike("Model", model);

      if (makeModelErr) {
        console.warn("tesoro_raw make/model sync warning:", makeModelErr.message);
      }
    }

    return json({
      success: true,
      updatedCatalog,
      updatedRaw,
      image_url: cleanImage,
      source,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync error";
    console.error("sync-images error:", err);
    return json({ success: false, error: message }, 500);
  }
}

export const Route = createFileRoute("/api/sync-images")({
  server: {
    handlers: {
      POST: handler,
    },
  },
});
