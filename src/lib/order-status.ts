import { normaliseStatus } from "@/lib/status";

/** Colour the status pill by what the shipment is actually doing. */
export function statusTone(status: string, delivered: boolean): string {
  if (delivered) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-400";
  if (normaliseStatus(status) === "In Transit")
    return "border-blue-500/40 bg-blue-500/10 text-blue-400";
  return "border-amber-500/40 bg-amber-500/10 text-amber-400";
}

export function statusLabel(status: string, delivered: boolean): string {
  if (delivered) return "Delivered";
  return normaliseStatus(status) || status;
}
