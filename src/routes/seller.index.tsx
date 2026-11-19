import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/market/pages/sell";

export const Route = createFileRoute("/seller/")({
  component: DashboardPage,
});
