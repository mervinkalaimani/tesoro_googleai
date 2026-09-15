// Admin push notifications: who to tell when someone asks to join, and acting
// on Approve / Reject tapped in the notification.
//
// Server-only. Reads and writes with the service role, so every entry point
// establishes who is asking first: a signed-in user's access token, or a
// decision token this server signed.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  sendPush,
  signDecisionToken,
  vapidConfig,
  verifyDecisionToken,
  type PushSubscriptionRow,
} from "@/lib/web-push.server";

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Push needs VAPID keys to sign, and the service role to see past RLS. */
export function pushReady() {
  return Boolean(vapidConfig() && process.env["SUPABASE_SERVICE_ROLE_KEY"]);
}

const NOT_READY = () =>
  json(
    {
      error:
        "Push notifications are not set up on this deployment. Add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT and SUPABASE_SERVICE_ROLE_KEY, then redeploy.",
    },
    501,
  );

// The generated types predate the push columns and table.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

type Profile = {
  sno: number;
  auth_uid: string | null;
  first_name: string | null;
  last_name: string | null;
  email_id: string;
  is_admin: boolean;
  is_approved: boolean;
  is_owner: boolean;
  rejected_at: string | null;
  approval_push_at: string | null;
};

const PROFILE_COLS =
  "sno, auth_uid, first_name, last_name, email_id, is_admin, is_approved, is_owner, rejected_at, approval_push_at";

const displayName = (p: Pick<Profile, "first_name" | "last_name" | "email_id">) =>
  [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email_id;

async function callerProfile(request: Request): Promise<Profile | null> {
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "")?.[1];
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await db()
    .from("tesoro_users")
    .select(PROFILE_COLS)
    .eq("auth_uid", data.user.id)
    .maybeSingle();
  return (profile as Profile) ?? null;
}

async function subscriptionsFor(uids: string[]) {
  if (!uids.length) return [];
  const { data } = await db()
    .from("tesoro_push_subscriptions")
    .select("endpoint, p256dh, auth, auth_uid")
    .in("auth_uid", uids);
  return (data ?? []) as (PushSubscriptionRow & { auth_uid: string })[];
}

/** Sends to every subscription, clearing out the ones the push service has dropped. */
async function deliver(
  subs: (PushSubscriptionRow & { auth_uid: string })[],
  messageFor: (sub: { auth_uid: string }) => unknown,
) {
  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        const r = await sendPush(s, messageFor(s));
        if (r.ok) sent++;
        else if (r.gone) gone.push(s.endpoint);
        else console.warn(`[push] ${new URL(s.endpoint).host} answered ${r.status}`);
      } catch (err) {
        console.warn("[push] send failed", (err as Error).message);
      }
    }),
  );
  if (gone.length) await db().from("tesoro_push_subscriptions").delete().in("endpoint", gone);
  return sent;
}

/**
 * Called from the waiting screen of a new account. Tells every admin once; the
 * claim on approval_push_at is what makes "once" hold when two tabs race.
 */
export async function notifyNewUser(request: Request) {
  if (!pushReady()) return NOT_READY();
  const me = await callerProfile(request);
  if (!me) return json({ error: "Sign in first." }, 401);
  if (me.is_approved || me.is_owner || me.rejected_at || me.approval_push_at) {
    return json({ sent: 0, reason: "nothing to announce" });
  }

  const { data: claimed } = await db()
    .from("tesoro_users")
    .update({ approval_push_at: new Date().toISOString() })
    .eq("sno", me.sno)
    .is("approval_push_at", null)
    .select("sno");
  if (!claimed?.length) return json({ sent: 0, reason: "already announced" });

  const { data: admins } = await db()
    .from("tesoro_users")
    .select("auth_uid")
    .eq("is_admin", true)
    .not("auth_uid", "is", null);
  const subs = await subscriptionsFor(
    ((admins ?? []) as { auth_uid: string }[]).map((a) => a.auth_uid),
  );

  const name = displayName(me);
  const sent = await deliver(subs, (s) => ({
    kind: "approval",
    title: "New account waiting for approval",
    body: name === me.email_id ? name : `${name} · ${me.email_id}`,
    tag: `approval-${me.sno}`,
    url: "/admin",
    sno: me.sno,
    name,
    token: signDecisionToken(me.sno, s.auth_uid),
  }));
  return json({ sent });
}

/** Approve or Reject tapped on the notification; the token stands in for a session. */
export async function decideFromNotification(request: Request) {
  if (!pushReady()) return NOT_READY();
  let body: { token?: unknown; decision?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "That request was not JSON." }, 400);
  }
  const decision = body.decision;
  if (decision !== "approve" && decision !== "reject") {
    return json({ error: "Decision must be approve or reject." }, 400);
  }
  const claims = verifyDecisionToken(String(body.token ?? ""));
  if (!claims)
    return json({ error: "This notification has expired. Open the app to decide." }, 401);

  // Still an admin now, not merely when the notification went out.
  const { data: admin } = await db()
    .from("tesoro_users")
    .select("is_admin")
    .eq("auth_uid", claims.admin)
    .maybeSingle();
  if (!admin?.is_admin) return json({ error: "You are no longer an admin." }, 403);

  const { data: target } = await db()
    .from("tesoro_users")
    .select(PROFILE_COLS)
    .eq("sno", claims.sno)
    .maybeSingle();
  if (!target || target.is_owner) return json({ error: "That account is gone." }, 404);

  const { error } = await db()
    .from("tesoro_users")
    .update(
      decision === "approve"
        ? { is_approved: true, rejected_at: null }
        : { is_approved: false, rejected_at: new Date().toISOString() },
    )
    .eq("sno", claims.sno);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, decision, name: displayName(target as Profile) });
}

/** "Send a test" in Settings: pushes to the calling admin's own devices. */
export async function sendTest(request: Request) {
  if (!pushReady()) return NOT_READY();
  const me = await callerProfile(request);
  if (!me?.auth_uid || !me.is_admin) return json({ error: "Admins only." }, 403);
  const subs = await subscriptionsFor([me.auth_uid]);
  if (!subs.length) return json({ error: "Turn notifications on for this device first." }, 400);
  const sent = await deliver(subs, () => ({
    kind: "test",
    title: "Tesoro notifications are on",
    body: "New accounts will show up here with Approve and Reject.",
    tag: "test",
    url: "/settings?tab=notifications",
  }));
  return json({ sent });
}
