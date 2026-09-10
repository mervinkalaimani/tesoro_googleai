import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

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

  return (
    <Popover
      // Modal: this lives inside the add-car dialog, which traps focus. Without
      // it the popover's input never receives the keystrokes it is there for.
      modal
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
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            className,
          )}
        >
          <span className={cn("truncate text-left", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
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
                  <span className="truncate">{option}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
