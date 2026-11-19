import { createFileRoute } from "@tanstack/react-router";

import { EventPage } from "@/market/pages/events";

export const Route = createFileRoute("/market/event/$eventId")({
  component: EventPage,
});
