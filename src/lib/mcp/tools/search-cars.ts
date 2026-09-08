import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { allCars, matches, summarize } from "../data";

export default defineTool({
  name: "search_cars",
  title: "Search cars",
  description:
    "Search the diecast collection across every field (name, make, model, brand, series, colour, seller, status). Supports optional brand/status/seller filters.",
  inputSchema: {
    query: z
      .string()
      .optional()
      .describe("Free text; space or comma separated terms must all match."),
    brand: z.string().optional().describe("Exact brand filter, case-insensitive."),
    status: z
      .string()
      .optional()
      .describe("Exact status filter, e.g. Available, Transit, Waiting, Pre Order."),
    seller: z.string().optional().describe("Exact seller filter, case-insensitive."),
    limit: z.number().int().optional().describe("Max results to return (default 25, max 200)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ query, brand, status, seller, limit }) => {
    const tokens = (query ?? "")
      .split(/[,\s]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const eq = (a: string, b?: string) => !b || a.trim().toLowerCase() === b.trim().toLowerCase();

    const results = allCars().filter(
      (c) =>
        matches(c, tokens) && eq(c.brand, brand) && eq(c.status, status) && eq(c.seller, seller),
    );
    const capped = results.slice(0, Math.min(Math.max(limit ?? 25, 1), 200)).map(summarize);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { total: results.length, returned: capped.length, cars: capped },
            null,
            2,
          ),
        },
      ],
      structuredContent: { total: results.length, cars: capped },
    };
  },
});
