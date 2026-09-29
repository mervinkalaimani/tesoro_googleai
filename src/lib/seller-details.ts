/**
 * What is known about a shop, beyond its name on a car.
 *
 * The seller on a car is a string and nothing else. This is the row behind it:
 * which shop it is, the number to ring, the WhatsApp to message, where they
 * are, and which of the two names to put on screen.
 *
 * Keyed on the lower-cased name, the same key the Sellers page groups by, so
 * "Crossword" and "crossword" are one shop. Loaded once and kept in a module
 * cache: 137 shops is one small read, and every row on the page wants it.
 */
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export type SellerDetails = {
  seller_key: string;
  owner_name: string;
  store_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  location: string | null;
  prefer: "owner" | "store";
};

/** The key a seller's name maps to, wherever it is spelled. */
export const sellerKey = (name: string) => name.trim().toLowerCase();

/** What to call this shop on screen, given what is known and what was asked for. */
export function sellerLabel(name: string, d?: SellerDetails | null): string {
  const store = (d?.store_name || "").trim();
  if (d?.prefer === "store" && store) return store;
  return name.trim();
}

let cache: Map<string, SellerDetails> | null = null;
let inFlight: Promise<Map<string, SellerDetails>> | null = null;
const listeners = new Set<(m: Map<string, SellerDetails>) => void>();

async function fetchAll(): Promise<Map<string, SellerDetails>> {
  // The generated Database types predate this table, as they do tesoro_raw.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("tesoro_sellers") as any).select(
    "seller_key, owner_name, store_name, phone, whatsapp, location, prefer",
  );
  const rows = (error ? [] : ((data || []) as unknown as SellerDetails[])) ?? [];
  cache = new Map(rows.map((r) => [r.seller_key, r]));
  for (const fn of listeners) fn(cache);
  return cache;
}

/** Every shop that has details, by key. Read once per session unless refreshed. */
export function useSellerDetails(): Map<string, SellerDetails> {
  const [map, setMap] = useState<Map<string, SellerDetails>>(() => cache ?? new Map());

  useEffect(() => {
    listeners.add(setMap);
    if (cache) setMap(cache);
    else {
      inFlight ??= fetchAll().finally(() => {
        inFlight = null;
      });
      void inFlight;
    }
    return () => {
      listeners.delete(setMap);
    };
  }, []);

  return map;
}

/**
 * Write a shop's details.
 *
 * Empty strings are stored as null rather than as nothing, so a field that has
 * been cleared reads the same as one never filled in.
 */
export async function saveSellerDetails(
  name: string,
  patch: {
    store_name: string;
    phone: string;
    whatsapp: string;
    location: string;
    prefer: "owner" | "store";
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = sellerKey(name);
  if (!key) return { ok: false, error: "That seller has no name." };

  const blank = (v: string) => {
    const t = v.trim();
    return t ? t : null;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("tesoro_sellers") as any).upsert(
    {
      seller_key: key,
      owner_name: name.trim(),
      store_name: blank(patch.store_name),
      phone: blank(patch.phone),
      whatsapp: blank(patch.whatsapp),
      location: blank(patch.location),
      // A shop cannot go by a store name it has not got.
      prefer: patch.prefer === "store" && blank(patch.store_name) ? "store" : "owner",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "seller_key" },
  );

  if (error) return { ok: false, error: error.message };
  await fetchAll();
  return { ok: true };
}

/** A wa.me link for a number, when there is a number and no link of its own. */
export function whatsappHref(d?: SellerDetails | null): string | null {
  const link = (d?.whatsapp || "").trim();
  if (link) return /^https?:\/\//i.test(link) ? link : `https://wa.me/${link.replace(/\D/g, "")}`;
  const phone = (d?.phone || "").replace(/\D/g, "");
  return phone ? `https://wa.me/${phone}` : null;
}
