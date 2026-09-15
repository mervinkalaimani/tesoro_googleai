import { createFileRoute } from "@tanstack/react-router";

/** A new account's waiting screen asks for the admins to be told. */
export const Route = createFileRoute("/api/push/new-user")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { notifyNewUser } = await import("@/lib/admin-push.server");
        return notifyNewUser(request);
      },
    },
  },
});
