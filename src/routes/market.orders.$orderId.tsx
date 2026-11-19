import { createFileRoute } from "@tanstack/react-router";

import { OrderPage } from "@/market/pages/orders";

export const Route = createFileRoute("/market/orders/$orderId")({
  component: OrderPage,
});
