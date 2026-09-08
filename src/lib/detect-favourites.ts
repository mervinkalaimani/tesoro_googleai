const SHEET_ID = "1p0k2lDD3sdyQ-G2wLpJxDsDIrq-Qa3LH8-lruOCustI";
const RAW_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=Raw`;

// Common boolean spellings considered TRUE
export const TRUE_SPELLINGS = [
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
  "fav",
  "t",
  "on",
];

export type FavouriteDetection = {
  totalRows: number;
  columnsScanned: string[];
  perColumn: Record<string, { trueCount: number; sampleValues: string[] }>;
  totalTrueRows: number; // union across favourite-like columns
  spellingsMatched: string[];
  hasAny: boolean;
  fetchedAt: number;
};

type Cell = { v?: unknown; f?: string } | null;
type Row = { c: Cell[] };
type Col = { id: string; label: string };
type Gviz = { table: { cols: Col[]; rows: Row[] } };

function parseGviz(text: string): Gviz {
  const m = text.match(/setResponse\(([\s\S]*)\);?\s*$/);
  if (!m) throw new Error("Malformed gviz response");
  return JSON.parse(m[1]);
}

function isTrueLike(v: unknown): { truthy: boolean; matched?: string } {
  if (v === true) return { truthy: true, matched: "true" };
  if (typeof v === "number")
    return v !== 0 ? { truthy: true, matched: String(v) } : { truthy: false };
  if (typeof v === "string") {
    const n = v.trim().toLowerCase();
    if (!n) return { truthy: false };
    if (TRUE_SPELLINGS.includes(n)) return { truthy: true, matched: n };
  }
  return { truthy: false };
}

export async function detectFavourites(): Promise<FavouriteDetection> {
  const res = await fetch(`${RAW_URL}&_ts=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  const data = parseGviz(await res.text());

  const favLikeIdx: { label: string; index: number }[] = [];
  data.table.cols.forEach((c, i) => {
    const label = (c.label || "").trim();
    if (/fav/i.test(label)) favLikeIdx.push({ label, index: i });
  });

  const perColumn: FavouriteDetection["perColumn"] = {};
  const spellings = new Set<string>();
  let unionTrue = 0;

  for (const row of data.table.rows) {
    let rowIsTrue = false;
    for (const { label, index } of favLikeIdx) {
      const cell = row.c[index];
      const raw = cell?.v ?? null;
      const { truthy, matched } = isTrueLike(raw);
      if (!perColumn[label]) perColumn[label] = { trueCount: 0, sampleValues: [] };
      if (truthy) {
        perColumn[label].trueCount += 1;
        if (matched) spellings.add(matched);
        rowIsTrue = true;
      } else if (raw != null && raw !== "" && perColumn[label].sampleValues.length < 5) {
        const s = String(raw);
        if (!perColumn[label].sampleValues.includes(s)) perColumn[label].sampleValues.push(s);
      }
    }
    if (rowIsTrue) unionTrue += 1;
  }

  return {
    totalRows: data.table.rows.length,
    columnsScanned: favLikeIdx.map((c) => c.label),
    perColumn,
    totalTrueRows: unionTrue,
    spellingsMatched: Array.from(spellings),
    hasAny: unionTrue > 0,
    fetchedAt: Date.now(),
  };
}
