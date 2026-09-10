import { LayoutGrid, List, Grid3x3 } from "lucide-react";

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

/** Column counts for the two grids, shared so every page matches. */
export const GRID_COLS = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
export const COMPACT_GRID_COLS =
  "grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8";

export function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div className="flex shrink-0 items-center rounded-md border border-border p-0.5">
      {MODES.map((m) => {
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
            className={`grid size-7 place-items-center rounded transition-colors ${
              active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
