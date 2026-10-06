import { createFileRoute } from "@tanstack/react-router";

/** A free account asking to be upgraded: tell the admins, and write the ask down. */
export const Route = createFileRoute("/api/push/upgrade")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requestUpgrade } = await import("@/lib/admin-push.server");
        return requestUpgrade(request);
      },
    },
  },
});
