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
/** Height of the top bar, which is what a sticky toolbar sits underneath. */
export const TOP_BAR_PX = 56;

export function PageToolbar({
  left,
  right,
  className = "",
  sticky = false,
}: {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
  /**
   * Pin below the top bar on long pages, on a translucent band. The controls
   * that decide what you are looking at should not be somewhere you have to
   * scroll back to — by the time you want to change the filter you are four
   * hundred rows past it.
   */
  sticky?: boolean;
}) {
  const inner = (
    <div className={`flex flex-wrap items-center justify-between gap-2 ${className}`}>
      {/* Full width on a phone, so a long segment control gets a line of its
          own to scroll along and the buttons drop beneath it rather than
          squeezing it into a corner. They share a line from md up. */}
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto md:flex-1">
        {left}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div>
    </div>
  );

  if (!sticky) return inner;

  return (
    // The negative margins let the band reach the edges of the page's padding
    // rather than stopping where the content column does — a translucent strip
    // with a gap either side reads as a floating box, not as part of the
    // chrome. z-10 keeps it under the top bar, which owns z-20.
    <div
      className="sticky z-10 -mx-3 border-b border-border/60 bg-background/80 px-3 py-2 backdrop-blur-xl md:-mx-6 md:px-6"
      style={{ top: TOP_BAR_PX }}
    >
      {inner}
    </div>
  );
}
