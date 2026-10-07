import { toast } from "sonner";

import { authHeader } from "@/lib/api-auth";
import type { PaidPlan } from "@/lib/tiers";

/**
 * Paying for a plan, from the browser's side.
 *
 * Everything that matters happens on the server: the price is read there, the
 * order is created there, and the signature is checked there before anything
 * is granted. This opens the window and carries the receipt back.
 *
 * It deliberately knows nothing about what a plan costs. A checkout that was
 * told the amount by the page it sits on is a checkout somebody can argue with.
 */

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

type Config = { enabled: boolean; keyId: string | null };

let cached: Config | null = null;

/** Whether this deployment takes payments. Asked once; it cannot change under us. */
export async function payConfig(): Promise<Config> {
  if (cached) return cached;
  try {
    const res = await fetch("/api/pay/config");
    cached = (await res.json()) as Config;
  } catch {
    // A deployment that cannot answer is one that cannot take money either.
    cached = { enabled: false, keyId: null };
  }
  return cached;
}

/** Razorpay's own script, loaded the first time somebody actually pays. */
function loadCheckout(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const el = document.createElement("script");
    el.src = SCRIPT;
    el.onload = () => resolve(true);
    el.onerror = () => resolve(false);
    document.head.appendChild(el);
  });
}

export type PayResult = "paid" | "cancelled" | "unavailable" | "failed";

/**
 * Takes somebody through a payment, start to finish.
 *
 * Returns what happened rather than throwing, because every one of the four
 * outcomes is something the dialog around it has to say differently — and
 * "cancelled" is not an error, it is somebody changing their mind.
 */
export async function payForPlan(
  plan: PaidPlan,
  months: number,
  who: { name?: string | null; email?: string | null },
): Promise<PayResult> {
  const config = await payConfig();
  if (!config.enabled) return "unavailable";

  const headers = { "content-type": "application/json", ...(await authHeader()) };

  const res = await fetch("/api/pay/order", {
    method: "POST",
    headers,
    body: JSON.stringify({ plan, months }),
  }).catch(() => null);

  if (!res) {
    toast.error("Could not reach the payment service");
    return "failed";
  }
  if (res.status === 501) return "unavailable";
  const order = (await res.json().catch(() => null)) as {
    orderId?: string;
    amount?: number;
    currency?: string;
    keyId?: string;
    error?: string;
  } | null;
  if (!res.ok || !order?.orderId) {
    toast.error("Could not start that payment", { description: order?.error });
    return "failed";
  }

  if (!(await loadCheckout())) {
    toast.error("Could not open the payment window", {
      description: "Check your connection or any script blocker, then try again.",
    });
    return "failed";
  }

  return new Promise<PayResult>((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rzp = new (window as any).Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.orderId,
      name: "VIIV",
      description: `${plan === "plus" ? "Plus" : "Pro"} · ${months} month${months === 1 ? "" : "s"}`,
      // Prefilled so nobody retypes what the account already knows. They can
      // still change it: this is the payer's detail, not the account's.
      prefill: { name: who.name || undefined, email: who.email || undefined },
      theme: { color: "#EF6413" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handler: async (reply: any) => {
        const check = await fetch("/api/pay/verify", {
          method: "POST",
          headers,
          body: JSON.stringify({
            razorpay_order_id: reply?.razorpay_order_id,
            razorpay_payment_id: reply?.razorpay_payment_id,
            razorpay_signature: reply?.razorpay_signature,
          }),
        }).catch(() => null);

        const out = (await check?.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (check?.ok && out?.ok) {
          resolve("paid");
          return;
        }
        // Money may well have left their account. Say so plainly rather than
        // showing a generic failure that invites a second attempt.
        toast.error("Paid, but the plan did not switch on", {
          description: out?.error || "Tell an admin — the payment is recorded.",
          duration: 12_000,
        });
        resolve("failed");
      },
      modal: { ondismiss: () => resolve("cancelled") },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rzp.on("payment.failed", (e: any) => {
      toast.error("The payment did not go through", {
        description: e?.error?.description || "Nothing has been charged.",
      });
      resolve("failed");
    });

    rzp.open();
  });
}
