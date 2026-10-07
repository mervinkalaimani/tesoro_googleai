import { createFileRoute } from "@tanstack/react-router";

/** Starts a payment for a plan and a length, at the price in the table. */
export const Route = createFileRoute("/api/pay/order")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { createOrder } = await import("@/lib/razorpay.server");
        return createOrder(request);
      },
    },
  },
});
