import { createFileRoute } from "@tanstack/react-router";

/**
 * Finds photographs of a casting from what was typed about it.
 *
 * The die-cast wikis are the one public source that has what a collector wants:
 * the actual model, and very often the card it came on. Their newer uploads are
 * named by a convention — "Premium Pop Culture 2024 Mix 3 Nissan Skyline GT-R
 * (BNR34) White Indonesia HKC28.jpg" — that spells out assortment, series, year,
 * colour and SKU, so the files on a casting's page can be ranked against the
 * form without downloading a single image.
 *
 * A server route rather than a browser fetch: the wikis' APIs are not reliably
 * CORS-enabled, and the answer is the same for everyone who types the same car,
 * so it caches at the edge.
 *
 * Brands with no wiki (Mini GT, Tarmac Works, …) fall back to Wikipedia, which
 * has the real car rather than the model. Better than nothing, and labelled as
 * such.
 */

export type CarImageCandidate = {
  url: string;
  thumb: string;
  title: string;
  source: string;
  /** "card" when the file name reads like a packaged photo, "car" otherwise. */
  kind: "card" | "car";
};

const USER_AGENT = "Tesoro/1.0 (personal diecast collection app)";

const WIKIS: { match: RegExp; host: string; name: string }[] = [
  { match: /hot\s*wheels|^hw$/i, host: "hotwheels.fandom.com", name: "Hot Wheels Wiki" },
  { match: /matchbox|^mbx$/i, host: "matchbox.fandom.com", name: "Matchbox Wiki" },
  { match: /mini\s*gt/i, host: "minigt.fandom.com", name: "Mini GT Wiki" },
];

type Query = {
  make: string;
  model: string;
  variant: string;
  year: string;
  colour: string;
  brand: string;
  assortment: string;
  series: string;
  subSeries: string;
  carNumber: string;
};

function json(body: unknown, status = 200, cache = true) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...(cache
        ? { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" }
        : {}),
    },
  });
}

async function api(host: string, params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams({ format: "json", ...params });
  const res = await fetch(`https://${host}/api.php?${qs}`, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${host} ${res.status}`);
  return res.json();
}

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);

/** Photos of the underside, a sketch, a signed sheet — never the one you want. */
const JUNK =
  /\b(back|base|rear|sketch|autograph|drilled|detail|interior|chassis|not available|convention|sheet|news|logo)\b/i;
/** Mattel's toy numbers (HKC28, JJK35) only ever appear on packaged photos. */
const SKU = /\b[A-Z]{3}\d{2}\b/;
const CARDED = /\b(card|carded|blister|package|packaged|box|boxed|moc)\b/i;

function scoreFile(file: string, q: Query): { score: number; kind: "card" | "car" } {
  const name = file.replace(/^File:/, "").replace(/\.[a-z]+$/i, "");
  if (!/\.(jpe?g|png|webp)$/i.test(file)) return { score: -99, kind: "car" };
  if (JUNK.test(name)) return { score: -99, kind: "car" };

  const have = new Set(words(name));
  const hits = (text: string, weight: number) =>
    words(text).reduce((n, w) => n + (have.has(w) ? weight : 0), 0);

  const card = SKU.test(name) || CARDED.test(name);
  let score = card ? 6 : 0;
  if (/\bloose\b/i.test(name)) score -= 2;
  score += hits(q.colour, 4);
  score += hits(q.assortment, 3);
  score += hits(q.series, 3);
  score += hits(q.subSeries, 3);
  score += hits(q.carNumber, 3);
  score += hits(q.variant, 2);
  score += hits(q.brand, 2);
  score += hits(`${q.make} ${q.model}`, 2);
  if (q.year && have.has(q.year.trim())) score += 2;
  // Camera-roll names ("IMG 0544", "DSC07510") say nothing about the car.
  if (/^(img|dsc|dscf|pxl|p\d{6,})\b/i.test(name) || /^[0-9a-f-]{20,}$/i.test(name)) score -= 3;
  return { score, kind: card ? "card" : "car" };
}

type SearchResult = { query?: { search?: { title: string }[] } };
type ImagesResult = { query?: { pages?: Record<string, { images?: { title: string }[] }> } };
type InfoResult = {
  query?: {
    pages?: Record<string, { title: string; imageinfo?: { url?: string; thumburl?: string }[] }>;
  };
};

async function fromWiki(host: string, source: string, q: Query): Promise<CarImageCandidate[]> {
  // The wiki is already the brand's own, so the brand is implied; year and
  // colour go into the search because casting pages list every release by
  // year and colour, which pulls the page with that exact release up the list.
  // If that is too specific to match anything, the casting alone is tried.
  const casting = [q.make, q.model, q.variant].filter(Boolean).join(" ");
  const searchFor = async (text: string) =>
    (
      (
        (await api(host, {
          action: "query",
          list: "search",
          srsearch: text,
          srnamespace: "0",
          srlimit: "2",
        })) as SearchResult
      ).query?.search ?? []
    ).map((p) => p.title);
  const detailed = [casting, q.year, q.colour].filter(Boolean).join(" ");
  let pages = await searchFor(detailed);
  if (!pages.length && detailed !== casting) pages = await searchFor(casting);
  if (!pages.length) return [];

  const imgs = (await api(host, {
    action: "query",
    titles: pages.join("|"),
    prop: "images",
    imlimit: "500",
  })) as ImagesResult;

  const files = new Set<string>();
  for (const page of Object.values(imgs.query?.pages ?? {})) {
    for (const img of page.images ?? []) files.add(img.title);
  }

  const ranked = [...files]
    .map((title) => ({ title, ...scoreFile(title, q) }))
    .filter((f) => f.score > -10)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  if (!ranked.length) return [];

  const info = (await api(host, {
    action: "query",
    titles: ranked.map((f) => f.title).join("|"),
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: "800",
  })) as InfoResult;

  const urls = new Map<string, { url: string; thumb: string }>();
  for (const page of Object.values(info.query?.pages ?? {})) {
    const ii = page.imageinfo?.[0];
    if (ii?.url) urls.set(page.title, { url: ii.thumburl || ii.url, thumb: ii.thumburl || ii.url });
  }

  // Titles come back normalised (underscores to spaces), which is how they
  // were requested, so a straight lookup lines up.
  return ranked.flatMap((f) => {
    const u = urls.get(f.title);
    if (!u) return [];
    return [
      {
        url: u.url,
        thumb: u.thumb,
        title: f.title.replace(/^File:/, ""),
        source,
        kind: f.kind,
      },
    ];
  });
}

type WikipediaResult = {
  query?: {
    pages?: Record<
      string,
      { title: string; original?: { source?: string }; thumbnail?: { source?: string } }
    >;
  };
};

async function fromWikipedia(q: Query): Promise<CarImageCandidate[]> {
  // Wikipedia has the real car, so the year narrows it ("1969 Dodge Charger");
  // a diecast brand or a paint colour would only match nothing.
  const text = [q.year, q.make, q.model, q.variant].filter(Boolean).join(" ");
  if (!text) return [];
  const data = (await api("en.wikipedia.org/w", {
    action: "query",
    generator: "search",
    gsrsearch: text,
    gsrlimit: "3",
    prop: "pageimages",
    piprop: "original|thumbnail",
    pithumbsize: "800",
  })) as WikipediaResult;
  return Object.values(data.query?.pages ?? {}).flatMap((p) => {
    const src = p.thumbnail?.source || p.original?.source;
    if (!src) return [];
    return [{ url: src, thumb: src, title: p.title, source: "Wikipedia", kind: "car" as const }];
  });
}

/** Trends Hobby products from Treasured Models collection */
async function fromTrendsHobby(q: Query): Promise<CarImageCandidate[]> {
  try {
    const res = await fetch(
      "https://treasuredmodels.com/collections/trends-hobby/products.json?limit=250",
      {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      products?: Array<{
        title: string;
        tags: string[];
        images?: Array<{ src: string }>;
      }>;
    };
    const terms = [q.make, q.model, q.variant].filter(Boolean).map((s) => s.toLowerCase());
    if (!terms.length) return [];

    const matched = (data.products ?? []).filter((p) => {
      const text = `${p.title} ${(p.tags || []).join(" ")}`.toLowerCase();
      return terms.some((term) => text.includes(term));
    });

    return matched
      .flatMap((p) => {
        const img = p.images?.[0]?.src;
        if (!img) return [];
        return [
          {
            url: img,
            thumb: img,
            title: p.title,
            source: "Trends Hobby / Treasured Models",
            kind: "car" as const,
          },
        ];
      })
      .slice(0, 10);
  } catch {
    return [];
  }
}

/** Web search image suggestions (DuckDuckGo / Web images) */
async function fromWebSearch(q: Query, rawQuery?: string): Promise<CarImageCandidate[]> {
  try {
    const fetchDdg = async (qs: string) => {
      const r1 = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(qs)}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(6000),
      });
      const t1 = await r1.text();
      const vqdMatch = t1.match(/vqd=([0-9-]+)/) || t1.match(/vqd=["']([0-9-]+)["']/);
      if (!vqdMatch) return [];

      const r2 = await fetch(
        `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(qs)}&vqd=${vqdMatch[1]}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(6000),
        },
      );
      if (!r2.ok) return [];
      const data = (await r2.json()) as {
        results?: Array<{ title?: string; image?: string; thumbnail?: string }>;
      };
      return data.results ?? [];
    };

    // Primary detailed query using all requested fields
    const primaryQuery = [
      q.brand,
      q.make,
      q.model,
      q.variant,
      q.year,
      q.assortment,
      q.series,
      q.subSeries,
      q.carNumber,
      "diecast",
    ]
      .filter(Boolean)
      .join(" ");

    // Secondary / broader query
    const broaderQuery = [q.brand, q.make, q.model, q.variant, q.colour, "1/64 diecast"]
      .filter(Boolean)
      .join(" ");

    // Typed words win over the fields: this is what the "Search the web"
    // box sends, and it is meant to be searched as written.
    const queryStr = (rawQuery || "").trim() || primaryQuery || broaderQuery;
    if (!queryStr.trim()) return [];

    let rawResults = await fetchDdg(queryStr);
    if (!rawQuery && rawResults.length < 4 && broaderQuery && broaderQuery !== queryStr) {
      const more = await fetchDdg(broaderQuery);
      rawResults = [...rawResults, ...more];
    }

    return rawResults.slice(0, rawQuery ? 30 : 16).flatMap((r) => {
      if (!r.image) return [];
      const scored = scoreFile(r.title || "", q);
      return [
        {
          url: r.image,
          thumb: r.thumbnail || r.image,
          title: r.title || `${q.brand} ${q.make} ${q.model}`.trim(),
          source: q.brand ? `${q.brand} Web Search` : "Diecast Web Search",
          kind: scored.kind,
        },
      ];
    });
  } catch {
    return [];
  }
}

async function handler({ request }: { request: Request }) {
  const params = new URL(request.url).searchParams;
  // A string, not keyof Query: the snake_case spellings below are accepted too,
  // for callers that send the catalog's column names.
  const get = (k: string) => (params.get(k) || "").trim().slice(0, 80);
  const q: Query = {
    make: get("make"),
    model: get("model"),
    variant: get("variant"),
    year: get("year"),
    colour: get("colour"),
    brand: get("brand"),
    assortment: get("assortment"),
    series: get("series"),
    subSeries: get("subSeries") || get("sub_series"),
    carNumber: get("carNumber") || get("car_number"),
  };

  // "text" is a search of its own: whatever was typed into the web search box,
  // sent to the image search as written and answered with those results alone.
  const text = (params.get("text") || "").trim().slice(0, 160);
  if (text) {
    const found = await fromWebSearch(q, text).catch(() => []);
    return json({ candidates: found });
  }

  if (!q.model && !q.make && !q.brand) {
    return json({ error: "Type at least a brand, make or model." }, 400, false);
  }

  const candidates: CarImageCandidate[] = [];

  // 1. Check brand wikis if applicable (Hot Wheels, Matchbox, Mini GT)
  const wiki = q.brand ? WIKIS.find((w) => w.match.test(q.brand)) : null;
  if (wiki) {
    try {
      candidates.push(...(await fromWiki(wiki.host, wiki.name, q)));
    } catch {
      /* ignore */
    }
  }

  // 2. Mini GT Wiki if query mentions mini gt
  if (!wiki && /mini\s*gt/i.test(`${q.brand} ${q.make} ${q.model} ${q.variant}`)) {
    try {
      candidates.push(...(await fromWiki("minigt.fandom.com", "Mini GT Wiki", q)));
    } catch {
      /* ignore */
    }
  }

  // 3. Check Trends Hobby if relevant
  if (/trends\s*hobby/i.test(`${q.brand} ${q.assortment} ${q.series}`)) {
    try {
      candidates.push(...(await fromTrendsHobby(q)));
    } catch {
      /* ignore */
    }
  }

  // 4. ALWAYS run Web Search for ALL cars (not just Hot Wheels and Matchbox)
  try {
    candidates.push(...(await fromWebSearch(q)));
  } catch {
    /* ignore */
  }

  // 5. Fallback to Wikipedia if we still have few candidates
  if (candidates.length < 3) {
    try {
      candidates.push(...(await fromWikipedia(q)));
    } catch {
      /* ignore */
    }
    // If no brand was typed at all, check Hot Wheels wiki as fallback
    if (!q.brand && candidates.length < 3) {
      try {
        candidates.push(...(await fromWiki(WIKIS[0].host, WIKIS[0].name, q)));
      } catch {
        /* ignore */
      }
    }
  }

  const seen = new Set<string>();
  const ranked = candidates
    .filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
    .sort((a, b) => scoreFile(b.title, q).score - scoreFile(a.title, q).score);

  return json({ candidates: ranked.slice(0, 16) });
}

export const Route = createFileRoute("/api/car-images")({
  server: { handlers: { GET: handler } },
});
