import { createFileRoute } from "@tanstack/react-router";

/** Settings' "Send a test" button. */
export const Route = createFileRoute("/api/push/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { sendTest } = await import("@/lib/admin-push.server");
        return sendTest(request);
      },
    },
  },
});
