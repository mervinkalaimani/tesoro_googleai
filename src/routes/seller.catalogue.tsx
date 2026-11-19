import { createFileRoute } from "@tanstack/react-router";

import { SellerCataloguePage } from "@/market/pages/seller-catalogue";

export const Route = createFileRoute("/seller/catalogue")({
  validateSearch: (s: Record<string, unknown>): { q?: string } => ({
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  component: SellerCataloguePage,
});
