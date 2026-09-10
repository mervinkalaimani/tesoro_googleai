/**
 * Drafts for forms that are long enough to be worth losing sleep over.
 *
 * A phone that goes to standby mid-form does not pause the page: iOS and Android
 * both evict a backgrounded tab under memory pressure and reload it when you
 * come back, which takes every piece of React state with it. Someone four steps
 * into cataloguing a car and one lock-screen away from losing it needs the
 * typing itself to be the save.
 *
 * So the write is synchronous on every change rather than debounced. A debounce
 * saves a handful of localStorage writes and loses the last few seconds of
 * typing, because the moment the page is frozen is exactly the moment a pending
 * timer never fires. These payloads are a few hundred bytes; the trade is not
 * close.
 */

const PREFIX = "dg.draft.";

/**
 * A draft rescues an interrupted session; it is not a document store. Past a
 * week, restoring it silently would be more surprising than helpful.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type Envelope<T> = { savedAt: number; value: T };

export function draftKey(...parts: string[]): string {
  return PREFIX + parts.join(".");
}

export const CAR_DRAFT_KEY = draftKey("car", "add");
export const BULK_DRAFT_KEY = draftKey("bulk");
export const carEditDraftKey = (id: string) => draftKey("car", "edit", id);

export function readDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T> | null;
    if (!env || typeof env.savedAt !== "number") return null;
    if (Date.now() - env.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return env.value ?? null;
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    const env: Envelope<T> = { savedAt: Date.now(), value };
    window.localStorage.setItem(key, JSON.stringify(env));
  } catch {
    // Quota or private mode. A draft is a safety net, not a promise — the form
    // in front of the person still works.
  }
}

export function clearDraft(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

export function hasDraft(key: string): boolean {
  return readDraft(key) !== null;
}

/**
 * Called on sign-out. Drafts are per-browser, so on a shared machine one
 * person's half-typed car must not greet the next one.
 */
export function clearAllDrafts() {
  if (typeof window === "undefined") return;
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable; there was nothing stored to clear.
  }
}
