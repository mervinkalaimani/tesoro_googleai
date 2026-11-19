import { createElement, useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth-store";
import { useCatalog } from "@/lib/catalog-store";

import { useStoreEnabled } from "./enabled";
import { fromCatalogCar, MARKET_CAR_EVENT } from "./catalogue";
import { api, getServerState, getState, setCatalogue, settleDue, subscribe } from "./db";
import type { R, State } from "./types";

export function useMarket() {
  const s = useSyncExternalStore(subscribe, getState, getServerState);
  return { s, me: s.users.find((u) => u.id === s.session) ?? null };
}

/** False on the server and first client render, so local-time text never mismatches hydration. */
export function useMounted() {
  const [m, set] = useState(false);
  useEffect(() => set(true), []);
  return m;
}

/** A clock that also closes due events. 0 until mounted. */
export function useNow(everyMs = 1000) {
  const [now, set] = useState(0);
  useEffect(() => {
    const tick = () => {
      set(Date.now());
      settleDue();
    };
    tick();
    const t = setInterval(tick, everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

/** Run an action; brief toast on success, the error on failure. Returns the result for page-level state. */
export function run<T>(r: R<T>, success?: string): R<T> {
  if (r.ok && success) toast.success(success);
  if (!r.ok) toast.error(r.error);
  return r;
}

export type { State };
export { api };

/**
 * Feeds the Viiv catalogue into the market (and, in demo mode, cars made in the
 * market back into the catalogue's list). Mount it wherever the market is read.
 */
export function useMarketCatalogue() {
  const { catalog } = useCatalog();
  const created = useSyncExternalStore(
    subscribe,
    () => getState().createdCars,
    () => getServerState().createdCars,
  );
  useEffect(() => {
    const have = new Set(catalog.map((c) => c.car_id));
    const extra = created.filter((c) => !have.has(c.car_id));
    setCatalogue([
      ...catalog.map((c) => fromCatalogCar(c)),
      ...extra.map((c) => fromCatalogCar(c, "market-created")),
    ]);
    for (const car of extra)
      window.dispatchEvent(new CustomEvent(MARKET_CAR_EVENT, { detail: { car } }));
    // `created` changes identity on every write; its length is what matters here.
  }, [catalog, created.length]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The store's session follows the Viiv login (a demo guest counts). */
function useViivIdentity() {
  const { user, profile, isGuest, status } = useAuth();
  useEffect(() => {
    if (status === "loading") return;
    if (isGuest) api.linkViivUser({ id: "guest", name: "Guest", email: "guest@demo.viiv" });
    else if (user)
      api.linkViivUser({
        id: user.id,
        name:
          [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
          user.email ||
          "Viiv collector",
        email: user.email ?? "",
      });
    else api.linkViivUser(null);
  }, [status, isGuest, user?.id, profile?.first_name, profile?.last_name]); // eslint-disable-line react-hooks/exhaustive-deps
}

function LiveBridge() {
  useMarketCatalogue();
  useViivIdentity();
  return null;
}

/**
 * Mounted once under the catalogue provider. Does nothing until the store is
 * switched on in Settings: no seeding, no catalogue copy, no session.
 */
export function MarketCatalogueBridge() {
  return useStoreEnabled() ? createElement(LiveBridge) : null;
}
