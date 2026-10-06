import { toast } from "sonner";

import { authHeader } from "@/lib/api-auth";

/**
 * Asking an admin to turn Pro on.
 *
 * One call from wherever the button is — the dialog on sign-in, the panel on a
 * locked section — because the answer it gives has to be the same in both: the
 * ask is recorded, the admins are told, and a payment link comes back by email.
 *
 * Asking twice is not an error. The first ask is the one with the date on it,
 * and the second says so rather than pretending to be new.
 */
export async function requestPro(): Promise<boolean> {
  try {
    const res = await fetch("/api/push/upgrade", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeader()) },
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      already?: boolean;
      error?: string;
    } | null;

    if (!res.ok || !body?.ok) {
      toast.error("Could not send that", {
        description: body?.error || "Try again in a moment.",
      });
      return false;
    }

    toast.success(body.already ? "Already asked" : "Asked for Pro", {
      description: body.already
        ? "Your request is with the admins. The payment link comes by email."
        : "The admins have been told. You will get a payment link by email.",
    });
    return true;
  } catch {
    toast.error("Could not send that", { description: "Check your connection and try again." });
    return false;
  }
}
