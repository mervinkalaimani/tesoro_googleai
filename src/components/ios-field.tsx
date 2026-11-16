import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The phone's form, the way iOS Settings lays one out: a grouped list, each row
 * the label on the left and the answer on the right. Text is typed in place; a
 * choice opens a pop-up menu at the value with the options as a list and a tick on
 * the one in use.
 */
export function IosGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-muted/40",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function IosRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 px-3.5">
      <span className="shrink-0 text-[15px]">{label}</span>
      <div className="min-w-0 flex-1 text-right">{children}</div>
    </div>
  );
}

const VALUE = "w-full bg-transparent text-right text-[15px] outline-none";

/** A typed answer, right-aligned, no box. */
export function IosInput({
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "date";
  inputMode?: "decimal";
  label: string;
}) {
  return (
    <input
      type={type}
      inputMode={inputMode}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
      style={{ textAlign: "right" }}
      className={cn(
        VALUE,
        "placeholder:text-muted-foreground/70",
        // The phone's date field draws its own text, left-aligned by default.
        "[&::-webkit-date-and-time-value]:text-right [&::-webkit-datetime-edit]:justify-end",
        type === "date" && "min-h-11 text-right",
      )}
    />
  );
}

/** A choice: the value and a chevron, then a pop-up menu right at the value. */
export function IosPicker({
  label,
  value,
  onChange,
  options,
  placeholder,
  allowNew = false,
  clearable = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  /** Lets a value that is not in the list be typed in, as a combo box does. */
  allowNew?: boolean;
  /** Offers a row that empties the field again. */
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = options.find((o) => o.value === value)?.label ?? value;
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? options.filter((o) => o.label.toLowerCase().includes(n)) : options;
  }, [options, q]);
  const typed = q.trim();
  const offerNew =
    allowNew && typed && !options.some((o) => o.label.toLowerCase() === typed.toLowerCase());

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        if (v) setQ("");
        setOpen(v);
      }}
    >
      <div className="flex w-full items-center justify-end gap-1.5">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="flex min-w-0 flex-1 items-center justify-end gap-1 text-[15px]"
          >
            <span className={cn("truncate", !shown && "text-muted-foreground/70")}>
              {shown || placeholder || "Select"}
            </span>
            {!(clearable && value) && (
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground/60" />
            )}
          </button>
        </PopoverTrigger>
        {/* With something chosen, the up-down arrows give way to a cross that
            empties the field. */}
        {clearable && value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={`Clear ${label}`}
            className="grid size-6 shrink-0 place-items-center text-muted-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {/* A menu that opens right at the value, the way iOS shows a pull-down:
          rounded, a tick on the one in use, scrolls when the list is long. */}
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[min(17rem,calc(100vw-2rem))] overflow-hidden rounded-2xl p-0 shadow-xl"
      >
        {(options.length > 8 || allowNew) && (
          <label className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={allowNew ? `Search or type a new ${label.toLowerCase()}` : "Search"}
              className="w-full bg-transparent text-[15px] outline-none"
            />
          </label>
        )}
        <div className="max-h-64 divide-y divide-border/60 overflow-y-auto overflow-x-hidden">
          {offerNew && (
            <button
              type="button"
              onClick={() => pick(typed)}
              className="flex w-full items-center px-3.5 py-2.5 text-left text-[15px] text-primary"
            >
              Use “{typed}”
            </button>
          )}
          {list.map((o) => (
            <button
              key={o.value || "__none"}
              type="button"
              onClick={() => pick(o.value)}
              className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-[15px] active:bg-muted"
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <Check className="size-4 shrink-0 text-primary" />}
            </button>
          ))}
          {list.length === 0 && !offerNew && (
            <p className="px-3.5 py-3 text-center text-sm text-muted-foreground">Nothing found.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
