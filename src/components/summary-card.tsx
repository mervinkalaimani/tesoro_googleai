import type { ReactNode } from "react";

/**
 * The headline figure at the top of a page — one number, what it counts, and a
 * line of context under it.
 *
 * Lifted out of the pre-orders page so My Orders can carry the same three-card
 * band. Two pages describing the same kind of thing should not each invent
 * their own header.
 */
export function SummaryCard({
  label,
  value,
  sub,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  sub: string;
  icon: ReactNode;
  tone?: "default" | "emerald" | "amber" | "sky";
}) {
  const valueTone =
    tone === "emerald"
      ? "text-emerald-500"
      : tone === "amber"
        ? "text-amber-500"
        : tone === "sky"
          ? "text-sky-500"
          : "text-foreground";
  const subTone =
    tone === "emerald"
      ? "text-emerald-500/80"
      : tone === "amber"
        ? "text-amber-500/80"
        : tone === "sky"
          ? "text-sky-500/80"
          : "text-muted-foreground";

  return (
    <div className="card-elevated p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className={`text-display mt-1 text-2xl font-bold tabular-nums ${valueTone}`}>
        {value}
      </div>
      <div className={`mt-1 font-mono text-xs ${subTone}`}>{sub}</div>
    </div>
  );
}
