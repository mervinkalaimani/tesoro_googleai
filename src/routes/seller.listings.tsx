import { createFileRoute } from "@tanstack/react-router";

import { ListingsPage } from "@/market/pages/sell";

export const Route = createFileRoute("/seller/listings")({
  component: ListingsPage,
});
