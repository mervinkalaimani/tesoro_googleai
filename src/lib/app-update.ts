/**
 * Noticing that the app has been deployed again.
 *
 * A tab left open on Monday is still running Monday's code on Friday, which is
 * how "it's broken for me" and "works for me" happen at the same time. There is
 * no version endpoint to ask, and there does not need to be: every build gives
 * its assets new hashed names, so the set of scripts the page was served with
 * *is* the version. Fetch the document again, compare, and the difference is a
 * deploy.
 *
 * Deliberately not the service worker. It is registered only for people who
 * turned push notifications on, so it would tell some of them and not others.
 */

/**
 * Hashed bundles only: /sw.js and /sw-register.js never change their names and
 * so say nothing. The digit is what tells a hash from a word — "client-Zz9Yy8Xx"
 * from "sw-register" — and a build whose hash came out all letters would cost
 * this one file out of dozens, not the mechanism.
 */
const HASHED = /-(?=[A-Za-z0-9_]*\d)[A-Za-z0-9_]{6,}\.(?:js|css)$/;

const normalise = (url: string): string => {
  try {
    return new URL(url, "http://x").pathname;
  } catch {
    return url;
  }
};

/** The fingerprint of a set of asset URLs: sorted, so order never matters. */
export function fingerprintOf(urls: string[]): string {
  const kept = urls
    .map(normalise)
    .filter((u) => HASHED.test(u))
    .sort();
  return [...new Set(kept)].join("|");
}

/** What this page is running, read off the document it was served as. */
export function currentFingerprint(doc: Document = document): string {
  const urls: string[] = [];
  doc.querySelectorAll("script[src]").forEach((el) => urls.push(el.getAttribute("src") || ""));
  doc.querySelectorAll("link[href]").forEach((el) => urls.push(el.getAttribute("href") || ""));
  return fingerprintOf(urls);
}

/** The same, read out of HTML that has not been parsed into a document. */
export function fingerprintHtml(html: string): string {
  const urls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((m) => m[1]);
  return fingerprintOf(urls);
}

/**
 * What the server is serving now.
 *
 * `cache: "no-store"` because a cached copy of the page is exactly the thing
 * being tested for. Any failure — offline, a 500, a login redirect — returns
 * null, which is read as "no news" rather than as an update.
 */
export async function fetchFingerprint(signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch("/", { cache: "no-store", credentials: "same-origin", signal });
    if (!res.ok) return null;
    const html = await res.text();
    const print = fingerprintHtml(html);
    return print || null;
  } catch {
    return null;
  }
}
