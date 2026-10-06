import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { authHeader } from "@/lib/api-auth";
import type { PaidPlan, PlanTerm } from "@/lib/tiers";

/**
 * Asking an admin to turn Pro on.
 *
 * Two steps, and only the first has to work. The ask is written through the
 * account's own session, so it needs nothing of the server but a database that
 * is up; the notification that follows goes through a route that reads with the
 * service role, and a deployment without that key still takes the request.
 *
 * That order is the whole fix. It used to be the other way round — the route
 * first — and without SUPABASE_SERVICE_ROLE_KEY the admin client is a stub with
 * no `getUser` on it, so working out who was asking failed and every press came
 * back refused.
 */
export async function requestPro(
  plan: PaidPlan = "pro",
  term: PlanTerm = "month",
  remind = false,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("tesoro_request_pro", {
    _plan: plan,
    _term: term,
  });

  if (error) {
    toast.error("Could not raise that request", {
      description: error.message || "Try again in a moment.",
    });
    return false;
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        requested_at: string | null;
        requested_plan: string | null;
        requested_term: string | null;
        was_new: boolean;
      }
    | undefined;

  // Already on Pro: the database says so rather than recording an ask nobody
  // will act on.
  if (!row?.requested_at) {
    toast.info("This account is already on Pro");
    return false;
  }

  const name = row.requested_plan === "plus" ? "Plus" : "Pro";
  toast.success(remind ? "Reminder sent" : `${name} request has been raised`, {
    description: remind
      ? `The admins have been nudged about your ${name} request.`
      : "The admins have been told. You will get a payment link by email.",
  });

  // The courtesy, and the only thing a reminder actually does: the request
  // itself was recorded the first time and keeps its date. It can fail — the
  // admin screen is where a request is read, not the notification.
  if (row.was_new || remind) {
    void fetch("/api/push/upgrade", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ remind }),
    }).catch(() => {});
  }

  return true;
}
