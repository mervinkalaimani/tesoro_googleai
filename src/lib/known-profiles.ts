/**
 * Who has signed in on this device before.
 *
 * The login page asked everybody who they were from scratch, every time, in a
 * house where one tablet is passed around. This remembers the face and the
 * handle — never the password, never a session — so picking a person is a tap
 * and typing a password is the only thing still asked for.
 *
 * Deliberately per browser and deliberately removable: each tile carries its
 * own way to be forgotten, because a name and a face on a shared screen is
 * something a person should be able to take back off it.
 */
export type KnownProfile = {
  /** What goes in the Email or user ID box: the handle, or the email. */
  handle: string;
  name: string;
  avatar: string | null;
  /** Last signed in, so the most recent face is the first one. */
  at: number;
};

const KEY = "dg.knownProfiles";

/** Enough for a household. Past this the row stops being a row. */
const MAX = 6;

function read(): KnownProfile[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p): p is KnownProfile =>
          !!p &&
          typeof p === "object" &&
          typeof (p as KnownProfile).handle === "string" &&
          (p as KnownProfile).handle.trim() !== "",
      )
      .map((p) => ({
        handle: p.handle,
        name: typeof p.name === "string" && p.name.trim() ? p.name : p.handle,
        avatar: typeof p.avatar === "string" && p.avatar ? p.avatar : null,
        at: typeof p.at === "number" ? p.at : 0,
      }));
  } catch {
    // Unreadable or unavailable storage means nobody is remembered, which is
    // the same as a new device and renders as one.
    return [];
  }
}

function write(list: KnownProfile[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // A browser that will not keep it simply never offers the faces.
  }
}

/** Most recent first. */
export function knownProfiles(): KnownProfile[] {
  return read().sort((a, b) => b.at - a.at);
}

/**
 * Note that somebody signed in.
 *
 * One entry per handle: signing in again moves the same face to the front
 * rather than adding a second copy of it.
 */
export function rememberProfile(p: { handle: string; name: string; avatar?: string | null }): void {
  const handle = p.handle.trim();
  if (!handle) return;
  const rest = read().filter((k) => k.handle.toLowerCase() !== handle.toLowerCase());
  write(
    [{ handle, name: p.name.trim() || handle, avatar: p.avatar || null, at: Date.now() }, ...rest]
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX),
  );
}

export function forgetProfile(handle: string): void {
  write(read().filter((k) => k.handle.toLowerCase() !== handle.trim().toLowerCase()));
}

/** "Mervin Kalaimani" becomes MK; one word gives one letter. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
