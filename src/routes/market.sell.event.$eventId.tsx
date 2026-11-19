import { createFileRoute } from "@tanstack/react-router";

import { EventFormPage } from "@/market/pages/events";

export const Route = createFileRoute("/market/sell/event/$eventId")({
  component: EventFormPage,
});
