/**
 * One box a casting is sold in, as a row.
 *
 * Shared by the two forms that file one: the catalogue form, where the rows are
 * the boxes themselves, and the add-a-car form, where the first row is also the
 * box your copy came out of and so carries what it cost.
 *
 * On a wide screen the labels sit once, above, which AssortmentHeader draws —
 * the same words repeated down a list of boxes is a list reading as a form
 * rather than as a table. On a phone there is no room for a header row, so each
 * field carries its own label and they stack full width. The alternative was
 * what this had: unlabelled boxes, one of them a third the width of the others.
 */
import { useEffect, useMemo, useState } from "react";
import { Trash2, Unlink } from "lucide-react";

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
 * `money` is whether a price box follows: none in the catalogue, one on a car —
 * what this copy cost. What has been paid of it is a question about the
 * purchase, not about the box, and lives in Seller & payment.
 */
const cols = (money: boolean) =>
  money
    ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_7rem_2.25rem]"
    : "sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_2.25rem]";

export function AssortmentHeader({ money = false }: { money?: boolean }) {
  return (
    <div className={cn("hidden gap-2 pb-1 text-xs text-muted-foreground sm:grid", cols(money))}>
      <span>Assortment *</span>
      <span>Retail / MRP *</span>
      {money ? <span>Buying price *</span> : null}
      <span aria-hidden />
    </div>
  );
}

/** A field and, on a phone only, the label the header would have carried. */
function Cell({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("col-span-2 min-w-0 space-y-1 sm:col-span-1 sm:space-y-0", className)}>
      <span className="block text-[11px] font-medium text-muted-foreground sm:hidden">{label}</span>
      {children}
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
  onAssortment,
  onMrp,
  onSpent,
  onRemove,
  onDetach,
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
  onAssortment: (v: string) => void;
  onMrp: (v: number) => void;
  onSpent?: (v: number | "") => void;
  /** Takes the row off the form. Absent on a row that is already filed. */
  onRemove?: () => void;
  /**
   * Take this box out of the casting and let it stand on its own. Only for a
   * row already on file: a row typed here and not saved is nothing to detach,
   * it is only removed.
   */
  onDetach?: () => void;
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
      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_2.25rem] items-end gap-2 sm:items-center",
          cols(money),
        )}
      >
        <Cell label="Assortment" className="col-span-1">
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
        </Cell>

        {/* The row's one button, beside the field that names it, so a row can
            be taken off from where you are reading it. */}
        {onDetach ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDetach}
            className="size-9 self-end text-muted-foreground hover:text-foreground sm:order-last sm:self-auto"
            aria-label="Make this a separate casting"
            title="Not a box of this casting — make it its own"
          >
            <Unlink className="size-4" />
          </Button>
        ) : onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="size-9 self-end text-muted-foreground hover:text-destructive sm:order-last sm:self-auto"
            aria-label="Remove this assortment"
            title="Remove this assortment"
          >
            <Trash2 className="size-4" />
          </Button>
        ) : (
          <span aria-hidden className="sm:order-last" />
        )}

        <Cell label="Retail / MRP">
          {/* Other sits beside the prices rather than under them: there are
              three of them, so the row has the width for it and the list does
              not grow a second line every time somebody types a price. */}
          <div className="flex min-w-0 items-center gap-2">
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
        </Cell>

        {money ? (
          // Yours, not the casting's: what this copy cost. A row for a box you
          // did not buy shows a dash.
          <Cell label="Buying price">
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
              <span className="flex h-9 items-center justify-center text-xs text-muted-foreground">
                —
              </span>
            )}
          </Cell>
        ) : null}
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
