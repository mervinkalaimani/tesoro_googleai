import { useEffect, useRef, useState, type ReactNode } from "react";

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
  wide,
}: {
  title: ReactNode;
  /** One line on what the page is for. */
  subtitle?: ReactNode;
  /** Anything that belongs beside the heading rather than in the toolbar. */
  children?: ReactNode;
  /** Room for a fuller set of controls on a phone, at the title's expense. */
  wide?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 min-w-0 max-w-full">
      <div className="min-w-0 flex-1 overflow-hidden">
        {/* The size My Cars has always used. Every other page opened a step
            smaller, which read as My Cars being the important one. */}
        <h1 className="text-display truncate text-xl font-semibold tracking-tight sm:text-2xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground truncate block max-w-full">
            {subtitle}
          </p>
        )}
      </div>
      {children && (
        // gap-2: the actions used to sit edge to edge, which read as one long
        // segmented control rather than four separate buttons.
        <div
          className={`min-w-0 ${wide ? "max-w-[85%]" : "max-w-[62%]"} sm:max-w-none flex justify-end gap-2 shrink-0`}
        >
          {children}
        </div>
      )}
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
/** Height of the top bar (matching h-14 / 3.5rem), which is what a sticky toolbar sits underneath. */
export const TOP_BAR_PX = "3.5rem";

export function PageToolbar({
  left,
  right,
  below,
  className = "",
  sticky = false,
  oneLine = false,
  overlay,
}: {
  /**
   * Drawn over the whole band, clipped to it. A caller slides something in here to
   * stand in for the controls instead of opening a card over them.
   */
  overlay?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  /**
   * A second row inside the band, under the controls. It belongs here rather
   * than as a sticky element of its own: two sticky bands have to agree on how
   * tall the first one is, and a toolbar that wraps to three rows on a narrow
   * desktop made a liar of any offset the second one hardcoded — it sat on top
   * of the filters instead of under them.
   */
  below?: ReactNode;
  className?: string;
  /**
   * Pin below the top bar on long pages, on a translucent band. The controls
   * that decide what you are looking at should not be somewhere you have to
   * scroll back to — by the time you want to change the filter you are four
   * hundred rows past it.
   */
  sticky?: boolean;
  /**
   * Keep both halves on one row at every width. For a toolbar short enough to
   * fit a phone — two segments and a view toggle — where giving the left half
   * its own line only buys a second row of mostly empty space.
   */
  oneLine?: boolean;
}) {
  const inner = (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 ${
        overlay ? "relative overflow-hidden" : ""
      } ${className}`}
    >
      {overlay}
      {/* Full width on a phone, so a long segment control gets a line of its
          own to scroll along and the buttons drop beneath it rather than
          squeezing it into a corner. They share a line from md up — or at every
          width when the caller says the toolbar is short enough. */}
      <div
        className={`flex min-w-0 items-center gap-2 md:w-auto md:flex-1 md:flex-wrap ${
          oneLine ? "w-auto flex-1 flex-nowrap" : "w-full flex-wrap"
        }`}
      >
        {left}
      </div>
      {/* Content-width from md up, the full row below it — unless the caller
          says the toolbar is one line, in which case it stays content-width
          throughout and its contents are expected to be small enough to sit
          beside the left half on a phone.

          Held at shrink-0 at every width, a right half of several controls
          could not give any of them less room than they asked for, so the last
          one hung off the edge of a phone. */}
      <div
        className={`flex min-w-0 flex-wrap items-center gap-2 ${
          oneLine ? "shrink-0" : "max-md:w-full md:shrink-0"
        }`}
      >
        {right}
      </div>
    </div>
  );

  const body = below ? (
    <>
      {inner}
      {below}
    </>
  ) : (
    inner
  );

  if (!sticky) return body;

  return <StickyBand>{body}</StickyBand>;
}

/**
 * The band the toolbar sits in. It has no background of its own while it is
 * resting in the page, so the page shows through it; once it reaches the top bar
 * and starts riding over the content it takes a frosted background, so the rows
 * scrolling under it do not run into its controls.
 */
/** Tells the top bar that something is pinned under it, so it matches the band. */
let pinnedCount = 0;
export function usePinnedFlag(pinned: boolean) {
  useEffect(() => {
    if (!pinned) return;
    // Several bands can be pinned in turn; the flag stays while any of them is.
    pinnedCount++;
    document.documentElement.dataset.pinned = "1";
    return () => {
      if (--pinnedCount <= 0) delete document.documentElement.dataset.pinned;
    };
  }, [pinned]);
}

export function StickyBand({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  usePinnedFlag(pinned);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      // top-14 is where it sticks: pinned means it has reached that line.
      const r = el.getBoundingClientRect();
      // ...and still there: a band whose section has ended rides off with it, so it is not pinned.
      const room = (el.parentElement?.getBoundingClientRect().bottom ?? Infinity) - r.height;
      setPinned(r.top <= 56 + 1 && window.scrollY > 0 && room > 56 + 1);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);
  return (
    // The negative margins let the band reach the edges of the page's padding
    // rather than stopping where the content column does. z-30 keeps it over
    // table headers (z-10/20) and under the top bar (z-40).
    <div
      ref={ref}
      className={`sticky top-14 z-30 -mx-3 border-b px-3 py-2 transition-[background-color,border-color,backdrop-filter] duration-300 md:-mx-6 md:px-6 ${
        pinned ? "pin-band-on border-border/40" : "border-transparent bg-transparent"
      }`}
    >
      {children}
    </div>
  );
}

export { PageTopBar, TopBarChips } from "@/components/page-top-bar";
