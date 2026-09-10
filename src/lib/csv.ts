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

import type { Diecast } from "@/lib/types";

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
  const asstCol = findCol("assortment", "asst");
  const sizeCol = findCol("size", "scale");
  const spentCol = findCol("spent", "cost", "total", "price", "amount");
  const mrpCol = findCol("mrp");
  const sellerCol = findCol("seller", "vendor", "store");
  const statusCol = findCol("status");
  const paymentCol = findCol("payment", "paymentstatus");
  const paidCol = findCol("paid", "advpaid", "advancepaid");
  const dateCol = findCol("date", "arrivaldate");
  const monthCol = findCol("month");
  const oDateCol = findCol("odate", "orderdate");
  const oMonthCol = findCol("omonth", "ordermonth");
  const transitCol = findCol("transitinfoeta", "transitinfo", "eta");
  const shippingCol = findCol("shippingid", "trackingid", "tracking");
  const balanceCol = findCol("balance");
  const chaseCol = findCol("chase");
  const favCol = findCol("favourite", "favorite", "fav");
  const officialCol = findCol("official");
  const openCol = findCol("open", "loose", "opened");

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
      assortment: val(row, asstCol),
      size: val(row, sizeCol) || "1/64",
      spent,
      mrp: parseNum(val(row, mrpCol)),
      seller: val(row, sellerCol),
      status: val(row, statusCol) || "Available",
      payment: val(row, paymentCol) || "Paid",
      paid: paid || spent,
      date: val(row, dateCol),
      month: val(row, monthCol),
      orderDate: val(row, oDateCol),
      orderMonth: val(row, oMonthCol),
      expectedDate: val(row, dateCol),
      transitInfo: val(row, transitCol),
      shippingId: val(row, shippingCol),
      balance,
      chase: parseBool(val(row, chaseCol)),
      favourite: parseBool(val(row, favCol)),
      official: parseBool(val(row, officialCol)),
      open: parseBool(val(row, openCol)),
    });
  });

  return { cars, errors };
}

export function generateDiecastCsvTemplate(): string {
  return [
    "Car ID,Name,Make,Model,Variant,Year,Brand,Series,Assortment,Size,Spent,MRP,Seller,Status,Payment,Paid,Date,Month,Order Date,Transit Info / ETA,Favourite,Chase",
    "CAR-001,1971 Datsun 240Z,Nissan,Datsun 240Z,Custom,1971,Hot Wheels,Car Culture,Premium,1/64,499,549,Amazon,Available,Paid,499,15/06/2026,Jun 2026,10/06/2026,Delivered,true,false",
    // Every row carries all 22 columns. The second one used to omit Assortment,
    // which slid Size and everything after it one column to the left — so a
    // template meant to show the format demonstrated the wrong one.
    "CAR-002,Porsche 911 GT3 RS,Porsche,911 GT3 RS,Shark Blue,2023,Mini GT,Exclusive,Premium,1/64,1299,1499,KarzandDolls,Available,Paid,1299,20/06/2026,Jun 2026,12/06/2026,Delivered,true,true",
  ].join("\n");
}
