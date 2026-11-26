import { normaliseStatus } from "./status";
import type { Diecast } from "./types";

/** What a card for a casting you already have says, nearest-to-arriving copy last. */
const LABELS: [string, string][] = [
  ["PO", "Preordered"],
  ["On Hold", "On hold"],
  ["Ordered", "Ordered"],
  ["In Transit", "In transit"],
];

export type OwnedNote = { pending: number; label: string };

/**
 * For each casting (by catalogue id) you have a row for: what is still owed on it, and the word
 * for where it is (Owned once it is in hand). The card shows the amount while anything is owed,
 * and the word once it is paid.
 */
export function ownedNotes(cars: Diecast[]): Map<string, OwnedNote> {
  const out = new Map<string, OwnedNote>();
  for (const c of cars) {
    const id = (c.catalogId || "").trim().toUpperCase();
    if (!id) continue;
    const owed = Math.max(c.balance ?? (c.spent || 0) - (c.paid || 0), 0);
    const label = LABELS.find(([st]) => st === normaliseStatus(c.status))?.[1] ?? "Owned";
    const prev = out.get(id);
    const rank = (l: string) => LABELS.findIndex(([, name]) => name === l);
    const best =
      !prev || (rank(label) !== -1 && (rank(prev.label) === -1 || rank(label) < rank(prev.label)))
        ? label
        : prev.label;
    out.set(id, { pending: (prev?.pending ?? 0) + owed, label: best });
  }
  return out;
}
