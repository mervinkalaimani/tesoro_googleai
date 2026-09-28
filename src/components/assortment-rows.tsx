/**
 * One box a casting is sold in, as a row.
 *
 * Shared by the two forms that file one: the catalogue form, where the rows are
 * the boxes themselves, and the add-a-car form, where the first row is also the
 * box your copy came out of and so carries what it cost and what you have paid
 * so far.
 *
 * Deliberately not a Field each -- the same labels repeated down a list of boxes
 * is the list reading as a form rather than as a table. They sit once, above,
 * which AssortmentHeader draws.
 */
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ClearableInput } from "@/components/form-parts";
import { SegmentControl } from "@/components/segment-control";
import { mrpOptionsFor } from "@/lib/car-prices";
import { inrFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Diecast } from "@/lib/types";

/** The value that means "not one of these — let me type it". */
const OTHER_MRP = "__other__";

/**
 * The columns, in one place so the header and the rows cannot drift apart.
 * `money` is how many number boxes follow the price: none in the catalogue,
 * two on a car — what it cost, and how much of that has been handed over.
 */
const cols = (money: boolean) =>
  money
    ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_6rem_6rem_2.25rem]"
    : "sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_2.25rem]";

export function AssortmentHeader({ money = false }: { money?: boolean }) {
  return (
    <div className={cn("hidden gap-2 pb-1 text-xs text-muted-foreground sm:grid", cols(money))}>
      <span>Assortment *</span>
      <span>Retail / MRP *</span>
      {money ? <span>Buying price *</span> : null}
      {money ? <span>Paid</span> : null}
      <span aria-hidden />
    </div>
  );
}

export function AssortmentRow({
  assortment,
  mrp,
  options,
  cars,
  brand,
  allowCustom,
  disabled,
  assortmentError,
  filedAs,
  money = false,
  spent,
  spentError,
  paid,
  onAssortment,
  onMrp,
  onSpent,
  onPaid,
  onRemove,
}: {
  assortment: string;
  mrp: number;
  options: string[];
  /** Ranks the prices, the same pool the rest of the form suggests from. */
  cars: Diecast[];
  brand: string;
  allowCustom: boolean;
  disabled?: boolean;
  assortmentError?: string;
  /** The catalogue ID this box is already filed under, when it is. */
  filedAs?: string;
  /**
   * Whether this row is also a purchase. Only the first row of the add-a-car
   * form is: the catalogue describes boxes, and the other boxes of a casting
   * are ones you did not buy.
   */
  money?: boolean;
  spent?: number | "";
  spentError?: string;
  paid?: number | "";
  onAssortment: (v: string) => void;
  onMrp: (v: number) => void;
  onSpent?: (v: number | "") => void;
  onPaid?: (v: number | "") => void;
  onRemove?: () => void;
}) {
  const priced = useMemo(
    () => mrpOptionsFor(cars, brand, assortment, 3),
    [cars, brand, assortment],
  );
  const [typed, setTyped] = useState(false);
  const known = !typed && mrp > 0 && priced.includes(mrp);
  const showInput = priced.length === 0 || !known;

  // The commonest price for this box, taken as read. Every Hot Wheels Mainline
  // is 179; asking for it again on each one is a question with one answer. Only
  // while nothing is set and nobody has asked to type their own.
  useEffect(() => {
    if (!typed && !mrp && priced.length > 0) onMrp(priced[0]);
    // onMrp is rebuilt every render by the form above; depending on it would
    // re-run this on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priced, mrp, typed]);

  return (
    <div data-field="assortment" className="scroll-mt-24">
      {/* A grid, not a flex row: ClearableInput wraps its input in a w-full
          div, so a width class on the input alone left the wrapper growing and
          the two controls sitting on top of each other. The columns carry the
          widths, and nothing inside has to know about them. */}
      <div className={cn("grid grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-2", cols(money))}>
        <Combobox
          clearable
          allowCustom={allowCustom}
          disabled={disabled}
          value={assortment}
          onChange={onAssortment}
          options={options}
          placeholder="e.g. Mainline"
          searchPlaceholder={
            allowCustom ? "Search assortments, or type a new one…" : "Search assortments…"
          }
          ariaLabel="Assortment"
        />
        {/* Other sits beside the prices rather than under them: there are three
            of them, so the row has the width for it and the list does not grow
            a second line every time somebody types a price. */}
        <div className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
          {priced.length > 0 && (
            <SegmentControl
              fill
              className="min-w-0 flex-1"
              value={known ? String(mrp) : OTHER_MRP}
              options={[
                ...priced.map((v) => ({ value: String(v), label: inrFull(v) })),
                { value: OTHER_MRP, label: "Other" },
              ]}
              onChange={(v) => {
                if (v === OTHER_MRP) {
                  setTyped(true);
                  return;
                }
                setTyped(false);
                onMrp(Number(v));
              }}
            />
          )}
          {showInput && (
            <div className={priced.length > 0 ? "w-24 shrink-0" : "min-w-0 flex-1"}>
              <ClearableInput
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                disabled={disabled}
                placeholder="179"
                className="tabular-nums"
                value={mrp || ""}
                onChange={(e) => onMrp(e.target.value === "" ? 0 : Number(e.target.value))}
                aria-label="Retail price"
              />
            </div>
          )}
        </div>
        {money ? (
          <>
            {/* Yours, not the casting's: what this copy cost, and how much of
                that has been handed over. A row for a box you did not buy shows
                a dash in both. */}
            <div className="min-w-0">
              {onSpent ? (
                <ClearableInput
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  disabled={disabled}
                  placeholder="0"
                  className={cn("tabular-nums", spentError && "border-destructive")}
                  value={spent ?? ""}
                  onChange={(e) => onSpent(e.target.value === "" ? "" : Number(e.target.value))}
                  aria-label="Buying price"
                />
              ) : (
                <span className="block text-center text-xs text-muted-foreground">—</span>
              )}
            </div>
            <div className="min-w-0">
              {onPaid ? (
                <ClearableInput
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  disabled={disabled}
                  placeholder="0"
                  className="tabular-nums"
                  value={paid ?? ""}
                  onChange={(e) => onPaid(e.target.value === "" ? "" : Number(e.target.value))}
                  aria-label="Amount paid"
                />
              ) : (
                <span className="block text-center text-xs text-muted-foreground">—</span>
              )}
            </div>
          </>
        ) : null}
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="size-9 text-muted-foreground hover:text-destructive"
            aria-label="Remove this assortment"
          >
            <X className="size-4" />
          </Button>
        ) : (
          <span aria-hidden />
        )}
      </div>
      {filedAs ? (
        <p className="pl-1 pt-1 font-mono text-[10px] text-muted-foreground">{filedAs}</p>
      ) : null}
      {assortmentError ? (
        <p className="pl-1 pt-1 text-[11px] text-destructive">{assortmentError}</p>
      ) : null}
      {spentError ? <p className="pl-1 pt-1 text-[11px] text-destructive">{spentError}</p> : null}
    </div>
  );
}
