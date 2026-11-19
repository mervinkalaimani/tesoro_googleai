/**
 * Whether the Viiv Store is switched on for this person.
 *
 * Off by default and kept per Viiv account on this device (the Settings toggle
 * writes it). ponytail: device-local; move it to a profile column when it should
 * follow the account across devices.
 */
import { useSyncExternalStore } from "react";

import { useAuth } from "@/lib/auth-store";

const key = (id: string) => `viiv.store.enabled:${id}`;
const subs = new Set<() => void>();

function read(id: string): boolean {
  try {
    return localStorage.getItem(key(id)) === "1";
  } catch {
    return false;
  }
}

function subscribe(f: () => void) {
  subs.add(f);
  const onStorage = (e: StorageEvent) => e.key?.startsWith("viiv.store.enabled:") && f();
  window.addEventListener("storage", onStorage);
  return () => {
    subs.delete(f);
    window.removeEventListener("storage", onStorage);
  };
}

/** The signed-in Viiv account's id (a demo guest counts), or null. */
export function useViivId(): string | null {
  const { user, isGuest } = useAuth();
  return user?.id ?? (isGuest ? "guest" : null);
}

/** True/false once known; null on the server and first render, so nothing flashes. */
export function useStoreEnabled(): boolean | null {
  const id = useViivId();
  const snap = useSyncExternalStore(
    subscribe,
    () => (id && read(id) ? "1" : "0"),
    () => "?",
  );
  return snap === "?" ? null : snap === "1";
}

export function setStoreEnabled(id: string, on: boolean) {
  try {
    localStorage.setItem(key(id), on ? "1" : "0");
  } catch {
    /* private mode: the switch just won't stick */
  }
  subs.forEach((f) => f());
}
