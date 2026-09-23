import { useEffect, useRef } from "react";
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
