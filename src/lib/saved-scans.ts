import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { ExtractedAttributes } from "@/components/image-search-dialog";

/**
 * Scans kept to add later. A Pro feature: scan on the phone, save, and open
 * them on the web. Private to the person who scanned them.
 */
export type SavedScan = { id: string; cars: ExtractedAttributes[]; created_at: string };

export async function saveScan(cars: ExtractedAttributes[]): Promise<string | null> {
  const { error } = await supabase.from("tesoro_saved_scans").insert({ cars: cars as Json });
  return error ? error.message : null;
}

export async function deleteSavedScan(id: string): Promise<void> {
  await supabase.from("tesoro_saved_scans").delete().eq("id", id);
}

/** The saved scans, newest first, and a way to read them again. */
export function useSavedScans(enabled: boolean) {
  const [scans, setScans] = useState<SavedScan[]>([]);
  const refresh = useCallback(async () => {
    if (!enabled) return setScans([]);
    const { data } = await supabase
      .from("tesoro_saved_scans")
      .select("id, cars, created_at")
      .order("created_at", { ascending: false });
    setScans((data ?? []) as unknown as SavedScan[]);
  }, [enabled]);
  useEffect(() => void refresh(), [refresh]);
  return { scans, refresh };
}
