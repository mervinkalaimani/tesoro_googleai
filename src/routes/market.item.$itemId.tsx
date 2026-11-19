import { createFileRoute } from "@tanstack/react-router";

import { ItemPage } from "@/market/pages/item";

export const Route = createFileRoute("/market/item/$itemId")({
  component: ItemPage,
});
