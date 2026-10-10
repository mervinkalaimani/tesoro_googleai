import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

/**
 * Deployment-wide settings, read from `public.deployment_settings`.
 *
 * Not to be confused with `app_settings`, which despite the name holds one
 * person's preferences keyed by user_id — theme, accent colour. These are facts
 * about the install: the same for every visitor, and readable before anyone has
 * signed in, which is why they are in a table with a world-readable policy
 * rather than in localStorage or on a profile row.
 */

export type OAuthProviders = { google: boolean; apple: boolean };

const TABLE = "deployment_settings";
const OAUTH_KEY = "oauth_providers";

/**
 * Both off. A provider button rendered for a provider that has not been set up
 * in the Supabase dashboard sends the person to a Supabase error page, so the
 * safe assumption while we do not know is that neither is ready — and the
 * password form is a complete way in on its own meanwhile.
 */
export const NO_PROVIDERS: OAuthProviders = { google: false, apple: false };

/** Cached for the tab: the login screen and the settings page both ask. */
let cached: OAuthProviders | null = null;

function coerce(value: unknown): OAuthProviders {
  const v = (value ?? {}) as Record<string, unknown>;
  return { google: v.google === true, apple: v.apple === true };
}

/**
 * The generated Database types are produced from the live schema, so this table
 * is unknown to them until the migration has run and they are regenerated.
 * Narrowed to a loose client for these two calls rather than hand-editing a
 * generated file that the next regeneration would overwrite.
 */
type LooseClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
    };
    upsert: (
      row: Record<string, unknown>,
      opts: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>;
  };
};
const db = () => supabase as unknown as LooseClient;

export async function fetchOAuthProviders(): Promise<OAuthProviders> {
  try {
    const { data, error } = await db()
      .from(TABLE)
      .select("value")
      .eq("key", OAUTH_KEY)
      .maybeSingle();
    // A missing row, a missing table and a refused read all mean the same thing
    // here: not configured, which is not a reason to show a button that fails.
    if (error || !data) return NO_PROVIDERS;
    cached = coerce((data as { value?: unknown }).value);
    return cached;
  } catch {
    return NO_PROVIDERS;
  }
}

export async function saveOAuthProviders(next: OAuthProviders): Promise<{ error?: string }> {
  const { error } = await db().from(TABLE).upsert(
    { key: OAUTH_KEY, value: next, updated_at: new Date().toISOString() },
    {
      onConflict: "key",
    },
  );
  if (error) return { error: error.message };
  cached = next;
  return {};
}

/**
 * Which providers to offer. Starts from whatever this tab already knows, so
 * navigating back to the login screen does not flash the buttons in.
 */
export function useOAuthProviders() {
  const [providers, setProviders] = useState<OAuthProviders>(cached ?? NO_PROVIDERS);
  // Until the answer is in, nothing is rendered: showing two buttons and then
  // taking them away is worse than showing them a moment late.
  const [loaded, setLoaded] = useState(cached !== null);

  useEffect(() => {
    let cancelled = false;
    void fetchOAuthProviders().then((p) => {
      if (cancelled) return;
      setProviders(p);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (next: OAuthProviders) => {
    setProviders(next);
    const res = await saveOAuthProviders(next);
    // Put it back if the database refused, rather than leaving a toggle that
    // says one thing while the table says another.
    if (res.error) setProviders(await fetchOAuthProviders());
    return res;
  }, []);

  return { providers, loaded, save };
}

/** Whether a new signup is approved the moment it arrives. */
export const AUTO_APPROVE_KEY = "auto_approve_signups";

/** Whether the card checkout is offered at all, keys or no keys. */
export const PAY_CARD_KEY = "pay_card";

/**
 * A deployment-wide boolean, read and written by key.
 *
 * Same table and same shape as the providers above; the value is a bare jsonb
 * boolean rather than an object because there is nothing else to say. A missing
 * row, a missing table or a refused read all read as false — the cautious
 * answer for every flag in here, since each one opens something up.
 */
export function useDeploymentFlag(key: string, fallback = false) {
  const [on, setOn] = useState(fallback);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let value = fallback;
      try {
        const { data } = await db().from(TABLE).select("value").eq("key", key).maybeSingle();
        const got = (data as { value?: unknown } | null)?.value;
        // A row that is not there has never been decided, so the caller says
        // what that means: false for a flag that opens something up, true for
        // one that hides something the app already does.
        value = typeof got === "boolean" ? got : fallback;
      } catch {
        value = fallback;
      }
      if (cancelled) return;
      setOn(value);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [key, fallback]);

  const save = useCallback(
    async (next: boolean) => {
      setOn(next);
      const { error } = await db()
        .from(TABLE)
        .upsert({ key, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
      // Put it back rather than leave a switch that says one thing while the
      // table says another.
      if (error) setOn(!next);
      return { error: error?.message };
    },
    [key],
  );

  return { on, loaded, save };
}
