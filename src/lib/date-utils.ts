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
