import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/lib/auth-store";

/**
 * The last few things you searched for, for the top search box alone.
 *
 * Kept in this browser and nowhere else: a search is a half-formed thought
 * about your own collection, and it has no business syncing to a table other
 * people can read. Each account gets its own key, so two people sharing a
 * laptop do not read each other's, and the guest demo keeps its own.
 *
 * A small pub-sub instead of a context: the box that writes the list and the
 * tray that shows it are in the same tree but not in the same component, and
 * this is smaller than threading four props through both of them — desktop and
 * phone.
 */
const MAX = 8;
const listeners = new Set<() => void>();
const keyFor = (uid: string) => `dg.recentSearches:${uid}`;

function read(uid: string): string[] {
  try {
    const raw = window.localStorage.getItem(keyFor(uid));
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [];
  } catch {
    // Private mode, blocked site data, a half-written value: no history is a
    // fine answer, and losing it costs nothing.
    return [];
  }
}

function write(uid: string, list: string[]) {
  try {
    window.localStorage.setItem(keyFor(uid), JSON.stringify(list.slice(0, MAX)));
  } catch {
    // Nothing to do about a full or forbidden store; the list in memory still
    // updates for this session.
  }
  for (const notify of listeners) notify();
}

export function useRecentSearches() {
  const { profile } = useAuth();
  const uid = profile?.user_id || "guest";
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setRecent(read(uid));
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, [uid]);

  /**
   * Keeps what was searched, newest first, one entry per search however it was
   * spelled — re-running an old search moves it up rather than repeating it.
   * Anything under two characters is a keystroke, not a search.
   */
  const remember = useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (q.length < 2) return;
      const rest = read(uid).filter((v) => v.toLowerCase() !== q.toLowerCase());
      write(uid, [q, ...rest]);
    },
    [uid],
  );

  const forget = useCallback(
    (q: string) =>
      write(
        uid,
        read(uid).filter((v) => v !== q),
      ),
    [uid],
  );

  const clear = useCallback(() => write(uid, []), [uid]);

  return { recent, remember, forget, clear };
}
