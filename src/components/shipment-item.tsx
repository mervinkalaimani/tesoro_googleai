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
}: {
  car: Diecast;
  /** Makes the name a button — used where opening the car makes sense. */
  onOpen?: () => void;
  /** An extra line under the name: a due date, a balance, a reason it is here. */
  meta?: ReactNode;
  /** Buttons for this car, laid out on their own row underneath. */
  actions?: ReactNode;
  thumb?: boolean;
}) {
  const title = car.name || `${car.make} ${car.model}`.trim() || "Unnamed car";

  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        {thumb && <CarThumb car={car} className="size-11 shrink-0 overflow-hidden rounded-md" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 truncate font-mono text-[11px] text-muted-foreground">
            <span>{car.carNumber || car.id}</span>
            {car.series ? (
              <>
                <span>·</span>
                <span className="truncate">{car.series}</span>
              </>
            ) : null}
          </div>
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              className="block max-w-full truncate text-left text-sm font-semibold hover:text-primary"
            >
              {title}
            </button>
          ) : (
            <div className="truncate text-sm font-semibold">{title}</div>
          )}
          {meta}
        </div>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {inr(car.spent || 0)}
        </span>
      </div>
      {actions ? (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
