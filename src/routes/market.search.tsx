import { createFileRoute } from "@tanstack/react-router";

import { SearchPage, validateSearch } from "@/market/pages/search";

export const Route = createFileRoute("/market/search")({
  validateSearch,
  component: SearchPage,
});
