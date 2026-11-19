import { createFileRoute } from "@tanstack/react-router";

import { ListingFormPage } from "@/market/pages/listing-form";

export const Route = createFileRoute("/seller/listing/$listingId")({
  component: ListingFormPage,
});
