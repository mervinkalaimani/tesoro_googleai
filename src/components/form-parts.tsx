import { useRef } from "react";
import { AlertCircle, ChevronRight, Info, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * The pieces every car form is built from.
 *
 * These lived inside the add-car dialog, which meant the catalogue form grew its
 * own labels, its own inputs and its own idea of what a required field looks
 * like. Three forms edit the same thirteen catalogue fields; they should not
 * disagree about how a label is spelled or where a clear button sits.
 */

/** A labelled field, with room for the message when it is the one that failed. */
export function Field({
  label,
  children,
  className = "",
  info,
  name,
  error,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  /** A sentence explaining the field, behind an ⓘ beside its label. */
  info?: string;
  /** The form key, so a failed submit can find and scroll to the field. */
  name?: string;
  /** What is missing, shown under the field with the field outlined in red. */
  error?: string;
}) {
  return (
    <div
      data-field={name}
      aria-invalid={error ? true : undefined}
      className={cn(
        "space-y-1.5 w-full min-w-0 scroll-mt-24 scroll-mb-28",
        error &&
          "[&_input]:border-destructive [&_input]:ring-1 [&_input]:ring-destructive/40 [&_[role=combobox]]:border-destructive [&_[role=combobox]]:ring-1 [&_[role=combobox]]:ring-destructive/40",
        className,
      )}
    >
      <div className="flex items-center gap-1">
        <Label className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>
          {label}
        </Label>
        {info && <InfoTip label={label} text={info} />}
      </div>
      {children}
      {error && (
        <p role="alert" className="flex items-center gap-1 text-[11px] text-destructive">
          <AlertCircle className="size-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A popover rather than a tooltip: a tooltip needs a hover, and on a phone there
 * is none — the ⓘ would be decoration.
 */
export function InfoTip({ label, text }: { label: string; text: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`About ${label}`}
          className="grid size-4 place-items-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto max-w-[min(20rem,calc(100vw-2rem))] px-3 py-2 text-xs"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}

/** An input that can be emptied without selecting its contents first. */
export function ClearableInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  const ref = useRef<HTMLInputElement>(null);
  const hasValue = props.value !== undefined && props.value !== null && props.value !== "";
  const showClear = hasValue && !props.readOnly && !props.disabled;
  // A date field keeps its calendar icon at the far right, so the clear button
  // sits just inside it instead of taking the end of the field.
  const isDate = props.type === "date";

  const clear = () => {
    const el = ref.current;
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
  };

  return (
    <div className="relative w-full min-w-0">
      <Input
        {...props}
        ref={ref}
        className={cn("min-w-0 w-full", showClear && !isDate && "pr-8", className)}
      />
      {showClear && (
        <button
          type="button"
          onClick={clear}
          aria-label={`Clear ${props["aria-label"] || props.placeholder || "field"}`}
          className={cn(
            "absolute top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground",
            isDate ? "right-9" : "right-2",
          )}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * A labelled, collapsible group of fields, with what it holds on the header so a
 * shut one still tells you something.
 */
export function FormSection({
  title,
  badge,
  badgeTone = "muted",
  open,
  onToggle,
  children,
}: {
  title: string;
  badge?: string;
  /** "warn" for a badge that is flagging something missing. */
  badgeTone?: "muted" | "warn";
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/40"
      >
        {title}
        {badge && (
          <span
            className={cn(
              "ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium",
              badgeTone === "warn"
                ? "bg-primary/12 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            {badge}
          </span>
        )}
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            !badge && "ml-auto",
            open && "rotate-90",
          )}
        />
      </button>
      {open && <div className="border-t border-border p-3">{children}</div>}
    </section>
  );
}

/**
 * Values this collection already uses, one tap under the field they fill.
 * `scroll` keeps them on one line: a wrapped second row of sellers pushes the
 * money fields down a phone, and the bar is hidden because three chips are a
 * swipe rather than a widget.
 */
export function PillRow({
  children,
  scroll = false,
}: {
  children: React.ReactNode;
  scroll?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex gap-1.5 pt-1.5",
        scroll
          ? "flex-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "flex-wrap",
      )}
    >
      {children}
    </div>
  );
}

export function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-auto shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tabular-nums",
        active
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
          : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
      )}
    >
      {children}
    </Button>
  );
}
