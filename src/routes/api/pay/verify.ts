import { createFileRoute } from "@tanstack/react-router";

/** Checks the signature on a finished payment, and grants the plan it bought. */
export const Route = createFileRoute("/api/pay/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyPayment } = await import("@/lib/razorpay.server");
        return verifyPayment(request);
      },
    },
  },
});
