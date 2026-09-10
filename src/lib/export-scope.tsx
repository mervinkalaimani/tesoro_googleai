import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { Diecast } from "@/lib/types";

/**
 * What Export would export, published by whichever page is on screen.
 *
 * The button lives in the top bar, but "everything" is rarely what anyone wants
 * — they want the rows in front of them, filtered and sorted the way they just
 * filtered and sorted them. So the page registers its current rows and the top
 * bar exports those, falling back to the whole collection on pages that have no
 * list of their own.
 */
export type ExportScope = {
  /** Filename stem, e.g. "inventory". */
  name: string;
  /** Shown in the dialog so it is obvious what is about to leave. */
  label: string;
  rows: Diecast[];
};

type Ctx = {
  scope: ExportScope | null;
  setScope: (scope: ExportScope | null) => void;
};

const ExportScopeCtx = createContext<Ctx | null>(null);

export function ExportScopeProvider({ children }: { children: ReactNode }) {
  const [scope, setScope] = useState<ExportScope | null>(null);
  const value = useMemo(() => ({ scope, setScope }), [scope]);
  return <ExportScopeCtx.Provider value={value}>{children}</ExportScopeCtx.Provider>;
}

export function useExportScope(): ExportScope | null {
  return useContext(ExportScopeCtx)?.scope ?? null;
}

/**
 * Publish this page's rows for the top bar to export, and withdraw them on the
 * way out so the next page does not inherit them.
 *
 * `rows` has to be a stable reference — a useMemo, as every caller already has —
 * or this re-registers on every render.
 */
export function useRegisterExportScope(name: string, label: string, rows: Diecast[]) {
  const ctx = useContext(ExportScopeCtx);
  const setScope = ctx?.setScope;

  useEffect(() => {
    if (!setScope) return;
    setScope({ name, label, rows });
    return () => setScope(null);
  }, [setScope, name, label, rows]);
}
