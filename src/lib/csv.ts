export type CsvColumn<T> = {
  key: string;
  label: string;
  get: (row: T) => string | number;
};

function escape(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * A value Excel would otherwise read as a date, kept as the text it is.
 *
 * "1:64" opens as 1:64 in the morning and "2/10" as the second of October —
 * a scale and a collector number, both silently turned into something else
 * before anybody sees the file. Quoting does not help: Excel converts quoted
 * values too. A leading apostrophe is the one marker it honours, and Google
 * Sheets reads it the same way.
 *
 * `excelSafe` strips it again on the way in, so a file this app wrote comes
 * home unchanged. Only the two columns that need it are marked — a blanket
 * strip would eat the apostrophe off "'70 Dodge Charger", which is a real
 * name and not a marker.
 */
export function excelText(v: string | number | undefined | null): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  // Anything with a slash or a colon between digits is a date or a time to
  // Excel. Plain words and plain numbers are safe and stay unmarked.
  return /^\d+\s*[:/]\s*\d+$/.test(s) ? `'${s}` : s;
}

/** The same value read back: the marker is ours, not part of the value. */
export function excelSafe(v: string): string {
  const s = (v ?? "").trim();
  return s.startsWith("'") && /^'\d+\s*[:/]\s*\d+$/.test(s) ? s.slice(1) : s;
}

export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => escape(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => escape(c.get(r))).join(",")).join("\n");
  return `${head}\n${body}`;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const dateStamp = () => new Date().toISOString().slice(0, 10);

export function exportCsv<T>(name: string, rows: T[], columns: CsvColumn<T>[]) {
  downloadCsv(`${name}-${dateStamp()}.csv`, buildCsv(rows, columns));
}

import { normaliseStatus } from "@/lib/status";
import type { Diecast } from "@/lib/types";
import { monthEtaToDate } from "@/lib/date-utils";
import { normaliseRarity } from "@/lib/rarity";
import { CAR_CSV_COLUMNS } from "@/lib/car-columns";

/**
 * Robust RFC 4180 CSV parser supporting quotes, commas, and newlines inside fields.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  // Normalize line breaks
  const cleanText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i++;
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === "," || char === "\t" || char === ";") {
        currentRow.push(currentField.trim());
        currentField = "";
      } else if (char === "\n") {
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = "";
      } else {
        currentField += char;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Convert parsed CSV rows or JSON records into Diecast array.
 */
export function parseCsvToDiecast(text: string): {
  cars: Diecast[];
  errors: string[];
  /** Template examples left in the file and ignored. */
  samples: number;
} {
  const errors: string[] = [];
  const rawRows = parseCsvRows(text);

  if (rawRows.length < 2) {
    return { cars: [], errors: ["CSV file is empty or missing data rows."], samples: 0 };
  }

  const header = rawRows[0].map((h) =>
    h
      .toLowerCase()
      .trim()
      .replace(/[\s/_-]+/g, ""),
  );
  const dataRows = rawRows.slice(1);

  // Map header index
  const findCol = (...aliases: string[]): number => {
    for (const a of aliases) {
      const idx = header.indexOf(a.toLowerCase().replace(/[\s/_-]+/g, ""));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const idCol = findCol("carid", "id", "car_id");
  const nameCol = findCol("displayname", "name", "carname", "title");
  const makeCol = findCol("make");
  const modelCol = findCol("model");
  const varCol = findCol("variant", "var");
  const yearCol = findCol("year");
  const brandCol = findCol("brand", "manufacturer", "mfg");
  const seriesCol = findCol("series");
  // These four had no lookup at all, so every import dropped them silently —
  // the Diecast being built was missing them outright, which is what TypeScript
  // had been complaining about here.
  const subSeriesCol = findCol("subseries");
  const carNumberCol = findCol("carnumber", "carno", "cardnumber", "no", "number");
  const colourCol = findCol("colour", "color");
  const typeCol = findCol("type");
  const shippingCostCol = findCol("shippingcost", "shipping", "delivery");
  const asstCol = findCol("assortment", "asst");
  const sizeCol = findCol("size", "scale");
  const spentCol = findCol("totalspent", "spent", "cost", "total", "price", "amount");
  const mrpCol = findCol("mrp");
  const sellerCol = findCol("seller", "vendor", "store");
  const statusCol = findCol("status");
  const paymentCol = findCol("payment", "paymentstatus");
  const paidCol = findCol("paidasoftoday", "paid", "advpaid", "advancepaid");
  // "Received date" is what exports and the template call it now; "Date" still
  // reads, so a file saved before the rename imports unchanged.
  const dateCol = findCol("receiveddate", "date", "arrivaldate");
  const monthCol = findCol("month");
  const oDateCol = findCol("odate", "orderdate");
  const oMonthCol = findCol("omonth", "ordermonth");
  const expectedCol = findCol("expectedinhanddate", "expecteddate", "expected", "targetrelease");
  const transitCol = findCol("notes", "transitinfoeta", "transitinfo", "eta");
  // These used to be one lookup, so a "Tracking ID" column landed in the
  // shipping ID — which is a batch reference this app derives itself, not a
  // consignment number.
  const shippingCol = findCol("shippingid");
  // Read back so a file this app exported re-imports unchanged. Blank is fine:
  // the store derives one from the seller and the order date on the way in.
  const orderIdCol = findCol("orderid");
  const partnerCol = findCol("deliverypartner", "courier", "carrier");
  const trackingCol = findCol("trackingid", "tracking", "awb", "awbno", "consignment");
  const balanceCol = findCol("balance");
  const chaseCol = findCol("chase");
  const rarityCol = findCol("rarity");
  const carConditionCol = findCol("carcondition", "condition");
  const cardConditionCol = findCol("cardcondition", "packagingcondition");
  const carRatingCol = findCol("carrating");
  const cardRatingCol = findCol("cardrating");
  const favCol = findCol("favourite", "favorite", "fav");
  const officialCol = findCol("official");
  // Columns the form has no input for, so the template stopped carrying them.
  // Still read, so a file exported before they went keeps its values.
  const caseCol = findCol("casemix", "casenumber", "case", "mix");
  const imageCol = findCol("photo", "imageurl", "image");

  const val = (row: string[], colIdx: number): string =>
    colIdx >= 0 && row[colIdx] ? row[colIdx] : "";

  const cars: Diecast[] = [];

  dataRows.forEach((row, i) => {
    const rawId = val(row, idCol);
    const make = val(row, makeCol);
    const model = val(row, modelCol);
    const variant = val(row, varCol);
    const year = val(row, yearCol);
    const brand = val(row, brandCol) || "Hot Wheels";
    const explicitName = val(row, nameCol);
    const name =
      explicitName || [year, make, model, variant].filter(Boolean).join(" ") || `Car #${i + 1}`;

    const id = rawId || `car-${Date.now().toString(36)}-${(i + 1).toString().padStart(4, "0")}`;

    const parseNum = (s: string) => {
      const clean = s.replace(/[^0-9.-]+/g, "");
      const n = Number(clean);
      return isNaN(n) ? 0 : n;
    };

    const parseBool = (s: string) => {
      const lower = s.toLowerCase();
      return lower === "true" || lower === "1" || lower === "yes" || lower === "y";
    };

    const spent = parseNum(val(row, spentCol));
    const paid = parseNum(val(row, paidCol));
    const rawBalance = parseNum(val(row, balanceCol));
    const balance = balanceCol >= 0 ? rawBalance : Math.max(0, spent - paid);

    cars.push({
      id,
      name,
      make,
      model,
      variant,
      year,
      brand,
      series: val(row, seriesCol),
      subSeries: val(row, subSeriesCol),
      carNumber: excelSafe(val(row, carNumberCol)),
      colour: val(row, colourCol),
      type: val(row, typeCol),
      assortment: val(row, asstCol),
      size: excelSafe(val(row, sizeCol)) || "1/64",
      spent,
      mrp: parseNum(val(row, mrpCol)),
      shippingCost: parseNum(val(row, shippingCostCol)),
      seller: val(row, sellerCol),
      status: normaliseStatus(val(row, statusCol)) || "In Hand",
      payment: val(row, paymentCol) || "Paid",
      paid: paid || spent,
      date: val(row, dateCol),
      month: val(row, monthCol),
      orderDate: val(row, oDateCol),
      orderMonth: val(row, oMonthCol),
      expectedDate:
        val(row, expectedCol) || monthEtaToDate(val(row, transitCol)) || val(row, dateCol),
      transitInfo: val(row, transitCol),
      shippingId: val(row, shippingCol),
      // Derived from the seller and the order date once the rows land in the
      // store, so an import does not have to carry one.
      orderId: val(row, orderIdCol),
      deliveryPartner: val(row, partnerCol) || undefined,
      trackingId: val(row, trackingCol) || undefined,
      balance,
      // A Rarity column wins; a bare Chase = true from an older export reads as
      // a chase, which is all it could have meant.
      rarity:
        normaliseRarity(val(row, rarityCol)) ??
        (parseBool(val(row, chaseCol)) ? "Chase" : "Normal"),
      chase:
        (normaliseRarity(val(row, rarityCol)) ?? "Normal") !== "Normal" ||
        parseBool(val(row, chaseCol)),
      caseNumber: val(row, caseCol) || undefined,
      imageUrl: val(row, imageCol) || undefined,
      carCondition: val(row, carConditionCol),
      cardCondition: val(row, cardConditionCol),
      carRating: Math.min(5, Math.max(0, Math.round(parseNum(val(row, carRatingCol))))),
      cardRating: Math.min(5, Math.max(0, Math.round(parseNum(val(row, cardRatingCol))))),
      favourite: parseBool(val(row, favCol)),
      official: parseBool(val(row, officialCol)),
    });
  });

  // The template ships filled in, and a file built from it usually still has
  // the examples in it. They are not anybody's cars.
  const real = cars.filter((c) => !isSampleRow(c));
  return { cars: real, errors, samples: cars.length - real.length };
}

/**
 * The seller that marks a row as an example rather than a car.
 *
 * The template ships with ten filled-in rows, because a bare header row taught
 * nobody what belongs in \"Rarity\" or how a five-pack is written, and every
 * one of them carries this seller. The importer drops them, so a file that is
 * filled in around the examples imports cleanly without anybody having to
 * delete them first.
 *
 * ponytail: a real row sold by a seller of this name would vanish silently.
 * Switch to an explicit Sample column if that ever happens to anybody.
 */
export const SAMPLE_SELLER = "TESORO SAMPLE";

export function isSampleRow(car: { seller?: string }): boolean {
  return (car.seller || "").trim().toLowerCase() === SAMPLE_SELLER.toLowerCase();
}

/**
 * Ten cars that are not cars: one of each shape the importer understands.
 *
 * A single mainline, a chase, a treasure hunt, a pre-order with money still
 * owed, a car still in transit, and the three ways a box of cars is written --
 * a 2 Pack, a 5 Pack and a Team Transport pair -- because a pack is an
 * assortment here, not a special kind of row, and that is the thing nobody
 * guesses. The prices are plausible and the dates are relative to nothing, so
 * they read as illustrations rather than records.
 */
/** Every field the CSV writes, so a sample row is a whole row. */
const BLANK_SAMPLE = {
  id: "",
  catalogId: "",
  name: "",
  make: "",
  model: "",
  variant: "",
  year: "",
  series: "",
  subSeries: "",
  carNumber: "",
  colour: "",
  type: "",
  brand: "",
  assortment: "",
  size: "1/64",
  spent: 0,
  mrp: 0,
  shippingCost: 0,
  seller: "",
  status: "In Hand",
  payment: "Paid",
  paid: 0,
  date: "",
  month: "",
  orderDate: "",
  orderMonth: "",
  expectedDate: "",
  transitInfo: "",
  shippingId: "",
  orderId: "",
  balance: 0,
  chase: false,
  rarity: "Normal",
  carCondition: "",
  cardCondition: "",
  carRating: 0,
  cardRating: 0,
  favourite: false,
  official: false,
} as unknown as Diecast;

const SAMPLE_ROWS: Diecast[] = [
  {
    name: "'70 Dodge Charger R/T",
    make: "Dodge",
    model: "Charger",
    variant: "R/T",
    year: "1970",
    brand: "Hot Wheels",
    assortment: "Mainline",
    series: "HW Flames",
    carNumber: "12/250",
    colour: "Purple",
    type: "Muscle",
    spent: 120,
    mrp: 110,
    status: "In Hand",
    rarity: "Normal",
  },
  {
    name: "'55 Chevy Bel Air Gasser",
    make: "Chevrolet",
    model: "Bel Air Gasser",
    year: "1955",
    brand: "Hot Wheels",
    assortment: "Mainline",
    series: "HW Gassers",
    carNumber: "84/250",
    colour: "Green",
    type: "Muscle",
    spent: 150,
    mrp: 110,
    status: "In Hand",
    rarity: "Chase",
  },
  {
    name: "Datsun 510 Wagon",
    make: "Datsun",
    model: "510 Wagon",
    year: "1971",
    brand: "Hot Wheels",
    assortment: "Mainline",
    series: "HW Wagons",
    carNumber: "03/250",
    colour: "Blue",
    type: "Wagon",
    spent: 850,
    mrp: 110,
    status: "In Hand",
    rarity: "STH",
  },
  {
    name: "Porsche 911 GT3 RS",
    make: "Porsche",
    model: "911 GT3 RS",
    year: "2023",
    brand: "Mini GT",
    assortment: "Blister",
    carNumber: "1301",
    colour: "White",
    type: "Sports",
    spent: 1799,
    mrp: 1799,
    status: "PO",
    payment: "Partial",
    paid: 500,
    balance: 1299,
  },
  {
    name: "Lamborghini Huracan STO",
    make: "Lamborghini",
    model: "Huracan STO",
    year: "2022",
    brand: "Mini GT",
    assortment: "Box",
    carNumber: "779",
    colour: "Arancio Borealis",
    type: "Sports",
    spent: 1650,
    mrp: 1650,
    status: "In Transit",
    deliveryPartner: "Delhivery",
    trackingId: "SAMPLE123456",
  },
  {
    name: "Nissan Skyline GT-R R34",
    make: "Nissan",
    model: "Skyline GT-R",
    variant: "R34",
    year: "1999",
    brand: "Tomica",
    assortment: "Box",
    colour: "Silver",
    type: "Sports",
    spent: 799,
    mrp: 799,
    status: "In Hand",
  },
  {
    name: "Fast & Furious 2 Pack",
    make: "Assorted",
    model: "2 Pack",
    brand: "Hot Wheels",
    assortment: "2 Pack",
    series: "Fast & Furious",
    colour: "Assorted",
    type: "Set",
    spent: 499,
    mrp: 499,
    status: "In Hand",
  },
  {
    name: "Ferrari 5 Pack",
    make: "Ferrari",
    model: "5 Pack",
    brand: "Hot Wheels",
    assortment: "5 Pack",
    series: "Ferrari",
    colour: "Assorted",
    type: "Set",
    spent: 899,
    mrp: 1350,
    status: "In Hand",
  },
  {
    name: "Team Transport Nissan Skyline & Ramp Truck",
    make: "Nissan",
    model: "Skyline & Ramp Truck",
    brand: "Hot Wheels",
    assortment: "Team Transport",
    series: "Team Transport",
    carNumber: "84",
    colour: "Assorted",
    type: "Set",
    spent: 1400,
    mrp: 1400,
    status: "In Hand",
  },
  {
    name: "Porsche 963 Penske",
    make: "Porsche",
    model: "963",
    variant: "Penske 2025",
    year: "2025",
    brand: "Mini GT",
    assortment: "Acrylic Case",
    carNumber: "1224",
    colour: "White & Red",
    type: "Race",
    spent: 2499,
    mrp: 2499,
    status: "In Hand",
    carCondition: "Mint",
    carRating: 5,
    cardCondition: "Mint",
    cardRating: 5,
    favourite: true,
  },
].map((row) => ({ ...BLANK_SAMPLE, ...row, seller: SAMPLE_SELLER }) as Diecast);

/**
 * The importer's template: the column row, and ten examples under it.
 *
 * It used to be a blank form, on the argument that rows in a template are rows
 * somebody has to delete. That argument loses to the other one: a header row
 * alone says nothing about how a five-pack is written or what goes in Rarity,
 * and those are exactly the columns people get wrong. The examples all carry
 * the sample seller, so the importer drops them and nobody has to delete
 * anything.
 */
export function generateDiecastCsvTemplate(): string {
  return buildCsv(SAMPLE_ROWS, CAR_CSV_COLUMNS);
}

/**
 * What importing `parsed` would do to a collection that already holds `existing`.
 *
 * An import upserts on car ID, so it does two different things at once: rows
 * with a new ID are added, and rows carrying an ID already in the collection
 * replace what is there. Undoing it has to remove the first kind and put the
 * second kind back, which is why both halves are named here rather than
 * assuming every imported row is new.
 */
export function importDelta(
  parsed: Diecast[],
  existing: Diecast[],
): { created: string[]; overwritten: Diecast[] } {
  const byId = new Map(existing.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const created: string[] = [];
  const overwritten: Diecast[] = [];
  for (const row of parsed) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const was = byId.get(row.id);
    if (was) overwritten.push(was);
    else created.push(row.id);
  }
  return { created, overwritten };
}
