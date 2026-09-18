import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function handler({ request }: { request: Request }) {
  try {
    const url = new URL(request.url);
    const carId = url.searchParams.get("car_id");
    if (!carId) {
      return json({ error: "Missing car_id", owners: [] }, 400);
    }

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
    const cleanId = carId.trim();
    const make = url.searchParams.get("make")?.trim();
    const model = url.searchParams.get("model")?.trim();
    const brand = url.searchParams.get("brand")?.trim();

    // Query tesoro_raw for users who own this casting
    const { data: initialRawCars } = await client
      .from("tesoro_raw")
      .select('user_id, "Date", "O_Date", "Catalog ID", "Car ID", Make, Model, Brand')
      .or(`"Catalog ID".ilike.${cleanId},"Car ID".ilike.${cleanId}`);
    let rawCars = initialRawCars;

    if ((!rawCars || rawCars.length === 0) && make && model) {
      const { data: fallbackCars } = await client
        .from("tesoro_raw")
        .select('user_id, "Date", "O_Date", "Catalog ID", "Car ID", Make, Model, Brand')
        .ilike("Make", make)
        .ilike("Model", model);
      if (fallbackCars && fallbackCars.length > 0) {
        rawCars = brand
          ? fallbackCars.filter((c) => !c.Brand || c.Brand.toLowerCase() === brand.toLowerCase())
          : fallbackCars;
      }
    }

    if (!rawCars || rawCars.length === 0) {
      return json({ owners: [] });
    }

    const userDateMap = new Map<string, string>();
    for (const r of rawCars as {
      user_id: string | null;
      Date?: string | null;
      O_Date?: string | null;
    }[]) {
      if (!r.user_id) continue;
      const date = (r.Date || r.O_Date || "").trim();
      const existing = userDateMap.get(r.user_id);
      if (!existing || (date && date > existing)) {
        userDateMap.set(r.user_id, date || existing || "—");
      }
    }

    const userIds = Array.from(userDateMap.keys());
    if (userIds.length === 0) {
      return json({ owners: [] });
    }

    const { data: usersData } = await client
      .from("tesoro_users")
      .select("auth_uid, user_id, first_name, last_name, created_at")
      .in("auth_uid", userIds);

    const usersMap = new Map<
      string,
      {
        auth_uid: string;
        user_id: string | null;
        first_name: string | null;
        last_name: string | null;
        created_at: string;
      }
    >();
    for (const u of usersData ?? []) {
      if (u.auth_uid) usersMap.set(u.auth_uid, u);
    }

    const owners = userIds.map((uid) => {
      const u = usersMap.get(uid);
      const rawDate = userDateMap.get(uid);
      const parts = [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim();
      const displayName = parts || u?.user_id || "Collector";
      const createdAt = u?.created_at ? new Date(u.created_at).toISOString().slice(0, 10) : "—";
      return {
        auth_uid: uid,
        user_id: u?.user_id || "",
        first_name: u?.first_name || null,
        last_name: u?.last_name || null,
        display_name: displayName,
        date_added: rawDate && rawDate !== "—" ? rawDate : createdAt,
      };
    });

    return json({ owners });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return json({ error: msg, owners: [] }, 500);
  }
}

export const Route = createFileRoute("/api/catalog-owners")({
  server: {
    handlers: {
      GET: handler,
    },
  },
});
