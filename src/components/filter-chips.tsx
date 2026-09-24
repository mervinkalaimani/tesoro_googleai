import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * The filter row My Cars uses, shared so the Catalog page wears the same one.
 *
 * Both pages had a toolbar with the same job — narrow a long list without
 * leaving it — and were drifting apart: one had chips in line with the segment
 * control, the other hid everything behind a funnel icon. These two components
 * are that row. A chip is a filter you can see the state of without opening
 * anything, which is the whole reason it beats a sheet.
 */

/**
 * "All Brands", but "All Series", "All Rarities" and "All Added by".
 *
 * Appending an "s" to every label read "All Seriess" and "All Raritys", and a
 * label that is a phrase rather than a noun — "Added by" — takes nothing at all.
 */
export const plural = (label: string) => {
  if (/s$/i.test(label) || label.includes(" ")) return label;
  if (/[^aeiou]y$/i.test(label)) return `${label.slice(0, -1)}ies`;
  return `${label}s`;
};

export function ToggleChip({
  label,
  active,
  onToggle,
  icon,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors cursor-pointer shrink-0 whitespace-nowrap outline-none",
        active
          ? "border border-primary/50 bg-primary text-primary-foreground font-semibold shadow-xs"
          : "border border-border/80 bg-background/90 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
      )}
    >
      {icon}
      <span>{label}</span>
      {active && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="grid size-3.5 place-items-center rounded-full hover:bg-primary-foreground/20 text-primary-foreground ml-0.5"
          title={`Remove ${label}`}
        >
          <X className="size-2.5" />
        </span>
      )}
    </button>
  );
}

export function FilterChipDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { name: string; value: number }[];
  onChange: (next: string) => void;
}) {
  const isSelected = value !== "all";
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors cursor-pointer outline-none shrink-0 whitespace-nowrap",
            isSelected
              ? "border border-primary/50 bg-primary text-primary-foreground font-semibold shadow-xs"
              : "border border-border/80 bg-background/90 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
          )}
        >
          <span>{isSelected ? `${label}: ${value}` : label}</span>
          {isSelected ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange("all");
              }}
              className="grid size-3.5 place-items-center rounded-full hover:bg-primary-foreground/20 text-primary-foreground ml-0.5"
              title={`Clear ${label} filter`}
            >
              <X className="size-2.5" />
            </span>
          ) : (
            <ChevronDown className="size-3 text-muted-foreground/70" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2 space-y-1.5 shadow-lg">
        {options.length > 5 && (
          <div className="relative">
            <Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder={`Search ${label.toLowerCase()}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7.5 w-full rounded-md border border-input bg-muted/30 pl-7 pr-2 text-xs outline-none focus:border-primary"
              autoFocus
            />
          </div>
        )}
        <div className="max-h-52 overflow-y-auto space-y-0.5 no-scrollbar">
          <button
            type="button"
            onClick={() => {
              onChange("all");
              setOpen(false);
              setSearch("");
            }}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-left cursor-pointer transition-colors",
              value === "all"
                ? "bg-muted font-semibold text-foreground"
                : "hover:bg-muted/50 text-muted-foreground",
            )}
          >
            {/* "Series" is already plural and "Added by" is not a noun, so
                neither takes the blanket "s". */}
            <span>All {plural(label)}</span>
            {value === "all" && <Check className="size-3.5 text-primary" />}
          </button>
          {filtered.map((opt) => {
            const active = opt.name === value;
            return (
              <button
                key={opt.name}
                type="button"
                onClick={() => {
                  onChange(opt.name);
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-left cursor-pointer transition-colors",
                  active
                    ? "bg-muted font-semibold text-foreground"
                    : "hover:bg-muted/50 text-muted-foreground",
                )}
              >
                <span className="truncate pr-2">{opt.name}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                  {opt.value}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-3 text-center text-xs text-muted-foreground">
              No matching {plural(label).toLowerCase()}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
