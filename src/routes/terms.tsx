import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/help-doc";

/** Readable before you have an account, which is when you are asked to accept them. */
export const Route = createFileRoute("/terms")({
  component: () => <LegalPage docKey="terms" />,
});
