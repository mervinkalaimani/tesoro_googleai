// Web Push, server side: VAPID-signed, aes128gcm-encrypted (RFC 8291 / 8292),
// on node:crypto alone so there is no extra dependency to install.
//
// Needs three environment variables on the deployment:
//   VAPID_PUBLIC_KEY    base64url, 65-byte uncompressed P-256 point
//   VAPID_PRIVATE_KEY   base64url, 32-byte private scalar
//   VAPID_SUBJECT       a mailto: or https: contact for the push services
// `node scripts/generate-vapid-keys.mjs` prints a fresh pair.
//
// Server-only: import it inside a handler, never from client code.

import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  hkdfSync,
  randomBytes,
  sign,
  timingSafeEqual,
} from "node:crypto";

export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string };

const b64url = (buf: Buffer | Uint8Array) => Buffer.from(buf).toString("base64url");
const fromB64url = (s: string) => Buffer.from(s, "base64url");

export function vapidConfig() {
  const publicKey = process.env["VAPID_PUBLIC_KEY"]?.trim();
  const privateKey = process.env["VAPID_PRIVATE_KEY"]?.trim();
  const subject = process.env["VAPID_SUBJECT"]?.trim() || "mailto:admin@example.com";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

/** The VAPID JWT for one push service origin, good for 12 hours. */
function vapidAuthorization(endpoint: string, cfg: NonNullable<ReturnType<typeof vapidConfig>>) {
  const pub = fromB64url(cfg.publicKey);
  // A scalar with leading zero bytes can come out short; JWK wants all 32.
  const raw = fromB64url(cfg.privateKey);
  const d = Buffer.concat([Buffer.alloc(Math.max(0, 32 - raw.length)), raw]);
  const key = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: b64url(d),
      x: b64url(pub.subarray(1, 33)),
      y: b64url(pub.subarray(33, 65)),
    },
    format: "jwk",
  });
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(
    Buffer.from(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: cfg.subject,
      }),
    ),
  );
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${cfg.publicKey}`;
}

/** One aes128gcm record holding the whole payload (RFC 8291 §4). */
function encrypt(sub: PushSubscriptionRow, payload: Buffer) {
  const uaPublic = fromB64url(sub.p256dh);
  const authSecret = fromB64url(sub.auth);

  const ecdh = createECDH("prime256v1");
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, keyInfo, 32));

  const salt = randomBytes(16);
  const cek = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16),
  );
  const nonce = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12),
  );

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  // 0x02 marks the last (and only) record; no padding.
  const body = Buffer.concat([
    cipher.update(Buffer.concat([payload, Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

/**
 * Sends one notification. `gone` means the push service has forgotten the
 * subscription (uninstalled, permission revoked) and the row should go.
 */
export async function sendPush(sub: PushSubscriptionRow, message: unknown) {
  const cfg = vapidConfig();
  if (!cfg) return { ok: false, gone: false, status: 0 };
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidAuthorization(sub.endpoint, cfg),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(3 * 86400),
      Urgency: "high",
    },
    body: encrypt(sub, Buffer.from(JSON.stringify(message))),
  });
  return { ok: res.ok, gone: res.status === 404 || res.status === 410, status: res.status };
}

// ---------------------------------------------------------------------------
// Decision tokens: what lets Approve / Reject work from the notification
// itself, where there is no signed-in session. Bound to the account being
// reviewed and the admin it was sent to, and short-lived.
// ---------------------------------------------------------------------------

const TOKEN_TTL_S = 7 * 86400;

function tokenKey() {
  const cfg = vapidConfig();
  if (!cfg) return null;
  return createHmac("sha256", cfg.privateKey).update("tesoro approval decision").digest();
}

export function signDecisionToken(sno: number, adminUid: string) {
  const key = tokenKey();
  if (!key) return null;
  const body = b64url(
    Buffer.from(
      JSON.stringify({ sno, admin: adminUid, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_S }),
    ),
  );
  return `${body}.${b64url(createHmac("sha256", key).update(body).digest())}`;
}

export function verifyDecisionToken(token: string): { sno: number; admin: string } | null {
  const key = tokenKey();
  const [body, mac] = String(token || "").split(".");
  if (!key || !body || !mac) return null;
  const expected = createHmac("sha256", key).update(body).digest();
  const given = fromB64url(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(fromB64url(body).toString("utf8"));
    if (typeof claims.sno !== "number" || typeof claims.admin !== "string") return null;
    if (typeof claims.exp !== "number" || claims.exp < Date.now() / 1000) return null;
    return { sno: claims.sno, admin: claims.admin };
  } catch {
    return null;
  }
}
