import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { allCars, summarize } from "../data";

export default defineTool({
  name: "list_duplicates",
  title: "List duplicates",
  description:
    "Find repeated cars in the collection. Two cars are duplicates when make, model, variant, year and brand all match.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .optional()
      .describe("Max duplicate groups to return (default 25, max 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ limit }) => {
    const groups = new Map<string, ReturnType<typeof summarize>[]>();
    for (const c of allCars()) {
      const key = [c.make, c.model, c.variant, c.year, c.brand]
        .map((v) => (v ?? "").trim().toLowerCase())
        .join("|");
      if (key.replace(/\|/g, "") === "") continue;
      const list = groups.get(key) ?? [];
      list.push(summarize(c));
      groups.set(key, list);
    }
    const dupes = [...groups.values()]
      .filter((g) => g.length > 1)
      .sort((a, b) => b.length - a.length);
    const capped = dupes.slice(0, Math.min(Math.max(limit ?? 25, 1), 100)).map((cars) => ({
      make: cars[0]!.make,
      model: cars[0]!.model,
      variant: cars[0]!.variant,
      year: cars[0]!.year,
      brand: cars[0]!.brand,
      count: cars.length,
      cars,
    }));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ totalGroups: dupes.length, groups: capped }, null, 2),
        },
      ],
      structuredContent: { totalGroups: dupes.length, groups: capped },
    };
  },
});
