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
}: {
  /** The `<th>` cells, in order. */
  head: ReactNode;
  children: ReactNode;
  /** Below this the table scrolls sideways rather than crushing its columns. */
  minWidth?: string;
}) {
  return (
    <div className="card-elevated overflow-x-auto">
      <table className={cn("w-full text-sm", minWidth)}>
        <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
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
      className="cursor-pointer border-t border-border/60 hover:bg-muted/30"
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
              <span className="block truncate text-[11px] text-muted-foreground">{sub}</span>
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
  children,
}: {
  car: Diecast;
  onOpen?: () => void;
  /** Sits before the name — a copy number, or an ID. */
  lead?: ReactNode;
  /** Replaces the usual "what kind of car" line. */
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <tr
      onClick={onOpen}
      className={cn(
        "border-t border-border/40 bg-muted/20",
        onOpen && "cursor-pointer hover:bg-muted/40",
      )}
    >
      <td className="py-2 pl-8 pr-3">
        <div className="flex min-w-0 items-center gap-2">
          {lead}
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium">{car.name || "—"}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {sub ?? carSubLine(car)}
            </span>
          </span>
        </div>
      </td>
      {children}
    </tr>
  );
}

/** The cell every one of these tables has: the car's status. */
export function StatusCell({ car }: { car: Diecast }) {
  return (
    <td className="px-3 py-2">
      <StatusPill status={car.status} />
    </td>
  );
}
