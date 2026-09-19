import type { Diecast } from "./types";
import { normaliseRarity, rarityOf } from "./rarity";

const TEXT_FIELDS: (keyof Diecast)[] = [
  "name",
  "make",
  "model",
  "variant",
  "series",
  "subSeries",
  "carNumber",
  "caseNumber",
  "brand",
  "assortment",
  "colour",
  "type",
  "seller",
  "status",
  "id",
  "size",
  "shippingId",
  "transitInfo",
  "deliveryPartner",
  "trackingId",
];

/** Map user-typed column names to Diecast keys. */
const FIELD_ALIASES: Record<string, keyof Diecast> = {
  name: "name",
  car: "name",
  model: "model",
  make: "make",
  maker: "make",
  manufacturer: "brand",
  brand: "brand",
  variant: "variant",
  series: "series",
  subseries: "subSeries",
  "sub series": "subSeries",
  "sub-series": "subSeries",
  sub_series: "subSeries",
  carnumber: "carNumber",
  "car number": "carNumber",
  "car-number": "carNumber",
  car_number: "carNumber",
  "car #": "carNumber",
  "car#": "carNumber",
  "car no": "carNumber",
  "car no.": "carNumber",
  carno: "carNumber",
  car_no: "carNumber",
  "#": "carNumber",
  no: "carNumber",
  number: "carNumber",
  num: "carNumber",
  casenumber: "caseNumber",
  "case number": "caseNumber",
  "case no": "caseNumber",
  case: "caseNumber",
  mix: "caseNumber",
  assortment: "assortment",
  colour: "colour",
  color: "colour",
  type: "type",
  seller: "seller",
  status: "status",
  size: "size",
  id: "id",
  year: "year",
  cost: "spent",
  spent: "spent",
  price: "spent",
  mrp: "mrp",
  paid: "paid",
  payment: "payment",
  date: "date",
  "order date": "orderDate",
  transit: "transitInfo",
  "transit info": "transitInfo",
  "expected date": "expectedDate",
  expected: "expectedDate",
  courier: "deliveryPartner",
  carrier: "deliveryPartner",
  partner: "deliveryPartner",
  "delivery partner": "deliveryPartner",
  tracking: "trackingId",
  "tracking id": "trackingId",
  awb: "trackingId",
  rarity: "rarity",
};

/**
 * Words that search a car's marks rather than its text: "fav" finds favourites,
 * "chase", "th" and "sth" find that rarity exactly — as free text, "th" would
 * match every "Smith" and "STH" would be counted as a TH.
 */
const MARK_WORDS: Record<string, (r: Diecast) => boolean> = {
  fav: (r) => Boolean(r.favourite),
  favs: (r) => Boolean(r.favourite),
  favourite: (r) => Boolean(r.favourite),
  favourites: (r) => Boolean(r.favourite),
  favorite: (r) => Boolean(r.favourite),
  favorites: (r) => Boolean(r.favourite),
  chase: (r) => rarityOf(r) === "Chase",
  chases: (r) => rarityOf(r) === "Chase",
  th: (r) => rarityOf(r) === "TH",
  "treasure hunt": (r) => rarityOf(r) === "TH",
  sth: (r) => rarityOf(r) === "STH",
  "super treasure hunt": (r) => rarityOf(r) === "STH",
};

const NUMERIC_FIELDS = new Set<keyof Diecast>(["spent", "mrp", "paid", "year"]);

type Op = ">" | "<" | ">=" | "<=" | "=" | "~";

export type QueryGroup = {
  field: keyof Diecast | null;
  op: Op;
  values: string[];
};

const numOf = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** "ferrari+lamborghini" -> ["ferrari", "lamborghini"] (OR values). */
function splitOr(raw: string): string[] {
  return raw
    .split("+")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

export function parseQuery(q: string): QueryGroup[] {
  if (typeof q !== "string" || !q.trim()) return [];
  const groups: QueryGroup[] = [];
  let currentList: QueryGroup | null = null;

  for (const raw of q.split(",")) {
    const token = raw.trim();
    if (!token) continue;

    const m = token.match(/^([A-Za-z#][A-Za-z0-9\s_#.-]*?)\s*(>=|<=|!=|>|<|=|:)\s*(.+)$/);
    if (m) {
      const key = m[1].trim().toLowerCase();
      const field = FIELD_ALIASES[key] ?? FIELD_ALIASES[key.replace(/[\s_#.-]/g, "")];
      if (field) {
        const op = (m[2] === ":" ? "=" : m[2]) as Op;
        const g: QueryGroup = { field, op, values: splitOr(m[3]) };
        groups.push(g);
        currentList = op === "=" ? g : null;
        continue;
      }
    }

    // A bare operator like "> 500" continues the previous numeric field
    const bareOp = token.match(/^(>=|<=|>|<)\s*(.+)$/);
    if (bareOp && groups.length && groups[groups.length - 1].field) {
      groups.push({
        field: groups[groups.length - 1].field,
        op: bareOp[1] as Op,
        values: [bareOp[2].trim().toLowerCase()],
      });
      currentList = null;
      continue;
    }

    if (currentList) {
      // OR-value for the active "field = a, b, c" list
      currentList.values.push(...splitOr(token));
      continue;
    }

    groups.push({ field: null, op: "~", values: splitOr(token) });
  }

  return groups;
}

function matchesGroup(row: Diecast, g: QueryGroup): boolean {
  // Free text token across all fields
  if (!g.field) {
    const fullText = TEXT_FIELDS.map((f) => String(row[f] ?? ""))
      .join(" ")
      .toLowerCase();
    const fullClean = clean(fullText);

    return g.values.some((token) => {
      const mark = MARK_WORDS[token.replace(/\s+/g, " ")];
      if (mark) return mark(row);

      if (/^\d{4}$/.test(token)) {
        const start = Math.floor(Number(token) / 10) * 10;
        const y = numOf(row.year);
        if (Number.isFinite(y) && y >= start && y <= start + 9) return true;
      }

      const tokenClean = clean(token);

      if (fullText.includes(token)) return true;
      if (tokenClean && fullClean.includes(tokenClean)) return true;

      if (
        TEXT_FIELDS.some((f) => {
          const v = String(row[f] ?? "").toLowerCase();
          return v.includes(token) || (tokenClean && clean(v).includes(tokenClean));
        })
      ) {
        return true;
      }

      const words = token.split(/\s+/).filter(Boolean);
      if (words.length > 1) {
        const allWords = words.every((w) => {
          const wClean = clean(w);
          return fullText.includes(w) || (wClean && fullClean.includes(wClean));
        });
        if (allWords) return true;
      }

      return false;
    });
  }

  const value = row[g.field];

  // Rarity compares whole values, so "th" is never satisfied by "STH".
  if (g.field === "rarity") {
    return g.values.some((v) => normaliseRarity(v) === rarityOf(row));
  }
  if (g.op === "=" || g.op === "~") {
    if (NUMERIC_FIELDS.has(g.field)) {
      return g.values.some((v) => numOf(value) === numOf(v));
    }
    const valStr = String(value ?? "").toLowerCase();
    const valClean = clean(valStr);
    return g.values.some((v) => {
      const vClean = clean(v);
      return valStr.includes(v) || (vClean && valClean.includes(vClean));
    });
  }

  const target = numOf(g.values[0]);
  const actual = numOf(value);
  if (!Number.isFinite(actual) || !Number.isFinite(target)) return false;
  switch (g.op) {
    case ">":
      return actual > target;
    case "<":
      return actual < target;
    case ">=":
      return actual >= target;
    case "<=":
      return actual <= target;
    default:
      return false;
  }
}

export function matchesQuery(row: Diecast, groups: QueryGroup[]): boolean {
  return groups.every((g) => matchesGroup(row, g));
}

export function filterRows(rows: Diecast[], query: string): Diecast[] {
  const groups = parseQuery(query);
  if (!groups.length) return rows;
  return rows.filter((r) => matchesQuery(r, groups));
}

/** Kept for backwards compatibility with older callers. */
export function tokenize(q: string): string[] {
  if (typeof q !== "string" || !q.trim()) return [];
  return q
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Field names offered as search suggestions, in display order. */
export const SEARCH_FIELDS: { label: string; field: keyof Diecast }[] = [
  { label: "name", field: "name" },
  { label: "make", field: "make" },
  { label: "model", field: "model" },
  { label: "variant", field: "variant" },
  { label: "brand", field: "brand" },
  { label: "series", field: "series" },
  { label: "sub series", field: "subSeries" },
  { label: "car #", field: "carNumber" },
  { label: "car number", field: "carNumber" },
  { label: "case", field: "caseNumber" },
  { label: "assortment", field: "assortment" },
  { label: "colour", field: "colour" },
  { label: "type", field: "type" },
  { label: "size", field: "size" },
  { label: "seller", field: "seller" },
  { label: "status", field: "status" },
  { label: "payment", field: "payment" },
  { label: "year", field: "year" },
  { label: "cost", field: "spent" },
  { label: "mrp", field: "mrp" },
  { label: "paid", field: "paid" },
];

const MARK_SUGGESTIONS = [
  { label: "Favourites", insert: "fav", words: ["favourites", "favorites", "fav"] },
  { label: "Chase", insert: "chase", words: ["chase"] },
  { label: "TH · Treasure Hunt", insert: "th", words: ["th", "treasure hunt"] },
  { label: "STH · Super Treasure Hunt", insert: "sth", words: ["sth", "super treasure hunt"] },
];

/** Fields free text is offered back as, in the order their groups appear. */
const CATEGORY_FIELDS: { title: string; label: string; field: keyof Diecast }[] = [
  { title: "Brand", label: "brand", field: "brand" },
  { title: "Make", label: "make", field: "make" },
  { title: "Model", label: "model", field: "model" },
  { title: "Series", label: "series", field: "series" },
  { title: "Sub series", label: "sub series", field: "subSeries" },
  { title: "Car #", label: "car #", field: "carNumber" },
  { title: "Case", label: "case", field: "caseNumber" },
  { title: "Colour", label: "colour", field: "colour" },
  { title: "Type", label: "type", field: "type" },
  { title: "Assortment", label: "assortment", field: "assortment" },
  { title: "Seller", label: "seller", field: "seller" },
  { title: "Status", label: "status", field: "status" },
];

export type SuggestionGroup = {
  title: string;
  items: { value: string; count: number; query: string }[];
};

/** Values of `field` containing `typed`, most common first. */
function valuesOf(rows: Diecast[], field: keyof Diecast, typed: string, limit: number) {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const v = String(r[field] ?? "").trim();
    if (!v || (typed && !v.toLowerCase().includes(typed))) continue;
    seen.set(v, (seen.get(v) ?? 0) + 1);
  }
  return [...seen.entries()]
    .sort((a, b) => {
      // A value that starts with what was typed beats one that merely contains it.
      const pa = a[0].toLowerCase().startsWith(typed) ? 1 : 0;
      const pb = b[0].toLowerCase().startsWith(typed) ? 1 : 0;
      return pb - pa || b[1] - a[1];
    })
    .slice(0, limit);
}

/**
 * Suggestions for the search page, grouped by what the value is. Each item
 * carries the whole query it would produce, so picking one needs no parsing.
 *
 * Field names are never offered as suggestions themselves — the syntax is
 * explained as a tip instead, and typing it narrows the values to that field.
 */
export function groupedSuggestions(query: string, rows: Diecast[]): SuggestionGroup[] {
  const comma = query.lastIndexOf(",");
  const head = comma >= 0 ? query.slice(0, comma + 1) + " " : "";
  const segment = comma >= 0 ? query.slice(comma + 1) : query;
  // Suggest only from what the filters before this one already leave.
  const pool = head.trim() ? filterRows(rows, head) : rows;

  const eq = segment.match(/^\s*([A-Za-z#][A-Za-z0-9\s_#.-]*?)\s*(=|:)\s*(.*)$/);
  if (eq) {
    const key = eq[1].trim().toLowerCase();
    const field = FIELD_ALIASES[key] ?? FIELD_ALIASES[key.replace(/[\s_#.-]/g, "")];
    if (!field || NUMERIC_FIELDS.has(field)) return [];
    const rest = eq[3];
    const plus = rest.lastIndexOf("+");
    const kept = plus >= 0 ? rest.slice(0, plus + 1) : "";
    const typed = rest
      .slice(plus + 1)
      .trim()
      .toLowerCase();
    const title =
      CATEGORY_FIELDS.find((c) => c.field === field)?.title ??
      SEARCH_FIELDS.find((f) => f.field === field)?.label ??
      String(field);
    const items = valuesOf(pool, field, typed, 12).map(([value, count]) => ({
      value,
      count,
      query: `${head}${eq[1].trim()} = ${kept}${value}`,
    }));
    return items.length ? [{ title, items }] : [];
  }

  const typed = segment.split("+").pop()!.trim().toLowerCase();
  // Operators and single characters say too little to suggest anything from.
  if (typed.length < 2 || /[<>]/.test(segment)) return [];

  const values = CATEGORY_FIELDS.map(({ title, label, field }) => ({
    title,
    items: valuesOf(pool, field, typed, 4).map(([value, count]) => ({
      value,
      count,
      query: `${head}${label} = ${value}`,
    })),
  }));

  // Favourites and the rarities, offered by any of the words that search them.
  const marks = MARK_SUGGESTIONS.filter((m) => m.words.some((w) => w.startsWith(typed)))
    .map((m) => ({
      value: m.label,
      count: pool.filter(MARK_WORDS[m.insert]).length,
      query: `${head}${m.insert}`,
    }))
    .filter((m) => m.count > 0);

  return [{ title: "Marks", items: marks }, ...values].filter((g) => g.items.length > 0);
}
