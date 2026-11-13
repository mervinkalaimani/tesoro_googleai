import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * A Supabase client for code running on the server, and the question "who is
 * asking".
 *
 * The env-fallback dance below is what `routes/api/catalog-owners.ts` does by
 * hand; this is the same thing in one place, for the routes that need it next.
 * That route is left alone.
 */

const PROJECT_URL = "https://matekrbcflojjooswoha.supabase.co";

/**
 * An environment value that is really there.
 *
 * `vercel env pull` writes the text "[SENSITIVE]" for a secret it will not
 * reveal, so a local .env.local can hold a placeholder where a key should be.
 * A placeholder is not blank, so it beat every fallback below and the server
 * asked Supabase "who is this" with a key that was never a key: "Invalid API
 * key", and a 401 for everyone, signed in or not. Treated as unset, the
 * fallbacks apply.
 */
function envValue(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v !== "[SENSITIVE]" ? v : undefined;
}

/** The project URL: the environment's, if it is a URL and not the old project. */
function projectUrl(): string {
  const v = envValue("SUPABASE_URL");
  return v && /^https?:\/\//.test(v) && !v.includes("pllpyzsfuhpsmqbxgarw") ? v : PROJECT_URL;
}

export function serverSupabase(): SupabaseClient {
  const key =
    envValue("SUPABASE_SERVICE_ROLE_KEY") ||
    envValue("SUPABASE_PUBLISHABLE_KEY") ||
    envValue("VITE_SUPABASE_PUBLISHABLE_KEY") ||
    "sb_publishable_t8mahOsDrNTnt-YeFGkgTA_ugnPJrpu";
  return createClient(projectUrl(), key);
}

export type Caller = {
  uid: string;
  /** Whether this account is on Pro today, straight from the database. */
  isPro: boolean;
  /** Their own access token, for anything that must be written as them. */
  token: string;
};

/**
 * A client that acts as the caller rather than as the deployment.
 *
 * Needed by anything that writes through a security definer function keyed on
 * auth.uid(): the server's own client has no session, so auth.uid() there is
 * null. Passing the uid as an argument instead would let one account spend
 * another's allowance, which is the whole thing worth preventing.
 */
export function callerSupabase(token: string): SupabaseClient {
  const key =
    envValue("SUPABASE_PUBLISHABLE_KEY") ||
    envValue("VITE_SUPABASE_PUBLISHABLE_KEY") ||
    "sb_publishable_t8mahOsDrNTnt-YeFGkgTA_ugnPJrpu";
  return createClient(projectUrl(), key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Who sent this request, from the bearer token they sent with it.
 *
 * Null for no token, a token that does not verify, or an account the users
 * table does not know. A route that calls this and acts on null is a route
 * nobody can use without signing in — which is the point: until now any of
 * them could be called by anyone, and the ones that cost money were spending
 * somebody else's key.
 *
 * The tier is read through `is_tesoro_pro`, the same function the RLS policies
 * use, rather than by reading `is_pro` and comparing dates here. Two answers to
 * "is this account Pro" is one answer too many.
 */
export async function callerFrom(request: Request): Promise<Caller | null> {
  const header = request.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const client = serverSupabase();
  const { data, error } = await client.auth.getUser(token);
  const uid = data?.user?.id;
  if (error || !uid) {
    // Said in the logs, never to the caller: "who is this" failing and "this
    // server cannot ask" failing both come back as a 401, and only one of them
    // is the person's doing.
    console.warn(`[caller] token not accepted: ${error?.message ?? "no user returned"}`);
    return null;
  }

  const { data: pro } = await client.rpc("is_tesoro_pro", { _uid: uid });
  return { uid, isPro: pro === true, token };
}
