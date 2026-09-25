import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/help-doc";

/** Public, and deliberately so: the app stores ask for this at a plain URL. */
export const Route = createFileRoute("/privacy")({
  component: () => <LegalPage docKey="privacy" />,
});
