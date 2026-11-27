import { normaliseStatus } from "@/lib/status";

/** Colour the status pill by what the shipment is actually doing. */
export function statusTone(status: string, delivered: boolean): string {
  if (delivered)
    return "border-emerald-600/50 bg-emerald-500/15 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400";
  if (normaliseStatus(status) === "In Transit")
    return "border-blue-600/50 bg-blue-500/15 text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-400";
  return "border-amber-600/50 bg-amber-500/20 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400";
}

export function statusLabel(status: string, delivered: boolean): string {
  if (delivered) return "Delivered";
  return normaliseStatus(status) || status;
}
