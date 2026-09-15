// Prints a fresh VAPID key pair for push notifications.
//
//   node scripts/generate-vapid-keys.mjs
//
// Put both values in the deployment's environment variables (VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY) along with VAPID_SUBJECT=mailto:you@example.com. Keep the
// private key out of the repo. Changing the pair later means every device has
// to switch notifications off and on again.

import { createECDH } from "node:crypto";

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();

console.log(`VAPID_PUBLIC_KEY=${ecdh.getPublicKey().toString("base64url")}`);
const priv = ecdh.getPrivateKey();
const padded = Buffer.concat([Buffer.alloc(Math.max(0, 32 - priv.length)), priv]);
console.log(`VAPID_PRIVATE_KEY=${padded.toString("base64url")}`);
