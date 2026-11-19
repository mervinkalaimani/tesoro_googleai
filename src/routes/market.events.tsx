import { createFileRoute } from "@tanstack/react-router";

import { EventsPage } from "@/market/pages/events";

export const Route = createFileRoute("/market/events")({
  component: EventsPage,
});
