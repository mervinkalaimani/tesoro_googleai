import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Clock3 } from "lucide-react";

import type { Diecast } from "@/lib/types";
import { inr, inrFull, monthKey, monthLabel, shortMonthLabel } from "@/lib/format";
import { SegmentControl } from "@/components/segment-control";

type Window = "6m" | "12m" | "all";

const PHONE_QUERY = "(max-width: 767px)";

/**
 * The month a car was *ordered*, for the Ordered view: the order date, or the
 * sheet's order month when the date is missing. Wishlist (ISO) rows were never
 * bought and count nowhere.
 */
function orderedMonthKey(r: Diecast): number | null {
  if ((r.status || "").trim().toLowerCase() === "iso") return null;
  return monthKey(r.orderDate) ?? monthKey(r.orderMonth);
}

/**
 * The month a car counts in for the Delivered view: the month it was
 * *received*. Anything that has not landed counts nowhere yet. `month` is the
 * sheet's own arrival month, so it is tried first — but only backed by the
 * arrival date, never the order date.
 */
function receivedMonthKey(r: Diecast): number | null {
  if (!(r.date || "").trim()) return null;
  return monthKey(r.month) ?? monthKey(r.date);
}

function usePhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(PHONE_QUERY);
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return phone;
}

/**
 * Cars and money per month, by the month they were ordered or the month they
 * arrived, with the busiest month named in the subtitle.
 *
 * Self-contained: it keeps its own window, basis and Count / Cost, so it can
 * sit on any page without being wired to what is around it.
 */
export function MonthlySpending({ rows, className = "" }: { rows: Diecast[]; className?: string }) {
  const [win, setWin] = useState<Window>("6m");
  const [basis, setBasis] = useState<"ordered" | "delivered">("delivered");
  const [mode, setMode] = useState<"count" | "cost">("count");
  const [mounted, setMounted] = useState(false);
  const phone = usePhone();
  // On a phone, 12 months or more of labels overlap into noise: only the bar
  // that was tapped carries its number.
  const [selected, setSelected] = useState<number | null>(null);
  const labelOnlySelected = phone && win !== "6m";

  useEffect(() => {
    setMounted(true);
  }, []);

  const series = useMemo(() => {
    const map = new Map<number, { spent: number; count: number }>();
    const keyOf = basis === "ordered" ? orderedMonthKey : receivedMonthKey;
    for (const r of rows) {
      const k = keyOf(r);
      if (k === null) continue;
      const cur = map.get(k) ?? { spent: 0, count: 0 };
      cur.spent += r.spent || 0;
      cur.count += 1;
      map.set(k, cur);
    }
    const now = new Date();
    const curKey = now.getFullYear() * 12 + now.getMonth();
    const all = [...map.entries()].sort((a, b) => a[0] - b[0]);
    let filtered = all;
    if (win === "6m") {
      filtered = filtered.filter(([k]) => k <= curKey && k > curKey - 6);
      if (filtered.length === 0 && all.length > 0) filtered = all.slice(-6);
    } else if (win === "12m") {
      filtered = filtered.filter(([k]) => k <= curKey && k > curKey - 12);
      if (filtered.length === 0 && all.length > 0) filtered = all.slice(-12);
    }
    // "All" means all of it, future months included.
    return filtered.map(([k, v]) => ({
      month: monthLabel(k),
      spent: Math.round(v.spent),
      count: v.count,
    }));
  }, [rows, win, basis]);

  // A different set of bars: the old selection points at nothing.
  useEffect(() => setSelected(null), [win, basis, mode]);

  const metricKey = mode === "count" ? "count" : "spent";
  const fmt = (v: number) => (mode === "count" ? v.toLocaleString() : inr(v));

  const average = useMemo(() => {
    if (series.length === 0) return 0;
    const total = series.reduce((s, d) => s + (mode === "count" ? d.count : d.spent), 0);
    return Math.round(total / series.length);
  }, [series, mode]);

  const peak = useMemo(
    () =>
      series.reduce<(typeof series)[number] | null>(
        (best, d) =>
          !best || (mode === "count" ? d.count > best.count : d.spent > best.spent) ? d : best,
        null,
      ),
    [series, mode],
  );

  const verb = basis === "ordered" ? "ordered" : "received";

  return (
    <div className={`card-elevated flex min-w-0 flex-col overflow-hidden p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-display text-lg font-semibold">Monthly spending</h2>
          <p className="truncate text-xs text-muted-foreground">
            {mode === "count" ? `Cars ${verb} by month` : `Spent on cars ${verb}, by month`}
            {peak
              ? ` · Peak ${peak.month} (${
                  mode === "count"
                    ? `${peak.count} car${peak.count === 1 ? "" : "s"}`
                    : inr(peak.spent)
                })`
              : ""}
          </p>
        </div>
        <SegmentControl
          value={win}
          onChange={setWin}
          options={[
            { value: "6m", label: "6M" },
            { value: "12m", label: "12M" },
            { value: "all", label: "All" },
          ]}
        />
      </div>

      {/* Above the chart: which month a car counts in, and what is measured. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SegmentControl
          value={basis}
          onChange={setBasis}
          options={[
            { value: "ordered", label: "Ordered" },
            { value: "delivered", label: "Delivered" },
          ]}
        />
        <SegmentControl
          value={mode}
          onChange={setMode}
          options={[
            { value: "count", label: "Count" },
            { value: "cost", label: "Cost" },
          ]}
        />
      </div>

      <div className="min-h-[260px] w-full flex-1">
        {!mounted ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : series.length === 0 ? (
          <div className="flex h-full w-full flex-col items-center justify-center rounded-lg border border-dashed border-border/60 p-6 text-center text-muted-foreground">
            <Clock3 className="mb-2 size-8 stroke-[1.5] text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No monthly records in this window</p>
            <p className="mt-1 max-w-[240px] text-xs text-muted-foreground">
              Try switching to &quot;12M&quot; or &quot;All&quot; to view spending across all
              recorded months.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={240}>
            <BarChart data={series} margin={{ top: 12, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                tickFormatter={shortMonthLabel}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                interval={series.length > 18 ? Math.floor(series.length / 12) : 0}
                angle={-25}
                textAnchor="end"
                height={44}
              />
              <YAxis
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickFormatter={(v) => fmt(Number(v))}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as { spent?: number; count?: number };
                  return (
                    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
                      <div className="font-medium">{label}</div>
                      <div className="font-semibold text-primary">
                        {mode === "count"
                          ? `${row.count ?? 0} car${row.count === 1 ? "" : "s"}`
                          : inrFull(row.spent ?? 0)}
                      </div>
                      <div className="text-muted-foreground">
                        {mode === "count"
                          ? inrFull(row.spent ?? 0)
                          : `${row.count ?? 0} car${row.count === 1 ? "" : "s"}`}
                      </div>
                    </div>
                  );
                }}
                cursor={{ fill: "color-mix(in srgb, var(--primary) 12%, transparent)" }}
              />
              {average > 0 && (
                <ReferenceLine
                  y={average}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: `Avg ${fmt(average)}`,
                    position: "insideTopRight",
                    fill: "var(--muted-foreground)",
                    fontSize: 10,
                  }}
                />
              )}
              <Bar
                dataKey={metricKey}
                fill="var(--primary)"
                radius={[6, 6, 0, 0]}
                onClick={(_, index) => setSelected((cur) => (cur === index ? null : index))}
              >
                <LabelList
                  dataKey={metricKey}
                  position="top"
                  content={(props) => {
                    const { x, y, width, value, index } = props as {
                      x?: number | string;
                      y?: number | string;
                      width?: number | string;
                      value?: number | string;
                      index?: number;
                    };
                    if (labelOnlySelected && index !== selected) return null;
                    return (
                      <text
                        x={Number(x) + Number(width) / 2}
                        y={Number(y) - 4}
                        textAnchor="middle"
                        fill={labelOnlySelected ? "var(--foreground)" : "var(--muted-foreground)"}
                        fontSize={labelOnlySelected ? 11 : 9}
                        fontWeight={labelOnlySelected ? 600 : 400}
                      >
                        {fmt(Number(value))}
                      </text>
                    );
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      {labelOnlySelected && selected === null && (
        <p className="mt-1 text-center text-[11px] text-muted-foreground">
          Tap a bar to see its value.
        </p>
      )}
    </div>
  );
}
