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

/** Parse DD/MM/YYYY into a Date, or null. */
export function parseDMY(s: string | undefined | null): Date | null {
  if (!s) return null;
  const parts = s.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map((p) => Number(p));
  if (!d || !m || !y) return null;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
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

/** "Apr 2011" -> year*12 + month */
export function monthKey(m: string): number | null {
  const parts = m?.split(" ");
  if (!parts || parts.length !== 2) return null;
  const mi = MONTH_ORDER.indexOf(parts[0] as (typeof MONTH_ORDER)[number]);
  const yr = Number(parts[1]);
  if (mi < 0 || !yr) return null;
  return yr * 12 + mi;
}

export function monthLabel(key: number): string {
  const yr = Math.floor(key / 12);
  const mi = key % 12;
  return `${MONTH_ORDER[mi]} ${yr}`;
}
