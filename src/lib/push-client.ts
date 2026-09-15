// Push notifications, browser side: turning them on for this device, off
// again, and asking the server to tell the admins about a new account.

import { supabase } from "@/integrations/supabase/client";

export type PushState =
  | "unsupported" // no service worker / Push API in this browser
  | "needs-install" // iPhone/iPad Safari: only a Home Screen app can receive push
  | "not-configured" // the deployment has no VAPID keys
  | "denied" // the person blocked notifications for the site
  | "off"
  | "on";

const SW_URL = "/sw.js";

function isIos() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function supported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

let publicKeyPromise: Promise<string | null> | null = null;
function publicKey() {
  publicKeyPromise ??= fetch("/api/push/config")
    .then((r) => (r.ok ? r.json() : { publicKey: null }))
    .then((j: { publicKey?: string | null }) => j.publicKey || null)
    .catch(() => {
      publicKeyPromise = null;
      return null;
    });
  return publicKeyPromise;
}

async function existingSubscription() {
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  return (await reg?.pushManager.getSubscription()) ?? null;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function readPushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  if (isIos() && !isStandalone()) return "needs-install";
  if (!supported()) return "unsupported";
  if (!(await publicKey())) return "not-configured";
  if (Notification.permission === "denied") return "denied";
  const sub = await existingSubscription();
  if (!sub) return "off";
  // The browser can still hold a subscription the database lost (signed in as
  // someone else since, or cleared); only call it on when both agree.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("tesoro_push_subscriptions")
    .select("id")
    .eq("endpoint", sub.endpoint)
    .limit(1);
  return data?.length ? "on" : "off";
}

export async function enablePush(): Promise<PushState> {
  const key = await publicKey();
  if (!key) return "not-configured";

  // Asked from the switch's click, which is what iOS insists on.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  const reg = await navigator.serviceWorker.register(SW_URL);
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  // A subscription made with a different key (keys were rotated) can't be used.
  const current = sub?.options.applicationServerKey;
  if (sub && current && toB64url(current) !== key) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: fromB64url(key),
  });

  const json = sub.toJSON();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("save_push_subscription", {
    _endpoint: sub.endpoint,
    _p256dh: json.keys?.p256dh ?? "",
    _auth: json.keys?.auth ?? "",
    _user_agent: navigator.userAgent,
  });
  if (error) throw new Error(error.message);
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const sub = await existingSubscription();
  if (sub) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc("delete_push_subscription", { _endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
  return "off";
}

export async function sendTestPush(): Promise<number> {
  const res = await fetch("/api/push/test", { method: "POST", headers: await authHeader() });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);
  return out.sent ?? 0;
}

/**
 * From a new account's waiting screen. The server announces each account once,
 * so calling this on every visit is harmless.
 */
export async function announceNewUser() {
  try {
    await fetch("/api/push/new-user", { method: "POST", headers: await authHeader() });
  } catch {
    // The admins still see the request in the bell; push is the extra.
  }
}

function fromB64url(s: string) {
  const b64 = s
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(s.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function toB64url(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
