import { createFileRoute } from "@tanstack/react-router";

import { CollectionPage } from "@/market/pages/collection";

export const Route = createFileRoute("/market/collection")({
  component: CollectionPage,
});
