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

/**
 * Fastest working first.
 *
 * gemini-2.5-flash used to lead and is no longer offered to newer keys: it
 * answers 404, every scan paid a round trip for that before reaching the next
 * model, and the next was the lite one, which took 32 seconds to read six cards
 * against 8 for gemini-3.8-flash. A deployment whose key still has 2.5 gets it
 * third, after the two that read a photograph quickly and well.
 */
const CANDIDATE_MODELS = [
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
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

/** The cap on one photograph, and so on what one multi-car scan can cost. */
const MAX_CARS = 6;

const MULTI_PROMPT = `You are an expert die-cast model car cataloguer for a collector's database.

The image shows SEVERAL die-cast cars at once, laid out together: blister cards, boxes, loose models, or a mix.
First count every distinct car you can see, then list them: one entry per car, left to right and then top to bottom.
Count and list EVERY car, including ones that are small, at an angle, partly overlapping or only partly legible.
Never leave a car out because some of its details are uncertain: include it and leave the uncertain fields as
empty strings. A car in a package counts as one car, not as the package and the car. If the same casting
appears twice, list it twice. Leave out only things that are not die-cast cars. At most ${MAX_CARS} cars; if
there are more, list the ${MAX_CARS} most clearly visible.

For every car, extract these fields:
- make: the real-world automotive manufacturer (e.g. Nissan, Porsche, Ford). Never the toy brand.
- model: the base vehicle model name only (e.g. Skyline, Supra, 911).
- variant: trim or sub-designation (e.g. GT-R, R34, GT3, LBWK).
- year: real car model year or packaging year if printed. Four digits.
- colour: the primary body colour and livery finish as a collector describes it.
- type: body style/category (e.g. Supercar, Race Car, Classic, JDM, Muscle, SUV, Truck).
- brand: die-cast manufacturer / toy brand (e.g. Hot Wheels, Matchbox, Mini GT, Tarmac Works, Majorette).
- assortment: product line (e.g. Mainline, Premium, Boulevard, Car Culture, Box).
- series: named series or collection printed or recognizable.
- subSeries: narrower run or sub-series if applicable.
- carNumber: collector number exactly as printed or known.
- size: scale, usually "1:64" or "1:43" or "1:32" or "1:18".

Return an empty string for any field you cannot determine. Do not invent or guess randomly.`;

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
  multi = false,
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
                text: multi
                  ? `${MULTI_PROMPT}

Reply with JSON only: an object with the key "count" (how many cars you can see) and then the key "cars", holding an array. Each item has exactly these keys: ${SCAN_FIELDS.join(", ")}.`
                  : `${PROMPT}

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

/**
 * Pays for the cars a photograph turned out to hold: one credit each.
 *
 * The first was taken before the model was called, as for any scan, and what
 * is owed is only known once it has answered. So the rest are claimed one at a
 * time, each through the same function and so each checked against the
 * allowance, and if the allowance runs out partway the list is cut to the cars
 * that were paid for rather than handing over what was not.
 */
async function payForCars(token: string, cars: ScanFields[]) {
  let paid = 1;
  for (let i = 1; i < cars.length; i++) {
    const { data, error } = await callerSupabase(token).rpc("tesoro_claim_scan");
    const taken = (Array.isArray(data) ? data[0] : data) as { allowed: boolean } | undefined;
    if (error || !taken?.allowed) break;
    paid += 1;
  }
  return { cars: cars.slice(0, paid), found: cars.length, trimmed: paid < cars.length };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function readBody(raw: unknown): { mimeType: string; data: string; multi: boolean } | null {
  if (!raw || typeof raw !== "object") return null;
  const { mimeType, data, multi } = raw as { mimeType?: unknown; data?: unknown; multi?: unknown };
  if (typeof mimeType !== "string" || typeof data !== "string") return null;
  if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) return null;
  if (!data || data.length > MAX_BASE64) return null;
  return { mimeType, data, multi: multi === true };
}

/** How many cars the model said it could see, which it is asked for before it lists them. */
function seenFrom(parsed: unknown): number {
  const n = Number((parsed as { count?: unknown } | null)?.count);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 99) : 0;
}

/** A reply that counted more cars than it described, short of the most one photograph can return. */
const incomplete = (read: number, seen: number) => seen > read && read < MAX_CARS;

/** Each car the reply listed, cleaned, with the ones that say nothing about a car dropped. */
function carsFrom(parsed: unknown): ScanFields[] {
  const list = (parsed as { cars?: unknown } | null)?.cars;
  if (!Array.isArray(list)) return [];
  return list
    .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object")
    .map(cleanFields)
    .filter((c) => Object.values(c).some(Boolean))
    .slice(0, MAX_CARS);
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

  /** The fullest multi-car reading so far, kept so a worse retry never replaces it. */
  let best: { cars: ScanFields[]; seen: number; model: string } | null = null;
  const consider = (cars: ScanFields[], seen: number, model: string) => {
    console.log(`[scan-car] multi model=${model} seen=${seen} read=${cars.length}`);
    if (!best || cars.length > best.cars.length) best = { cars, seen, model };
  };
  const bestReply = async () => {
    const b = best!;
    return json({
      ...(await payForCars(caller.token, b.cars)),
      seen: b.seen,
      modelUsed: b.model,
    });
  };

  // The router first, when there is one.
  if (omniBase) {
    const attempt = await scanViaOmniRoute(omniBase, image, image.multi);
    if (attempt.fields) {
      if (image.multi) {
        const cars = carsFrom(attempt.fields);
        const seen = seenFrom(attempt.fields);
        if (cars.length) {
          consider(cars, seen, `omniroute:${attempt.model}`);
          // Counted more than it listed, and there is another reader to ask.
          if (!(key && incomplete(cars.length, seen))) return bestReply();
          lastError = "The first reading missed some of the cars.";
        } else {
          lastError = "No cars could be read in that photograph.";
        }
      } else {
        return json({
          fields: cleanFields(attempt.fields),
          modelUsed: `omniroute:${attempt.model}`,
        });
      }
    } else {
      lastError = `${attempt.error} (omniroute: ${attempt.model})`;
    }
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
            { text: image.multi ? MULTI_PROMPT : PROMPT },
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
          responseSchema: image.multi
            ? {
                type: Type.OBJECT,
                // The count is asked for first, so the model has numbered the cars
                // before it describes them rather than stopping at the first few.
                propertyOrdering: ["count", "cars"],
                properties: {
                  count: { type: Type.INTEGER },
                  cars: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: Object.fromEntries(
                        SCAN_FIELDS.map((f) => [f, { type: Type.STRING }]),
                      ),
                      required: [...SCAN_FIELDS],
                    },
                  },
                },
                required: ["count", "cars"],
              }
            : {
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

      if (image.multi) {
        const cars = carsFrom(parsed);
        const seen = seenFrom(parsed);
        if (!cars.length) {
          lastError = "No cars could be read in that photograph.";
          continue;
        }
        consider(cars, seen, model);
        // It counted more cars than it described: try the next model, and keep
        // whichever reading turns out fullest.
        if (incomplete(cars.length, seen) && model !== modelsToTry[modelsToTry.length - 1]) {
          lastError = `Only ${cars.length} of ${seen} cars were read.`;
          continue;
        }
        return bestReply();
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

  // Every reader fell short, but one of them read something: that is the answer.
  if (best) return bestReply();

  return json({ error: lastError }, 502);
}

export const Route = createFileRoute("/api/scan-car")({
  server: { handlers: { POST: handler } },
});
