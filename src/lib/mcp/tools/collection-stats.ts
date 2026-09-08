import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { allCars } from "../data";
import type { Diecast } from "@/lib/types";

const FIELDS = {
  brand: (c: Diecast) => c.brand,
  make: (c: Diecast) => c.make,
  model: (c: Diecast) => c.model,
  series: (c: Diecast) => c.series,
  assortment: (c: Diecast) => c.assortment,
  seller: (c: Diecast) => c.seller,
  status: (c: Diecast) => c.status,
  type: (c: Diecast) => c.type,
  colour: (c: Diecast) => c.colour,
  size: (c: Diecast) => c.size,
} as const;

export default defineTool({
  name: "collection_stats",
  title: "Collection stats",
  description:
    "Overall collection totals (car count, total spend, status breakdown) plus an optional top-N ranking grouped by a field such as brand, make, series or seller.",
  inputSchema: {
    groupBy: z
      .enum([
        "brand",
        "make",
        "model",
        "series",
        "assortment",
        "seller",
        "status",
        "type",
        "colour",
        "size",
      ])
      .optional()
      .describe("Field to rank by. Omit for headline totals only."),
    limit: z.number().int().optional().describe("How many groups to return (default 10, max 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ groupBy, limit }) => {
    const cars = allCars();
    const totalSpent = cars.reduce((s, c) => s + (c.spent || 0), 0);
    const byStatus: Record<string, number> = {};
    for (const c of cars) {
      const key = c.status?.trim() || "Unknown";
      byStatus[key] = (byStatus[key] ?? 0) + 1;
    }

    let top: { value: string; count: number; spent: number }[] | undefined;
    if (groupBy) {
      const pick = FIELDS[groupBy];
      const map = new Map<string, { count: number; spent: number }>();
      for (const c of cars) {
        const key = pick(c)?.trim() || "Unknown";
        const cur = map.get(key) ?? { count: 0, spent: 0 };
        cur.count += 1;
        cur.spent += c.spent || 0;
        map.set(key, cur);
      }
      top = [...map.entries()]
        .map(([value, v]) => ({ value, ...v }))
        .sort((a, b) => b.count - a.count)
        .slice(0, Math.min(Math.max(limit ?? 10, 1), 50));
    }

    const payload = {
      totalCars: cars.length,
      totalSpent,
      currency: "INR",
      favourites: cars.filter((c) => c.favourite).length,
      chase: cars.filter((c) => c.chase).length,
      byStatus,
      ...(groupBy ? { groupBy, top } : {}),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
