/**
 * Where the auth session is kept, decided by "Remember me".
 *
 * Supabase writes the session through whatever storage the client was built
 * with, and the client is a singleton built once — so the choice cannot be made
 * per sign-in by swapping adapters. This wraps the real one instead and routes
 * each read and write by a flag the login form sets just before signing in.
 *
 * Ticked (the default), the session goes to localStorage. Unticked, it goes to
 * sessionStorage — which the browser discards when the tab closes, so "don't
 * stay signed in" is enforced by the browser rather than by this app
 * remembering to sign out.
 */

/** Undefined during SSR, where there is no storage to write a session to. */
function persistentStorage() {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}

const REMEMBER_KEY = "dg.rememberSession";

/** Default true: the app has always stayed signed in, and most people want it. */
export function rememberSession(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(REMEMBER_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setRememberSession(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REMEMBER_KEY, on ? "1" : "0");
  } catch {
    // A browser refusing storage will not persist the session either, which is
    // the same outcome as unticking the box.
  }
}

const session = {
  get: (k: string) => {
    try {
      return window.sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      window.sessionStorage.setItem(k, v);
    } catch {
      /* nothing to do: the session simply will not survive a reload */
    }
  },
  remove: (k: string) => {
    try {
      window.sessionStorage.removeItem(k);
    } catch {
      /* already gone */
    }
  },
};

/**
 * When the tab copy and the kept copy disagree, which one is still good.
 *
 * The tab copy used to win outright, which is right while a "don't stay signed
 * in" session is running and wrong the moment one is left behind. A tab that
 * once held an expired session kept handing it to Supabase in front of a
 * perfectly good remembered one, Supabase tried to refresh the dead one, failed
 * and signed the person out — so "Remember me" was ticked and the password was
 * asked for anyway.
 *
 * Both copies are sessions in the same shape, so the one that expires later is
 * the one to use. Anything unparseable falls back to the old behaviour.
 */
function expiresAt(raw: string | null): number {
  if (!raw) return -1;
  try {
    const v = JSON.parse(raw) as { expires_at?: number };
    return typeof v?.expires_at === "number" ? v.expires_at : 0;
  } catch {
    return 0;
  }
}

const isOAuthVerifierKey = (k: string) =>
  k.includes("code-verifier") || k.includes("provider") || k.includes("flow-id");

export function rememberAwareStorage() {
  const persistent = persistentStorage();
  if (!persistent) return undefined;

  return {
    getItem: async (key: string) => {
      // PKCE verifiers are temporary handshake keys; check localStorage first to ensure
      // redirects across different contexts (framed/unframed, new tabs, popups) never drop them.
      if (isOAuthVerifierKey(key) && typeof window !== "undefined") {
        try {
          const direct = window.localStorage.getItem(key);
          if (direct !== null) return direct;
        } catch {
          /* ignore storage access restriction */
        }
      }

      // A session written while the box was unticked has to keep working for
      // the life of the tab, even if the preference changes underneath it — so
      // the tab copy is read, but it no longer wins by being looked at first.
      const inTab = session.get(key);
      const kept = await persistent.getItem(key);
      if (inTab === null) return kept;
      if (kept === null) return inTab;
      return expiresAt(inTab) >= expiresAt(kept) ? inTab : kept;
    },
    setItem: async (key: string, value: string) => {
      // Always store OAuth PKCE verifiers in standard localStorage so full-window OAuth
      // redirects return with the verifier intact regardless of "remember me" state.
      if (isOAuthVerifierKey(key) && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(key, value);
        } catch {
          /* ignore storage write restriction */
        }
      }

      if (rememberSession()) {
        session.remove(key);
        return await persistent.setItem(key, value);
      }
      session.set(key, value);
      // Clear any copy left from a previous signed-in-and-remembered session,
      // or closing the browser would still find one waiting.
      return await persistent.removeItem(key);
    },
    removeItem: async (key: string) => {
      if (isOAuthVerifierKey(key) && typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(key);
        } catch {
          /* ignore storage removal restriction */
        }
      }
      session.remove(key);
      return await persistent.removeItem(key);
    },
  };
}
