import { useEffect, useMemo, useState } from "react";

import type { CarImageCandidate } from "@/routes/api/car-images";

export type { CarImageCandidate };

/** What is known about a car that a photo search can use. */
export type CarImageLookup = {
  make?: string;
  model?: string;
  variant?: string;
  year?: string;
  colour?: string;
  brand?: string;
  assortment?: string;
  series?: string;
};

const KEYS = [
  "make",
  "model",
  "variant",
  "year",
  "colour",
  "brand",
  "assortment",
  "series",
] as const;

/** One key per distinct car, ignoring case and stray spaces. */
export function lookupKey(lookup: CarImageLookup): string {
  return KEYS.map((k) => (lookup[k] || "").trim().replace(/\s+/g, " ").toLowerCase()).join("|");
}

// Per tab. The server response is cached at the edge anyway; this only saves
// the round trip when the form goes back and forth between steps.
const memo = new Map<string, Promise<CarImageCandidate[]>>();

export function searchCarImages(lookup: CarImageLookup): Promise<CarImageCandidate[]> {
  const key = lookupKey(lookup);
  const hit = memo.get(key);
  if (hit) return hit;

  const params = new URLSearchParams();
  for (const k of KEYS) {
    const v = (lookup[k] || "").trim();
    if (v) params.set(k, v);
  }
  const request = fetch(`/api/car-images?${params}`)
    .then((res) => (res.ok ? res.json() : { candidates: [] }))
    .then((body: { candidates?: CarImageCandidate[] }) => body.candidates ?? [])
    .catch(() => {
      // A failed lookup is forgotten so the next attempt can try again.
      memo.delete(key);
      return [] as CarImageCandidate[];
    });
  memo.set(key, request);
  return request;
}

/**
 * Photo suggestions for a car, fetched once the make or model is known.
 *
 * Debounced, because the fields feeding it change a keystroke at a time and
 * each distinct car is a network request.
 */
export function useCarImageCandidates(lookup: CarImageLookup, enabled = true) {
  const key = lookupKey(lookup);
  // Rebuilt only when the car described actually changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => lookup, [key]);
  const ready = enabled && Boolean((stable.make || "").trim() || (stable.model || "").trim());

  const [state, setState] = useState<{
    key: string;
    candidates: CarImageCandidate[];
    loading: boolean;
  }>({ key: "", candidates: [], loading: false });

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setState((s) => (s.key === key ? s : { key, candidates: [], loading: true }));
    const timer = setTimeout(() => {
      void searchCarImages(stable).then((candidates) => {
        if (!cancelled) setState({ key, candidates, loading: false });
      });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready, key, stable]);

  const current = state.key === key;
  return {
    key,
    candidates: ready && current ? state.candidates : [],
    loading: ready && (!current || state.loading),
  };
}
