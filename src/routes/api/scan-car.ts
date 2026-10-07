import { createFileRoute } from "@tanstack/react-router";

import { callerFrom, callerSupabase } from "@/lib/supabase-server";
import { GoogleGenAI, Type } from "@google/genai";

import { fieldsFromChatCompletion } from "@/lib/scan-reply";

/**
 * Reads a photograph of a die-cast car (card, box, or loose model) and extracts
 * its attributes (make, model, colour, brand, series, etc.).
 *
 * Two backends, tried in order:
 *
 *   1. OmniRoute, when OMNIROUTE_BASE_URL is set. An OpenAI-compatible router
 *      that picks a provider and falls back between them itself, so one key in
 *      one place covers whatever the scan runs on. It is opt-in because it is
 *      somebody's own process: a deployment that does not name one never calls
 *      it, which is why production keeps working unchanged.
 *   2. Gemini through @google/genai with GEMINI_API_KEY.
 *
 * Either alone is enough. With both, OmniRoute goes first and Gemini catches
 * what it drops -- naming a router means wanting it used, not wanting it to be
 * the only thing between a photograph and an answer.
 */

const CANDIDATE_MODELS = [
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
];
const MAX_BASE64 = 6_000_000;

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

const PROMPT = `You are an expert die-cast model car cataloguer for a collector's database.

The image is a photograph of a die-cast car — either in its blister card / packaging, box, or a loose model car.
Analyze the image carefully and extract all identifiable car and collectible attributes.

Field notes:
- make: the real-world automotive manufacturer (e.g. Nissan, Porsche, Ford, Toyota, BMW, Ferrari). Never the toy brand.
- model: the base vehicle model name only (e.g. Skyline, Supra, 911, Mustang, Civic). Not the full trim.
- variant: trim or sub-designation (e.g. GT-R, R34, GT3, LBWK, Nismo, Shelby, Custom).
- year: real car model year or packaging year if printed (e.g. 1999, 2023). Four digits.
- colour: the primary body colour and livery finish as a diecast collector describes it (e.g. Bayside Blue, Red, Matte Black, Yellow).
- type: body style/category (e.g. Supercar, Race Car, Classic, JDM, Muscle, SUV, Truck).
- brand: die-cast manufacturer / toy brand (e.g. Hot Wheels, Matchbox, Mini GT, Kaido House, Tarmac Works, Inno64, Majorette, Pop Race).
- assortment: product line (e.g. Mainline, Premium, Boulevard, Car Culture, Team Transport, Box).
- series: named series or collection printed or recognizable (e.g. Fast & Furious, HW Exotics, Retro Entertainment).
- subSeries: narrower run or sub-series if applicable.
- carNumber: collector number exactly as printed or known (e.g. "3/5", "142/250", "#1133").
- size: scale of the model, usually "1:64" or "1:43" or "1:32" or "1:18".

Return an empty string for anything you cannot determine or are uncertain about.
Do not invent or guess randomly.`;

let aiClient: GoogleGenAI | null = null;
function getGenAI(apiKey: string): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

/** Asks OmniRoute. Returns the fields, or the reason it could not. */
async function scanViaOmniRoute(
  base: string,
  image: { mimeType: string; data: string },
): Promise<{ fields?: Record<string, unknown>; model: string; error?: string }> {
  const model = process.env["OMNIROUTE_MODEL"] || "auto";
  const apiKey = process.env["OMNIROUTE_API_KEY"];
  const url = `${base.replace(/\/+$/, "")}/v1/chat/completions`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${PROMPT}

Reply with JSON only, using exactly these keys: ${SCAN_FIELDS.join(", ")}.`,
              },
              {
                type: "image_url",
                image_url: { url: `data:${image.mimeType};base64,${image.data}` },
              },
            ],
          },
        ],
      }),
    });

    const payload: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      // OmniRoute says which providers it tried and why each refused. That is
      // the whole reason to read its body rather than just the status.
      const detail =
        (payload as { error?: { message?: string } })?.error?.message ||
        `OmniRoute answered ${res.status}.`;
      return { model, error: detail };
    }

    const fields = fieldsFromChatCompletion(payload);
    if (!fields) return { model, error: "OmniRoute returned no readable JSON." };
    return { fields, model };
  } catch (err) {
    return { model, error: (err as Error)?.message || "OmniRoute could not be reached." };
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function readBody(raw: unknown): { mimeType: string; data: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const { mimeType, data } = raw as { mimeType?: unknown; data?: unknown };
  if (typeof mimeType !== "string" || typeof data !== "string") return null;
  if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) return null;
  if (!data || data.length > MAX_BASE64) return null;
  return { mimeType, data };
}

function cleanFields(parsed: Record<string, unknown>): ScanFields {
  const out = {} as ScanFields;
  for (const key of SCAN_FIELDS) {
    const v = typeof parsed[key] === "string" ? (parsed[key] as string).trim() : "";
    out[key] = /^(n\/?a|unknown|none|null|-|—)$/i.test(v) ? "" : v;
  }
  return out;
}

async function handler({ request }: { request: Request }) {
  /**
   * Who is asking, before anything is spent on them.
   *
   * This route had no caller check at all: anyone who could reach the
   * deployment could post an image and bill the Gemini or OmniRoute key to it.
   * The tier gate and that hole are the same fix, so both close here, and
   * before the model is called rather than after.
   */
  const caller = await callerFrom(request);
  if (!caller) {
    return json({ error: "Sign in to scan a card." }, 401);
  }
  /**
   * And what it costs them.
   *
   * The claim is written as the caller through their own token, so the count
   * cannot be spent on somebody else's account, and it happens before the
   * model call rather than after: a scan that failed to be paid for should not
   * have been taken.
   */
  const { data: claim, error: claimError } = await callerSupabase(caller.token).rpc(
    "tesoro_claim_scan",
  );
  if (claimError) {
    return json({ error: "Could not check your scan allowance. Try again in a moment." }, 503);
  }
  const taken = (Array.isArray(claim) ? claim[0] : claim) as
    { allowed: boolean; used: number; allowance: number | null } | undefined;
  if (!taken?.allowed) {
    const n = taken?.allowance ?? 0;
    return json(
      {
        error: `That is all ${n} scans for this month. The count resets on the 1st, and a bigger plan lifts it.`,
      },
      429,
    );
  }

  const key = process.env["GEMINI_API_KEY"];
  const omniBase = process.env["OMNIROUTE_BASE_URL"];
  if (!key && !omniBase) {
    return json(
      {
        error:
          "Image analysis is not set up on this deployment. Add a GEMINI_API_KEY or an OMNIROUTE_BASE_URL environment variable and redeploy.",
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

  let lastError = "Image analysis failed.";

  // The router first, when there is one.
  if (omniBase) {
    const attempt = await scanViaOmniRoute(omniBase, image);
    if (attempt.fields) {
      return json({ fields: cleanFields(attempt.fields), modelUsed: `omniroute:${attempt.model}` });
    }
    lastError = `${attempt.error} (omniroute: ${attempt.model})`;
    // Nothing else to fall back to.
    if (!key) return json({ error: lastError }, 502);
  }

  const specifiedModel = process.env["GEMINI_MODEL"];
  const modelsToTry = specifiedModel ? [specifiedModel] : CANDIDATE_MODELS;
  const ai = getGenAI(key!);

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            { text: PROMPT },
            {
              inlineData: {
                mimeType: image.mimeType,
                data: image.data,
              },
            },
          ],
        },
        config: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: Object.fromEntries(SCAN_FIELDS.map((f) => [f, { type: Type.STRING }])),
            required: [...SCAN_FIELDS],
          },
        },
      });

      const text = response.text;
      if (!text) {
        lastError = "Nothing came back from image analysis.";
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        lastError = "The response was in an unexpected format.";
        continue;
      }

      if (!parsed || typeof parsed !== "object") {
        lastError = "No attributes were detected from the image.";
        continue;
      }

      return json({ fields: cleanFields(parsed as Record<string, unknown>), modelUsed: model });
    } catch (err: unknown) {
      const detail = (err as Error)?.message || "Image analysis failed.";
      lastError = `${detail} (model: ${model})`;
      // If quota exceeded or 429, continue to next model
      const isQuota = /429|quota|resource_exhausted|rate limit/i.test(detail);
      if (isQuota) {
        continue;
      }
      // For other critical failures, continue trying next candidate model
      continue;
    }
  }

  return json({ error: lastError }, 502);
}

export const Route = createFileRoute("/api/scan-car")({
  server: { handlers: { POST: handler } },
});
