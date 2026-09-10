import { cn } from "@/lib/utils";

export function SegmentControl<T extends string>({
  value,
  onChange,
  options,
  className,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-md border border-border bg-muted/40 p-0.5 text-xs",
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
            onClick={() => onChange(o.value)}
            className={cn(
              // min-w-0 + truncate keep a long label from stretching its cell:
              // in a grid the columns are equal, so one wide option would
              // otherwise widen every other one with it.
              "min-w-0 truncate rounded-[6px] px-2.5 py-1 text-center transition-colors",
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
