import { supabase } from "@/integrations/supabase/client";

export type Assortment = {
  id: string;
  name: string;
  brand: string;
  sort: number;
  retired: boolean;
};

export type AssortmentUsage = { name: string; cars: number; entries: number };

/**
 * The kept list, held at module level rather than in a provider.
 *
 * It is read from the option helpers, which are plain functions called deep
 * inside forms — the same reason the catalogue's ID codes live this way in
 * car-id.ts. It is loaded once with the catalogue and changes only when an
 * admin edits it.
 */
let kept: Assortment[] = [];

export function setAssortments(rows: Assortment[]) {
  kept = rows;
}

/**
 * Names for the pickers: live ones only, most-used order as stored, and a brand
 * filter when one is given — a brand's own lines plus the packaging shapes
 * anybody uses, which carry no brand of their own.
 */
export function assortmentNames(brand = ""): string[] {
  const want = brand.trim().toLowerCase();
  return kept
    .filter((a) => !a.retired)
    .filter((a) => !want || !a.brand || a.brand.trim().toLowerCase() === want)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .map((a) => a.name);
}

/** Whether the kept list has been loaded at all. Empty means fall back. */
export function hasAssortments(): boolean {
  return kept.length > 0;
}

export async function fetchAssortments(): Promise<Assortment[]> {
  const { data, error } = await supabase
    .from("tesoro_assortments")
    .select("id, name, brand, sort, retired")
    .order("sort")
    .order("name");
  if (error) {
    console.warn("fetchAssortments failed:", error.message);
    return [];
  }
  const rows = (data ?? []) as Assortment[];
  setAssortments(rows);
  return rows;
}

export async function fetchAssortmentUsage(): Promise<AssortmentUsage[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("tesoro_assortment_usage");
  if (error) {
    console.warn("fetchAssortmentUsage failed:", error.message);
    return [];
  }
  return (data ?? []) as AssortmentUsage[];
}

export async function addAssortment(
  name: string,
  brand = "",
): Promise<{ success: boolean; error?: string }> {
  const cleaned = name.trim();
  if (!cleaned) return { success: false, error: "An assortment needs a name" };
  const { error } = await supabase
    .from("tesoro_assortments")
    .insert({ name: cleaned, brand: brand.trim() });
  if (error) return { success: false, error: error.message };
  await fetchAssortments();
  return { success: true };
}

/**
 * Rename, which is also how two spellings become one: renaming onto a name that
 * already exists moves the cars and drops the spare row.
 */
export async function renameAssortment(
  from: string,
  to: string,
): Promise<{ success: boolean; moved?: number; error?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("tesoro_rename_assortment", {
    _from: from,
    _to: to,
  });
  if (error) return { success: false, error: error.message };
  await fetchAssortments();
  return { success: true, moved: Number(data) || 0 };
}

export async function setAssortmentRetired(
  id: string,
  retired: boolean,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from("tesoro_assortments").update({ retired }).eq("id", id);
  if (error) return { success: false, error: error.message };
  await fetchAssortments();
  return { success: true };
}

/**
 * Only for a name nothing uses. One in use is retired instead — deleting it
 * would leave every car that carries it pointing at a name the list denies.
 */
export async function deleteAssortment(id: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from("tesoro_assortments").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  await fetchAssortments();
  return { success: true };
}
