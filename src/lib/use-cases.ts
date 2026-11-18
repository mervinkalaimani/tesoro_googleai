/**
 * What a person uses VIIV for, asked once after they first sign in and changeable
 * in Settings. The answer decides which details the app shows: the rest are not
 * deleted, only left off the screen. Nothing answered (null) means all of it.
 */
export const USE_CASES: { key: string; label: string; hint: string; icon: string }[] = [
  { key: "car", label: "Car details", hint: "Brand, series, colour, photos", icon: "car" },
  { key: "seller", label: "Seller details", hint: "Who you buy from", icon: "store" },
  { key: "purchase", label: "Purchase details", hint: "Cost, payments, balances", icon: "receipt" },
  { key: "tracking", label: "Tracking", hint: "Orders, pre-orders, arrivals", icon: "truck" },
];

/** Whether a feature is in use: everything is, until the person has said otherwise. */
export function uses(useCases: string[] | null | undefined, key: string): boolean {
  return !useCases || useCases.includes(key);
}

/** The home summary cards that only make sense for each use. */
export const TRACKING_CARDS = ["transit", "ordered", "onhold", "po", "late"];
