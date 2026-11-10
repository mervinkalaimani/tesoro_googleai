/**
 * Fill catalogue cars from the maker's own site, and mark them synced.
 *
 * Mini GT, Kaido House (sold by Mini GT, numbers like KHMG241) and Qube Carz
 * all live on minigt.tsm-models.com, so one adapter covers three brands. For
 * each catalogue row it finds the product by item number, then:
 *
 *   - image_url      ← the second gallery picture (replaces what was there)
 *   - car_number     ← the item number, only when the row has none
 *   - colour         ← what follows the casting name in the maker's title,
 *                      only when the row has none
 *   - synced_at / synced_source ← so the app can show "Synced"
 *
 * It only touches rows that exist; it never adds cars. A row whose number
 * finds nothing, or finds a product that does not agree, is left alone and
 * listed in the report. The report also keeps every old value, which is the
 * undo.
 *
 *   node scripts/sync-catalog-makers.mjs                 # dry run, writes nothing
 *   node scripts/sync-catalog-makers.mjs --limit 10      # first ten rows only
 *   SUPABASE_SERVICE_ROLE_KEY=… node scripts/sync-catalog-makers.mjs --apply
 *
 * Run the migration that adds synced_at / synced_source first.
 *
 * BBR: the catalogue has no BBR rows, so there is nothing to update; add an
 * adapter here when it does.
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const li = args.indexOf("--limit");
const limit = li >= 0 ? Number(args[li + 1]) || Infinity : Infinity;

const SITE = "https://minigt.tsm-models.com";
const SOURCE = "minigt.tsm-models.com";
const QUBE_BRAND_ID = 70;

const url = process.env.SUPABASE_URL || "https://matekrbcflojjooswoha.supabase.co";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_publishable_t8mahOsDrNTnt-YeFGkgTA_ugnPJrpu";
if (apply && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("--apply needs SUPABASE_SERVICE_ROLE_KEY. Nothing was done.");
  process.exit(1);
}
const db = createClient(url, key);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(path) {
  for (let t = 0; t < 4; t++) {
    try {
      const res = await fetch(`${SITE}/index.php?${path}`, {
        headers: { "user-agent": "Mozilla/5.0 (viiv catalogue sync)" },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) {
        await sleep(600); // two requests a second at most: it is somebody's shop
        return await res.text();
      }
    } catch {
      /* retry */
    }
    await sleep(2000 * (t + 1));
  }
  return null;
}

const text = (h) =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** One product page, reduced to what we use. */
function parseDetail(h) {
  const flat = text(h);
  const item = /Item No\.\s*(.+?)\s+Scale\b/.exec(flat)?.[1]?.trim() ?? "";
  const desc =
    /Description\s+(.+?)\s+(?:Categories|Select Categories)\b/.exec(flat)?.[1]?.trim() ?? "";
  // Gallery: the cover (picfile/), then picfile_list/ extras. The second
  // picture is the first extra.
  const extras = [
    ...new Set([...h.matchAll(/src="(upload\/picfile_list\/[^"]+)"/g)].map((m) => m[1])),
  ];
  const second = extras[0] ? `${SITE}/${extras[0]}` : null;
  return { item, desc, second };
}

async function findByItemNo(itemNo) {
  const h = await get(`action=product-search&keywords=${encodeURIComponent(itemNo)}`);
  if (!h) return null;
  const ids = [...new Set([...h.matchAll(/product-detail&id=(\d+)/g)].map((m) => m[1]))];
  for (const id of ids.slice(0, 3)) {
    const d = await get(`action=product-detail&id=${id}`);
    if (!d) continue;
    const p = parseDetail(d);
    if (p.item.toUpperCase() === itemNo.toUpperCase()) return p;
  }
  return null;
}

/** Qube Carz items read "027 - QZ01401": the catalogue's number is the first part. */
let qubeIndex = null;
async function qube(number) {
  if (!qubeIndex) {
    qubeIndex = new Map();
    for (let p = 1; p < 20; p++) {
      const l = await get(`action=product-list&b_id=${QUBE_BRAND_ID}&p=${p}`);
      const ids = l
        ? [...new Set([...l.matchAll(/product-detail&id=(\d+)/g)].map((m) => m[1]))]
        : [];
      let fresh = 0;
      for (const id of ids) {
        const d = await get(`action=product-detail&id=${id}`);
        if (!d) continue;
        const pd = parseDetail(d);
        const n = /^(\d+)\s*-/.exec(pd.item)?.[1];
        if (n && !qubeIndex.has(n)) {
          qubeIndex.set(n, pd);
          fresh++;
        }
      }
      if (!fresh) break;
    }
  }
  return qubeIndex.get(number) ?? null;
}

/** The item number to look for, and the car_number it implies. */
function plan(row) {
  const n = (row.car_number || "").trim();
  if (row.brand === "Qube Carz") return /^\d+$/.test(n) ? { kind: "qube", number: n } : null;
  if (/^KHMG\d+$/i.test(n))
    return { kind: "item", itemNo: n.toUpperCase(), number: n.toUpperCase() };
  if (/^\d+$/.test(n)) return { kind: "item", itemNo: `MGT${n.padStart(5, "0")}`, number: n };
  return null;
}

async function rows() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("tesoro_car_catalog")
      .select("car_id,brand,name,colour,car_number,image_url")
      .in("brand", ["Mini GT", "Qube Carz"])
      .order("car_id")
      .range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const report = { when: new Date().toISOString(), apply, updated: [], skipped: [] };
const all = (await rows()).slice(0, limit);
console.log(
  `${all.length} catalogue rows (Mini GT, Kaido House, Qube Carz). ${apply ? "APPLYING" : "dry run"}`,
);

for (const row of all) {
  const p = plan(row);
  if (!p) {
    report.skipped.push({ car_id: row.car_id, name: row.name, why: "no usable item number" });
    continue;
  }
  const found = p.kind === "qube" ? await qube(p.number) : await findByItemNo(p.itemNo);
  if (!found) {
    report.skipped.push({ car_id: row.car_id, name: row.name, why: "not found on the site" });
    continue;
  }
  // The number alone could point at a different car if the site reused it:
  // at least one word of the catalogue name must appear in the maker's title.
  const words = norm(row.name)
    .split(" ")
    .filter((w) => w.length > 2);
  const title = norm(found.desc);
  if (words.length && !words.some((w) => title.includes(w))) {
    report.skipped.push({
      car_id: row.car_id,
      name: row.name,
      why: `title disagrees: "${found.desc}"`,
    });
    continue;
  }

  const patch = { synced_at: new Date().toISOString(), synced_source: SOURCE };
  if (found.second) patch.image_url = found.second;
  if (!row.car_number) patch.car_number = p.number;
  if (
    !row.colour &&
    norm(found.desc).startsWith(norm(row.name)) &&
    norm(found.desc) !== norm(row.name)
  ) {
    patch.colour = found.desc.slice(row.name.length).trim();
  }
  report.updated.push({
    car_id: row.car_id,
    name: row.name,
    before: { image_url: row.image_url, car_number: row.car_number, colour: row.colour },
    after: patch,
    noSecondImage: !found.second,
  });
  if (apply) {
    const { error } = await db.from("tesoro_car_catalog").update(patch).eq("car_id", row.car_id);
    if (error) {
      console.error(`${row.car_id}: ${error.message}`);
      report.skipped.push({
        car_id: row.car_id,
        name: row.name,
        why: `write failed: ${error.message}`,
      });
      report.updated.pop();
    }
  }
}

const file = `sync-report-${apply ? "applied" : "dry-run"}.json`;
writeFileSync(file, JSON.stringify(report, null, 2));
const noPhoto = report.updated.filter((u) => u.noSecondImage).length;
console.log(
  `${report.updated.length} ${apply ? "updated" : "would update"} (${noPhoto} without a second picture), ` +
    `${report.skipped.length} skipped. Report: ${file}`,
);
