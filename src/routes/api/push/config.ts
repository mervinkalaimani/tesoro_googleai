import { createFileRoute } from "@tanstack/react-router";

/**
 * The VAPID public key a browser subscribes with, or null when push is not set
 * up here. Read at runtime so the key lives only in the server environment.
 */
export const Route = createFileRoute("/api/push/config")({
  server: {
    handlers: {
      GET: async () => {
        const { json, pushReady } = await import("@/lib/admin-push.server");
        const { vapidConfig } = await import("@/lib/web-push.server");
        return json({ publicKey: pushReady() ? vapidConfig()?.publicKey : null });
      },
    },
  },
});
