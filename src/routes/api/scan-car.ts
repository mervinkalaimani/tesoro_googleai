import { createFileRoute } from "@tanstack/react-router";
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Reads a photograph of a die-cast car (card, box, or loose model) and extracts
 * its attributes (make, model, colour, brand, series, etc.).
 *
 * Server-side route using @google/genai with GEMINI_API_KEY.
 */

const DEFAULT_MODEL = "gemini-3.8-flash";
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
  const key = process.env["GEMINI_API_KEY"];
  if (!key) {
    return json(
      {
        error:
          "Image analysis is not set up on this deployment. Add a GEMINI_API_KEY environment variable and redeploy.",
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

  try {
    const ai = getGenAI(key);
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
      return json({ error: "Nothing came back from image analysis." }, 502);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({ error: "The response was in an unexpected format." }, 502);
    }

    if (!parsed || typeof parsed !== "object") {
      return json({ error: "No attributes were detected from the image." }, 502);
    }

    return json({ fields: cleanFields(parsed as Record<string, unknown>) });
  } catch (err: unknown) {
    const detail = (err as Error)?.message || "Image analysis failed.";
    return json({ error: `${detail} (model: ${model})` }, 502);
  }
}

export const Route = createFileRoute("/api/scan-car")({
  server: { handlers: { POST: handler } },
});
