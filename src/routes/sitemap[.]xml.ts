/**
 * Every casting, listed for a crawler.
 *
 * The catalogue is the only part of Tesoro a stranger may read, so it is the
 * only part listed here. Built from the table rather than kept as a file
 * because it grows every time somebody files a casting nobody had entered.
 *
 * The base URL comes from the request, so a preview deployment advertises its
 * own URLs rather than production's — a sitemap that points somewhere else is
 * worse than none.
 */
import { createFileRoute } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;",
  );
}

async function handler({ request }: { request: Request }) {
  const origin = new URL(request.url).origin;

  // PostgREST caps a response at 1,000 rows whatever the limit says, so this
  // asks in pages. The catalogue passed a thousand entries some time ago; a
  // sitemap that stopped there would leave a third of it unlisted.
  const PAGE = 1000;
  const rows: { car_id: string; updated_at: string | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("tesoro_car_catalog")
      .select("car_id, updated_at")
      .order("car_id", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) return new Response("sitemap unavailable", { status: 503 });
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const urls = rows.map((row) => {
    const loc = `${origin}/catalog/${encodeURIComponent(row.car_id)}`;
    const lastmod = String(row.updated_at || "").slice(0, 10);
    return `  <url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;
  });

  // The calendar changes every time a pre-order gains a date, which is more
  // often than any single casting changes.
  urls.unshift(`  <url><loc>${origin}/releases</loc><changefreq>daily</changefreq></url>`);

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

export const Route = createFileRoute("/sitemap.xml")({
  server: { handlers: { GET: handler } },
});
