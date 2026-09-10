import type { Diecast } from "@/lib/types";
import { buildCarName } from "@/lib/car-name";
import { monthEtaToDate } from "@/lib/date-utils";

const SHEET_ID = "1p0k2lDD3sdyQ-G2wLpJxDsDIrq-Qa3LH8-lruOCustI";
const RAW_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=Raw`;

type Cell = { v?: unknown; f?: string } | null;
type Row = { c: Cell[] };
type Col = { id: string; label: string };
type Gviz = { table: { cols: Col[]; rows: Row[] } };

function parseGviz(text: string): Gviz {
  const m = text.match(/setResponse\(([\s\S]*)\);?\s*$/);
  if (!m) throw new Error("Malformed gviz response");
  return JSON.parse(m[1]);
}

export async function fetchRawSheet(): Promise<Diecast[]> {
  const res = await fetch(`${RAW_URL}&_ts=${Date.now()}`, {
    cache: "no-store",
    credentials: "omit",
  });
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  const text = await res.text();
  const data = parseGviz(text);
  const idx: Record<string, number> = {};
  data.table.cols.forEach((c, i) => {
    idx[c.label] = i;
  });

  const names = (name: string | string[]) => (Array.isArray(name) ? name : [name]);
  const val = (r: Row, name: string | string[]): unknown => {
    for (const n of names(name)) {
      const i = idx[n];
      if (i == null) continue;
      const value = r.c[i]?.v ?? null;
      if (value !== null && value !== "") return value;
    }
    return null;
  };
  const fmt = (r: Row, name: string | string[]): string => {
    for (const n of names(name)) {
      const i = idx[n];
      if (i == null) continue;
      const c = r.c[i];
      if (!c) continue;
      if (c.f) return c.f;
      if (c.v != null && c.v !== "") return String(c.v);
    }
    return "";
  };
  const str = (r: Row, name: string | string[]): string => {
    const v = val(r, name);
    return v == null ? "" : String(v);
  };
  const num = (r: Row, name: string | string[]): number => {
    const v = val(r, name);
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const bool = (r: Row, name: string | string[]): boolean => {
    const v = val(r, name);
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
      const normalized = v.trim().toLowerCase();
      return [
        "true",
        "yes",
        "y",
        "1",
        "checked",
        "check",
        "x",
        "✓",
        "✔",
        "★",
        "star",
        "favourite",
        "favorite",
      ].includes(normalized);
    }
    return false;
  };

  const out: Diecast[] = [];
  for (const r of data.table.rows) {
    const id = str(r, "Car ID");
    if (!id) continue;
    const dateF = fmt(r, "Date");
    const make = str(r, "Make");
    const model = str(r, "Model");
    const variant = str(r, "Variant");
    const year = fmt(r, "Year");
    const type = str(r, "Type");
    const series = str(r, "Series");
    out.push({
      id,
      name: buildCarName({ make, model, variant, year, type, series }),
      make,
      model,
      variant,
      year,
      series,
      subSeries: str(r, "Sub Series"),
      carNumber: fmt(r, "Car Number"),
      colour: str(r, "Colour"),
      type,
      brand: str(r, "Brand"),
      assortment: str(r, "Assortment"),
      size: str(r, "Size"),
      spent: num(r, "Spent"),
      mrp: num(r, "MRP"),
      seller: str(r, "Seller"),
      status: str(r, "Status"),
      payment: str(r, "Payment"),
      paid: num(r, "Paid"),
      date: dateF,
      month: str(r, "Month"),
      orderDate: fmt(r, "O_Date"),
      orderMonth: str(r, "O_Month"),
      expectedDate:
        fmt(r, "Expected Date") ||
        monthEtaToDate(str(r, ["Transit Info / ETA", "Transit Info", "ETA"])) ||
        dateF,
      transitInfo: str(r, ["Transit Info / ETA", "Transit Info", "ETA"]),
      shippingId: str(r, "Shipping ID"),
      deliveryPartner: str(r, ["Delivery Partner", "Courier"]) || undefined,
      trackingId: str(r, ["Tracking ID", "AWB"]) || undefined,
      balance: num(r, "Balance"),
      chase: bool(r, "Chase"),
      favourite: bool(r, ["Favourite", "Favourites", "Favorite", "Favorites"]),
      official: bool(r, "Official"),
      open: bool(r, "Open"),
    });
  }
  return out;
}
