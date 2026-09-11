import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type RecordField = {
  label: string;
  value: ReactNode;
};

/** How many fields a card shows before "View more". */
const COLLAPSED_FIELDS = 3;

/**
 * A table row, for a screen too narrow to be a table.
 *
 * Columns that scroll sideways are a way of pretending a table fits; this shows
 * the same record as a stack of label / value rows with the identifier and the
 * row's actions in a header, and keeps it short — the first three fields, then
 * "View more" for the rest. Every list in the app uses it below `md`, so a
 * record reads the same wherever you meet it.
 */
export function MobileRecordCard({
  id,
  fields,
  actions,
  footer,
  onOpen,
  selected,
  onSelectedChange,
  collapsedCount = COLLAPSED_FIELDS,
  className,
}: {
  /** The short identifier in the header — a car ID, a user handle. */
  id: ReactNode;
  fields: RecordField[];
  /** Icon buttons for this record, shown at the right of the header. */
  actions?: ReactNode;
  /** Anything that belongs under the fields — bulk actions, say. */
  footer?: ReactNode;
  /** Tapping the header opens the record. */
  onOpen?: () => void;
  selected?: boolean;
  onSelectedChange?: (next: boolean) => void;
  collapsedCount?: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? fields : fields.slice(0, collapsedCount);
  const hidden = fields.length - shown.length;

  return (
    <article className={cn("card-elevated overflow-hidden", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {onSelectedChange && (
            <input
              type="checkbox"
              checked={Boolean(selected)}
              onChange={(e) => onSelectedChange(e.target.checked)}
              aria-label="Select record"
              className="size-4 shrink-0 rounded border-input accent-primary"
            />
          )}
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              className="min-w-0 truncate text-left font-mono text-sm font-semibold"
            >
              {id}
            </button>
          ) : (
            <span className="min-w-0 truncate font-mono text-sm font-semibold">{id}</span>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
      </header>

      <dl>
        {shown.map((f, i) => (
          <div
            key={f.label}
            className={cn(
              "flex items-center justify-between gap-3 px-3 py-2.5",
              i > 0 && "border-t border-border/60",
            )}
          >
            <dt className="shrink-0 text-xs text-muted-foreground">{f.label}</dt>
            <dd className="min-w-0 flex-1 truncate text-right text-sm font-medium">
              {f.value ?? "—"}
            </dd>
          </div>
        ))}
      </dl>

      {fields.length > collapsedCount && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full border-t border-border/60 py-2.5 text-center text-sm font-semibold text-primary"
        >
          {expanded ? "View less" : `View more${hidden ? ` (${hidden})` : ""}`}
        </button>
      )}

      {footer && <div className="border-t border-border/60 px-3 py-2.5">{footer}</div>}
    </article>
  );
}

/** The compact icon button the card headers use. */
export function RecordAction({
  label,
  onClick,
  children,
  tone = "default",
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  tone?: "default" | "destructive";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 place-items-center rounded-md transition-colors disabled:opacity-40",
        tone === "destructive"
          ? "text-rose-500 hover:bg-rose-500/10"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
