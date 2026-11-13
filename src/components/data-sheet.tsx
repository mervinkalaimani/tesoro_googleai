import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, X } from "lucide-react";
import { parseDMY } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Rows as a sheet: click a heading to sort, type under it to filter, and the
 * footer adds up what is left.
 *
 * Filters are ANDed and an empty value always sorts to the bottom. It does not
 * know what a row is; the caller says what each column reads and how it looks.
 */

export type SheetKind = "text" | "number" | "date";

export type SheetColumn<T> = {
  key: string;
  label: string;
  kind: SheetKind;
  /** The value sorted and filtered on: a number, a time, or a string. */
  value: (r: T) => string | number | null;
  /** What is printed, when that differs from the value. Also what a text filter reads. */
  text?: (r: T) => string;
  /** A cell that is more than text, such as a pill. */
  render?: (r: T, text: string) => ReactNode;
  width: string;
  /** Number columns marked so are summed in the footer. */
  sum?: boolean;
  /** Extra classes for the cell. */
  cellClass?: string;
  /** Format for the footer total. */
  total?: (n: number) => string;
};

/**
 * A number against a typed filter: `500`, `>500`, `<=1000`, `500-1500`. Anything
 * else is matched as text against the number as printed, so `1,6` still finds
 * 1,649.
 */
function matchNumber(value: number, shown: string, q: string): boolean {
  const range = q.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (range) return value >= Number(range[1]) && value <= Number(range[2]);
  const cmp = q.match(/^(>=|<=|>|<|=)?\s*(\d+(?:\.\d+)?)$/);
  if (cmp) {
    const n = Number(cmp[2]);
    switch (cmp[1]) {
      case ">":
        return value > n;
      case "<":
        return value < n;
      case ">=":
        return value >= n;
      case "<=":
        return value <= n;
      default:
        return value === n;
    }
  }
  return shown.toLowerCase().includes(q.toLowerCase());
}

/** A date against `>15/11/2026`, `<…`, or text matched against the printed day. */
function matchDate(value: number | null, shown: string, q: string): boolean {
  const cmp = q.match(/^(>=|<=|>|<)\s*(.+)$/);
  if (cmp) {
    const d = parseDMY(cmp[2]);
    if (!d || value === null) return false;
    const t = d.getTime();
    if (cmp[1] === ">") return value > t;
    if (cmp[1] === "<") return value < t;
    return cmp[1] === ">=" ? value >= t : value <= t;
  }
  return shown.toLowerCase().includes(q.toLowerCase());
}

type Sort = { key: string; dir: "asc" | "desc" } | null;

export function DataSheet<T>({
  rows,
  columns,
  rowKey,
  onOpen,
  initialSort = null,
  empty = "No rows match.",
  className,
}: {
  rows: T[];
  columns: SheetColumn<T>[];
  rowKey: (r: T) => string;
  /** Click on a row. Unset leaves rows plain. */
  onOpen?: (r: T) => void;
  initialSort?: Sort;
  empty?: string;
  /** Height of the scrolling area. */
  className?: string;
}) {
  const [sort, setSort] = useState<Sort>(initialSort);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const active = Object.values(filters).filter((v) => v.trim()).length;

  const shown = useMemo(() => {
    const live = columns.filter((c) => (filters[c.key] ?? "").trim());
    let out = rows.filter((r) =>
      live.every((c) => {
        const q = (filters[c.key] ?? "").trim();
        const v = c.value(r);
        const printed = c.text ? c.text(r) : String(v ?? "");
        if (c.kind === "number") return matchNumber(Number(v ?? 0), printed, q);
        if (c.kind === "date") return matchDate(v as number | null, printed, q);
        return printed.toLowerCase().includes(q.toLowerCase());
      }),
    );
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        const sign = sort.dir === "asc" ? 1 : -1;
        out = [...out].sort((a, b) => {
          const x = col.value(a);
          const y = col.value(b);
          // A blank goes last whichever way the column runs.
          const blank = (v: string | number | null) => v === null || v === "";
          if (blank(x) || blank(y)) return blank(x) === blank(y) ? 0 : blank(x) ? 1 : -1;
          if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
          return String(x).localeCompare(String(y), undefined, { numeric: true }) * sign;
        });
      }
    }
    return out;
  }, [rows, columns, filters, sort]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const c of columns) {
      if (c.sum) t[c.key] = shown.reduce((s, r) => s + Number(c.value(r) ?? 0), 0);
    }
    return t;
  }, [shown, columns]);

  /** Ascending, then descending, then back to the order the rows came in. */
  const cycle = (key: string) =>
    setSort((s) =>
      !s || s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null,
    );

  const cell = "border-b border-r border-border/60 px-2 py-1.5 text-xs whitespace-nowrap";

  return (
    <div className="card-elevated overflow-hidden">
      <div className={cn("max-h-[calc(100vh-15rem)] overflow-auto", className)}>
        <table className="w-max min-w-full border-separate border-spacing-0 text-left">
          <thead className="sticky top-0 z-20">
            <tr className="bg-muted">
              <th
                className={cn(
                  cell,
                  "sticky left-0 z-30 w-10 bg-muted text-center font-medium text-muted-foreground",
                )}
              >
                #
              </th>
              {columns.map((c) => {
                const on = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    className={cn(cell, c.width, "bg-muted p-0 font-semibold")}
                    aria-sort={on ? (sort?.dir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <button
                      type="button"
                      onClick={() => cycle(c.key)}
                      title={`Sort by ${c.label}`}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-1 px-2 py-1.5 uppercase tracking-wider hover:bg-foreground/5",
                        c.kind === "number" && "flex-row-reverse text-right",
                        on ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      <span>{c.label}</span>
                      {on ? (
                        sort?.dir === "asc" ? (
                          <ArrowUp className="size-3 shrink-0" />
                        ) : (
                          <ArrowDown className="size-3 shrink-0" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 shrink-0 opacity-30" />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
            <tr className="bg-muted">
              <th
                className={cn(cell, "sticky left-0 z-30 bg-muted p-0 text-center")}
                title="Clear every filter"
              >
                <button
                  type="button"
                  disabled={active === 0}
                  onClick={() => setFilters({})}
                  aria-label="Clear every filter"
                  className="grid size-full cursor-pointer place-items-center py-1.5 text-muted-foreground enabled:hover:text-foreground disabled:cursor-default disabled:opacity-30"
                >
                  <X className="size-3" />
                </button>
              </th>
              {columns.map((c) => (
                <th key={c.key} className={cn(cell, "bg-muted p-0.5 font-normal")}>
                  <input
                    value={filters[c.key] ?? ""}
                    onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                    placeholder={
                      c.kind === "text" ? "Filter" : c.kind === "number" ? ">500" : ">dd/mm/yy"
                    }
                    aria-label={`Filter ${c.label}`}
                    className={cn(
                      "h-6 w-full rounded-sm border border-transparent bg-background/60 px-1.5 text-xs outline-none placeholder:text-muted-foreground/50 focus:border-primary/60",
                      c.kind === "number" && "text-right",
                      (filters[c.key] ?? "").trim() && "border-primary/50 bg-primary/10",
                    )}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr
                key={rowKey(r)}
                onClick={onOpen ? () => onOpen(r) : undefined}
                className={cn(
                  "group odd:bg-background even:bg-muted/20",
                  onOpen && "cursor-pointer hover:bg-primary/10",
                )}
              >
                <td
                  className={cn(
                    cell,
                    "sticky left-0 z-10 bg-inherit text-center tabular-nums text-muted-foreground",
                  )}
                >
                  {i + 1}
                </td>
                {columns.map((c) => {
                  const text = c.text ? c.text(r) : String(c.value(r) ?? "");
                  return (
                    <td
                      key={c.key}
                      className={cn(
                        cell,
                        c.kind === "number" && "text-right tabular-nums",
                        c.cellClass,
                      )}
                      title={text || undefined}
                    >
                      {c.render
                        ? c.render(r, text)
                        : text || <span className="text-muted-foreground/40">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="p-8 text-center text-sm text-muted-foreground"
                >
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="sticky bottom-0 z-20">
            <tr className="bg-muted font-semibold">
              <td className={cn(cell, "sticky left-0 z-30 bg-muted")} />
              {columns.map((c, i) => (
                <td
                  key={c.key}
                  className={cn(cell, "bg-muted", c.kind === "number" && "text-right tabular-nums")}
                >
                  {i === 0
                    ? `${shown.length} of ${rows.length} rows`
                    : c.sum
                      ? (c.total ?? String)(totals[c.key] ?? 0)
                      : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
