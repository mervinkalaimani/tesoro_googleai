// The app's version, as recorded in Notion.
//
// The Tesoro Project Kanban's "Phase" select is where versions are tracked —
// "v0.7 Active Dev" and so on. The highest one is the current version. Shared by
// the build (vite.config.ts, for the number shown in Settings) and the release
// workflow (scripts/notion-release.mjs, for tagging the cards it files).
//
// Needs NOTION_TOKEN, an internal integration secret with access to the Kanban.
// Without one — a local build, a fork — it resolves to null and the caller
// falls back to package.json.

export const KANBAN_DATABASE_ID = "3bfdec580c8a413e96926f8193a1fab5";
export const RELEASE_NOTES_PAGE_ID = "3da4ef69791f818e9b51d92d2fc3fc23";
export const NOTION_VERSION = "2022-06-28";

export async function notion(
  path,
  { method = "GET", body, token = process.env.NOTION_TOKEN } = {},
) {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Notion ${method} ${path} → ${res.status}: ${json.message || "no message"}`);
  }
  return json;
}

/** "v0.7 Active Dev" -> [0, 7, 0]; anything without a version number -> null. */
function parsePhase(name) {
  const m = /^v?(\d+)\.(\d+)(?:\.(\d+))?/i.exec(String(name || "").trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0)] : null;
}

/** The newest Phase option: { name: "v0.7 Active Dev", version: "0.7.0" }, or null. */
export async function latestPhase() {
  if (!process.env.NOTION_TOKEN) return null;
  const db = await notion(`databases/${KANBAN_DATABASE_ID}`);
  const options = db?.properties?.Phase?.select?.options ?? [];
  let best = null;
  for (const option of options) {
    const v = parsePhase(option.name);
    if (!v) continue;
    const newer =
      !best ||
      v[0] > best.v[0] ||
      (v[0] === best.v[0] && (v[1] > best.v[1] || (v[1] === best.v[1] && v[2] > best.v[2])));
    if (newer) best = { name: option.name, v };
  }
  return best ? { name: best.name, version: best.v.join(".") } : null;
}
