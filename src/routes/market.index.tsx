import { createFileRoute } from "@tanstack/react-router";

import { HomePage } from "@/market/pages/home";

export const Route = createFileRoute("/market/")({ component: HomePage });
