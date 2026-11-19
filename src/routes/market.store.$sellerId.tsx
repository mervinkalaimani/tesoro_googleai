import { createFileRoute } from "@tanstack/react-router";

import { StorePage } from "@/market/pages/store";

export const Route = createFileRoute("/market/store/$sellerId")({
  component: StorePage,
});
