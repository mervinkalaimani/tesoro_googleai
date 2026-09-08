import type { Diecast } from "./types";

const TEXT_FIELDS: (keyof Diecast)[] = [
  "name",
  "make",
  "model",
  "variant",
  "series",
  "subSeries",
  "brand",
  "assortment",
  "colour",
  "type",
  "seller",
  "status",
  "id",
  "size",
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
  assortment: "assortment",
  colour: "colour",
  color: "colour",
  type: "type",
  seller: "seller",
  status: "status",
  size: "size",
  id: "id",
  carnumber: "carNumber",
  "car number": "carNumber",
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

/** "ferrari+lamborghini" -> ["ferrari", "lamborghini"] (OR values). */
function splitOr(raw: string): string[] {
  return raw
    .split("+")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

export function parseQuery(q: string): QueryGroup[] {
  const groups: QueryGroup[] = [];
  let currentList: QueryGroup | null = null;

  for (const raw of q.split(",")) {
    const token = raw.trim();
    if (!token) continue;

    const m = token.match(/^([A-Za-z][A-Za-z\s_-]*?)\s*(>=|<=|!=|>|<|=|:)\s*(.+)$/);
    if (m) {
      const key = m[1].trim().toLowerCase();
      const field = FIELD_ALIASES[key] ?? FIELD_ALIASES[key.replace(/[\s_-]/g, "")];
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
    return g.values.some((token) => {
      if (/^\d{4}$/.test(token)) {
        const start = Math.floor(Number(token) / 10) * 10;
        const y = numOf(row.year);
        if (Number.isFinite(y) && y >= start && y <= start + 9) return true;
      }
      return TEXT_FIELDS.some((f) => {
        const v = row[f];
        return typeof v === "string" && v.toLowerCase().includes(token);
      });
    });
  }

  const value = row[g.field];

  if (g.op === "=" || g.op === "~") {
    if (NUMERIC_FIELDS.has(g.field)) {
      return g.values.some((v) => numOf(value) === numOf(v));
    }
    return g.values.some((v) =>
      String(value ?? "")
        .toLowerCase()
        .includes(v),
    );
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

export type Suggestion = { kind: "field" | "value"; label: string; insert: string; hint?: string };

/** Suggestions for the segment currently being typed (after the last comma). */
export function suggestFor(fragment: string, rows: Diecast[]): Suggestion[] {
  const frag = fragment.trim().toLowerCase();
  const afterPlus = frag.split("+").pop()!.trim();
  const eq = frag.match(/^([A-Za-z][A-Za-z\s_-]*?)\s*(?:=|:)\s*(.*)$/);

  if (eq) {
    const key = eq[1].trim().toLowerCase();
    const field = FIELD_ALIASES[key] ?? FIELD_ALIASES[key.replace(/[\s_-]/g, "")];
    if (!field) return [];
    const typed = eq[2].split("+").pop()!.trim().toLowerCase();
    const seen = new Map<string, number>();
    for (const r of rows) {
      const v = String(r[field] ?? "").trim();
      if (!v) continue;
      if (typed && !v.toLowerCase().includes(typed)) continue;
      seen.set(v, (seen.get(v) ?? 0) + 1);
    }
    return [...seen.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([v, n]) => ({ kind: "value" as const, label: v, insert: v, hint: `${n}` }));
  }

  const fields = SEARCH_FIELDS.filter((f) => !afterPlus || f.label.startsWith(afterPlus))
    .slice(0, 6)
    .map((f) => ({
      kind: "field" as const,
      label: `${f.label} = `,
      insert: `${f.label} = `,
      hint: "field",
    }));

  if (!afterPlus) return fields;

  const seen = new Map<string, number>();
  for (const r of rows) {
    for (const f of ["name", "brand", "make", "series", "seller", "colour"] as (keyof Diecast)[]) {
      const v = String(r[f] ?? "").trim();
      if (v && v.toLowerCase().includes(afterPlus)) seen.set(v, (seen.get(v) ?? 0) + 1);
    }
  }
  const values = [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([v, n]) => ({ kind: "value" as const, label: v, insert: v, hint: `${n}` }));

  return [...fields, ...values];
}
