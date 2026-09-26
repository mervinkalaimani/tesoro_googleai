export type CsvColumn<T> = {
  key: string;
  label: string;
  get: (row: T) => string | number;
};

function escape(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
export function parseCsvToDiecast(text: string): { cars: Diecast[]; errors: string[] } {
  const errors: string[] = [];
  const rawRows = parseCsvRows(text);

  if (rawRows.length < 2) {
    return { cars: [], errors: ["CSV file is empty or missing data rows."] };
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
  const nameCol = findCol("name", "carname", "title");
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
  const spentCol = findCol("spent", "cost", "total", "price", "amount");
  const mrpCol = findCol("mrp");
  const sellerCol = findCol("seller", "vendor", "store");
  const statusCol = findCol("status");
  const paymentCol = findCol("payment", "paymentstatus");
  const paidCol = findCol("paid", "advpaid", "advancepaid");
  // "Received date" is what exports and the template call it now; "Date" still
  // reads, so a file saved before the rename imports unchanged.
  const dateCol = findCol("receiveddate", "date", "arrivaldate");
  const monthCol = findCol("month");
  const oDateCol = findCol("odate", "orderdate");
  const oMonthCol = findCol("omonth", "ordermonth");
  const expectedCol = findCol("expecteddate", "expected", "targetrelease");
  const transitCol = findCol("transitinfoeta", "transitinfo", "eta");
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
      carNumber: val(row, carNumberCol),
      colour: val(row, colourCol),
      type: val(row, typeCol),
      assortment: val(row, asstCol),
      size: val(row, sizeCol) || "1/64",
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
      carCondition: val(row, carConditionCol),
      cardCondition: val(row, cardConditionCol),
      carRating: Math.min(5, Math.max(0, Math.round(parseNum(val(row, carRatingCol))))),
      cardRating: Math.min(5, Math.max(0, Math.round(parseNum(val(row, cardRatingCol))))),
      favourite: parseBool(val(row, favCol)),
      official: parseBool(val(row, officialCol)),
    });
  });

  return { cars, errors };
}

/**
 * The importer's template: the column row and nothing under it.
 *
 * Written from CAR_CSV_COLUMNS, the list the export uses, so a file downloaded
 * here, filled in and imported comes home to the fields it left from, and a
 * column added later appears in all three places at once. It used to be two
 * hand-typed lines that had drifted eleven columns behind the importer.
 *
 * No sample rows. A template is a blank form — rows in it are rows somebody has
 * to delete before their own, and a car that was never bought is a strange
 * thing to hand someone as an example of their collection.
 */
export function generateDiecastCsvTemplate(): string {
  return buildCsv([], CAR_CSV_COLUMNS);
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
