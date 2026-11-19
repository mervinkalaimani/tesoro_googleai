/**
 * Which hat this account is wearing: Admin, Buyer or Seller. A view, not a
 * permission: Admin only exists for accounts that really are admins, and the
 * database still decides what any account may write.
 * ponytail: device-local per account; move to a profile column to follow the account.
 */
import { useSyncExternalStore } from "react";

import { useAuth } from "@/lib/auth-store";
import { useViivId } from "@/market/enabled";

export type Persona = "admin" | "buyer" | "seller";

const key = (id: string) => `viiv.persona:${id}`;
const subs = new Set<() => void>();
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};

function read(id: string | null): string {
  try {
    return (id && localStorage.getItem(key(id))) || "";
  } catch {
    return "";
  }
}

export function usePersona() {
  const { isAdmin } = useAuth();
  const id = useViivId();
  const saved = useSyncExternalStore(
    subscribe,
    () => read(id),
    () => "",
  );
  // Admins start as Admin (nothing changes for them); everyone else as Buyer.
  const persona: Persona =
    saved === "seller" ? "seller" : saved === "buyer" ? "buyer" : isAdmin ? "admin" : "buyer";
  const set = (p: Persona) => {
    if (!id || (p === "admin" && !isAdmin)) return;
    try {
      localStorage.setItem(key(id), p);
    } catch {
      /* private mode: the choice just won't stick */
    }
    subs.forEach((f) => f());
  };
  return { persona, setPersona: set, canAdmin: isAdmin };
}
