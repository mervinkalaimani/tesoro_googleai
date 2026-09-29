import type { Diecast } from "@/lib/types";
import { excelText, type CsvColumn } from "@/lib/csv";
import { rarityOf } from "@/lib/rarity";

/**
 * The CSV's columns: the fields somebody types into the form, in the order the
 * form asks for them.
 *
 * It used to carry whatever the app happened to store, which meant four columns
 * nobody can fill in — the car's own ID, its shipping ID, its order ID, the
 * month — and left out five that are typed every day: the display name, the
 * balance, the shipping cost, the case a copy came from, its photo. A template
 * is a form on paper, so it holds the same fields in the same order.
 *
 * Car ID is the one derived column that stays. It is how a re-imported export
 * finds the row it belongs to: without it every row of your own file reads as a
 * new car, and importing your collection back would double it. Leave it blank
 * for a car you are adding and the app mints one.
 *
 * No catalogue ID: a spreadsheet is written by a person, and nobody types
 * 180F0A-03-0000-1. Which casting a row is, is worked out from what the row
 * says — brand, make, model and the rest — which is the same question Add a
 * car answers from the same fields.
 *
 * Shipping ID, Order ID, Received date, Month and Name are gone. The first two
 * are derived from the seller and the dates; the received date is stamped when
 * a car is marked In Hand; the name assembles itself from make, model, variant
 * and year unless Display name says otherwise.
 */
export const CAR_CSV_COLUMNS: CsvColumn<Diecast>[] = [
  // The identity of the car, as the form asks for it.
  { key: "id", label: "Car ID", get: (r) => r.id },
  { key: "make", label: "Make", get: (r) => r.make },
  { key: "model", label: "Model", get: (r) => r.model },
  { key: "variant", label: "Variant", get: (r) => r.variant },
  { key: "year", label: "Year", get: (r) => r.year },
  // Brand before the number and the series, because all three depend on it: a
  // car number means one thing for Hot Wheels and another for Mini GT, and a
  // series belongs to a brand's range.
  { key: "brand", label: "Brand", get: (r) => r.brand },
  // Marked as text: Excel reads "2/10" as the second of October.
  { key: "carNumber", label: "Car number", get: (r) => excelText(r.carNumber) },
  { key: "series", label: "Series", get: (r) => r.series },
  { key: "subSeries", label: "Sub series", get: (r) => r.subSeries },
  { key: "colour", label: "Colour", get: (r) => r.colour },
  { key: "type", label: "Type", get: (r) => r.type },
  // Same again: "1:64" opens as a time.
  { key: "size", label: "Size", get: (r) => excelText(r.size) },
  { key: "rarity", label: "Rarity", get: (r) => rarityOf(r) },
  // Chase follows from Rarity, and stays because a sheet is often sorted and
  // filtered on it.
  { key: "chase", label: "Chase", get: (r) => (r.chase ? "TRUE" : "") },
  { key: "name", label: "Display name", get: (r) => r.name },

  // The purchase.
  { key: "assortment", label: "Assortment", get: (r) => r.assortment },
  { key: "status", label: "Status", get: (r) => r.status },
  { key: "seller", label: "Seller", get: (r) => r.seller },
  { key: "orderDate", label: "Order date", get: (r) => r.orderDate },
  { key: "mrp", label: "MRP", get: (r) => r.mrp || 0 },
  { key: "spent", label: "Total Spent", get: (r) => r.spent || 0 },
  { key: "payment", label: "Payment Status", get: (r) => r.payment },
  { key: "paid", label: "Paid as of today", get: (r) => r.paid || 0 },
  { key: "balance", label: "Balance", get: (r) => r.balance || 0 },
  // One column for both halves of a car's life: the day it is due while it is
  // coming, the day it landed once it is here.
  { key: "expectedDate", label: "Expected / In Hand Date", get: (r) => r.expectedDate },
  { key: "shippingCost", label: "Shipping cost", get: (r) => r.shippingCost ?? 0 },
  { key: "deliveryPartner", label: "Delivery partner", get: (r) => r.deliveryPartner ?? "" },
  { key: "trackingId", label: "Tracking ID", get: (r) => r.trackingId ?? "" },

  // The copy itself.
  { key: "carCondition", label: "Car condition", get: (r) => r.carCondition ?? "" },
  { key: "cardCondition", label: "Card condition", get: (r) => r.cardCondition ?? "" },
  { key: "caseNumber", label: "Case / Mix", get: (r) => r.caseNumber ?? "" },
  { key: "transitInfo", label: "Notes", get: (r) => r.transitInfo },
  { key: "favourite", label: "Favourite", get: (r) => (r.favourite ? "TRUE" : "") },
  { key: "imageUrl", label: "Photo", get: (r) => r.imageUrl ?? "" },
];
