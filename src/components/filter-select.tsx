import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SortDir = "asc" | "desc";

/**
 * The sort control. Choosing a different order uses that order's natural
 * direction (newest first, A to Z); choosing the one already in use flips it.
 * The arrow on the trigger and beside the current option says which way.
 */
export function SortSelect<T extends string>({
  value,
  dir,
  onChange,
  options,
  label = "Sort",
  triggerLabel,
  neutral,
  iconOnly = false,
  iconOnlyOnMobile = true,
  className = "",
}: {
  value: T;
  dir: SortDir;
  onChange: (value: T, dir: SortDir) => void;
  /** `dir` is the direction the option starts in when picked. */
  options: { value: T; label: string; dir: SortDir }[];
  label?: string;
  triggerLabel?: string;
  /** The page's default order; anything else reads as a sort being applied. */
  neutral: T;
  iconOnly?: boolean;
  iconOnlyOnMobile?: boolean;
  className?: string;
}) {
  const current = options.find((o) => o.value === value);
  const neutralDir = options.find((o) => o.value === neutral)?.dir ?? "asc";
  const isSet = value !== neutral || dir !== neutralDir;
  const Arrow = dir === "asc" ? ArrowUp : ArrowDown;
  const dirName = dir === "asc" ? "ascending" : "descending";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${label}: ${current?.label ?? ""}, ${dirName}`}
        title={`${label}: ${current?.label ?? ""} (${dirName})`}
        className={cn(
          "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-transparent text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring",
          iconOnly
            ? "w-8 justify-center px-0"
            : iconOnlyOnMobile
              ? "w-8 justify-center px-0 sm:w-auto sm:px-2"
              : "px-2",
          isSet ? "border-primary/40 text-foreground font-medium" : "text-muted-foreground",
          className,
        )}
      >
        {isSet ? (
          <Arrow className="size-3.5 shrink-0" />
        ) : (
          <ArrowUpDown className="size-3.5 shrink-0" />
        )}
        <span
          className={cn(
            "min-w-0 truncate text-xs",
            iconOnly ? "sr-only" : iconOnlyOnMobile && "max-sm:hidden",
          )}
        >
          {triggerLabel ?? (isSet && current ? current.label : "Sort")}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <DropdownMenuItem
              key={o.value}
              onSelect={(e) => {
                if (active) {
                  // Stays open, so the flip is seen happening.
                  e.preventDefault();
                  onChange(o.value, dir === "asc" ? "desc" : "asc");
                } else {
                  onChange(o.value, o.dir);
                }
              }}
              className="cursor-pointer justify-between gap-3"
            >
              <span className="flex items-center gap-2">
                <Check className={cn("size-3.5", active ? "opacity-100" : "opacity-0")} />
                {o.label}
              </span>
              {active && (
                <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <Arrow className="size-3" />
                  {dir === "asc" ? "Asc" : "Desc"}
                </span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
  iconOnly = false,
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
  iconOnly?: boolean;
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
          iconOnly
            ? "w-8 justify-center px-0 [&>svg:last-child]:hidden"
            : iconOnlyOnMobile
              ? "w-8 justify-center px-0 [&>svg:last-child]:hidden sm:w-auto sm:px-2 sm:justify-between sm:[&>svg:last-child]:block"
              : "w-auto px-2",
          isSet
            ? cn(
                "border-primary/40 text-foreground",
                iconOnly ? "" : iconOnlyOnMobile ? "sm:max-w-[11rem]" : "max-w-[11rem]",
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
            // sr-only rather than hidden: the trigger's own [&>span] rules set a
            // display that beat `hidden`, and a sliver of the label showed.
            (iconOnly || (iconOnlyOnMobile && isSet)) && "max-sm:sr-only",
            iconOnly && "sr-only",
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
