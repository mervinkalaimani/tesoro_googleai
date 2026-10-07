import { createHmac, timingSafeEqual } from "node:crypto";

import { callerFrom, serverSupabase } from "@/lib/supabase-server";
import { withGatewayFee } from "@/lib/tiers";

/**
 * Taking money, and turning it into a plan.
 *
 * Three rules shape all of this.
 *
 * The price is never sent by the browser. It is read from tesoro_plan_prices
 * at the moment the order is created, so a payment for ₹1 cannot buy a year of
 * Pro however the request was edited on the way out.
 *
 * The plan is never granted by the browser either. A checkout window closing
 * successfully is a claim, not a proof; what grants a plan is a signature over
 * the order and payment ids that only a holder of the key secret could have
 * produced, checked here.
 *
 * And a refusal is loud. Push notifications fail quietly by design — the
 * request is still recorded — but a payment that quietly does nothing is
 * somebody's money in the wrong place, so every missing piece of configuration
 * answers with a sentence saying which piece.
 */

const API = "https://api.razorpay.com/v1";

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type Keys = { id: string; secret: string };

/** Both halves, or nothing. A key id without its secret can create nothing. */
function keys(): Keys | null {
  const id = process.env["RAZORPAY_KEY_ID"];
  const secret = process.env["RAZORPAY_KEY_SECRET"];
  return id && secret ? { id, secret } : null;
}

/** The public half, for the browser that opens the checkout. */
export function publicKeyId(): string | null {
  return keys()?.id ?? null;
}

/**
 * Whether this deployment can both take a payment and act on it.
 *
 * The service-role key is in here deliberately. Granting a plan writes to a
 * row the paying account may not write to itself, so without it the money
 * would be taken and nothing would happen — the worst of the three outcomes.
 */
export function payReady(): boolean {
  return Boolean(keys() && process.env["SUPABASE_SERVICE_ROLE_KEY"]);
}

function notReady() {
  return json(
    {
      error:
        "Payments are not set up on this deployment. Add RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and SUPABASE_SERVICE_ROLE_KEY, then redeploy.",
    },
    501,
  );
}

/** The server's own client. Writing a payment is not something a session may do. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => serverSupabase() as any;

/**
 * Creates an order for a plan and a length, at today's price.
 *
 * Returns what the checkout needs and nothing it does not: no secret, and no
 * amount the browser could have chosen.
 */
export async function createOrder(request: Request) {
  const k = keys();
  if (!k || !payReady()) return notReady();

  const caller = await callerFrom(request);
  if (!caller) return json({ error: "Sign in first." }, 401);

  const body = (await request.json().catch(() => null)) as {
    plan?: string;
    months?: number;
  } | null;
  const plan = body?.plan === "plus" || body?.plan === "pro" ? body.plan : null;
  const months = Math.round(Number(body?.months));
  if (!plan || !Number.isFinite(months) || months < 1 || months > 60) {
    return json({ error: "Pick a plan and a length." }, 400);
  }

  // The price, from the table rather than from the request.
  const { data: priced, error: priceError } = await db()
    .from("tesoro_plan_prices")
    .select("price")
    .eq("plan", plan)
    .eq("months", months)
    .maybeSingle();
  if (priceError) return json({ error: "Could not read the price." }, 503);
  const rupees = Number((priced as { price?: number } | null)?.price);
  if (!Number.isFinite(rupees) || rupees <= 0) {
    return json({ error: "That plan is not for sale at that length." }, 400);
  }
  // The card fee goes on here, where the price is read — not in the browser,
  // which is not allowed to decide what anything costs. The screen shows the
  // same sum because it uses the same function.
  const amount = Math.round(withGatewayFee(rupees) * 100);
  // Razorpay refuses anything under a rupee, and so should we rather than
  // handing them an error to render.
  if (amount < 100) return json({ error: "That plan costs too little to charge for." }, 400);

  const made = await fetch(`${API}/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${Buffer.from(`${k.id}:${k.secret}`).toString("base64")}`,
    },
    body: JSON.stringify({
      amount,
      currency: "INR",
      // Their reference, not ours: it is what shows on the Razorpay dashboard
      // beside the payment, and it must not be anybody's email address.
      receipt: `viiv-${plan}-${months}m-${Date.now()}`,
      notes: { plan, months: String(months) },
    }),
  });

  if (!made.ok) {
    // The body may carry a key id or a message worth nobody's eyes but ours.
    return json({ error: "The payment provider refused to start that order." }, 502);
  }
  const order = (await made.json()) as { id?: string };
  if (!order.id) return json({ error: "The payment provider returned no order." }, 502);

  const { error: writeError } = await db().from("tesoro_payments").insert({
    auth_uid: caller.uid,
    plan,
    months,
    amount_paise: amount,
    currency: "INR",
    razorpay_order_id: order.id,
  });
  if (writeError) return json({ error: "Could not record that order." }, 503);

  return json({ orderId: order.id, amount, currency: "INR", keyId: k.id, plan, months });
}

/** Constant-time, because a signature check that leaks its timing is a guessable one. */
function sameSignature(expected: string, given: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Checks the signature, and only then grants the plan.
 *
 * The order row is what says which plan was bought and for how long — not the
 * request — so a verified payment can only ever grant what was paid for.
 */
export async function verifyPayment(request: Request) {
  const k = keys();
  if (!k || !payReady()) return notReady();

  const caller = await callerFrom(request);
  if (!caller) return json({ error: "Sign in first." }, 401);

  const body = (await request.json().catch(() => null)) as {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  } | null;
  const orderId = String(body?.razorpay_order_id || "");
  const paymentId = String(body?.razorpay_payment_id || "");
  const signature = String(body?.razorpay_signature || "");
  if (!orderId || !paymentId || !signature) {
    return json({ error: "That payment is missing its receipt." }, 400);
  }

  const expected = createHmac("sha256", k.secret).update(`${orderId}|${paymentId}`).digest("hex");
  if (!sameSignature(expected, signature)) {
    await db()
      .from("tesoro_payments")
      .update({ status: "failed" })
      .eq("razorpay_order_id", orderId)
      .eq("auth_uid", caller.uid);
    return json({ error: "That payment could not be verified." }, 400);
  }

  // The order, and it has to be this account's: a signature is proof the
  // payment happened, not proof of who is asking about it.
  const { data: row } = await db()
    .from("tesoro_payments")
    .select("id, plan, months, status, auth_uid")
    .eq("razorpay_order_id", orderId)
    .maybeSingle();
  const order = row as {
    id: number;
    plan: "plus" | "pro";
    months: number;
    status: string;
    auth_uid: string;
  } | null;
  if (!order) return json({ error: "No such order." }, 404);
  if (order.auth_uid !== caller.uid) return json({ error: "No such order." }, 404);

  // Already settled: say so rather than granting a second run for one payment.
  if (order.status === "paid") return json({ ok: true, already: true });

  // A plan bought while one is still running starts when that one ends, so
  // paying early adds to the run instead of cutting it short.
  const { data: me } = await db()
    .from("tesoro_users")
    .select("sno, pro_since, pro_until, is_pro")
    .eq("auth_uid", caller.uid)
    .maybeSingle();
  const profile = me as {
    sno: number;
    pro_since: string | null;
    pro_until: string | null;
    is_pro: boolean;
  } | null;
  if (!profile) return json({ error: "No account for this sign-in." }, 404);

  const today = new Date().toISOString().slice(0, 10);
  const runningUntil = profile.is_pro && profile.pro_until ? profile.pro_until : null;
  const startsOn = runningUntil && runningUntil >= today ? runningUntil : today;

  const { error: grantError } = await db()
    .from("tesoro_users")
    .update({
      is_pro: true,
      pro_plan: order.plan,
      pro_months: order.months,
      pro_since: startsOn,
      // Paying answers the ask, and it answers the leaving.
      pro_requested_at: null,
      pro_requested_plan: null,
      pro_requested_term: null,
      cancel_requested_at: null,
    })
    .eq("sno", profile.sno);
  if (grantError) {
    // The money is taken and the plan is not granted: the row stays unpaid so
    // it shows up as exactly that rather than disappearing.
    return json({ error: "Paid, but the plan could not be switched on. Tell an admin." }, 500);
  }

  await db()
    .from("tesoro_payments")
    .update({ status: "paid", razorpay_payment_id: paymentId, paid_at: new Date().toISOString() })
    .eq("id", order.id);

  return json({ ok: true, plan: order.plan, months: order.months });
}
