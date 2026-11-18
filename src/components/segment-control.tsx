import { useEffect, useRef } from "react";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

function SegmentRow<T extends string>({
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
  const containerRef = useRef<HTMLDivElement>(null);
  const activeBtnRef = useRef<HTMLButtonElement | null>(null);

  // When value changes, scroll active item into view horizontally
  useEffect(() => {
    if (activeBtnRef.current && containerRef.current) {
      activeBtnRef.current.scrollIntoView({
        behavior: "smooth",
        inline: "nearest",
        block: "nearest",
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className={cn(
        // Flow strictly left and right: flex-nowrap, whitespace-nowrap, overflow-y-hidden, touch-pan-x
        "flex flex-nowrap min-w-0 max-w-full h-8 shrink-0 items-center snap-x overflow-x-auto overflow-y-hidden whitespace-nowrap touch-pan-x overscroll-x-contain rounded-md border border-border bg-muted/40 p-0.5 text-xs [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        fill ? "w-full" : "inline-flex w-auto",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={active ? activeBtnRef : undefined}
            type="button"
            disabled={disabled}
            onClick={() => onChange(clearable && active ? ("" as T) : o.value)}
            className={cn(
              "h-7 shrink-0 inline-flex items-center justify-center whitespace-nowrap snap-start select-none rounded-[6px] px-2.5 text-center font-medium leading-none transition-colors",
              fill ? "flex-1 basis-0" : "",
              active
                ? "bg-background text-foreground shadow-xs font-semibold"
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

/**
 * A segment control that is one value with up/down chevrons on a phone. Each
 * tap steps to the next option and wraps round — no popup, no row to scroll
 * sideways. From sm: up it is the ordinary segment control.
 *
 * `separate` names an option that gets a button of its own beside the pill
 * ("All"), and the pill cycles through the rest. Until one of the rest is
 * chosen the pill is plain, and its first tap picks the first of them.
 */
export function CyclePill<T extends string>({
  value,
  onChange,
  options,
  className,
  separate,
  disabled,
  fill,
  phoneOnly,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  separate?: T;
  disabled?: boolean;
  fill?: boolean;
  /** No segment row from sm: up — for a set too long to lay out as a row. */
  phoneOnly?: boolean;
}) {
  const rest = options.filter((o) => o.value !== separate);
  const i = rest.findIndex((o) => o.value === value);
  const onSeparate = separate !== undefined && value === separate;
  const shown = rest[Math.max(0, i)];
  const pill = (active: boolean) =>
    cn(
      "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium disabled:pointer-events-none disabled:opacity-50",
      // The same pill whether or not it is selected — no extra fill, no brighter
      // edge — and the selection shows in the text alone.
      "border-border bg-muted/40",
      active ? "text-foreground" : "text-muted-foreground",
    );
  return (
    <>
      <div className="flex min-w-0 items-center gap-2 sm:hidden">
        {separate !== undefined && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(separate)}
            aria-pressed={onSeparate}
            className={pill(onSeparate)}
          >
            {options.find((o) => o.value === separate)?.label}
          </button>
        )}
        {shown && (
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              onChange(i < 0 || onSeparate ? rest[0].value : rest[(i + 1) % rest.length].value)
            }
            aria-label={`${shown.label}. Tap for the next.`}
            className={cn(pill(!onSeparate), "pr-3", phoneOnly && "min-w-0 shrink")}
          >
            <span className={cn("truncate", phoneOnly && "max-w-[8.5rem]")}>{shown.label}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
          </button>
        )}
      </div>
      <div className={cn("hidden", !phoneOnly && "sm:contents")}>
        <SegmentRow
          value={value}
          onChange={onChange}
          options={options}
          className={className}
          disabled={disabled}
          fill={fill}
        />
      </div>
    </>
  );
}

/**
 * The segment control every screen uses. On a phone it is a cycle pill — one
 * value, tap for the next — and from sm: up it is the row of segments.
 *
 * A clearable control stays a row everywhere: tapping the chosen segment again
 * unsets it, and a pill that only steps forward has no way back to blank.
 */
export function SegmentControl<T extends string>(props: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  disabled?: boolean;
  clearable?: boolean;
  fill?: boolean;
  /** Keep the row of segments on a phone too, where a form wants every choice visible. */
  row?: boolean;
}) {
  const { row, ...rest } = props;
  if (row || rest.clearable || rest.options.length < 2) return <SegmentRow {...rest} />;
  return <CyclePill {...rest} />;
}
