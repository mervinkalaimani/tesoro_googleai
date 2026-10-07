import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { authHeader } from "@/lib/api-auth";
import { TRIAL_DAYS, type PaidPlan } from "@/lib/tiers";

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
  term: string = "month",
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

/**
 * Turning on the one free trial.
 *
 * Nobody is asked and nothing is granted: the account writes its own start
 * date through its own session, and every tier question answers differently
 * from the next read onwards. It happens once, which the database decides —
 * a second press gets the first date back and says so.
 */
export async function startTrial(): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("tesoro_start_trial");

  if (error) {
    toast.error("Could not start the trial", {
      description: error.message || "Try again in a moment.",
    });
    return false;
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    { started_on: string | null; was_new: boolean } | undefined;

  if (!row?.was_new) {
    toast.info("This account has already had its trial", {
      description: "One per account. Choosing a plan is the way back to Pro.",
    });
    return false;
  }

  toast.success(`${TRIAL_DAYS} days of Pro, starting now`, {
    description: "Everything is open. Nothing is charged, and nothing is owed at the end of it.",
  });
  return true;
}

/**
 * Taking a request back.
 *
 * The ask could be made and nudged but not withdrawn, so changing your mind
 * meant leaving a request on somebody's screen forever. Cleared through the
 * account's own session, like the ask itself; no notification follows, because
 * the admin screen is where a request is read and an absent one reads as
 * absent.
 */
export async function cancelProRequest(): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("tesoro_cancel_pro_request");

  if (error) {
    toast.error("Could not withdraw that request", {
      description: error.message || "Try again in a moment.",
    });
    return false;
  }

  toast.success(data === true ? "Request withdrawn" : "There was no request to withdraw");
  return true;
}
