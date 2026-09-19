import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * "top Bar" view pattern:
 * - Title and subtitle on the left.
 * - Actions (filter, sort, export, view toggle buttons) inline with the title on the right.
 * - Filter chips placed at the top of the body, outside the header section.
 * - Optional expandable filter panel between the heading and body chips.
 *
 * Saved as "top Bar". Whenever requested to "implement this top bar to [page]",
 * use PageTopBar and TopBarChips directly.
 */
export function PageTopBar({
  title,
  subtitle,
  actions,
  filterPanel,
  chips,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Filter, sort, export, and view toggle buttons inline with title */
  actions?: ReactNode;
  /** Expandable filter drawer / panel */
  filterPanel?: ReactNode;
  /** Chips placed at the top of the body */
  chips?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {/* Title section with inline actions */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:flex-nowrap min-w-0">
        <div className="min-w-0 shrink-0">
          <h1 className="text-display truncate text-lg sm:text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
        {actions && (
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap justify-end shrink-0 ml-auto">
            {actions}
          </div>
        )}
      </div>

      {/* Expandable filter panel if opened */}
      {filterPanel}

      {/* Chips at the top of the body */}
      {chips && <div className="pt-0.5">{chips}</div>}
    </div>
  );
}

/**
 * Modern filter chips for the "top Bar" pattern.
 * Displayed horizontally at the top of the body.
 */
export function TopBarChips<T extends string = string>({
  value,
  onChange,
  options,
  className = "",
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none sm:flex-wrap",
        className,
      )}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isSelected
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60",
            )}
          >
            <span>{opt.label}</span>
            {typeof opt.count === "number" && (
              <span
                className={cn(
                  "text-[10px] tabular-nums px-1 py-0.2 rounded-full",
                  isSelected
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted-foreground/15 text-muted-foreground",
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
