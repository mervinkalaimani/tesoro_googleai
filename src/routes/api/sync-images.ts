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
    // make and model are still accepted so older callers do not break, and are
    // deliberately unread: they are what caused this endpoint to overwrite
    // every row of a model.
    const { catalog_id, image_url, source } = body;

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
    }
    // There used to be an "else" here that looked the casting up by make and
    // model and wrote the image to the first row that came back. "Porsche 911"
    // matches thirty entries and .limit(1) picks whichever the planner returns
    // first, so it filed the photo against an arbitrary one of them. Without a
    // catalogue id there is no right answer, so nothing is written.

    // 2. Nothing is written to tesoro_raw any more.
    //
    // This step used to stamp the photo onto every row of the casting, using the
    // service-role key — which bypasses RLS, so one person replacing their own
    // photo rewrote strangers' rows. A row with no photo of its own already
    // falls back to the catalogue entry when it is read, so the copy was never
    // needed; all it ever did was overwrite photos people had chosen.

    // A second write used to follow this one, labelled a fallback but running
    // unconditionally whenever make and model were sent — which both callers
    // always do:
    //
    //   .update({ "Image URL": cleanImage }).ilike("Make", make).ilike("Model", model)
    //
    // Make and model are not an identity. One photo uploaded against one
    // Porsche 911 therefore overwrote the image on every Porsche 911 row in
    // the table, in everyone's collection — 56 of them — because this endpoint
    // holds the service-role key and RLS does not apply to it. The Catalog ID
    // update above is the whole job; a row with no catalogue id is not this
    // casting and must not be touched.

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
