import { createFileRoute } from "@tanstack/react-router";

import { AccountPage } from "@/market/pages/account";

export const Route = createFileRoute("/market/account")({
  component: AccountPage,
});
