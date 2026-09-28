/**
 * Copy the catalogue's wiki photographs into our own bucket.
 *
 * Run it, run it again a month later; it skips whatever is already ours and
 * whatever it is not allowed to copy, so there is no state to keep and nothing
 * to undo. Public casting pages show a photo only once it has been through
 * here, so this is what turns 1,500 pictureless pages into illustrated ones.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=… npx esbuild scripts/cache-catalogue-images.ts \
 *     --bundle --format=esm --platform=node --alias:@=./src --outfile=.cache-images.mjs \
 *     && node .cache-images.mjs --limit 10
 *
 *   --limit N   stop after N rows (default 25; try ten first)
 *   --all       every row that qualifies
 *
 * The service-role key writes under a prefix no user owns. It is read from the
 * environment and never printed.
 */
import { createClient } from "@supabase/supabase-js";

import { mirrorImage, isOurs, mayCopy } from "@/lib/mirror-image";

const args = process.argv.slice(2);
const all = args.includes("--all");
const limitArg = args.indexOf("--limit");
const limit = all ? Infinity : Number(limitArg >= 0 ? args[limitArg + 1] : 25) || 25;

const url = process.env["SUPABASE_URL"] || "https://matekrbcflojjooswoha.supabase.co";
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!key) {
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY is not set. Uploading under catalog/ needs it; nothing was done.",
  );
  process.exit(1);
}

const client = createClient(url, key);

const PAGE = 1000;
const rows: { car_id: string; image_url: string | null }[] = [];
for (let from = 0; ; from += PAGE) {
  const { data, error } = await client
    .from("tesoro_car_catalog")
    .select("car_id, image_url")
    .not("image_url", "is", null)
    .order("car_id")
    .range(from, from + PAGE - 1);
  if (error) {
    console.error("Could not read the catalogue:", error.message);
    process.exit(1);
  }
  rows.push(...(data ?? []));
  if (!data || data.length < PAGE) break;
}

const todo = rows.filter((r) => r.image_url && !isOurs(r.image_url) && mayCopy(r.image_url));
console.log(
  `${rows.length} entries with a photo · ${todo.length} copyable · doing ${Math.min(todo.length, limit)}`,
);

let copied = 0;
const skipped = new Map<string, number>();

for (const row of todo.slice(0, limit === Infinity ? undefined : limit)) {
  const outcome = await mirrorImage(client as never, row.car_id, row.image_url ?? "");
  if (outcome.status === "copied") {
    copied += 1;
    console.log(`  ✓ ${row.car_id}`);
  } else {
    skipped.set(outcome.why, (skipped.get(outcome.why) ?? 0) + 1);
    console.log(`  – ${row.car_id}: ${outcome.why}`);
  }
}

console.log(`\ncopied ${copied}`);
for (const [why, n] of [...skipped].sort((a, b) => b[1] - a[1]))
  console.log(`skipped ${n}: ${why}`);
