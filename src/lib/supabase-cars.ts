import { supabase } from "@/integrations/supabase/client";
import type { Diecast } from "@/lib/types";
import { buildCarName } from "@/lib/car-name";
import { getSupabaseTableName } from "@/lib/supabase-config";
import { parseCurrency } from "@/lib/format";

export type TesoroRawRow = {
  "Car ID"?: string | null;
  Name?: string | null;
  Make?: string | null;
  Model?: string | null;
  Variant?: string | null;
  Year?: string | null;
  Type?: string | null;
  Series?: string | null;
  "Sub Series"?: string | null;
  "Car Number"?: string | null;
  Colour?: string | null;
  Brand?: string | null;
  Assortment?: string | null;
  Size?: string | null;
  Spent?: number | null;
  MRP?: number | null;
  "Shipping Cost"?: number | null;
  Seller?: string | null;
  Status?: string | null;
  Payment?: string | null;
  Paid?: number | null;
  Month?: string | null;
  Date?: string | null;
  O_Date?: string | null;
  O_Month?: string | null;
  "Transit Info / ETA"?: string | null;
  "Shipping ID"?: string | null;
  Balance?: number | null;
  Chase?: boolean | null;
  Favourite?: boolean | null;
  Official?: boolean | null;
  Open?: boolean | null;
  "Image URL"?: string | null;
  image_url?: string | null;
  Image?: string | null;
  [key: string]: unknown;
};

export function diecastToTesoroRaw(car: Diecast): TesoroRawRow {
  const row: TesoroRawRow = {
    "Car ID": car.id,
    Name: car.name,
    Make: car.make,
    Model: car.model,
    Variant: car.variant || "",
    Year: car.year || "",
    Type: car.type || "",
    Series: car.series || "",
    "Sub Series": car.subSeries || "",
    "Car Number": car.carNumber || "",
    Colour: car.colour || "",
    Brand: car.brand || "",
    Assortment: car.assortment || "",
    Size: car.size || "1:64",
    Spent: Number(car.spent) || 0,
    MRP: Number(car.mrp) || 0,
    "Shipping Cost": car.shippingCost !== undefined ? Number(car.shippingCost) : 0,
    Seller: car.seller || "",
    Status: car.status || "",
    Payment: car.payment || "",
    Paid: Number(car.paid) || 0,
    Month: car.month || "",
    Date: car.date || "",
    O_Date: car.orderDate || "",
    O_Month: car.orderMonth || "",
    "Transit Info / ETA": car.transitInfo || "",
    "Shipping ID": car.shippingId || "",
    Balance: Number(car.balance) || 0,
    Chase: Boolean(car.chase),
    Favourite: Boolean(car.favourite),
    Official: Boolean(car.official),
    Open: Boolean(car.open),
  };
  if (car.imageUrl) {
    row["Image URL"] = car.imageUrl;
  }
  return row;
}

export function tesoroRawToDiecast(row: TesoroRawRow): Diecast {
  const id = String(row["Car ID"] || "").trim();
  const make = String(row.Make || "").trim();
  const model = String(row.Model || "").trim();
  const variant = String(row.Variant || "").trim();
  const year = String(row.Year || "").trim();
  const type = String(row.Type || "").trim();
  const series = String(row.Series || "").trim();
  const name =
    String(row.Name || "").trim() || buildCarName({ make, model, variant, year, type, series });

  const rawSpent =
    row.Spent ?? (row as Record<string, unknown>).Cost ?? (row as Record<string, unknown>).Price;
  const spent = parseCurrency(rawSpent);
  const mrp = parseCurrency(row.MRP);
  const rawShipping =
    row["Shipping Cost"] ??
    (row as Record<string, unknown>).shipping_cost ??
    (row as Record<string, unknown>)["shipping cost"];
  const shippingCost = parseCurrency(rawShipping);
  const paid = parseCurrency(row.Paid);
  const hasRawBalance =
    row.Balance !== null && row.Balance !== undefined && String(row.Balance).trim() !== "";
  const balance = hasRawBalance ? parseCurrency(row.Balance) : Math.max(0, spent - paid);

  const imageUrl =
    String(
      row["Image URL"] ||
        row.image_url ||
        row.Image ||
        row.image ||
        (row as Record<string, unknown>).photo ||
        "",
    ).trim() || undefined;

  return {
    id,
    name,
    make,
    model,
    variant,
    year,
    series,
    subSeries: String(row["Sub Series"] || "").trim(),
    carNumber: String(row["Car Number"] || "").trim(),
    colour: String(row.Colour || "").trim(),
    type,
    brand: String(row.Brand || "").trim(),
    assortment: String(row.Assortment || "").trim(),
    size: String(row.Size || "1:64").trim(),
    spent,
    mrp,
    shippingCost,
    seller: String(row.Seller || "").trim(),
    status: String(row.Status || "").trim(),
    payment: String(row.Payment || "").trim(),
    paid,
    date: String(row.Date || "").trim(),
    month: String(row.Month || "").trim(),
    orderDate: String(row.O_Date || "").trim(),
    orderMonth: String(row.O_Month || "").trim(),
    expectedDate: String(row.Date || "").trim(),
    transitInfo: String(row["Transit Info / ETA"] || "").trim(),
    shippingId: String(row["Shipping ID"] || "").trim(),
    balance,
    chase: Boolean(row.Chase),
    favourite: Boolean(row.Favourite),
    official: Boolean(row.Official),
    open: Boolean(row.Open),
    imageUrl,
  };
}

/**
 * Fetch all rows from the configured Supabase table.
 * Paginates in chunks of 1000 to bypass Supabase's default 1000-row limit.
 * Returns null if the initial query fails, or an array of Diecast items.
 */
export async function fetchCarsFromSupabase(): Promise<Diecast[] | null> {
  try {
    const tableName = getSupabaseTableName();
    const pageSize = 1000;
    let allRows: TesoroRawRow[] = [];
    let page = 0;

    while (true) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from(tableName as any)
        .select("*")
        .order("Car ID", { ascending: true })
        .range(from, to);

      if (error) {
        console.warn(`Supabase fetch ${tableName} error:`, error.message);
        if (allRows.length > 0) break;
        return null;
      }

      if (!data || data.length === 0) break;
      allRows = allRows.concat(data as TesoroRawRow[]);
      if (data.length < pageSize) break;
      page++;
    }

    return allRows.filter((r) => r["Car ID"]).map(tesoroRawToDiecast);
  } catch (err) {
    console.error("fetchCarsFromSupabase failed:", err);
    return null;
  }
}

/**
 * Insert or upsert a car in the configured Supabase table.
 */
export async function saveCarToSupabase(
  car: Diecast,
): Promise<{ success: boolean; error?: string }> {
  try {
    const tableName = getSupabaseTableName();
    const payload = diecastToTesoroRaw(car);
    let { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from(tableName as any)
      .upsert(payload, { onConflict: "Car ID" });

    // If Supabase table does not yet have "Image URL" column in schema cache, retry without it
    if (
      error &&
      payload["Image URL"] &&
      (error.message.includes("Image URL") ||
        error.message.includes("schema cache") ||
        error.message.includes("column"))
    ) {
      console.warn(
        "Supabase upsert with Image URL failed, retrying without Image URL:",
        error.message,
      );
      const { "Image URL": _img, ...fallbackPayload } = payload;
      const res = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from(tableName as any)
        .upsert(fallbackPayload, { onConflict: "Car ID" });
      error = res.error;
    }

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Delete a car by Car ID in the configured Supabase table.
 */
export async function deleteCarFromSupabase(
  carId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const tableName = getSupabaseTableName();
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from(tableName as any)
      .delete()
      .eq("Car ID", carId);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Batch seed rows into the configured Supabase table.
 */
export async function seedCarsToSupabase(
  cars: Diecast[],
  onProgress?: (inserted: number, total: number) => void,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const tableName = getSupabaseTableName();
    const chunkSize = 100;
    let count = 0;
    for (let i = 0; i < cars.length; i += chunkSize) {
      const slice = cars.slice(i, i + chunkSize);
      const rows = slice.map(diecastToTesoroRaw);
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from(tableName as any)
        .upsert(rows, { onConflict: "Car ID" });

      if (error) {
        return { success: false, count, error: error.message };
      }
      count += slice.length;
      if (onProgress) {
        onProgress(count, cars.length);
      }
    }
    return { success: true, count };
  } catch (err) {
    return { success: false, count: 0, error: (err as Error).message };
  }
}
