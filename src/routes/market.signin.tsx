import { createFileRoute } from "@tanstack/react-router";

import { SignInPage } from "@/market/pages/signin";

export const Route = createFileRoute("/market/signin")({
  component: SignInPage,
});
