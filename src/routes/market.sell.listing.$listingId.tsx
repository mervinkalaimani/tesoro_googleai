import { createFileRoute } from "@tanstack/react-router";

import { ListingFormPage } from "@/market/pages/listing-form";

export const Route = createFileRoute("/market/sell/listing/$listingId")({
  component: ListingFormPage,
});
