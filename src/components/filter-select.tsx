import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * A filter or sort control that leads with its icon rather than its name.
 *
 * "Sort: Order date" and "All sellers" spent most of a toolbar saying what kind
 * of control they were, which the control itself already says. The icon carries
 * that, and the text is reserved for the one thing the icon cannot show — what
 * this filter is currently set to.
 *
 * So an untouched filter is a bare icon, and a set one widens to name its
 * value. That also makes an active filter visible from across the toolbar,
 * which a row of identical dropdowns never was.
 */
export function FilterSelect({
  value,
  onChange,
  options,
  icon,
  label,
  /** The value that counts as "not filtering". Defaults to "all". */
  neutral = "all",
  className = "",
  iconOnlyOnMobile = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  icon: ReactNode;
  /** Named for screen readers and the tooltip, not drawn. */
  label: string;
  neutral?: string;
  className?: string;
  iconOnlyOnMobile?: boolean;
}) {
  const isSet = value !== neutral;
  const current = options.find((o) => o.value === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        title={current ? `${label}: ${current.label}` : label}
        className={cn(
          "h-8 gap-1.5",
          iconOnlyOnMobile
            ? "w-8 justify-center px-0 [&>svg:last-child]:hidden sm:w-auto sm:px-2 sm:justify-between sm:[&>svg:last-child]:block"
            : "w-auto px-2",
          isSet
            ? cn(
                "border-primary/40 text-foreground",
                iconOnlyOnMobile ? "sm:max-w-[11rem]" : "max-w-[11rem]",
              )
            : "text-muted-foreground",
          className,
        )}
      >
        <span className="shrink-0">{icon}</span>
        {/* Radix needs SelectValue mounted to track the selection; it is only
            drawn once the filter is doing something. */}
        <span
          className={cn(
            isSet ? "min-w-0 truncate text-xs" : "sr-only",
            iconOnlyOnMobile && isSet && "hidden sm:inline",
          )}
        >
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
