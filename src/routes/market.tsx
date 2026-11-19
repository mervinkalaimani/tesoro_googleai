import { createFileRoute } from "@tanstack/react-router";

import { MarketLayout } from "@/market/components/shell";

export const Route = createFileRoute("/market")({
  head: () => ({
    meta: [
      { title: "Viiv Market: collectible model cars" },
      {
        name: "description",
        content:
          "Buy, sell and collect die-cast and collectible model cars. Compare every seller of the exact same casting.",
      },
      { name: "theme-color", content: "#1b1b1b" },
    ],
  }),
  component: MarketLayout,
});
