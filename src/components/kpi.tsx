import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

/**
 * Where tile `i` of `total` sits on the phone's six-column grid.
 *
 * Three to a row, and the one or two tiles that cannot make a full row take the
 * extra width at the *front* rather than the back. Seven tiles put the first
 * across the whole width and then two rows of three; five give the first two
 * half a row each and then a row of three. Either way the grid fills with no
 * tile-shaped hole at the bottom, and the widest tile is never the last one.
 *
 * Which matters because the first two tiles are In hand and In transit: what
 * you have and what is coming. The old rule handed the spare width to whatever
 * happened to be at the end of the list, so a set of five drew Late wider than
 * either of them.
 */
export function bentoSpan(i: number, total: number): string {
  const rest = total % 3;
  // A lone leftover would run the full width; four-or-more makes it two rows of
  // half-width pairs instead, and the rest go three to a row.
  if (rest === 1 && total >= 4) return i < 4 ? "col-span-3" : "col-span-2";
  if (rest === 0 || i >= rest) return "col-span-2";
  return rest === 1 ? "col-span-6" : "col-span-3";
}

/**
 * The band of numbers a page opens with.
 *
 * Three small tiles a row on a phone and a single scrollable line from md: up.
 * The span each tile gets is worked out here rather than passed in, because it
 * depends on how many tiles there are — which the caller would otherwise have to
 * count for itself on every page.
 */
export function KpiBand({ children, className }: { children: ReactNode; className?: string }) {
  const items = Children.toArray(children).filter(isValidElement) as ReactElement<{
    className?: string;
  }>[];

  return (
    <section
      className={cn(
        // On desktop the row scrolls sideways, which clips what pokes out of it: padded out and pulled
        // back in so each tile's shadow has room before the scroll edge.
        "grid grid-cols-6 gap-1.5 pb-1 md:no-scrollbar md:-mx-4 md:-mt-8 md:mb-3 md:flex md:snap-x md:scroll-px-4 md:gap-3 md:overflow-x-auto md:px-4 md:py-8 md:[&>*]:min-w-[9.5rem] md:[&>*]:flex-1",
        className,
      )}
    >
      {items.map((child, i) =>
        cloneElement(child, {
          className: cn(bentoSpan(i, items.length), child.props.className),
        }),
      )}
    </section>
  );
}

const TONE_CHIP: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-500",
  amber: "bg-amber-500/15 text-amber-500",
  violet: "bg-violet-500/15 text-violet-500",
  sky: "bg-sky-500/15 text-sky-500",
  blue: "bg-blue-500/15 text-blue-500",
  orange: "bg-orange-500/15 text-orange-500",
  rose: "bg-rose-500/15 text-rose-500",
  zinc: "bg-zinc-500/20 text-zinc-500",
  primary: "bg-primary/15 text-primary",
};

const TONE_VALUE: Record<string, string> = {
  emerald: "text-emerald-500",
  amber: "text-amber-500",
  rose: "text-rose-500",
  sky: "text-sky-500",
};

/**
 * One figure: what it is, what it counts, and on wider screens a line of
 * context under it. Every page uses this one — the dashboard, orders,
 * pre-orders, favourites and habits each had their own before, which is why
 * they were four different sizes on a phone.
 */
export function KpiTile({
  label,
  value,
  sub,
  icon,
  tone = "primary",
  valueTone,
  status,
  ordersTab,
  to,
  action,
  className,
  subVisibleOnMobile = false,
}: {
  label: string;
  value: ReactNode;
  /** Context line. Hidden on a phone by default, where there is no room for it. */
  sub?: string;
  /** Left out for a tile that is just a label and a number. */
  icon?: ReactNode;
  /** Colours the icon chip. */
  tone?: string;
  /** Colours the number itself — for money that is owed, gained or spent. */
  valueTone?: string;
  /** Status this tile represents; tapping opens inventory filtered to it. */
  status?: string;
  /**
   * A segment of My Orders instead, for a tile that is not a status: Late is
   * worked out from the expected date, so the inventory has no filter for it.
   */
  ordersTab?: "late";
  /** A page to open, for a tile that is not one status. */
  to?: "/inventory" | "/orders";
  /** A small control at the end of the header line. */
  action?: ReactNode;
  className?: string;
  subVisibleOnMobile?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground md:gap-2 md:text-xs">
        {icon ? (
          <span
            className={cn(
              "grid size-5 shrink-0 place-items-center md:size-6",
              // One accent, no chip: the bare icon in the brand colour. Colour is
              // kept for the number itself when it carries meaning.
              "text-primary",
            )}
          >
            {icon}
          </span>
        ) : null}
        <span data-kpi-label className="truncate">
          {label}
        </span>
        {action ? <span className="ml-auto shrink-0">{action}</span> : null}
      </div>
      {/* The label stays at the top of every tile, so the titles line up across a row; the number and
          its line share out whatever height is left under it. */}
      <div className="flex flex-1 flex-col justify-center">
        <div
          className={cn(
            "text-display mt-1 truncate text-xl font-semibold leading-none tabular-nums md:mt-2 md:text-2xl",
            valueTone ? TONE_VALUE[valueTone] : undefined,
          )}
        >
          {value}
        </div>
        {sub && (
          <div
            data-kpi-sub
            className={cn(
              "mt-1 truncate font-mono text-xs",
              subVisibleOnMobile ? "block" : "hidden md:block",
              valueTone ? cn(TONE_VALUE[valueTone], "opacity-80") : "text-muted-foreground",
            )}
          >
            {sub}
          </div>
        )}
      </div>
    </>
  );

  const shell = cn(
    "card-elevated flex min-w-0 flex-col overflow-hidden p-3.5 text-left md:p-4",
    className,
  );

  // Late is not a status, so there is no filtered inventory to send it to — the
  // Late segment of My Orders is where those cars are listed, and a tile you
  // cannot click is a number you cannot act on.
  if (ordersTab) {
    return (
      <Link
        to="/orders"
        search={{ tab: ordersTab }}
        className={cn(
          shell,
          "transition-all hover:border-primary/40 hover:bg-primary/[0.06] active:scale-[0.98]",
        )}
        title={`Show ${label.toLowerCase()} orders`}
      >
        {body}
      </Link>
    );
  }

  if (!status && to) {
    return (
      <Link
        to={to}
        className={cn(
          shell,
          "transition-all hover:border-primary/40 hover:bg-primary/[0.06] active:scale-[0.98]",
        )}
        title={`Open ${label.toLowerCase()}`}
      >
        {body}
      </Link>
    );
  }

  if (!status) return <div className={shell}>{body}</div>;

  return (
    <Link
      to="/inventory"
      search={{ status }}
      className={cn(
        shell,
        "transition-all hover:border-primary/40 hover:bg-primary/[0.06] active:scale-[0.98]",
      )}
      title={`Show ${label.toLowerCase()} cars in inventory`}
    >
      {body}
    </Link>
  );
}
