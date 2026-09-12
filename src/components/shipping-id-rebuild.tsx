import { useMemo, useState } from "react";
import { Hash, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { Diecast } from "@/lib/types";
import { useCars, useCarsActions } from "@/lib/cars-store";
import { shippingIdTable } from "@/lib/shipping-id";
import { orderIdTable } from "@/lib/order-id";

/** How many examples to show before saying "and N more". */
const SAMPLE = 6;

/**
 * Squares every derived ID in the collection with the formula it comes from.
 *
 * Editing a car renumbers the runs that edit disturbs, which is the right scope
 * for an edit and no help at all to rows that were already wrong: IDs imported
 * from the sheet, rows written by a version of this app that numbered only the
 * car in front of it, or anything that changed while another device held a
 * stale copy. This is the pass that fixes those, and it says what it will do
 * before it does it.
 *
 * One component, two kinds. Shipping and order IDs are different runs over
 * different dates, but the drift is read the same way and rewriting it is the
 * same promise — a second copy of this would only be a second place to fix.
 */
type Kind = "shipping" | "order";

const KINDS: Record<
  Kind,
  {
    title: string;
    blurb: string;
    noun: string;
    table: (cars: Diecast[]) => Map<string, string>;
    of: (car: Diecast) => string;
  }
> = {
  shipping: {
    title: "Shipping IDs",
    blurb:
      "Seller code, then that seller’s nth shipping day — pre-orders counted separately. Derived, never typed.",
    noun: "shipping ID",
    table: shippingIdTable,
    of: (car) => (car.shippingId || "").trim(),
  },
  order: {
    title: "Order IDs",
    blurb:
      "Seller code, the month, then that seller’s nth order day inside it. Cars bought on one day share one. Derived, never typed.",
    noun: "order ID",
    table: orderIdTable,
    of: (car) => (car.orderId || "").trim(),
  },
};

export function IdRebuild({ kind }: { kind: Kind }) {
  const cars = useCars();
  const { renumberShippingIds, renumberOrderIds } = useCarsActions();
  const [running, setRunning] = useState(false);
  const spec = KINDS[kind];

  const drift = useMemo(() => {
    const table = spec.table(cars);
    const out: { id: string; name: string; from: string; to: string }[] = [];
    for (const car of cars) {
      const want = table.get(car.id) ?? "";
      const have = spec.of(car);
      if (have === want) continue;
      out.push({
        id: car.id,
        name: car.name || car.model || car.id,
        from: have || "—",
        to: want || "—",
      });
    }
    return out;
  }, [cars, spec]);

  const run = async () => {
    setRunning(true);
    try {
      const n = await (kind === "shipping" ? renumberShippingIds() : renumberOrderIds());
      toast.success(
        n === 0
          ? `Every ${spec.noun} already matches`
          : `Rewrote ${n} ${spec.noun}${n === 1 ? "" : "s"}`,
        { description: n > 0 ? "Undo in the top bar puts them back." : undefined },
      );
    } catch (e) {
      toast.error("Some rows could not be saved", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Hash className="size-4 text-primary" />
            {spec.title}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{spec.blurb}</p>
        </div>
        <Button
          size="sm"
          onClick={() => void run()}
          disabled={running || drift.length === 0}
          className="shrink-0 gap-1.5"
        >
          {running ? <Loader2 className="size-4 animate-spin" /> : null}
          {drift.length === 0 ? "Nothing to rebuild" : `Rebuild ${drift.length}`}
        </Button>
      </div>

      {drift.length === 0 ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          All {cars.length.toLocaleString()} cars match the formula.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {drift.length.toLocaleString()} of {cars.length.toLocaleString()} cars carry an ID the
            formula disagrees with. Rewriting is one database write per row, and undo reverses it.
          </p>
          <ul className="space-y-1 text-xs">
            {drift.slice(0, SAMPLE).map((d) => (
              <li key={d.id} className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.name}</span>
                <span className="shrink-0 font-mono text-muted-foreground line-through">
                  {d.from}
                </span>
                <span className="shrink-0 font-mono font-semibold text-foreground">{d.to}</span>
              </li>
            ))}
          </ul>
          {drift.length > SAMPLE && (
            <p className="text-xs text-muted-foreground">
              and {(drift.length - SAMPLE).toLocaleString()} more.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
