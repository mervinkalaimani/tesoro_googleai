/**
 * The one address this site answers to.
 *
 * Tesoro had a single host, so every public page could name itself with a
 * relative canonical and be right. VIIV has two — viiv.si and the vercel.app
 * deployment behind it — and a relative canonical on two hosts tells a crawler
 * the same casting exists twice, which is the one thing a canonical exists to
 * prevent. So it is absolute, and it always names this.
 *
 * Overridable through VITE_SITE_URL for a deployment that genuinely is its own
 * site. A preview is not one: it should point at production, because a preview
 * is a copy and the copy is not the page anybody should land on.
 */
const RAW = (import.meta.env?.["VITE_SITE_URL"] as string | undefined) || "https://viiv.si";

/** No trailing slash, so joining a path cannot produce "//". */
export const SITE_ORIGIN = RAW.trim().replace(/\/+$/, "");

/** The site's name, for og:site_name and anywhere else it is said aloud. */
export const SITE_NAME = "VIIV";

/**
 * An absolute URL for a path on this site.
 *
 * Takes the path with or without its leading slash, and refuses to build
 * something ending in a stray slash that would read as a second address for
 * the same page.
 */
export function siteUrl(path = "/"): string {
  const p = String(path).trim();
  if (!p || p === "/") return `${SITE_ORIGIN}/`;
  return `${SITE_ORIGIN}/${p.replace(/^\/+/, "")}`;
}
