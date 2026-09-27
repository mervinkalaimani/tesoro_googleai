import { needsCarNumber } from "@/lib/duplicate";
import { isIso } from "@/lib/status";
import type { Diecast } from "@/lib/types";

/**
 * What a car has to have before it can be saved.
 *
 * The same list the add-a-car form enforces in `validateStep`
 * (car-form-dialog.tsx), in the same order, so a row that passes here would
 * pass there. It lives apart from the form because an import has to answer the
 * same question about two hundred rows at once, and a second copy of the rule
 * is how the two drift.
 *
 * Deliberately not checked here: that the colour is a colour. The form can
 * afford to argue with one field somebody is looking at; an import cannot
 * refuse two hundred rows over spellings, and a wrong colour is a thing you can
 * see and fix in the preview.
 */
export type RequiredField = {
  key: string;
  /** The column as the CSV and the preview label it. */
  label: string;
};

const FIELDS: (RequiredField & { has: (c: Diecast) => boolean })[] = [
  { key: "make", label: "Make", has: (c) => Boolean((c.make || "").trim()) },
  { key: "model", label: "Model", has: (c) => Boolean((c.model || "").trim()) },
  { key: "type", label: "Type", has: (c) => Boolean((c.type || "").trim()) },
  { key: "brand", label: "Brand", has: (c) => Boolean((c.brand || "").trim()) },
  { key: "assortment", label: "Assortment", has: (c) => Boolean((c.assortment || "").trim()) },
  // Hot Wheels and Matchbox print a position in a series; every other brand
  // prints a number that belongs to the casting, and it is what tells two
  // near-identical ones apart.
  {
    key: "carNumber",
    label: "Car number",
    has: (c) => !needsCarNumber(c.brand || "") || Boolean((c.carNumber || "").trim()),
  },
  { key: "status", label: "Status", has: (c) => Boolean((c.status || "").trim()) },
  { key: "seller", label: "Seller", has: (c) => Boolean((c.seller || "").trim()) },
  { key: "orderDate", label: "Order date", has: (c) => Boolean((c.orderDate || "").trim()) },
  { key: "mrp", label: "MRP", has: (c) => Number.isFinite(Number(c.mrp)) && c.mrp !== undefined },
  {
    key: "spent",
    label: "Total Spent",
    has: (c) => Number.isFinite(Number(c.spent)) && c.spent !== undefined,
  },
  { key: "payment", label: "Payment Status", has: (c) => Boolean((c.payment || "").trim()) },
];

/** Which of them this car is missing, in the order the form asks for them. */
export function missingRequired(car: Diecast): RequiredField[] {
  // Everything below the status describes a purchase, and a car you are only
  // looking for is not one.
  const purchase = !isIso(car.status);
  return FIELDS.filter((f) => {
    if (!purchase && ["seller", "orderDate", "mrp", "spent", "payment"].includes(f.key)) {
      return false;
    }
    return !f.has(car);
  }).map(({ key, label }) => ({ key, label }));
}

/** The keys, for marking a header or a cell. */
export const REQUIRED_KEYS = new Set(FIELDS.map((f) => f.key));
