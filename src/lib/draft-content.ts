/**
 * Whether a saved draft holds anything a person typed.
 *
 * The forms decide "untouched" by comparing against the blank form, which does
 * not survive a night: the blank form's order date is *today*, so a draft saved
 * yesterday can never equal it again. The draft then lives for its full week,
 * the badge on the Add button stays lit, and opening it shows what looks like
 * an ordinary blank form — because it very nearly is one.
 *
 * So the test is content rather than equality. Everything the app chose on the
 * person's behalf is ignored — the size, the status, the payment, the rarity,
 * the dates — and what is left is what they would recognise as their typing.
 */

/** Values the form fills in by itself, which say nothing about being touched. */
const CHOSEN_FOR_YOU = new Set([
  "size",
  "status",
  "payment",
  "rarity",
  "orderDate",
  // Derived from what was spent and paid, not typed.
  "balance",
  // Bookkeeping, not typing.
  "key",
  "isoId",
  "step",
]);
// Ratings and the two flags are not in that set on purpose: they default to 0
// and false, which never count, so the only way they read as content is if
// somebody set them — which is exactly what they mean.

/** True when any field outside that set holds something. */
export function hasTypedContent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([k, v]) => {
    if (CHOSEN_FOR_YOU.has(k)) return false;
    if (v === null || v === undefined) return false;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    return String(v).trim() !== "";
  });
}

/** A single-car draft: `{ form, step }`. */
export function carDraftHasContent(draft: unknown): boolean {
  const form = (draft as { form?: unknown } | null)?.form;
  return hasTypedContent(form);
}

/** A bulk draft: `{ rows, shared, sharedKeys }`. Any row or shared field counts. */
export function bulkDraftHasContent(draft: unknown): boolean {
  const d = draft as { rows?: unknown[]; shared?: unknown } | null;
  if (!d) return false;
  if (Array.isArray(d.rows) && d.rows.some((r) => hasTypedContent(r))) return true;
  return hasTypedContent(d.shared);
}
