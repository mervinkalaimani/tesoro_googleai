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
 * Turns a month-level ETA into a real date: "Mar 2027" -> "2027-03-01".
 *
 * Pre-orders were logged with the release month in the ETA note, because that is
 * all a seller ever commits to. Anything else — "Not Released", "Waiting for
 * Arrival to Ankush" — returns "" and is left alone.
 *
 * The 1st: picking "March 2027" in the form means the reminder should arrive as
 * that month opens, and the same rule has to read the months already written in
 * the ETA notes or a pre-order would move ten days when it was next edited. This
 * was the 10th, chosen so a card would not announce itself due the moment the
 * month turned over; being told at the start of the release window won out.
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
  return `${year}-${String(mi + 1).padStart(2, "0")}-01`;
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

const MONTH_LABELS = [
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
];

/**
 * The window a pre-order can be due in: this month and the next 23.
 *
 * One field rather than a month and a year, because they were never independent
 * — picking March and then 2027 is two taps to say one thing, and the pair let
 * you say March 2024, which no pre-order is due in. Each option is the 1st of
 * its month, which is the shape the column has always been kept in.
 *
 * `current` is whatever the row already says. A date outside the window — an
 * entry filed a year ago, or one dated further out than two years — is kept at
 * the front rather than silently dropped, so opening the form cannot change it.
 */
export function expectedByOptions(
  current = "",
  now = new Date(),
  count = 24,
): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
      label: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`,
    });
  }
  const held = expectedByValue(current);
  if (held && !out.some((o) => o.value === held)) {
    const [y, m] = held.split("-").map(Number);
    out.unshift({ value: held, label: `${MONTH_LABELS[m - 1]} ${y}` });
  }
  return out;
}

/** Any stored expected date as the 1st of its month, or "" if it is not one. */
export function expectedByValue(d?: string | null): string {
  const iso = toDateInputValue(d ?? "") || String(d ?? "").trim();
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  return m ? `${m[1]}-${m[2]}-01` : "";
}
