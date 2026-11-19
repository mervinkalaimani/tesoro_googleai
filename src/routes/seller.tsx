import { createFileRoute } from "@tanstack/react-router";

import { SellerLayout } from "@/market/components/shell";

export const Route = createFileRoute("/seller")({
  head: () => ({
    meta: [
      { title: "VIIV Seller" },
      {
        name: "description",
        content: "List cars from the Viiv catalogue, ship orders, run auctions.",
      },
    ],
  }),
  component: SellerLayout,
});
