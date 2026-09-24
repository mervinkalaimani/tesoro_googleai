/**
 * Who a synced photo is allowed to touch.
 *
 * This is one rule in one place because getting it wrong has been expensive
 * three separate times. A photo uploaded against one car kept spreading:
 *
 *   - an API route matched on Make and Model with the service-role key, so one
 *     Porsche 911 photo overwrote all 56 Porsche 911 rows in the table, across
 *     every account;
 *   - a client store matched on make and model again, in memory only, so a
 *     photo appeared on every same-model car until the page was reloaded;
 *   - the catalogue's own sync wrote its picture over every owner's row.
 *
 * The rule that survives all three: a photo lands on a car only when it is the
 * *same casting by id*, and only when that car has no photo of its own.
 *
 * Make and model are not an identity — "Nissan Skyline" is dozens of different
 * castings — so they never decide this. And a car whose owner chose a picture
 * keeps it; nothing here is allowed to overwrite a deliberate choice. A car
 * with no picture falls back to the catalogue's when it is read anyway, so the
 * only thing this affects is whether the URL is copied onto the row as well.
 */
export function takesSyncedPhoto(
  car: { catalogId?: string; imageUrl?: string },
  syncedCatalogId: string,
): boolean {
  const mine = (car.catalogId || "").trim().toUpperCase();
  const theirs = (syncedCatalogId || "").trim().toUpperCase();
  if (!mine || !theirs || mine !== theirs) return false;
  return !(car.imageUrl || "").trim();
}
