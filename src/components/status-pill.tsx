import { normaliseStatus, styleFor, LATE_STYLE } from "@/lib/status";

/**
 * The status of a car, as a pill.
 *
 * Its own module rather than a member of cars-table: the details drawer shows
 * one beside the car's name, and cars-table imports the drawer, so importing it
 * from there would close a cycle between the two.
 *
 * What it prints is the *normalised* status, so a row still carrying an old
 * spelling reads "In Hand" rather than "Available" — the list, the filter and
 * the pill then agree even before the migration has run.
 */
export function StatusPill({ status, className = "" }: { status: string; className?: string }) {
  const label = normaliseStatus(status);
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs ${styleFor(status)} ${className}`}
    >
      {label || "—"}
    </span>
  );
}

/**
 * Late is not a status, so it is a mark of its own that sits beside one.
 *
 * Nothing stores it: a car is late when it is Ordered or In Transit and the day
 * it was expected has gone by, which `isLate` in delivery-watch works out from
 * the date every time it is asked.
 */
export function LatePill({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs ${LATE_STYLE} ${className}`}
      title="Expected before today and not here yet"
    >
      Late
    </span>
  );
}
