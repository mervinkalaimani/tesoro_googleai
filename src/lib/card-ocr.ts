import { createWorker } from "tesseract.js";
import {
  BRANDS,
  MAKES,
  MODELS_BY_MAKE,
  SERIES,
  ASSORTMENTS,
  COLOURS,
} from "@/lib/car-taxonomy.generated";
import type { ScanResult } from "@/components/car-scan-dialog";

/**
 * Intelligent client-side parser that takes raw OCR or pasted text from a diecast card
 * and extracts car attributes using regexes, collectors' vocabulary, and taxonomy dictionaries.
 */
export function parseTextToCarFields(rawText: string): ScanResult {
  const text = rawText.replace(/\r\n/g, "\n");
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const lowerFull = text.toLowerCase();

  const out: ScanResult = {};

  // 1. Detect Brand
  for (const b of BRANDS) {
    const reg = new RegExp(`\\b${b.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
    if (reg.test(text)) {
      out.brand = b;
      break;
    }
  }
  if (!out.brand) {
    if (/hot\s*wheels/i.test(text)) out.brand = "Hot Wheels";
    else if (/matchbox/i.test(text)) out.brand = "Matchbox";
    else if (/majorette/i.test(text)) out.brand = "Majorette";
    else if (/mini\s*gt/i.test(text)) out.brand = "Mini GT";
    else if (/kaido\s*house/i.test(text)) out.brand = "Kaido House";
    else if (/inno\s*64/i.test(text)) out.brand = "Inno64";
    else if (/tarmac\s*works/i.test(text)) out.brand = "Tarmac Works";
    else if (/pop\s*race/i.test(text)) out.brand = "Pop Race";
    else if (/greenlight/i.test(text)) out.brand = "Greenlight";
    else if (/johnny\s*lightning/i.test(text)) out.brand = "Johnny Lightning";
    else if (/m2\s*machines/i.test(text)) out.brand = "M2 Machines";
  }

  // 2. Detect Scale / Size
  const scaleMatch = text.match(/\b1\s*[:/]\s*(64|43|32|24|18|12|76|87)\b/i);
  if (scaleMatch) {
    out.size = `1:${scaleMatch[1]}`;
  } else {
    out.size = "1:64";
  }

  // 3. Detect Year (Four digits e.g. 1960-2029 or two digit apostrophe '83)
  const fourDigitYear = text.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  if (fourDigitYear) {
    out.year = fourDigitYear[1];
  } else {
    const twoDigitYear = text.match(/'([5-9]\d|[0-2]\d)\b/);
    if (twoDigitYear) {
      const yr = parseInt(twoDigitYear[1], 10);
      out.year = yr > 40 ? `19${twoDigitYear[1]}` : `20${twoDigitYear[1]}`;
    }
  }

  // 4. Detect Car Number (e.g. "3/5", "142/250", "#04", "04/10")
  const carNumFraction = text.match(/\b([0-9]{1,3}\s*\/\s*[0-9]{1,3})\b/);
  if (carNumFraction) {
    out.carNumber = carNumFraction[1].replace(/\s+/g, "");
  } else {
    const hashNum = text.match(/#\s*([0-9]{1,4})/);
    if (hashNum) {
      out.carNumber = `#${hashNum[1]}`;
    }
  }

  // 5. Detect Assortment
  for (const ass of ASSORTMENTS) {
    const reg = new RegExp(`\\b${ass.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
    if (reg.test(text)) {
      out.assortment = ass;
      break;
    }
  }
  if (!out.assortment) {
    if (/mainline/i.test(text)) out.assortment = "Mainline";
    else if (/car\s*culture/i.test(text)) out.assortment = "Car Culture";
    else if (/boulevard/i.test(text)) out.assortment = "Boulevard";
    else if (/premium/i.test(text)) out.assortment = "Premium";
    else if (/team\s*transport/i.test(text)) out.assortment = "Team Transport";
    else if (/fast\s*(&|and)\s*furious/i.test(text)) out.assortment = "Fast & Furious";
  }

  // 6. Detect Series
  for (const s of SERIES) {
    if (s.length < 3) continue;
    const reg = new RegExp(`\\b${s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
    if (reg.test(text)) {
      out.series = s;
      break;
    }
  }

  // 7. Detect Make
  let matchedMake = "";
  for (const m of MAKES) {
    if (m.length < 3 && !["bmw", "gmc", "mg"].includes(m.toLowerCase())) continue;
    const reg = new RegExp(`\\b${m.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
    if (reg.test(text)) {
      out.make = m;
      matchedMake = m.toLowerCase();
      break;
    }
  }

  // 8. Detect Model (Check models of matched make first, then all models)
  let matchedModel = "";
  if (matchedMake && (MODELS_BY_MAKE as Record<string, string[]>)[matchedMake]) {
    const candidateModels = (MODELS_BY_MAKE as Record<string, string[]>)[matchedMake];
    for (const mod of candidateModels) {
      if (mod.length < 2) continue;
      const reg = new RegExp(`\\b${mod.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
      if (reg.test(text)) {
        out.model = mod;
        matchedModel = mod;
        break;
      }
    }
  }

  if (!out.model) {
    // Search across all models in taxonomy
    outer: for (const [, modList] of Object.entries(MODELS_BY_MAKE as Record<string, string[]>)) {
      for (const mod of modList) {
        if (mod.length < 4) continue;
        const reg = new RegExp(`\\b${mod.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
        if (reg.test(text)) {
          out.model = mod;
          matchedModel = mod;
          break outer;
        }
      }
    }
  }

  // 9. If no model found, look for prominent text line that is not a brand/assortment
  if (!out.model && lines.length > 0) {
    for (const l of lines) {
      const clean = l.replace(/hot\s*wheels|mattel|diecast|guaranteed|for\s*life/gi, "").trim();
      if (clean.length >= 3 && clean.length <= 35 && !/\d{5,}/.test(clean)) {
        if (!out.make) {
          // Check if make is the first word
          const words = clean.split(/\s+/);
          if (words.length > 1) {
            out.make = words[0];
            out.model = words.slice(1).join(" ");
          } else {
            out.model = clean;
          }
        } else if (!out.model) {
          out.model = clean;
        }
        break;
      }
    }
  }

  // 10. Detect Colour
  for (const c of COLOURS) {
    if (c.length < 3) continue;
    const reg = new RegExp(`\\b${c.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
    if (reg.test(text)) {
      out.colour = c;
      break;
    }
  }

  // 11. Detect Rarity marks
  if (/\b(sth|super\s*treasure\s*hunt)\b/i.test(lowerFull)) {
    out.rarity = "STH";
  } else if (/\b(th|treasure\s*hunt)\b/i.test(lowerFull)) {
    out.rarity = "TH";
  } else if (/\bchase\b/i.test(lowerFull)) {
    out.rarity = "Chase";
  }

  return out;
}

/**
 * Runs Tesseract OCR entirely client-side on the supplied image File or Blob.
 */
let workerPromise: Promise<Tesseract.Worker> | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker("eng");
      return worker;
    })();
  }
  return workerPromise;
}

export async function runClientOcr(
  imageSource: Blob | File | string,
  onProgress?: (progress: number, status: string) => void,
): Promise<{ text: string; fields: ScanResult }> {
  const worker = await getWorker();

  // If callback provided, listen to logger
  const ret = await worker.recognize(imageSource as never);
  const text = ret.data.text || "";
  const fields = parseTextToCarFields(text);

  return { text, fields };
}
