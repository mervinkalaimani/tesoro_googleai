/**
 * The status of a car, as a pill.
 *
 * Its own module rather than a member of cars-table: the details drawer shows
 * one beside the car's name, and cars-table imports the drawer, so importing it
 * from there would close a cycle between the two.
 */
const STATUS_STYLES: Record<string, string> = {
  available: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
  transit: "bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30",
  "out for delivery": "bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30",
  waiting: "bg-orange-500/15 text-orange-600 dark:text-orange-300 border-orange-500/30",
  delayed: "bg-red-500/15 text-red-600 dark:text-red-300 border-red-500/30",
  "pre order": "bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30",
  preorder: "bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30",
  iso: "bg-zinc-500/20 text-zinc-600 dark:text-zinc-300 border-zinc-500/30",
};

export function StatusPill({ status, className = "" }: { status: string; className?: string }) {
  const key = (status || "").trim().toLowerCase();
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs ${
        STATUS_STYLES[key] ?? "border-border bg-muted/40 text-muted-foreground"
      } ${className}`}
    >
      {status || "—"}
    </span>
  );
}
