import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { allCars } from "../data";

export default defineTool({
  name: "get_car",
  title: "Get car",
  description: "Get every recorded field for one car in the collection, by its id.",
  inputSchema: { id: z.string().min(1).describe("Car id, e.g. DIS/PRM/001.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ id }) => {
    const car = allCars().find((c) => c.id.toLowerCase() === id.trim().toLowerCase());
    if (!car) throw new ToolError(`No car found with id "${id}".`);
    return {
      content: [{ type: "text", text: JSON.stringify(car, null, 2) }],
      structuredContent: { car },
    };
  },
});
