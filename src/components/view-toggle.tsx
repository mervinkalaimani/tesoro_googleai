import { LayoutGrid, List, Grid3x3 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * How a list of cars is laid out.
 *
 * Table first, because it is the one that answers a question — what did this
 * cost, who sold it, when did it land — where the grids answer "which one is
 * it". Then the two grids, large to small.
 */
export type ViewMode = "table" | "grid" | "compact";

const MODES: { value: ViewMode; label: string; icon: typeof List }[] = [
  { value: "table", label: "Table view", icon: List },
  { value: "grid", label: "Grid view", icon: LayoutGrid },
  { value: "compact", label: "Compact grid view", icon: Grid3x3 },
];

/** Column counts for the two grids, shared so every page matches: 2 cols for grid and 3 cols for compact on phone */
export const GRID_COLS = "grid gap-2.5 sm:gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
export const COMPACT_GRID_COLS =
  "grid gap-1.5 sm:gap-2 grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8";

export function ViewToggle({
  value,
  onChange,
  className = "",
  modes,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  className?: string;
  /**
   * Limit the choices, for a page with no table to show — and order them: the
   * icons come out in the order given. The catalogue puts its list last because
   * the grids are what people browse it with; the collection leaves this unset
   * and gets the table first, which is what it is read through.
   */
  modes?: ViewMode[];
}) {
  const shown = modes ? modes.flatMap((v) => MODES.filter((m) => m.value === v)) : MODES;
  return (
    // Same container styling as SegmentControl (rounded-md, border-border, bg-muted/40, p-0.5)
    <div
      className={cn(
        "inline-flex h-8 shrink-0 items-center rounded-md border border-border bg-muted/40 p-0.5",
        className,
      )}
    >
      {shown.map((m) => {
        const Icon = m.icon;
        const active = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => onChange(m.value)}
            aria-pressed={active}
            aria-label={m.label}
            title={m.label}
            className={cn(
              "grid size-7 place-items-center rounded-[6px] transition-all",
              active
                ? "bg-background text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
