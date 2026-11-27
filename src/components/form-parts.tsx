import { createContext, useContext, useRef } from "react";
import { AlertCircle, ChevronRight, ExternalLink, Info, X } from "lucide-react";

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

/**
 * On a phone, the update forms read like iOS Settings: each field is a row with its label on the
 * left and its answer on the right, and the explanatory text is left out. The form turns this on
 * for the phone; the desktop layout does not use it.
 */
const IosFormContext = createContext(false);
export const IosFormProvider = IosFormContext.Provider;
export const useIosForm = () => useContext(IosFormContext);

/** Borderless, right-aligned answers inside an iOS row. */
const IOS_ANSWER =
  "[&_input]:h-11 [&_input]:border-0 [&_input]:bg-transparent [&_input]:pl-0 [&_input]:pr-6 [&_input]:text-right [&_input]:text-[15px] [&_input]:shadow-none [&_input]:ring-0 [&_[role=combobox]]:h-11 [&_[role=combobox]]:justify-end [&_[role=combobox]]:gap-1.5 [&_[role=combobox]]:border-0 [&_[role=combobox]]:bg-transparent [&_[role=combobox]]:px-0 [&_[role=combobox]]:text-[15px] [&_[role=combobox]]:shadow-none [&_[role=combobox]]:ring-0 [&_[role=combobox]>span]:text-right [&_button[aria-label^='Clear']]:right-0 [&_button[aria-label^='Clear']]:size-4 [&_input[type=date]]:!inline-flex [&_input[type=date]]:!pr-5 [&_input[type=date]]:!text-sm [&_input[type=date]]:justify-end [&_input[type=date]::-webkit-calendar-picker-indicator]:hidden";

/** A labelled field, with room for the message when it is the one that failed. */
export function Field({
  label,
  children,
  className = "",
  info,
  name,
  error,
  required,
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
  /** Marks the label with a star. Says nothing about validation, which is the form's. */
  required?: boolean;
}) {
  const ios = useIosForm();
  if (ios) {
    return (
      <div
        data-field={name}
        aria-invalid={error ? true : undefined}
        className={cn(
          // A row of the group, not a card: the group draws the box, and a hairline above each row
          // (the first one is clipped by the group) is what separates them.
          "flex min-h-11 w-full min-w-0 scroll-mt-24 scroll-mb-28 flex-wrap items-center justify-between gap-x-4 border-t border-border/60 px-4 has-[.glass-btn]:flex-col has-[.glass-btn]:items-stretch has-[.glass-btn]:gap-1.5 has-[.glass-btn]:py-2.5 has-[[data-menu-pill]]:!flex-row has-[[data-menu-pill]]:!items-center has-[[data-menu-pill]]:!py-0 has-[textarea]:flex-col has-[textarea]:items-stretch has-[textarea]:py-2.5",
          IOS_ANSWER,
          error && "bg-destructive/[0.06]",
          className,
        )}
      >
        <Label
          className={cn(
            "flex shrink-0 items-center gap-1 text-[15px] font-normal",
            error && "text-destructive",
          )}
        >
          {label}
          {required && <span className="text-primary">*</span>}
          {info && <InfoTip label={label} text={info} />}
        </Label>
        <div className="min-w-0 flex-1 text-right has-[.glass-btn]:text-left has-[[data-menu-pill]]:!text-right has-[textarea]:text-left">
          {children}
        </div>
        {error && (
          <p role="alert" className="flex w-full items-center gap-1 pb-2 text-xs text-destructive">
            <AlertCircle className="size-3 shrink-0" />
            {error}
          </p>
        )}
      </div>
    );
  }
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
        {/* Small caps rather than sentence case: a label this size has to read
            as a label and not as the first word of the answer. */}
        <Label
          className={cn(
            "text-xs font-semibold uppercase tracking-wider",
            error ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {label}
          {required && <span className="ml-0.5 text-primary">*</span>}
        </Label>
        {info && <InfoTip label={label} text={info} />}
      </div>
      {children}
      {error && (
        <p role="alert" className="flex items-center gap-1 text-xs text-destructive">
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
  id,
  title,
  description,
  badge,
  badgeTone = "muted",
  open,
  onToggle,
  children,
}: {
  /** What the rail beside the form scrolls to. See editor-shell.tsx. */
  id?: string;
  title: string;
  /** One line saying what the section is for, under its title. */
  description?: string;
  badge?: string;
  /** "warn" for a badge that is flagging something missing. */
  badgeTone?: "muted" | "warn";
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const ios = useIosForm();
  if (ios) {
    // iOS Settings: the section's title above, outside, small and grey; then one rounded group that
    // holds the rows, with a hairline between them. No frame round the section as well.
    return (
      <section data-section={id} className="scroll-mt-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          // Rides the top while its rows are on screen, as a grouped table's header does.
          className="sticky top-0 z-10 flex w-full items-center gap-2 bg-background px-4 py-2 text-left"
        >
          <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
          {badge && (
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                badgeTone === "warn" ? "bg-primary/12 text-primary" : "text-muted-foreground",
              )}
            >
              {badge}
            </span>
          )}
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
        </button>
        {open && (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            {/* -mt-px hides the first row's hairline under the group's edge; the rows sit flush,
                and anything that put a gap between them (grids, stacks) is closed up. */}
            <div className="-mt-px [&_.grid-cols-1]:!gap-y-0 [&_.mb-3]:!mb-0 [&_.space-y-2>*+*]:!mt-0 [&_.space-y-3>*+*]:!mt-0 [&_p.text-muted-foreground]:hidden">
              {children}
            </div>
          </div>
        )}
      </section>
    );
  }
  return (
    <section
      data-section={id}
      // Scrolled to by the rail, so it stops clear of the top of the scroller
      // rather than flush against it.
      //
      // No `overflow-hidden`: it would make this section the sticky header's
      // scrollport, and a box that never scrolls is a box a header never
      // sticks inside. The corners are rounded on the header and the body
      // instead, which is what the clip was doing.
      className="scroll-mt-2 rounded-xl border border-border/70 bg-muted/30"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        // Rides the top of the form while its own fields are on screen, the
        // way a grouped table's header does on iOS — so you can always see
        // which section you are filling in.
        className="sticky top-0 z-10 flex w-full items-start gap-2 rounded-t-xl border-b border-transparent bg-muted/80 px-3.5 py-2.5 text-left backdrop-blur-sm hover:bg-muted/50"
      >
        <span className="min-w-0 flex-1">
          {/* Small, grey and in caps: a label for what follows rather than a
              title competing with the field names under it. */}
          <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
          {description && (
            <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
          )}
        </span>
        {badge && (
          <span
            className={cn(
              "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
              badgeTone === "warn"
                ? "bg-primary/12 text-primary"
                : "bg-background text-muted-foreground",
            )}
          >
            {badge}
          </span>
        )}
        <ChevronRight
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open && (
        <div className="rounded-b-xl border-t border-border/70 bg-card p-3.5">{children}</div>
      )}
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
        "h-auto shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums",
        active
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
          : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
      )}
    >
      {children}
    </Button>
  );
}

/**
 * Which catalogue entry this is: the last line of the details, as a value a
 * SummaryRow prints.
 *
 * A link from a car, which is filed under a casting it can go and read. Not a
 * link from the casting itself — that page is the one being edited, and
 * offering to open it from inside its own form is a trip back to where you
 * already are.
 */
export function CatalogueIdValue({ id, href = true }: { id?: string | null; href?: boolean }) {
  const value = (id ?? "").trim();
  if (!value) return null;
  if (!href) return <span className="font-mono text-xs">{value}</span>;
  return (
    <a
      href={`/catalog/${encodeURIComponent(value)}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Open this casting's catalogue page"
      className="inline-flex max-w-full items-center gap-1.5 font-mono text-xs text-primary hover:underline"
    >
      <span className="truncate">{value}</span>
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}
