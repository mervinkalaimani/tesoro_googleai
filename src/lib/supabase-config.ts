import { useState, useEffect, useCallback } from "react";

export interface SupabaseConfig {
  url: string;
  key: string;
  tableName: string;
}

export const DEFAULT_SUPABASE_CONFIG: SupabaseConfig = {
  url: "https://matekrbcflojjooswoha.supabase.co",
  key: "sb_publishable_t8mahOsDrNTnt-YeFGkgTA_ugnPJrpu",
  tableName: "tesoro_raw",
};

export const SUPABASE_STORAGE_KEYS = {
  URL: "tesoro.supabase.url",
  KEY: "tesoro.supabase.key",
  TABLE: "tesoro.supabase.table",
};

export function getSupabaseConfig(): SupabaseConfig {
  if (typeof window === "undefined") return DEFAULT_SUPABASE_CONFIG;
  try {
    const url =
      window.localStorage.getItem(SUPABASE_STORAGE_KEYS.URL)?.trim() || DEFAULT_SUPABASE_CONFIG.url;
    const key =
      window.localStorage.getItem(SUPABASE_STORAGE_KEYS.KEY)?.trim() || DEFAULT_SUPABASE_CONFIG.key;
    const tableName =
      window.localStorage.getItem(SUPABASE_STORAGE_KEYS.TABLE)?.trim() ||
      DEFAULT_SUPABASE_CONFIG.tableName;
    return { url, key, tableName };
  } catch {
    return DEFAULT_SUPABASE_CONFIG;
  }
}

export function saveSupabaseConfig(config: Partial<SupabaseConfig>): SupabaseConfig {
  if (typeof window !== "undefined") {
    try {
      if (config.url !== undefined) {
        window.localStorage.setItem(SUPABASE_STORAGE_KEYS.URL, config.url.trim());
      }
      if (config.key !== undefined) {
        window.localStorage.setItem(SUPABASE_STORAGE_KEYS.KEY, config.key.trim());
      }
      if (config.tableName !== undefined) {
        window.localStorage.setItem(SUPABASE_STORAGE_KEYS.TABLE, config.tableName.trim());
      }
      window.dispatchEvent(new CustomEvent("tesoro:supabase-config-changed"));
    } catch (e) {
      console.error("Failed to save Supabase config:", e);
    }
  }
  return getSupabaseConfig();
}

export function resetSupabaseConfig(): SupabaseConfig {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(SUPABASE_STORAGE_KEYS.URL);
      window.localStorage.removeItem(SUPABASE_STORAGE_KEYS.KEY);
      window.localStorage.removeItem(SUPABASE_STORAGE_KEYS.TABLE);
      window.dispatchEvent(new CustomEvent("tesoro:supabase-config-changed"));
    } catch (e) {
      console.error("Failed to reset Supabase config:", e);
    }
  }
  return DEFAULT_SUPABASE_CONFIG;
}

export function getSupabaseTableName(): string {
  return getSupabaseConfig().tableName;
}

export function useSupabaseConfig() {
  const [config, setConfig] = useState<SupabaseConfig>(getSupabaseConfig);

  useEffect(() => {
    const handleUpdate = () => {
      setConfig(getSupabaseConfig());
    };
    window.addEventListener("tesoro:supabase-config-changed", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("tesoro:supabase-config-changed", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const update = useCallback((partial: Partial<SupabaseConfig>) => {
    const next = saveSupabaseConfig(partial);
    setConfig(next);
  }, []);

  const reset = useCallback(() => {
    const def = resetSupabaseConfig();
    setConfig(def);
  }, []);

  return { config, update, reset };
}

export async function testSupabaseConnection(
  url: string,
  key: string,
  tableName: string,
): Promise<{
  success: boolean;
  message: string;
  rowCount?: number;
  statusCode?: number;
  durationMs?: number;
}> {
  const cleanUrl = url.trim().replace(/\/+$/, "");
  const cleanKey = key.trim();
  const cleanTable = tableName.trim();

  if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
    return { success: false, message: "URL must begin with https:// or http://" };
  }
  if (!cleanKey) {
    return { success: false, message: "API key cannot be empty" };
  }
  if (!cleanTable) {
    return { success: false, message: "Table name cannot be empty" };
  }

  const startTime = Date.now();
  try {
    const endpoint = `${cleanUrl}/rest/v1/${encodeURIComponent(cleanTable)}?select=*&limit=1`;
    const headers: Record<string, string> = {
      apikey: cleanKey,
    };
    if (!cleanKey.startsWith("sb_publishable_") && !cleanKey.startsWith("sb_secret_")) {
      headers["Authorization"] = `Bearer ${cleanKey}`;
    }

    const res = await fetch(endpoint, {
      method: "GET",
      headers,
    });

    const durationMs = Date.now() - startTime;

    if (!res.ok) {
      let errorDetail = "";
      try {
        const errJson = await res.json();
        errorDetail = errJson.message || errJson.error || JSON.stringify(errJson);
      } catch {
        errorDetail = await res.text();
      }
      return {
        success: false,
        statusCode: res.status,
        durationMs,
        message: `HTTP ${res.status} ${res.statusText}${errorDetail ? `: ${errorDetail}` : ""}`,
      };
    }

    const data = await res.json();
    return {
      success: true,
      statusCode: res.status,
      durationMs,
      rowCount: Array.isArray(data) ? data.length : 0,
      message: `Connection successful! Table '${cleanTable}' is reachable (${durationMs}ms).`,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      durationMs,
      message: (err as Error).message || "Network request failed. Verify URL and CORS settings.",
    };
  }
}
