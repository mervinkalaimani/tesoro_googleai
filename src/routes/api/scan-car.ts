import { createFileRoute } from "@tanstack/react-router";

/**
 * Reads a photograph of a card or a box and says what casting is on it.
 *
 * This is a server route rather than a fetch from the browser for one reason:
 * the API key. A key shipped to the client is a key published, and this one
 * bills to an account. Nothing about the request is stored — the image is
 * forwarded, the answer is returned, and neither is written down.
 *
 * The model is Gemini, because it takes an image and a JSON schema in one call
 * and the free tier covers a collection being catalogued by one person. Swap
 * providers here and nothing above this file changes.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Google retires these out from under you: 2.5-flash stopped accepting new keys
 * and said so in the response, which is the whole reason the provider's own
 * error text is passed through to the dialog rather than replaced with
 * something friendlier. When it happens again, GEMINI_MODEL overrides this
 * without touching code — the message names its own replacement.
 */
const DEFAULT_MODEL = "gemini-3.6-flash";

/** Roughly 6MB of base64, which is about 4.5MB of JPEG. */
const MAX_BASE64 = 6_000_000;

/**
 * The fields worth reading off a card, and nothing else.
 *
 * Price and seller are deliberately absent: what a card says it costs is the
 * American retail price on a blister from 2019, and the seller is a person in
 * a WhatsApp group who is not printed on anything.
 */
export const SCAN_FIELDS = [
  "make",
  "model",
  "variant",
  "year",
  "colour",
  "type",
  "series",
  "subSeries",
  "carNumber",
  "brand",
  "assortment",
  "size",
] as const;

export type ScanFields = Record<(typeof SCAN_FIELDS)[number], string>;

const PROMPT = `You are cataloguing a die-cast model car for a collector's database.

The image is a photograph of the car's blister card, box, or the model itself.
Read it and return what you can actually see or confidently identify.

Field notes:
- make: the real-world manufacturer of the car depicted (Nissan, Porsche, Ford).
  Never the toy company.
- model: the base model name only (Skyline, Supra, 911). Not the trim.
- variant: the trim or sub-designation (R34, GT-R, KH, Custom).
- year: the model year of the real car, if printed. Four digits.
- colour: the body colour as a collector would describe it.
- type: the body style or category (Race Car, Classic, Supercar, SUV, Truck).
- brand: the die-cast manufacturer (Hot Wheels, Matchbox, Mini GT, Tarmac Works).
- assortment: the product line (Mainline, Premium, Boulevard, Car Culture).
- series: the named series or collection printed on the card.
- subSeries: a narrower run inside that series, when the card names one.
- carNumber: the collector number exactly as printed, including the slash
  (e.g. "3/5", "142/250").
- size: the scale, formatted like "1:64".

Return an empty string for anything you cannot read or are not confident about.
Do not guess at a field to fill it. A blank is more useful than a wrong answer,
because a blank gets typed in and a wrong answer gets saved.`;

/** Gemini's schema dialect: every field a nullable string. */
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: Object.fromEntries(SCAN_FIELDS.map((f) => [f, { type: "STRING" }])),
  required: [...SCAN_FIELDS],
};

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Everything the caller sent, narrowed to strings we are willing to forward. */
function readBody(raw: unknown): { mimeType: string; data: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const { mimeType, data } = raw as { mimeType?: unknown; data?: unknown };
  if (typeof mimeType !== "string" || typeof data !== "string") return null;
  if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) return null;
  if (!data || data.length > MAX_BASE64) return null;
  return { mimeType, data };
}

/** Trims, and drops anything the model filled in with a placeholder. */
function cleanFields(parsed: Record<string, unknown>): ScanFields {
  const out = {} as ScanFields;
  for (const key of SCAN_FIELDS) {
    const v = typeof parsed[key] === "string" ? (parsed[key] as string).trim() : "";
    // Models reach for these when told to leave a field blank and asked for a
    // string anyway. They are not answers.
    out[key] = /^(n\/?a|unknown|none|null|-|—)$/i.test(v) ? "" : v;
  }
  return out;
}

async function handler({ request }: { request: Request }) {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) {
    return json(
      {
        error:
          "Scanning is not set up on this deployment. Add a GEMINI_API_KEY environment variable and redeploy.",
      },
      501,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "That request was not JSON." }, 400);
  }

  const image = readBody(body);
  if (!image) {
    return json({ error: "Send a JPEG, PNG or WebP under about 4MB." }, 400);
  }

  const model = process.env["GEMINI_MODEL"] || DEFAULT_MODEL;

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: image.mimeType, data: image.data } },
            ],
          },
        ],
        generationConfig: {
          // Cataloguing is not a creative task: the same card should read the
          // same way twice.
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });
  } catch {
    return json({ error: "Could not reach the scanning service." }, 502);
  }

  const payload = (await res.json().catch(() => null)) as GeminiResponse | null;

  if (!res.ok) {
    // The provider's own message, which is usually the useful one — a bad key,
    // a quota, a model name that has moved on. Tagged with the model actually
    // used, because "this model is no longer available" is only actionable if
    // you know which one was asked for and whether GEMINI_MODEL set it.
    const detail = payload?.error?.message || `Scanning failed (${res.status}).`;
    return json({ error: `${detail} (model: ${model})` }, 502);
  }

  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return json({ error: "Nothing came back from the scan." }, 502);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return json({ error: "The scan came back in a shape we could not read." }, 502);
  }
  if (!parsed || typeof parsed !== "object") {
    return json({ error: "The scan came back empty." }, 502);
  }

  return json({ fields: cleanFields(parsed as Record<string, unknown>) });
}

export const Route = createFileRoute("/api/scan-car")({
  server: { handlers: { POST: handler } },
});
