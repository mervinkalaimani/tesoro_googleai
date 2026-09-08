import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { allCars, summarize } from "../data";

const RANK: Record<string, number> = { transit: 0, waiting: 1, "pre order": 2, "pre-order": 2 };

export default defineTool({
  name: "list_orders",
  title: "List open orders",
  description:
    "List cars that are not yet in hand — in transit, waiting to ship, or pre-ordered — sorted transit first, with seller, transit info, order date and expected date.",
  inputSchema: {
    status: z
      .enum(["all", "transit", "waiting", "pre order"])
      .optional()
      .describe("Filter to one order status. Default: all open orders."),
    limit: z.number().int().optional().describe("Max results (default 50, max 200)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ status, limit }) => {
    const wanted = (status ?? "all").toLowerCase();
    const open = allCars().filter((c) => {
      const s = c.status?.trim().toLowerCase() ?? "";
      const isOpen = s in RANK;
      if (!isOpen) return false;
      if (wanted === "all") return true;
      return s === wanted || (wanted === "pre order" && s === "pre-order");
    });
    open.sort(
      (a, b) =>
        (RANK[a.status.trim().toLowerCase()] ?? 9) - (RANK[b.status.trim().toLowerCase()] ?? 9),
    );
    const capped = open.slice(0, Math.min(Math.max(limit ?? 50, 1), 200)).map(summarize);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { total: open.length, returned: capped.length, orders: capped },
            null,
            2,
          ),
        },
      ],
      structuredContent: { total: open.length, orders: capped },
    };
  },
});
