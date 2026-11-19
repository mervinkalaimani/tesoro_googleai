import { createFileRoute } from "@tanstack/react-router";

import { SellOrdersPage } from "@/market/pages/sell";

export const Route = createFileRoute("/market/sell/orders")({
  component: SellOrdersPage,
});
