import { defineMcp } from "@lovable.dev/mcp-js";
import searchCars from "./tools/search-cars";
import getCar from "./tools/get-car";
import collectionStats from "./tools/collection-stats";
import listOrders from "./tools/list-orders";
import listDuplicates from "./tools/list-duplicates";

export default defineMcp({
  name: "my-diecast-dashboard",
  title: "My Diecast Dashboard",
  version: "0.1.0",
  instructions:
    "Read-only tools for a personal diecast car collection. Use `search_cars` to find models by any field, `get_car` for one car's full record, `collection_stats` for totals and top-N rankings (brand, make, series, seller...), `list_orders` for cars in transit / waiting / pre-ordered, and `list_duplicates` for repeated models.",
  tools: [searchCars, getCar, collectionStats, listOrders, listDuplicates],
});
