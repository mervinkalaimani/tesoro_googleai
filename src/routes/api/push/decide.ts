import { createFileRoute } from "@tanstack/react-router";

/** Approve / Reject tapped on a notification, sent by the service worker. */
export const Route = createFileRoute("/api/push/decide")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { decideFromNotification } = await import("@/lib/admin-push.server");
        return decideFromNotification(request);
      },
    },
  },
});
