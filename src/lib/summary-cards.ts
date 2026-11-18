/**
 * The cards in the row of counts at the top of the home page, and what each is
 * called in Settings. The labels there are plain words for the people who would
 * not know what "ISO" or "PO" stands for. ("ISO" is shown as "Wishlist".)
 */
export const SUMMARY_ITEMS: { key: string; label: string; hint: string }[] = [
  { key: "inhand", label: "In hand", hint: "Cars you have and are holding" },
  { key: "transit", label: "On the way", hint: "Cars that have shipped and not yet arrived" },
  { key: "ordered", label: "Ordered", hint: "Cars you have bought and are waiting on" },
  { key: "onhold", label: "On hold", hint: "Cars the seller is holding for you" },
  { key: "po", label: "Pre-orders", hint: "Cars you have booked before they are released" },
  { key: "iso", label: "Wishlist", hint: "Cars you are looking for" },
  { key: "late", label: "Running late", hint: "Orders past the date you were promised" },
];
