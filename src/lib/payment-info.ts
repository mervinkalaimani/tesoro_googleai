import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

/**
 * The picture somebody pays against — a UPI QR, a bank card, whatever the
 * owner put there.
 *
 * One picture for the whole deployment, so it sits in deployment_settings
 * beside the other facts about this install rather than on anybody's row.
 * What is per-account is only whether an admin has handed it over, which is a
 * date on the account (pay_info_sent_at).
 *
 * World-readable, like everything else in that table. That is the right call
 * for a payment QR: it is a thing whose entire purpose is being shown to
 * people, and the account-level gate decides who is *told* about it rather
 * than pretending the image is a secret.
 */

const TABLE = "deployment_settings";
const KEY = "payment_info";

export type PaymentInfo = {
  /** Public URL of the uploaded image, or empty when none has been set. */
  url: string;
  /** A line under it — an account name, a handle, whatever the QR does not say. */
  note: string;
};

export const NO_PAYMENT_INFO: PaymentInfo = { url: "", note: "" };

/** The generated Database types predate this table; narrowed for these calls. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;

function coerce(value: unknown): PaymentInfo {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    url: typeof v.url === "string" ? v.url : "",
    note: typeof v.note === "string" ? v.note : "",
  };
}

let cached: PaymentInfo | null = null;

export async function fetchPaymentInfo(): Promise<PaymentInfo> {
  if (cached) return cached;
  try {
    const { data, error } = await db().from(TABLE).select("value").eq("key", KEY).maybeSingle();
    if (error || !data) return NO_PAYMENT_INFO;
    cached = coerce((data as { value?: unknown }).value);
    return cached;
  } catch {
    return NO_PAYMENT_INFO;
  }
}

export async function savePaymentInfo(next: PaymentInfo): Promise<{ error?: string }> {
  const { error } = await db()
    .from(TABLE)
    .upsert({ key: KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return { error: (error as { message?: string }).message };
  cached = next;
  return {};
}

/** Reading it in a component, with the shipped empty value until it arrives. */
export function usePaymentInfo(): PaymentInfo {
  const [info, setInfo] = useState<PaymentInfo>(cached ?? NO_PAYMENT_INFO);
  useEffect(() => {
    let alive = true;
    void fetchPaymentInfo().then((v) => {
      if (alive) setInfo(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

/** Forgets what was read, so the next read sees what was just written. */
export function forgetPaymentInfo() {
  cached = null;
}
