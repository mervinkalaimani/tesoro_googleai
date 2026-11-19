import { createFileRoute } from "@tanstack/react-router";

import { ListingFormPage } from "@/market/pages/listing-form";

export const Route = createFileRoute("/seller/listing/$listingId")({
  validateSearch: (s: Record<string, unknown>): { mode?: string; car?: string } => ({
    mode: typeof s.mode === "string" ? s.mode : undefined,
    car: typeof s.car === "string" ? s.car : undefined,
  }),
  component: ListingFormPage,
});
