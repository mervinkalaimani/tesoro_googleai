import { createFileRoute } from "@tanstack/react-router";

import { OrdersPage } from "@/market/pages/orders";

export const Route = createFileRoute("/market/orders/")({
  component: OrdersPage,
});
