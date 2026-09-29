/**
 * Deleting your own data.
 *
 * One RPC, because it has to reach rows no signed-in caller can: the login
 * itself, and a profile row that has to survive the login going. What it does
 * and why is written out in the migration that defines it.
 */
import { supabase } from "@/integrations/supabase/client";

export async function deleteMyData(): Promise<{ cars: number } | { error: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("tesoro_delete_my_data");
  if (error) return { error: error.message || "Could not delete your data." };
  const out = (data ?? {}) as { cars?: number };
  return { cars: Number(out.cars) || 0 };
}
