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

export function serverSupabase(): SupabaseClient {
  const url =
    (process.env["SUPABASE_URL"] && !process.env["SUPABASE_URL"].includes("pllpyzsfuhpsmqbxgarw")
      ? process.env["SUPABASE_URL"]
      : null) || PROJECT_URL;
  const key =
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    "sb_publishable_t8mahOsDrNTnt-YeFGkgTA_ugnPJrpu";
  return createClient(url, key);
}

export type Caller = {
  uid: string;
  /** Whether this account is on Pro today, straight from the database. */
  isPro: boolean;
};

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
  if (error || !uid) return null;

  const { data: pro } = await client.rpc("is_tesoro_pro", { _uid: uid });
  return { uid, isPro: pro === true };
}
