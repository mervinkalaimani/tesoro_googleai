import { createFileRoute } from "@tanstack/react-router";

import { SetupPage } from "@/market/pages/sell";

export const Route = createFileRoute("/seller/setup")({
  component: SetupPage,
});
