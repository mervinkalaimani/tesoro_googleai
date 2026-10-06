import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { authHeader } from "@/lib/api-auth";

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
export async function requestPro(): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("tesoro_request_pro");

  if (error) {
    toast.error("Could not raise that request", {
      description: error.message || "Try again in a moment.",
    });
    return false;
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    { requested_at: string | null; was_new: boolean } | undefined;

  // Already on Pro: the database says so rather than recording an ask nobody
  // will act on.
  if (!row?.requested_at) {
    toast.info("This account is already on Pro");
    return false;
  }

  toast.success("Pro request has been raised", {
    description: row.was_new
      ? "The admins have been told. You will get a payment link by email."
      : "It was already with the admins. The payment link comes by email.",
  });

  // The courtesy. It can fail — the request is already recorded, and the admin
  // screen is where it is read.
  if (row.was_new) {
    void fetch("/api/push/upgrade", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeader()) },
    }).catch(() => {});
  }

  return true;
}
