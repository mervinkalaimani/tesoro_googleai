/**
 * A list of groups, as one table.
 *
 * Collection, Duplicates and Sellers are all the same shape: a heading that
 * counts something, and the cars it counted. They were each a stack of cards,
 * and a page of cards is a page you scroll rather than scan — fifteen groups
 * became fifteen screens. The seller dialog already answered this: one table,
 * one row per group, opening in place to the cars inside it.
 *
 * The pages keep their own columns, because what a series is worth and what a
 * duplicate is worth are different questions. All this holds is the frame, the
 * chevron, and the two row shapes.
 */
import { CarThumb } from "@/components/car-thumb";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { StatusPill } from "@/components/status-pill";
import { carSubLine } from "@/lib/car-subline";
import { cn } from "@/lib/utils";
import type { Diecast } from "@/lib/types";

export function GroupTable({
  head,
  children,
  minWidth = "min-w-[40rem]",
  headClassName,
}: {
  /** The `<th>` cells, in order. */
  head: ReactNode;
  children: ReactNode;
  /** Below this the table scrolls sideways rather than crushing its columns. */
  minWidth?: string;
  /** Extra classes for the header row — `max-md:hidden` drops it on a phone. */
  headClassName?: string;
}) {
  return (
    <div className="card-elevated overflow-x-auto">
      <table className={cn("w-full text-sm", minWidth)}>
        <thead
          className={cn(
            "bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground",
            headClassName,
          )}
        >
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** A header cell, so three pages do not each spell out the same padding. */
export function Th({
  children,
  align = "left",
  className,
}: {
  children?: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-3 py-2 font-medium",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

/** One group. `children` are its remaining cells, after the title. */
export function GroupRow({
  open,
  onToggle,
  title,
  sub,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <tr
      onClick={onToggle}
      aria-expanded={open}
      className="cursor-pointer border-t border-border/60 hover:bg-primary/[0.06]"
    >
      <td className="px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="min-w-0">
            <span className="block truncate font-medium">{title}</span>
            {sub ? (
              <span className="block truncate text-xs text-muted-foreground">{sub}</span>
            ) : null}
          </span>
        </div>
      </td>
      {children}
    </tr>
  );
}

/**
 * One car inside an open group: indented, quieter than the group above it, and
 * clickable through to the drawer. `children` are the cells after the name.
 */
export function CarSubRow({
  car,
  onOpen,
  lead,
  sub,
  aside,
  asideSub,
  flush = false,
  centerName = false,
  showImage = false,
  children,
}: {
  car: Diecast;
  onOpen?: () => void;
  /** Sits before the name — a copy number, or an ID. */
  lead?: ReactNode;
  /** Replaces the usual "what kind of car" line. */
  sub?: ReactNode;
  /** Sits at the right end of the name's line — the brand, say. */
  aside?: ReactNode;
  /** Sits at the right end of the second line, under the aside. */
  asideSub?: ReactNode;
  /** No indent: the row is not sitting under a group heading. */
  flush?: boolean;
  /** On a phone: no second line, so the name sits in the middle of the two lines beside it. */
  centerName?: boolean;
  /** The car's photograph at the left of the row. */
  showImage?: boolean;
  children?: ReactNode;
}) {
  return (
    <tr
      onClick={onOpen}
      className={cn(
        "border-t border-border/40 bg-muted/20",
        onOpen && "cursor-pointer hover:bg-primary/[0.06]",
      )}
    >
      {/* w-full max-w-0: take the width the other columns leave and truncate to it,
          so a brand at the right of the name stays on screen. */}
      <td
        className={cn(
          "w-full max-w-0 pr-3 md:w-auto md:max-w-none",
          // A photograph at the left gets the same room above as beside it, so
          // its corner can follow the card's (see below).
          showImage ? "py-2.5 pl-2.5" : cn("py-2", flush ? "pl-4" : "pl-8"),
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {lead}
          {showImage && (
            <CarThumb
              car={car}
              // Concentric with the card: its 1.5rem corner less the 0.625rem of
              // room round the photograph.
              className="size-12 shrink-0 overflow-hidden rounded-[calc(1.5rem-0.625rem)]"
            />
          )}
          {/* A grid, so the name can span both lines and sit in the middle of
              them when there is no second line of its own to put under it. */}
          <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
            <span
              className={cn(
                "col-start-1 row-start-1 truncate text-xs font-medium",
                centerName && "max-md:row-span-2 max-md:self-center",
              )}
            >
              {car.name || "—"}
            </span>
            {aside && (
              <span className="col-start-2 row-start-1 text-[11px] text-muted-foreground">
                {aside}
              </span>
            )}
            <span
              className={cn(
                "col-start-1 row-start-2 truncate text-xs text-muted-foreground",
                centerName && "max-md:hidden",
              )}
            >
              {sub ?? carSubLine(car)}
            </span>
            {asideSub && (
              <span className="col-start-2 row-start-2 text-[11px] text-muted-foreground">
                {asideSub}
              </span>
            )}
          </span>
        </div>
      </td>
      {children}
    </tr>
  );
}

/** The cell every one of these tables has: the car's status. */
export function StatusCell({ car, className }: { car: Diecast; className?: string }) {
  return (
    <td className={cn("px-3 py-2", className)}>
      <StatusPill status={car.status} />
    </td>
  );
}
