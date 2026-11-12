import { LayoutGrid, List, RectangleVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * How a list of cars is laid out.
 *
 * Table first, because it is the one that answers a question — what did this
 * cost, who sold it, when did it land — where the grids answer "which one is
 * it". Then the two grids, large to small.
 */
export type ViewMode = "table" | "grid" | "blister";

const MODES: { value: ViewMode; label: string; icon: typeof List }[] = [
  { value: "blister", label: "Blister view", icon: RectangleVertical },
  { value: "grid", label: "Grid view", icon: LayoutGrid },
  { value: "table", label: "Table view", icon: List },
];

/** Column counts for the two grids, shared so every page matches: 2 cols on a phone */
export const GRID_COLS = "grid gap-2.5 sm:gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
/**
 * Blister view: one column more than the grid at every width, because a blister
 * card is taller than it is wide and a row of them would otherwise run off the
 * bottom of the screen before it ran out of cars.
 */
export const BLISTER_GRID_COLS =
  "grid gap-2.5 sm:gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

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
   * icons come out in the order given. Unset is every view, blister first, which
   * is also the one every page opens on.
   */
  modes?: ViewMode[];
}) {
  const shown = modes ? modes.flatMap((v) => MODES.filter((m) => m.value === v)) : MODES;
  const current = shown.find((m) => m.value === value) ?? shown[0];
  const CurrentIcon = current.icon;
  return (
    <>
      {/* On a phone four icons are four 28px targets in one row; one button
          holding a menu leaves the toolbar room and a proper tap size. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`View: ${current.label}`}
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-md border border-border bg-muted/40 text-foreground sm:hidden",
            className,
          )}
        >
          <CurrentIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as ViewMode)}>
            {shown.map((m) => (
              <DropdownMenuRadioItem key={m.value} value={m.value} className="gap-2 py-2.5">
                <m.icon className="size-4" />
                {m.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Same container styling as SegmentControl (rounded-md, border-border, bg-muted/40, p-0.5) */}
      <div
        className={cn(
          "hidden h-8 shrink-0 items-center rounded-md border sm:inline-flex border-border bg-muted/40 p-0.5",
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
    </>
  );
}
