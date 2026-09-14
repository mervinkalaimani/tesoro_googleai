import * as React from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * A single-select field that filters as you type and accepts values that are not
 * on the list yet.
 *
 * The catalogue fields it fronts (brand, assortment, colour, …) have a long tail:
 * a fixed <Select> would block the first car from a new brand, and a plain
 * <Input> re-asks for the spelling every time. So the list is a suggestion, and
 * anything typed is a valid answer — which is also how the list grows, since the
 * options handed in are drawn from the collection itself.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Select or type…",
  searchPlaceholder = "Search or type a new one…",
  allowCustom = true,
  disabled,
  className,
  id,
  ariaLabel,
  clearable = false,
  descriptions,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  /** When false the field behaves as a searchable <Select>. */
  allowCustom?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** For places with no visible <Label>, such as a bulk-entry table column. */
  ariaLabel?: string;
  /** An × in place of the chevron once there is a value, to empty the field. */
  clearable?: boolean;
  /** A line of explanation under an option, keyed by its lower-cased value. */
  descriptions?: Record<string, string>;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const trimmed = search.trim();
  const canCreate =
    allowCustom &&
    trimmed.length > 0 &&
    !options.some((o) => o.toLowerCase() === trimmed.toLowerCase());

  const commit = (next: string) => {
    onChange(next);
    setSearch("");
    setOpen(false);
  };

  const showClear = clearable && !disabled && Boolean(value);

  return (
    <div className="relative w-full">
      <Popover
        // Deliberately NOT modal. A modal popover inside the (modal) add-car
        // dialog leaves `pointer-events: none` stuck on the body when it closes —
        // both layers manage that style and the popover restores it to the value
        // it remembered rather than the one the dialog wants. The result is a
        // dialog that goes completely dead to clicks after the first selection.
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel}
            disabled={disabled}
            className={cn(
              // Matches <Input> so a row of mixed fields still lines up.
              "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
              className,
            )}
          >
            <span className={cn("min-w-0 truncate text-left", !value && "text-muted-foreground")}>
              {value || placeholder}
            </span>
            {/* The chevron keeps its space under the × so the text never shifts. */}
            <ChevronsUpDown
              className={cn("size-4 shrink-0 opacity-50", showClear && "invisible")}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="p-0"
          style={{ width: "var(--radix-popover-trigger-width)", minWidth: "12rem" }}
        >
          <Command
            // cmdk's own scoring reorders and drops close-enough matches; a plain
            // substring test is what someone typing half a model name expects.
            filter={(itemValue, query) =>
              itemValue.toLowerCase().includes(query.trim().toLowerCase()) ? 1 : 0
            }
          >
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder={searchPlaceholder}
              onKeyDown={(event) => {
                // Enter on a typed value that matches nothing still has to commit
                // it: cmdk highlights no item, so it would otherwise do nothing.
                if (event.key === "Enter" && canCreate) {
                  event.preventDefault();
                  commit(trimmed);
                }
              }}
            />
            <CommandList>
              {canCreate ? (
                <CommandGroup>
                  <CommandItem value={`__create__${trimmed}`} onSelect={() => commit(trimmed)}>
                    <Plus className="opacity-60" />
                    <span className="truncate">
                      Use “<span className="font-medium">{trimmed}</span>”
                    </span>
                  </CommandItem>
                </CommandGroup>
              ) : null}
              <CommandEmpty>{allowCustom ? "Keep typing to add it." : "No matches."}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem key={option} value={option} onSelect={() => commit(option)}>
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        option === value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{option}</span>
                      {descriptions?.[option.toLowerCase()] && (
                        <span className="truncate text-[11px] text-muted-foreground">
                          {descriptions[option.toLowerCase()]}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {/* A sibling of the trigger, not inside it: a button in a button is
          invalid and the click would open the list as well. */}
      {showClear && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={`Clear ${ariaLabel || placeholder}`}
          className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
