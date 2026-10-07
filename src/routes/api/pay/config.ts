import { createFileRoute } from "@tanstack/react-router";

/**
 * Whether this deployment can take a payment, and the key id a checkout opens
 * with. Never the secret: that is read in the route that signs with it and
 * leaves the server nowhere else.
 */
export const Route = createFileRoute("/api/pay/config")({
  server: {
    handlers: {
      GET: async () => {
        const { json, payReady, publicKeyId } = await import("@/lib/razorpay.server");
        const ready = payReady();
        return json({ enabled: ready, keyId: ready ? publicKeyId() : null });
      },
    },
  },
});
