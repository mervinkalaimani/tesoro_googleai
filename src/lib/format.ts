export function inr(n: number): string {
  if (!Number.isFinite(n)) return "₹0";
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}

export function inrFull(n: number): string {
  if (!Number.isFinite(n)) return "₹0";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

/**
 * Parse any currency string or number (e.g. '₹600.00', '₹1,000.00', ' 499.50 ', 150)
 * into a valid numeric value, returning 0 if empty or unparseable.
 */
export function parseCurrency(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  const str = String(val).trim();
  if (!str) return 0;
  const clean = str.replace(/[^0-9.-]/g, "");
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

/** Parse DD/MM/YYYY, YYYY-MM-DD, or ISO strings into a Date, or null. */
export function parseDMY(s: string | undefined | null): Date | null {
  if (!s || typeof s !== "string") return null;
  const clean = s.trim();
  if (!clean) return null;

  // 1. Try ISO YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = clean.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 2. Try DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmyMatch) {
    const d = Number(dmyMatch[1]);
    const m = Number(dmyMatch[2]);
    const y = Number(dmyMatch[3]);
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 3. Fallback to standard Date constructor
  const fallback = new Date(clean);
  return isNaN(fallback.getTime()) ? null : fallback;
}

export function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / 86400000);
}

export function relativeDay(dt: Date, now = new Date()): string {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const diff = Math.round((a.getTime() - b.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  return b.toLocaleDateString("en-GB");
}

export function formatDMY(dt: Date): string {
  return dt.toLocaleDateString("en-GB");
}

export function addDays(dt: Date, days: number): Date {
  const d = new Date(dt);
  d.setDate(d.getDate() + days);
  return d;
}

export const MONTH_ORDER = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Flexible month key converter:
 * Handles "Apr 2024", "April 2024", "2024-04-15", "15/04/2024", "2024-04" -> year * 12 + month
 */
export function monthKey(m: string | null | undefined): number | null {
  if (!m || typeof m !== "string") return null;
  const clean = m.trim();
  if (!clean) return null;

  // Pattern A: "Apr 2024" or "April 2024" or "Apr-2024"
  const parts = clean.split(/[\s-]+/);
  if (parts.length === 2) {
    const monthPrefix = parts[0].slice(0, 3).toLowerCase();
    const mi = MONTH_ORDER.findIndex((mo) => mo.toLowerCase() === monthPrefix);
    const yr = Number(parts[1]);
    if (mi >= 0 && yr >= 1900 && yr <= 2100) return yr * 12 + mi;

    // Or "2024 04" or "2024-04"
    const yrFirst = Number(parts[0]);
    const moSecond = Number(parts[1]);
    if (yrFirst >= 1900 && yrFirst <= 2100 && moSecond >= 1 && moSecond <= 12) {
      return yrFirst * 12 + (moSecond - 1);
    }
  }

  // Pattern B: ISO YYYY-MM-DD
  const isoMatch = clean.match(/^(\d{4})[/-](\d{1,2})/);
  if (isoMatch) {
    const yr = Number(isoMatch[1]);
    const mo = Number(isoMatch[2]);
    if (yr >= 1900 && yr <= 2100 && mo >= 1 && mo <= 12) {
      return yr * 12 + (mo - 1);
    }
  }

  // Pattern C: DD/MM/YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmyMatch) {
    const yr = Number(dmyMatch[3]);
    const mo = Number(dmyMatch[2]);
    if (yr >= 1900 && yr <= 2100 && mo >= 1 && mo <= 12) {
      return yr * 12 + (mo - 1);
    }
  }

  return null;
}

export function monthLabel(key: number): string {
  const yr = Math.floor(key / 12);
  const mi = key % 12;
  return `${MONTH_ORDER[mi]} ${yr}`;
}

/**
 * How the price paid compares with MRP, as a multiplier shown inline beside the
 * value — e.g. ₹330 paid against ₹150 MRP reads "^2.2x". Above MRP is a loss on
 * paper (red); below it is a win (green). Returns null when there is nothing
 * meaningful to compare.
 */
export function mrpRatio(spent: number, mrp: number): { text: string; over: boolean } | null {
  if (!mrp || !spent) return null;
  const ratio = spent / mrp;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;

  const rounded = Number(ratio.toFixed(1));
  // A multiplier of 1.0x is effectively at MRP: show the price on its own.
  if (rounded === 1) return null;

  return { text: `${rounded.toFixed(1)}x`, over: rounded > 1 };
}

/** "Apr 2025" -> "Apr 25", for axis ticks where the full year does not fit. */
export function shortMonthLabel(label: string): string {
  const [mon, yr] = label.split(" ");
  if (!mon || !yr) return label;
  return `${mon} ${yr.slice(-2)}`;
}
