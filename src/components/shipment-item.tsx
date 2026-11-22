import { useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

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
  simple = false,
  onDismiss,
  dismissLabel,
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
  /**
   * The notification panel: a flat row with the name and its one line, no
   * identity line above and no price beside, and small buttons.
   */
  simple?: boolean;
  /** Closes the notice: a cross beside the name, and a swipe sideways. */
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  // Swiping the row sideways clears it: it follows the finger, and a pull past
  // a third of its width carries it off; short of that it springs back.
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; locked: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const swipe = simple && onDismiss;
  const finish = () => {
    start.current = null;
    setDragging(false);
    const w = box.current?.offsetWidth ?? 300;
    if (Math.abs(dx) > w / 3) {
      setGone(true);
      setDx(dx > 0 ? w : -w);
      window.setTimeout(() => onDismiss?.(), 200);
    } else {
      setDx(0);
    }
  };
  const heading = title || car.name || `${car.make} ${car.model}`.trim() || "Unnamed car";
  // Brand, then the series it belongs to, then the number that tells it from
  // its near-twins — widest to narrowest, so the line reads down to the car.
  const bits = (identity ?? [car.brand, car.carNumber || car.id, car.series]).filter(
    Boolean,
  ) as string[];

  return (
    <div
      ref={box}
      style={
        swipe
          ? {
              transform: `translateX(${dx}px)`,
              opacity: gone ? 0 : 1 - Math.min(Math.abs(dx) / 400, 0.5),
              transition: dragging ? "none" : "transform 0.2s ease-out, opacity 0.2s ease-out",
              touchAction: "pan-y",
            }
          : undefined
      }
      onPointerDown={
        swipe
          ? (e) => {
              if ((e.target as HTMLElement).closest("button,a,input,select,textarea")) return;
              start.current = { x: e.clientX, y: e.clientY, locked: false };
            }
          : undefined
      }
      onPointerMove={
        swipe
          ? (e) => {
              const s0 = start.current;
              if (!s0) return;
              const mx = e.clientX - s0.x;
              if (!s0.locked) {
                if (Math.abs(mx) < 8) return;
                s0.locked = true;
                setDragging(true);
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }
              setDx(mx);
            }
          : undefined
      }
      onPointerUp={swipe ? finish : undefined}
      onPointerCancel={swipe ? finish : undefined}
      className={
        simple
          ? "border-b border-border/50 px-1 py-3 last:border-b-0"
          : "rounded-md border border-border bg-muted/20 px-3 py-2"
      }
    >
      <div className="flex items-start justify-between gap-3">
        {thumb && (
          <CarThumb
            car={car}
            className={
              simple
                ? "size-12 shrink-0 overflow-hidden rounded-xl"
                : "size-11 shrink-0 overflow-hidden rounded-md"
            }
          />
        )}
        <div className="min-w-0 flex-1">
          <div
            className={
              simple
                ? "hidden"
                : "flex items-center gap-1.5 truncate font-mono text-xs text-muted-foreground"
            }
          >
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
        {!simple && (
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {inr(amount ?? car.spent ?? 0)}
          </span>
        )}
        {swipe && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={`Close the notice for ${dismissLabel ?? heading}`}
            title="Close — it will not come back"
            className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {actions ? (
        <div
          className={
            simple
              ? "mt-2 flex items-center gap-2 [&_button]:h-9 [&_button]:text-xs [&>button]:flex-1"
              : "mt-2 flex flex-wrap items-center justify-end gap-2"
          }
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
