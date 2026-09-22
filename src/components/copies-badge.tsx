/**
 * "6×" — this casting is in the collection six times over.
 *
 * Shown only when there is more than one, and only in My Cars, where the copies
 * are collapsed into a single row. Tapping it opens the rest of them in place;
 * the car's own page carries the full purchase history either way.
 *
 * Same size and weight as the chase and favourite marks it sits beside, so it
 * reads as one more fact about the car rather than a control bolted on.
 */
export function CopiesBadge({
  n,
  expanded = false,
  onToggle,
  className = "",
}: {
  n: number;
  expanded?: boolean;
  /** Absent for a card that cannot expand — the badge is then just a count. */
  onToggle?: () => void;
  className?: string;
}) {
  if (n < 2) return null;

  const look =
    "inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-1.5 " +
    "text-[11px] font-bold leading-[1.4] tabular-nums text-primary";

  if (!onToggle) {
    return (
      <span className={`${look} ${className}`} title={`You own this casting ${n} times`}>
        {n}×
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-expanded={expanded}
      title={expanded ? "Collapse these copies" : `Show all ${n} copies`}
      onClick={(e) => {
        // The row underneath opens the car; this one only opens the group.
        e.stopPropagation();
        onToggle();
      }}
      className={`${look} transition-colors hover:bg-primary/20 ${className}`}
    >
      {expanded ? "Hide" : `${n}×`}
    </button>
  );
}
