import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Five stars. Interactive when given `onChange`: tapping the lit star you are
 * already on clears the rating, so "not rated" is reachable without a separate
 * button.
 */
export function StarRating({
  value,
  onChange,
  label,
  size = "md",
  className,
}: {
  value: number;
  onChange?: (value: number) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const icon = size === "sm" ? "size-3.5" : "size-6";
  const stars = [1, 2, 3, 4, 5];

  if (!onChange) {
    return (
      <span
        role="img"
        aria-label={value ? `${label}: ${value} of 5` : `${label}: not rated`}
        className={cn("inline-flex items-center gap-0.5", className)}
      >
        {stars.map((n) => (
          <Star
            key={n}
            className={cn(
              icon,
              n <= value ? "fill-amber-400 text-amber-500" : "fill-none text-muted-foreground/40",
            )}
          />
        ))}
      </span>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {stars.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onClick={() => onChange(value === n ? 0 : n)}
          className="grid place-items-center rounded p-0.5 transition-transform active:scale-90"
        >
          <Star
            className={cn(
              icon,
              n <= value
                ? "fill-amber-400 text-amber-500"
                : "fill-none text-muted-foreground/50 hover:text-amber-500",
            )}
          />
        </button>
      ))}
    </div>
  );
}
