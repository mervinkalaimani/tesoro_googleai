import type { ReactNode } from "react";

/**
 * The shape every page opens with, so that moving between them is moving
 * between the same page with different contents:
 *
 *   1. what this page is, and one line on what it is for
 *   2. the KPI band
 *   3. the segment control on the left, filter / sort / view on the right
 *   4. the body
 *
 * Each page used to arrange its own, which is why the heading sat above the
 * tiles on one page and below them on the next, and why the sort dropdown was
 * on the left here and the right there. None of that was a decision anyone
 * made — it was eight files drifting apart. These two components are the order
 * written down once.
 */

export function PageHeading({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  /** One line on what the page is for. */
  subtitle?: ReactNode;
  /** Anything that belongs beside the heading rather than in the toolbar. */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-display truncate text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/**
 * Filtering on one side, everything that changes how the list looks on the
 * other.
 *
 * The split is the point: the left decides *which* rows, the right decides how
 * they are shown. Mixing them is how a page ends up with a status filter
 * between the sort dropdown and the view toggle.
 */
export function PageToolbar({
  left,
  right,
  className = "",
}: {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 ${className}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{left}</div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div>
    </div>
  );
}
