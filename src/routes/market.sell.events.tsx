import { createFileRoute } from "@tanstack/react-router";

import { SellEventsPage } from "@/market/pages/events";

export const Route = createFileRoute("/market/sell/events")({
  component: SellEventsPage,
});
