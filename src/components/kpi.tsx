import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

/**
 * Where tile `i` of `total` sits on the phone's six-column grid.
 *
 * Three to a row while there is a full row left; the one or two that remain
 * share the last row between them, so a set of five or seven fills its space
 * instead of leaving a tile-shaped hole at the bottom.
 */
export function bentoSpan(i: number, total: number): string {
  const fullRows = Math.floor(total / 3) * 3;
  if (i < fullRows) return "col-span-2";
  const rest = total - fullRows;
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
        "grid grid-cols-6 gap-1.5 pb-1 md:flex md:gap-3 md:snap-x md:overflow-x-auto md:[&>*]:min-w-[9.5rem] md:[&>*]:flex-1",
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
  className,
}: {
  label: string;
  value: ReactNode;
  /** Context line. Hidden on a phone, where there is no room for it. */
  sub?: string;
  icon: ReactNode;
  /** Colours the icon chip. */
  tone?: string;
  /** Colours the number itself — for money that is owed, gained or spent. */
  valueTone?: string;
  /** Status this tile represents; tapping opens inventory filtered to it. */
  status?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground md:gap-2 md:text-xs">
        <span
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded md:size-6 md:rounded-md",
            TONE_CHIP[tone] ?? "bg-muted",
          )}
        >
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          "text-display mt-0.5 truncate text-lg font-semibold leading-tight tabular-nums md:mt-2 md:text-2xl",
          valueTone ? TONE_VALUE[valueTone] : undefined,
        )}
      >
        {value}
      </div>
      {sub && (
        <div
          className={cn(
            "mt-1 hidden truncate font-mono text-xs md:block",
            valueTone ? cn(TONE_VALUE[valueTone], "opacity-80") : "text-muted-foreground",
          )}
        >
          {sub}
        </div>
      )}
    </>
  );

  const shell = cn(
    "card-elevated flex min-w-0 flex-col overflow-hidden p-2 text-left md:p-4",
    className,
  );

  if (!status) return <div className={shell}>{body}</div>;

  return (
    <Link
      to="/inventory"
      search={{ status }}
      className={cn(shell, "transition-colors hover:border-primary/40 hover:bg-muted/40")}
      title={`Show ${label.toLowerCase()} cars in inventory`}
    >
      {body}
    </Link>
  );
}
