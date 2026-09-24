/**
 * The photo-spreading rule, which has been broken three times. No test
 * framework in this project, so: plain asserts, run it.
 *
 *   npx esbuild src/lib/photo-sync.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=.selfcheck.mjs && node .selfcheck.mjs
 */
import assert from "node:assert/strict";

import { takesSyncedPhoto } from "@/lib/photo-sync";

const PACK = "0F1406-01-0E02-1";
const OTHER = "0F1406-01-0E02-2";

// The case it exists for: same casting, no photo of its own.
assert.equal(takesSyncedPhoto({ catalogId: PACK, imageUrl: "" }, PACK), true);
assert.equal(takesSyncedPhoto({ catalogId: PACK.toLowerCase() }, PACK), true);
assert.equal(takesSyncedPhoto({ catalogId: ` ${PACK} ` }, PACK), true);

// The bug. A photo the owner chose is never overwritten, same casting or not.
assert.equal(takesSyncedPhoto({ catalogId: PACK, imageUrl: "https://mine.png" }, PACK), false);

// A different casting is a different car, however alike the names look.
assert.equal(takesSyncedPhoto({ catalogId: OTHER, imageUrl: "" }, PACK), false);

// Make and model are not an identity and are not consulted: a car carrying no
// catalogue id matches nothing, even when every descriptive field agrees.
assert.equal(
  takesSyncedPhoto({ catalogId: "", imageUrl: "" } as { catalogId?: string }, PACK),
  false,
);
assert.equal(takesSyncedPhoto({}, PACK), false);
assert.equal(takesSyncedPhoto({ catalogId: PACK }, ""), false);
assert.equal(takesSyncedPhoto({ catalogId: PACK }, "   "), false);

console.log("photo-sync: all checks passed");
