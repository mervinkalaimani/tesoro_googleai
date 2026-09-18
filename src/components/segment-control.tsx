import { cn } from "@/lib/utils";

export function SegmentControl<T extends string>({
  value,
  onChange,
  options,
  className,
  disabled,
  clearable = false,
  fill = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  disabled?: boolean;
  /**
   * Tapping the chosen option again unsets it. An optional grade needs that —
   * having picked "Damaged" by mistake there is otherwise no way back to blank —
   * and a required state like a payment status must not have it.
   */
  clearable?: boolean;
  /**
   * The options share the width equally instead of hugging their labels. For a
   * control sitting in a form field that is what reads as a field: hugging left
   * it looks like three loose buttons with a gap after them.
   */
  fill?: boolean;
}) {
  return (
    <div
      className={cn(
        // max-w-full + overflow-x-auto keep a long set of options inside the
        // card instead of pushing past its edge: Collection has seven, which is
        // wider than a phone. Without `fill` the options never shrink, so the
        // control scrolls rather than squashing its labels; with it they share
        // the width and truncate, which is what a form field wants.
        "min-w-0 max-w-full snap-x overflow-x-auto rounded-md border border-border bg-muted/40 p-0.5 text-xs [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        fill ? "flex w-full" : "inline-flex",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(clearable && active ? ("" as T) : o.value)}
            className={cn(
              // min-w-0 + truncate keep a long label from stretching its cell:
              // in a grid the columns are equal, so one wide option would
              // otherwise widen every other one with it.
              "min-w-0 snap-start truncate rounded-[6px] px-2.5 py-1 text-center transition-colors",
              fill ? "flex-1 basis-0" : "shrink-0",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
