import { supabase } from "@/integrations/supabase/client";

/**
 * The signed-in session as a header, for this app's own API routes.
 *
 * Empty when there is no session, so the call still goes out and the route
 * answers 401 — a request that silently did not happen is harder to read than
 * one that was refused.
 *
 * Lived in push-client.ts while push was the only thing that identified its
 * caller. The card scanner needs it too now, and a second copy of four lines
 * that decide who someone is would be two answers to one question.
 */
export async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
