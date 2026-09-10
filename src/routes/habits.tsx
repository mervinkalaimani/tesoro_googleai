import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type CSSProperties } from "react";
import { CalendarDays, PackageCheck, ShoppingCart, Wallet, Store, Tag } from "lucide-react";

import { useCars } from "@/lib/cars-store";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import type { Diecast } from "@/lib/types";
import { inr, inrFull, parseDMY, formatDMY } from "@/lib/format";
import { SegmentControl } from "@/components/segment-control";
import { StatusPill, carSubLine } from "@/components/cars-table";
import { useCarDrawer } from "@/components/car-details-drawer";

export const Route = createFileRoute("/habits")({
  head: () => ({
    meta: [
      { title: "Habit Tracker | Tesoro" },
      {
        name: "description",
        content:
          "Track your diecast ordering and delivery habits day by day with an activity heatmap and collecting insights.",
      },
      { property: "og:title", content: "Habit Tracker | Tesoro" },
      {
        property: "og:description",
        content:
          "Track your diecast ordering and delivery habits day by day with an activity heatmap and collecting insights.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HabitsPage,
});

type Mode = "ordered" | "delivered";
type View = "daily" | "weekly" | "monthly" | "yearly";
type Range = "this" | "last" | "3" | "6" | "12";

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * One square size for every view. The yearly and mobile matrices used to size
 * their cells as a fraction of the available width, so four years of data drew
 * squares several times the size of a daily cell — the same heatmap at a
 * different scale depending on which button was pressed.
 */
const SQUARE = "size-5 shrink-0 rounded-[4px]";

const LEVEL_CLASS = [
  "bg-muted/50",
  "bg-primary/25",
  "bg-primary/45",
  "bg-primary/70",
  "bg-primary",
];

type Cell = { key: string; date: Date; count: number; spent: number; items: Diecast[] };
type Bucket = {
  key: string;
  label: string;
  sub?: string;
  count: number;
  spent: number;
  items: Diecast[];
};

function rangeBounds(range: Range) {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (range === "this") {
    return { start: new Date(today.getFullYear(), today.getMonth(), 1), end };
  }
  if (range === "last") {
    return {
      start: new Date(today.getFullYear(), today.getMonth() - 1, 1),
      end: new Date(today.getFullYear(), today.getMonth(), 0),
    };
  }
  const start = new Date(end);
  start.setMonth(start.getMonth() - Number(range));
  start.setDate(start.getDate() + 1);
  return { start, end };
}

function HabitsPage() {
  const { query } = useApp();
  const cars = useCars();
  const rows = useMemo(() => filterRows(cars, query), [cars, query]);
  const [mode, setMode] = useState<Mode>("ordered");
  const [view, setView] = useState<View>("daily");
  const [range, setRange] = useState<Range>("6");
  const [selected, setSelected] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Diecast[]>();
    for (const r of rows) {
      const src = mode === "ordered" ? r.orderDate || r.date : r.date;
      if (mode === "delivered" && (r.status || "").trim().toLowerCase() !== "available") continue;
      const dt = parseDMY(src);
      if (!dt) continue;
      const k = dayKey(dt);
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    }
    return map;
  }, [rows, mode]);

  // Yearly view always covers every year present in the data
  const allBounds = useMemo(() => {
    const keys = [...byDay.keys()].sort();
    const today = new Date();
    const end = new Date(today.getFullYear(), 11, 31);
    if (!keys.length) return { start: new Date(today.getFullYear(), 0, 1), end };
    const first = new Date(keys[0]);
    return { start: new Date(first.getFullYear(), 0, 1), end };
  }, [byDay]);

  const cells = useMemo<Cell[]>(() => {
    const { start, end } = view === "yearly" ? allBounds : rangeBounds(range);
    const s = new Date(start);
    const out: Cell[] = [];
    for (const d = new Date(s); d <= end; d.setDate(d.getDate() + 1)) {
      const date = new Date(d);
      const k = dayKey(date);
      const items = byDay.get(k) ?? [];
      out.push({
        key: k,
        date,
        items,
        count: items.length,
        spent: items.reduce((sum, r) => sum + (r.spent || 0), 0),
      });
    }
    return out;
  }, [byDay, range, view, allBounds]);

  // Heatmap columns: pad the first week so weekdays line up
  const grid = useMemo(() => {
    const weeks: (Cell | null)[][] = [];
    let cur: (Cell | null)[] = [];
    const first = cells[0];
    if (first) for (let i = 0; i < first.date.getDay(); i++) cur.push(null);
    for (const c of cells) {
      cur.push(c);
      if (c.date.getDay() === 6) {
        weeks.push(cur);
        cur = [];
      }
    }
    if (cur.length) {
      while (cur.length < 7) cur.push(null);
      weeks.push(cur);
    }
    return weeks;
  }, [cells]);

  const buckets = useMemo<Bucket[]>(() => {
    if (view === "daily") {
      return cells.map((c) => ({
        key: c.key,
        label: formatDMY(c.date),
        count: c.count,
        spent: c.spent,
        items: c.items,
      }));
    }
    const map = new Map<string, Bucket>();
    for (const c of cells) {
      let key: string, label: string, sub: string | undefined;
      if (view === "weekly") {
        const ws = new Date(c.date);
        ws.setDate(ws.getDate() - ws.getDay());
        key = dayKey(ws);
        label = `Week of ${formatDMY(ws)}`;
        sub = undefined;
      } else if (view === "monthly") {
        key = `${c.date.getFullYear()}-${String(c.date.getMonth() + 1).padStart(2, "0")}`;
        label = `${MONTHS[c.date.getMonth()]} ${c.date.getFullYear()}`;
      } else {
        key = String(c.date.getFullYear());
        label = key;
      }
      const b = map.get(key) ?? { key, label, sub, count: 0, spent: 0, items: [] };
      b.count += c.count;
      b.spent += c.spent;
      b.items.push(...c.items);
      map.set(key, b);
    }
    return [...map.values()];
  }, [cells, view]);

  const max = useMemo(() => buckets.reduce((m, b) => Math.max(m, b.count), 0) || 1, [buckets]);

  // Matrix layout for weekly / monthly / yearly: years on the Y axis
  const matrix = useMemo(() => {
    if (view === "daily") return null;
    const byYear = new Map<number, Map<number, Bucket>>();
    let maxCol = 0;
    for (const b of buckets) {
      const d = new Date(b.key.length === 4 ? `${b.key}-01-01` : b.key);
      const year = d.getFullYear();
      let col = 0;
      if (view === "monthly") col = d.getMonth();
      else if (view === "weekly") {
        const jan1 = new Date(year, 0, 1);
        col = Math.floor((d.getTime() - jan1.getTime()) / 86400000 / 7);
      }
      maxCol = Math.max(maxCol, col);
      const row = byYear.get(year) ?? new Map<number, Bucket>();
      row.set(col, b);
      byYear.set(year, row);
    }
    const cols = view === "yearly" ? 1 : maxCol + 1;
    const labels =
      view === "monthly"
        ? MONTHS.slice(0, cols).map((m) => m[0])
        : view === "weekly"
          ? Array.from({ length: cols }, (_, i) => (i % 4 === 0 ? `W${i + 1}-${i + 4}` : ""))
          : [""];
    const rows = [...byYear.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, row]) => ({
        year,
        cells: Array.from({ length: cols }, (_, i) => row.get(i) ?? null),
      }));
    return { rows, labels, cols };
  }, [buckets, view]);

  const unit =
    view === "daily" ? "day" : view === "weekly" ? "week" : view === "monthly" ? "month" : "year";

  const stats = useMemo(() => {
    const active = buckets.filter((b) => b.count > 0);
    const totalCars = active.reduce((s, b) => s + b.count, 0);
    const totalSpent = active.reduce((s, b) => s + b.spent, 0);
    const best = active.reduce<Bucket | null>((b, c) => (!b || c.count > b.count ? c : b), null);
    let streak = 0;
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (buckets[i].count > 0) streak++;
      else if (streak > 0) break;
    }
    const avg = active.length ? totalCars / active.length : 0;
    return { active: active.length, totalCars, totalSpent, best, streak, avg };
  }, [buckets]);

  const selectedBucket = buckets.find((b) => b.key === selected) ?? null;
  const insightRows = useMemo(
    () => (selectedBucket ? selectedBucket.items : buckets.flatMap((b) => b.items)),
    [buckets, selectedBucket],
  );

  const level = (count: number) => {
    if (!count) return 0;
    const pct = count / max;
    if (pct > 0.75) return 4;
    if (pct > 0.5) return 3;
    if (pct > 0.25) return 2;
    return 1;
  };

  return (
    <div className="mx-auto min-w-0 max-w-[1600px] space-y-4 overflow-x-hidden p-3 md:p-6">
      <section className="grid grid-cols-2 gap-3 pb-1 md:flex md:snap-x md:overflow-x-auto md:[&>*]:min-w-[9.5rem] md:[&>*]:flex-1">
        <Stat
          icon={<CalendarDays className="size-4" />}
          label={`Active ${unit}s`}
          value={stats.active.toLocaleString()}
          hint={`of ${buckets.length}`}
        />
        <Stat
          icon={
            mode === "ordered" ? (
              <ShoppingCart className="size-4" />
            ) : (
              <PackageCheck className="size-4" />
            )
          }
          label={mode === "ordered" ? "Cars ordered" : "Cars delivered"}
          value={stats.totalCars.toLocaleString()}
          hint={`${stats.avg.toFixed(1)} per active ${unit}`}
        />
        <Stat
          icon={<CalendarDays className="size-4" />}
          label={`Busiest ${unit}`}
          value={stats.best ? String(stats.best.count) : "—"}
          hint={stats.best?.label}
        />
        <Stat
          icon={<CalendarDays className="size-4" />}
          label="Current streak"
          value={`${stats.streak} ${unit}${stats.streak === 1 ? "" : "s"}`}
        />
        <Stat
          icon={<Wallet className="size-4" />}
          label="Total spent"
          value={inr(stats.totalSpent)}
        />
      </section>

      <section className="card-elevated min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h1 className="text-display truncate text-lg font-semibold">Habit tracker</h1>
            <p className="text-xs text-muted-foreground">
              {mode === "ordered" ? "When you place orders" : "When cars land in the collection"} ·
              tap a {unit} for details
            </p>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <SegmentControl
              value={mode}
              onChange={(v) => {
                setMode(v);
                setSelected(null);
              }}
              className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto"
              options={[
                { value: "ordered", label: "Ordered" },
                { value: "delivered", label: "Delivered" },
              ]}
            />
            <SegmentControl
              value={view}
              onChange={(v) => {
                setView(v);
                setSelected(null);
              }}
              className="grid w-full grid-cols-4 sm:inline-flex sm:w-auto"
              options={[
                { value: "daily", label: "Daily" },
                { value: "weekly", label: "Weekly" },
                { value: "monthly", label: "Monthly" },
                { value: "yearly", label: "Yearly" },
              ]}
            />
            <SegmentControl
              value={range}
              disabled={view === "yearly"}
              onChange={(v) => {
                setRange(v);
                setSelected(null);
              }}
              className="grid w-full grid-cols-5 sm:inline-flex sm:w-auto"
              options={[
                { value: "this", label: "This month" },
                { value: "last", label: "Last month" },
                { value: "3", label: "3M" },
                { value: "6", label: "6M" },
                { value: "12", label: "12M" },
              ]}
            />
          </div>
        </div>

        {view === "daily" ? (
          <div className="overflow-x-auto p-4">
            <div className="inline-flex min-w-full flex-col gap-1.5">
              <div className="flex gap-[6px] pl-12 text-[11px] text-muted-foreground">
                {grid.map((week, i) => {
                  const first = week.find(Boolean) as Cell | undefined;
                  const showLabel = first && first.date.getDate() <= 7;
                  const showYear = showLabel && first.date.getMonth() === 0;
                  return (
                    <span key={i} className="w-5 shrink-0 whitespace-nowrap">
                      {showLabel
                        ? showYear
                          ? `${MONTHS[0]} ${first!.date.getFullYear()}`
                          : MONTHS[first!.date.getMonth()]
                        : ""}
                    </span>
                  );
                })}
              </div>
              <div className="flex gap-[6px]">
                <div className="mr-1 flex w-11 shrink-0 flex-col gap-[6px] text-[11px] text-muted-foreground">
                  {DAYS.map((d) => (
                    <span key={d} className="h-5 leading-5">
                      {d}
                    </span>
                  ))}
                </div>
                {grid.map((week, wi) => (
                  <div key={wi} className="flex shrink-0 flex-col gap-[6px]">
                    {week.map((cell, di) => {
                      if (!cell) return <span key={di} className="size-5" />;
                      const lv = level(cell.count);
                      return (
                        <button
                          key={di}
                          type="button"
                          title={`${formatDMY(cell.date)} — ${cell.count} car${cell.count === 1 ? "" : "s"}${cell.spent ? ` · ${inr(cell.spent)}` : ""}`}
                          onClick={() => setSelected(cell.count ? cell.key : null)}
                          className={`size-5 rounded-[4px] ${LEVEL_CLASS[lv]} ${
                            selected === cell.key
                              ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                              : ""
                          } ${cell.count ? "cursor-pointer" : "cursor-default"}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-1.5 pl-12 text-[11px] text-muted-foreground">
                <span>Less</span>
                {LEVEL_CLASS.map((c, i) => (
                  <span key={i} className={`size-4 rounded-[4px] ${c}`} />
                ))}
                <span>More</span>
                <span className="ml-auto tabular-nums">{inrFull(stats.totalSpent)} total</span>
              </div>
            </div>
          </div>
        ) : view === "yearly" ? (
          <div className="p-4">
            <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
              {buckets.map((b) => (
                <div key={b.key} className="flex flex-col items-center gap-1">
                  <div className="text-[10px] text-muted-foreground">{b.label}</div>
                  <PeriodSquare
                    bucket={b}
                    level={level(b.count)}
                    selected={selected === b.key}
                    onSelect={setSelected}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="hidden min-w-full flex-col gap-1.5 sm:flex">
              <MatrixHeader labels={matrix?.labels ?? []} />
              {(matrix?.rows ?? []).map((row) => (
                <MatrixRow
                  key={row.year}
                  row={row}
                  level={level}
                  selected={selected}
                  onSelect={setSelected}
                />
              ))}
            </div>
            <div className="grid gap-1.5 sm:hidden">
              {(matrix?.labels ?? []).map((label, col) => (
                <div
                  key={col}
                  className="grid grid-cols-[2rem_repeat(var(--years),1.25rem)] items-center gap-1"
                  style={{ "--years": matrix?.rows.length || 1 } as CSSProperties}
                >
                  <span className="text-[10px] text-muted-foreground">
                    {label || (view === "weekly" ? `W${col + 1}` : "")}
                  </span>
                  {(matrix?.rows ?? []).map((row) => {
                    const b = row.cells[col];
                    return b ? (
                      <PeriodSquare
                        key={row.year}
                        bucket={b}
                        level={level(b.count)}
                        selected={selected === b.key}
                        onSelect={setSelected}
                      />
                    ) : (
                      <span key={row.year} className={`${SQUARE} bg-muted/25`} />
                    );
                  })}
                </div>
              ))}
              <div
                className="grid grid-cols-[2rem_repeat(var(--years),1.25rem)] gap-1 text-center text-[10px] text-muted-foreground"
                style={{ "--years": matrix?.rows.length || 1 } as CSSProperties}
              >
                <span />
                {(matrix?.rows ?? []).map((row) => (
                  <span key={row.year}>{row.year}</span>
                ))}
              </div>
            </div>
            {(matrix?.rows.length ?? 0) === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No activity in this range.
              </div>
            )}
          </div>
        )}
      </section>

      <section className="grid min-w-0 gap-4 lg:h-[430px] lg:grid-cols-2">
        <div className="card-elevated flex h-[430px] min-w-0 flex-col overflow-hidden">
          <PeriodDetail bucket={selectedBucket} mode={mode} unit={unit} />
        </div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:h-[430px]">
          <InsightCard
            icon={<Store className="size-4" />}
            title="Top sellers by cars"
            rows={rank(insightRows, (r) => r.seller, "count")}
            format={(v) => v.toLocaleString()}
          />
          <InsightCard
            icon={<Wallet className="size-4" />}
            title="Top sellers by spend"
            rows={rank(insightRows, (r) => r.seller, "spent")}
            format={inr}
          />
          <InsightCard
            icon={<Tag className="size-4" />}
            title="Top brands by cars"
            rows={rank(insightRows, (r) => r.brand, "count")}
            format={(v) => v.toLocaleString()}
          />
          <InsightCard
            icon={<Tag className="size-4" />}
            title="Top makes by cars"
            rows={rank(insightRows, (r) => r.make, "count")}
            format={(v) => v.toLocaleString()}
          />
        </div>
      </section>
    </div>
  );
}

function PeriodSquare({
  bucket,
  level,
  selected,
  onSelect,
}: {
  bucket: Bucket;
  level: number;
  selected: boolean;
  onSelect: (key: string | null) => void;
}) {
  return (
    <button
      type="button"
      title={`${bucket.label} — ${bucket.count} car${bucket.count === 1 ? "" : "s"}${bucket.spent ? ` · ${inr(bucket.spent)}` : ""}`}
      onClick={() => onSelect(bucket.count ? bucket.key : null)}
      className={`${SQUARE} ${LEVEL_CLASS[level]} ${
        selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
      } ${bucket.count ? "cursor-pointer" : "cursor-default"}`}
    />
  );
}

function MatrixHeader({ labels }: { labels: string[] }) {
  return (
    <div className="flex gap-[6px] pl-12 text-[11px] text-muted-foreground">
      {labels.map((label, i) => (
        <span key={i} className="w-5 shrink-0 whitespace-nowrap">
          {label}
        </span>
      ))}
    </div>
  );
}

function MatrixRow({
  row,
  level,
  selected,
  onSelect,
}: {
  row: { year: number; cells: (Bucket | null)[] };
  level: (count: number) => number;
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-[6px]">
      <span className="mr-1 w-11 shrink-0 text-[11px] leading-5 text-muted-foreground">
        {row.year}
      </span>
      {row.cells.map((bucket, i) =>
        bucket ? (
          <PeriodSquare
            key={bucket.key}
            bucket={bucket}
            level={level(bucket.count)}
            selected={selected === bucket.key}
            onSelect={onSelect}
          />
        ) : (
          <span key={i} className={`${SQUARE} bg-muted/25`} />
        ),
      )}
    </div>
  );
}

function rank(rows: Diecast[], key: (r: Diecast) => string, metric: "count" | "spent") {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = (key(r) || "").trim();
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + (metric === "count" ? 1 : r.spent || 0));
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, value]) => ({ label, value }));
}

function InsightCard({
  icon,
  title,
  rows,
  format,
}: {
  icon: React.ReactNode;
  title: string;
  rows: { label: string; value: number }[];
  format: (v: number) => string;
}) {
  const max = rows[0]?.value || 1;
  return (
    <div className="card-elevated min-w-0 overflow-hidden p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="grid size-6 place-items-center rounded-md bg-primary/15 text-primary">
          {icon}
        </span>
        <span className="truncate">{title}</span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate">{r.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{format(r.value)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted/60">
              <div
                className="h-1.5 rounded-full bg-primary/70"
                style={{ width: `${(r.value / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="py-3 text-sm text-muted-foreground">No data yet.</li>}
      </ul>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="card-elevated flex min-w-0 flex-col overflow-hidden p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 text-display text-3xl font-semibold tabular-nums">{value}</div>
      <div className="mt-auto pt-0.5 text-xs text-muted-foreground truncate">{hint ?? ""}</div>
    </div>
  );
}

function PeriodDetail({ bucket, mode, unit }: { bucket: Bucket | null; mode: Mode; unit: string }) {
  if (!bucket) {
    return (
      <div className="grid flex-1 place-items-center p-6 text-center text-sm text-muted-foreground">
        Select a {unit} in the tracker to see the cars{" "}
        {mode === "ordered" ? "ordered" : "delivered"}.
      </div>
    );
  }
  const spent = bucket.items.reduce((s, r) => s + (r.spent || 0), 0);
  return (
    <>
      <div className="border-b border-border p-4">
        <h2 className="text-display text-lg font-semibold">{bucket.label}</h2>
        <p className="text-xs text-muted-foreground">
          {bucket.items.length} car{bucket.items.length === 1 ? "" : "s"} · {inrFull(spent)}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <DayList items={bucket.items} />
      </div>
    </>
  );
}

function DayList({ items }: { items: Diecast[] }) {
  const { open } = useCarDrawer();
  if (!items.length) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">No cars in this period.</div>
    );
  }
  return (
    <ul className="divide-y divide-border/60">
      {items.map((r, i) => (
        <li
          key={(r.id || "") + i}
          onClick={() => open(r)}
          className="cursor-pointer rounded-md px-2 py-2.5 hover:bg-muted/40"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{r.name || "—"}</div>
              <div className="truncate text-xs text-muted-foreground">{carSubLine(r)}</div>
              <div className="truncate text-xs text-muted-foreground">
                <Store className="mr-1 inline size-3" />
                {r.seller || "Unknown seller"}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <div className="text-sm tabular-nums">{r.spent ? inr(r.spent) : "—"}</div>
              <StatusPill status={r.status} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
