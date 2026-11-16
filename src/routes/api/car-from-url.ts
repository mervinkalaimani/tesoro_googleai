import { createFileRoute } from "@tanstack/react-router";
import { GoogleGenAI, Type } from "@google/genai";

import { monthEtaToDate } from "@/lib/date-utils";
import { json, requireCaller, tooMany } from "@/lib/api-guard";
import {
  ASSORTMENTS,
  BRANDS,
  COLOURS,
  MAKES,
  MODELS_BY_MAKE,
  TYPES,
  VARIANTS_BY_MODEL,
} from "@/lib/car-taxonomy.generated";

/**
 * Reads a shop or wiki page for one die-cast car and returns its details and
 * photo, so a link can fill the add-car form.
 *
 * The browser cannot fetch someone else's page (CORS), so the server does,
 * pulls the title, meta tags, JSON-LD and visible text out, and asks Gemini to
 * map that to the same fields a photo scan returns. The photo is the page's own
 * og:image / JSON-LD image, not something the model invents.
 */

const FIELDS = [
  "make",
  "model",
  "variant",
  "year",
  "colour",
  "type",
  "brand",
  "assortment",
  "series",
  "subSeries",
  "carNumber",
  "size",
] as const;

const MODELS = ["gemini-3.8-flash", "gemini-flash-latest"];
const MAX_HTML = 1_500_000;
const MAX_TEXT = 9_000;

const PROMPT = `You are an expert die-cast model car cataloguer. Below is the text of a web page about ONE die-cast car.
Extract these fields: ${FIELDS.join(", ")}.
- make: real-world manufacturer (Nissan, Porsche), never the toy brand.
- model: base vehicle model only. variant: trim/sub-designation.
- brand: die-cast maker (Hot Wheels, Mini GT, Tarmac Works...). assortment: product line (Mainline, Premium...).
- size: scale such as 1:64. year: four digits. carNumber: collector number as printed.
Return an empty string for anything the page does not say. Do not guess.`;

/**
 * Hosts that are not the open internet.
 *
 * ponytail: judged by name only, so a public name that resolves to a private
 * address gets through. Resolving first needs node:dns, which this runtime may
 * not have; add it if the deployment is somewhere with internal services.
 */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h.endsWith(".internal") || (!h.includes(".") && !h.includes(":"))) return true;
  if (h.includes(":")) return /^(::1?$|f[cd]|fe80)/.test(h);
  const m = h.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function parseUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    return /^https?:$/.test(u.protocol) && !isPrivateHost(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

/** The page, following up to three redirects and checking each one's host. */
async function fetchPage(start: URL): Promise<{ html: string; url: URL } | { error: string }> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        // Many shops refuse a bare fetch; a browser-ish agent gets the real page.
        "user-agent": "Mozilla/5.0 (compatible; TesoroBot/1.0)",
        accept: "text/html,application/xhtml+xml",
      },
    }).catch(() => null);
    if (!res) return { error: "That page could not be reached." };
    if (res.status >= 300 && res.status < 400) {
      const next = parseUrl(new URL(res.headers.get("location") || "", url).toString());
      if (!next) return { error: "That link redirects somewhere that cannot be read." };
      url = next;
      continue;
    }
    if (!res.ok) return { error: `That page answered ${res.status}.` };
    if (!/html|xml/i.test(res.headers.get("content-type") || "")) {
      return { error: "That link is not a web page." };
    }
    return { html: (await res.text()).slice(0, MAX_HTML), url };
  }
  return { error: "Too many redirects." };
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

function meta(html: string, key: string): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = /(?:property|name)=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (name !== key) continue;
    const content = /content=["']([^"']*)["']/i.exec(tag)?.[1];
    if (content) return decode(content.trim());
  }
  return "";
}

/** The Product block out of any JSON-LD on the page, flattened to what we need. */
function jsonLdProduct(html: string): {
  name?: string;
  description?: string;
  image?: string;
  brand?: string;
  price?: string;
} {
  const blocks = html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, body] of blocks) {
    try {
      const data: unknown = JSON.parse(body);
      const flat = (Array.isArray(data) ? data : [data]).flatMap((d) =>
        Array.isArray((d as { "@graph"?: unknown })?.["@graph"])
          ? (d as { "@graph": unknown[] })["@graph"]
          : [d],
      ) as {
        "@type"?: string | string[];
        name?: string;
        description?: string;
        image?: unknown;
        brand?: string | { name?: string };
        offers?: { price?: string | number } | { price?: string | number }[];
      }[];
      const p = flat.find((d) => [d?.["@type"]].flat().includes("Product"));
      if (!p) continue;
      const img = Array.isArray(p.image) ? p.image[0] : p.image;
      const offer = [p.offers].flat()[0];
      return {
        brand: typeof p.brand === "string" ? p.brand : p.brand?.name,
        price: offer?.price != null ? String(offer.price) : undefined,
        name: p.name,
        description: p.description,
        image: typeof img === "string" ? img : (img as { url?: string } | undefined)?.url,
      };
    } catch {
      // Bad JSON-LD is common; the meta tags are the next best thing.
    }
  }
  return {};
}

function visibleText(html: string): string {
  return decode(
    html
      .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  )
    .trim()
    .slice(0, MAX_TEXT);
}

function absolute(src: string | undefined, base: URL): string {
  if (!src) return "";
  try {
    const u = new URL(src, base);
    return /^https?:$/.test(u.protocol) ? u.toString() : "";
  } catch {
    return "";
  }
}

/**
 * The title read against the app's own lists of makes, models, colours and
 * brands. It is what answers when there is no model key, or the model is down:
 * "Trends Hobby Porsche 911 GT1 Silver - Box" still gives Porsche, 911, GT1,
 * Silver, and "Trends Hobby" as the words before the make.
 */
function guessFields(title: string): Record<string, string> {
  const out: Record<string, string> = {};
  let rest = ` ${title.replace(/[-–|,()]/g, " ").replace(/\s+/g, " ")} `;
  const take = (list: string[]) => {
    for (const v of [...list].sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`\\s${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s)`, "i");
      const m = re.exec(rest);
      if (m) {
        rest = rest.replace(re, "");
        return { value: v, at: m.index };
      }
    }
    return null;
  };
  const size = /\b1[:/](\d{2,3})\b/.exec(rest);
  if (size) {
    out["size"] = `1:${size[1]}`;
    rest = rest.replace(size[0], " ");
  }
  const year = /\b(19[5-9]\d|20[0-3]\d)\b/.exec(rest);
  if (year) {
    out["year"] = year[1];
    rest = rest.replace(year[0], " ");
  }
  const brand = take(BRANDS);
  const assortment = take(ASSORTMENTS);
  if (assortment) out["assortment"] = assortment.value;
  const type = take(TYPES);
  if (type) out["type"] = type.value;
  else if (/\b(GT[1-4]R?|GTE|LMP\d?|DTM|racing|le mans|race)\b/i.test(title))
    out["type"] = "Race Car";
  const make = take(MAKES);
  if (make) {
    out["make"] = make.value;
    const model = take(MODELS_BY_MAKE[make.value.toLowerCase()] ?? []);
    if (model) {
      out["model"] = model.value;
      const variant = take(VARIANTS_BY_MODEL[`${make.value}|${model.value}`.toLowerCase()] ?? []);
      if (variant) out["variant"] = variant.value;
    }
  }
  const colour = take(COLOURS);
  if (colour) out["colour"] = colour.value;
  if (brand) out["brand"] = brand.value;
  else if (make) {
    // Whatever came before the make is usually the maker of the model: "Trends Hobby".
    const before = title.slice(0, title.toLowerCase().indexOf(make.value.toLowerCase())).trim();
    if (before && before.split(" ").length <= 3) out["brand"] = before;
  }
  return out;
}

async function readFields(text: string): Promise<Record<string, string>> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) {
    console.warn("[car-from-url] GEMINI_API_KEY is not set; reading the title only.");
    return {};
  }
  const ai = new GoogleGenAI({ apiKey: key });
  for (const model of process.env["GEMINI_MODEL"] ? [process.env["GEMINI_MODEL"]] : MODELS) {
    try {
      const r = await ai.models.generateContent({
        model,
        contents: `${PROMPT}\n\nPAGE:\n${text}`,
        config: {
          temperature: 0,
          responseMimeType: "application/json",
          httpOptions: { timeout: 20_000 },
          responseSchema: {
            type: Type.OBJECT,
            properties: Object.fromEntries(FIELDS.map((f) => [f, { type: Type.STRING }])),
            required: [...FIELDS],
          },
        },
      });
      const parsed = JSON.parse(r.text || "{}") as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const f of FIELDS) {
        const v = typeof parsed[f] === "string" ? (parsed[f] as string).trim() : "";
        if (v && !/^(n\/?a|unknown|none|null|-|—)$/i.test(v)) out[f] = v;
      }
      return out;
    } catch (e) {
      console.warn(`[car-from-url] ${model} failed: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  return {};
}

/** "Q1 2027" or "Mar 2027" near the word ETA / arrival / expected, as the month it ends in: 2027-03-01. */
function arrivalFrom(text: string): string {
  const m =
    /(?:ETA|arriv\w*|expected|release\w*)[^A-Za-z0-9]{0,12}(?:by\s+)?(?:(Q([1-4])\s*(20\d\d))|([A-Za-z]{3,9})\.?\s+(20\d\d))/i.exec(
      text,
    );
  if (!m) return "";
  if (m[2]) return `${m[3]}-${String(Number(m[2]) * 3).padStart(2, "0")}-01`;
  return monthEtaToDate(`${m[4]} ${m[5]}`);
}

/** The price shown on the page, digits only. */
function priceFrom(html: string, ldPrice: string | undefined, text: string): string {
  const raw =
    ldPrice ||
    meta(html, "product:price:amount") ||
    meta(html, "og:price:amount") ||
    /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)/i.exec(text)?.[1] ||
    "";
  const n = Number(raw.replace(/,/g, ""));
  return n > 0 ? String(Math.round(n)) : "";
}

/** A number the title or page calls the car's own: "#19", "No. 19", "Car 19". */
function numberFrom(title: string, text: string): string {
  const m =
    /#\s*(\d{1,4})\b/.exec(title) ||
    /\b(?:car\s*(?:no|number|#)\.?|no\.)\s*(\d{1,4})\b/i.exec(text) ||
    /(?:^|\s)#\s*(\d{1,4})\b/.exec(text);
  return m ? m[1] : "";
}

/** The number printed on the car or its card, read off the page photo. Empty when it cannot be seen. */
async function numberFromImage(imageUrl: string): Promise<string> {
  const key = process.env["GEMINI_API_KEY"];
  const src = parseUrl(imageUrl);
  if (!key || !src) return "";
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(10_000), redirect: "error" });
    const mime = (res.headers.get("content-type") || "").split(";")[0];
    if (!res.ok || !/^image\/(jpeg|png|webp)$/.test(mime)) return "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4_000_000) return "";
    const ai = new GoogleGenAI({ apiKey: key });
    for (const model of process.env["GEMINI_MODEL"] ? [process.env["GEMINI_MODEL"]] : MODELS) {
      try {
        const r = await ai.models.generateContent({
          model,
          contents: {
            parts: [
              {
                text: 'What number is printed on this die-cast car (a race number on its body) or on its card (a collector number such as "3/5")? Reply with JSON {"carNumber": ""}; use an empty string if no number is clearly visible. Do not guess.',
              },
              { inlineData: { mimeType: mime, data: buf.toString("base64") } },
            ],
          },
          config: {
            temperature: 0,
            responseMimeType: "application/json",
            httpOptions: { timeout: 20_000 },
          },
        });
        const v = (JSON.parse(r.text || "{}") as { carNumber?: unknown }).carNumber;
        return typeof v === "string" ? v.trim().replace(/^#/, "") : "";
      } catch (e) {
        console.warn(
          `[car-from-url] number ${model} failed: ${(e as Error).message.slice(0, 120)}`,
        );
      }
    }
  } catch {
    // A photo that cannot be fetched just means no number from it.
  }
  return "";
}

async function handler({ request }: { request: Request }) {
  const got = await requireCaller(request);
  if (got.refused) return got.refused;
  const limited = tooMany(`car-from-url:${got.caller.uid}`, 20, 60_000);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const target = parseUrl(body?.url);
  if (!target) return json({ error: "Paste a full web link to a car page." }, 400);

  const page = await fetchPage(target);
  if ("error" in page) return json({ error: page.error }, 502);

  const ld = jsonLdProduct(page.html);
  const title = ld.name || meta(page.html, "og:title") || meta(page.html, "twitter:title");
  const description = ld.description || meta(page.html, "og:description");
  const imageUrl =
    absolute(ld.image, page.url) ||
    absolute(meta(page.html, "og:image") || meta(page.html, "twitter:image"), page.url);

  const text = [title, description, visibleText(page.html)].filter(Boolean).join("\n");
  const extra: Record<string, string> = {};
  const mrp = priceFrom(page.html, ld.price, text);
  if (mrp) extra["mrp"] = mrp;
  const arrival = arrivalFrom(text);
  if (arrival) extra["expectedDate"] = arrival;
  if (ld.brand) extra["brand"] = ld.brand;
  // "PACKAGING: BOX" is how shops say the assortment.
  const packaging =
    /packaging[:\s]+([A-Za-z0-9 ]{2,20}?)(?=\s{2,}|\s*[₹|•]|\s+[A-Z]{2,}\b|$)/i.exec(text)?.[1];
  const known =
    packaging && ASSORTMENTS.find((a) => a.toLowerCase() === packaging.trim().toLowerCase());
  if (known) extra["assortment"] = known;
  const number = numberFrom(title, text);
  if (number) extra["carNumber"] = number;
  const fields: Record<string, string> = {
    ...guessFields(title),
    ...extra,
    ...(await readFields(text)),
  };
  if (!Object.keys(fields).length && !imageUrl) {
    return json({ error: "No car details could be read from that page." }, 422);
  }
  // Page first, then the photo, then a dash so the cell is never left looking unread.
  if (!fields["carNumber"]) fields["carNumber"] = (await numberFromImage(imageUrl)) || "-";
  return json({ fields, imageUrl, title });
}

export const Route = createFileRoute("/api/car-from-url")({
  server: { handlers: { POST: handler } },
});
