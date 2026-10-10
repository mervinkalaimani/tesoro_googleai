import { callerFrom, serverSupabase, type Caller } from "@/lib/supabase-server";

/**
 * Who may call an API route, and how often.
 *
 * Every route under /api is a public URL. Until now most of them read that
 * literally: no token asked for, the service-role key used to answer, and in
 * two cases a write across every collection in the database. A route that
 * holds the service-role key holds the key that RLS cannot stop, so the check
 * RLS would have done has to be done here instead.
 */

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** The caller, or a 401 to return. Never both. */
export async function requireCaller(
  request: Request,
): Promise<{ caller: Caller; refused?: never } | { caller?: never; refused: Response }> {
  const caller = await callerFrom(request);
  if (!caller) return { refused: json({ error: "Sign in first." }, 401) };
  return { caller };
}

/**
 * The caller, if they are an admin.
 *
 * Read through `is_tesoro_admin` — the same function the RLS policies use —
 * rather than by reading the column here, so there is one answer to "is this
 * an admin" and not two that can drift apart.
 */
export async function requireAdmin(
  request: Request,
): Promise<{ caller: Caller; refused?: never } | { caller?: never; refused: Response }> {
  const got = await requireCaller(request);
  if (got.refused) return got;
  const { data } = await serverSupabase().rpc("is_tesoro_admin", { _uid: got.caller.uid });
  if (data !== true) return { refused: json({ error: "Admins only." }, 403) };
  return { caller: got.caller };
}

/**
 * A fixed window per key, counted in this instance's memory.
 *
 * ponytail: per-instance and in-memory, so a deployment running four
 * instances allows four times the limit and a cold start forgets everything.
 * That is the difference between "one person cannot hammer this in a loop"
 * and "this endpoint has a quota", and the first is what is wanted here. If
 * it ever needs to be a real quota, it moves to a table with the same shape
 * as tesoro_claim_scan.
 */
const hits = new Map<string, { n: number; until: number }>();

export function tooMany(key: string, limit: number, windowMs: number): Response | null {
  const now = Date.now();
  const seen = hits.get(key);

  if (!seen || seen.until <= now) {
    hits.set(key, { n: 1, until: now + windowMs });
    // Nothing clears this otherwise, and a map keyed by uid grows with the
    // number of people who ever called. Cheap enough to sweep on a miss.
    if (hits.size > 5000) for (const [k, v] of hits) if (v.until <= now) hits.delete(k);
    return null;
  }

  seen.n += 1;
  if (seen.n <= limit) return null;

  const retryAfter = Math.max(1, Math.ceil((seen.until - now) / 1000));
  return new Response(JSON.stringify({ error: "Too many requests. Try again in a moment." }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(retryAfter) },
  });
}

/**
 * Who to count against when there is no account to count against.
 *
 * The proxy sets x-forwarded-for; the left-most entry is the client as the
 * first proxy saw it. It can be spoofed by anyone willing to send a header,
 * which is why nothing is authorised on it — it only decides whose bucket an
 * anonymous request falls in.
 */
export function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anon";
}
