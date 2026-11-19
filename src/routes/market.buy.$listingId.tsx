import { createFileRoute } from "@tanstack/react-router";

import { CheckoutPage } from "@/market/pages/checkout";

export const Route = createFileRoute("/market/buy/$listingId")({
  component: CheckoutPage,
});
