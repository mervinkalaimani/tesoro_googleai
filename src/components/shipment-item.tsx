import type { ReactNode } from "react";

import { CarThumb } from "@/components/car-thumb";
import { inr } from "@/lib/format";
import type { Diecast } from "@/lib/types";

/**
 * One casting inside a shipment: its number and series, its name, what it cost.
 *
 * Written for the shipment contents on My Orders and reused by the notification
 * panel, which shows the same cars for the same reason — so they read as the
 * same list in two places rather than two lists that happen to overlap.
 */
export function ShipmentItem({
  car,
  onOpen,
  meta,
  actions,
  thumb = false,
  identity,
  title,
  amount,
}: {
  car: Diecast;
  /** Makes the name a button — used where opening the car makes sense. */
  onOpen?: () => void;
  /** An extra line under the name: a due date, a balance, a reason it is here. */
  meta?: ReactNode;
  /** Buttons for this car, laid out on their own row underneath. */
  actions?: ReactNode;
  thumb?: boolean;
  /**
   * The small line above the name, in place of this car's own. A row standing
   * for a whole order says how many cars and whose they are, where one car says
   * what it is.
   */
  identity?: string[];
  /** In place of the car's name: the shipment a row of several stands for. */
  title?: string;
  /** In place of what this car cost: the order's total. */
  amount?: number;
}) {
  const heading = title || car.name || `${car.make} ${car.model}`.trim() || "Unnamed car";
  // Brand, then the series it belongs to, then the number that tells it from
  // its near-twins — widest to narrowest, so the line reads down to the car.
  const bits = (identity ?? [car.brand, car.series, car.carNumber || car.id]).filter(
    Boolean,
  ) as string[];

  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        {thumb && <CarThumb car={car} className="size-11 shrink-0 overflow-hidden rounded-md" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 truncate font-mono text-[11px] text-muted-foreground">
            {bits.map((bit, i) => (
              <span key={i} className="truncate last:min-w-0">
                {i > 0 && <span className="mr-1.5">·</span>}
                {bit}
              </span>
            ))}
          </div>
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              className="block max-w-full truncate text-left text-sm font-semibold hover:text-primary"
            >
              {heading}
            </button>
          ) : (
            <div className="truncate text-sm font-semibold">{heading}</div>
          )}
          {meta}
        </div>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {inr(amount ?? car.spent ?? 0)}
        </span>
      </div>
      {actions ? (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
