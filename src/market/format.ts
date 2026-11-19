const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Paise -> "₹1,299" (or "₹1,299.50" when there are paise). */
export function rupees(paise: number): string {
  const whole = paise / 100;
  return Number.isInteger(whole)
    ? `₹${inr.format(whole)}`
    : `₹${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(whole)}`;
}

/** Rupee text typed by a person -> integer paise, or null when it isn't a price. */
export function toPaise(text: string): number | null {
  const n = Number(text.replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function discountPct(mrp: number | null, price: number): number {
  return mrp && mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
}

/** Local time, with the zone named: deadlines are meaningless without it. */
export function dateTime(ms: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(ms);
}

export function dateOnly(ms: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(ms);
}

/** "2d 4h", "35m", "ended". */
export function timeLeft(endsAt: number, now: number): string {
  const s = Math.floor((endsAt - now) / 1000);
  if (s <= 0) return "Ended";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return m ? `${m}m` : "<1m";
}

/** What the buyer sees: the backend says `shipped`, the buyer reads "In transit". */
export const ORDER_LABEL = {
  processing: "Processing",
  shipped: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
} as const;
