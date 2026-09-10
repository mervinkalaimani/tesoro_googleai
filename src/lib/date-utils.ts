/**
 * Date parsing and formatting utilities for car records and forms.
 */

/**
 * Converts any date representation (ISO YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, or Date string)
 * into standard HTML date input format "YYYY-MM-DD".
 */
export function toDateInputValue(d?: string | null): string {
  if (!d) return "";
  const s = d.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dm = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dm) {
    const day = dm[1].padStart(2, "0");
    const month = dm[2].padStart(2, "0");
    const year = dm[3];
    return `${year}-${month}-${day}`;
  }
  const dateObj = new Date(s);
  if (!isNaN(dateObj.getTime())) {
    return dateObj.toISOString().slice(0, 10);
  }
  return "";
}

const MONTH_NAMES = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/**
 * Turns a month-level ETA into a real date: "Mar 2027" -> "2027-03-10".
 *
 * Pre-orders were logged with the release month in the ETA note, because that is
 * all a seller ever commits to. Anything else — "Not Released", "Waiting for
 * Arrival to Ankush" — returns "" and is left alone.
 *
 * The 10th, rather than the 1st, so a card does not announce itself as due on
 * the day the month turns over while still landing inside the window promised.
 */
export function monthEtaToDate(text?: string | null): string {
  const s = (text || "").trim();
  if (!s) return "";
  const m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/);
  if (!m) return "";
  const mi = MONTH_NAMES.indexOf(m[1].slice(0, 3).toLowerCase());
  if (mi < 0) return "";
  const year = Number(m[2]);
  if (year < 1900 || year > 2100) return "";
  return `${year}-${String(mi + 1).padStart(2, "0")}-10`;
}

/**
 * Derives a human-friendly month string like "Jan 2025" from a date string.
 */
export function deriveMonth(d?: string | null): string {
  if (!d) return "";
  const iso = toDateInputValue(d);
  if (!iso) return "";
  const [year, month] = iso.split("-");
  const dateObj = new Date(Number(year), Number(month) - 1, 1);
  if (!isNaN(dateObj.getTime())) {
    return dateObj.toLocaleString("en-US", { month: "short", year: "numeric" });
  }
  return "";
}
