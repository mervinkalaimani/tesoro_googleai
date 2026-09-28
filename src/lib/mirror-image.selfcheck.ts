/**
 * Which photographs may be copied, and which are already ours.
 *
 *   npx esbuild src/lib/mirror-image.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=.selfcheck.mjs && node .selfcheck.mjs
 */
import assert from "node:assert/strict";

import { isOurs, mayCopy } from "@/lib/mirror-image";

// The two wikis hold 824 of the catalogue's photographs between them, under a
// licence that allows a copy with attribution.
assert.equal(mayCopy("https://static.wikia.nocookie.net/hotwheels/images/a/b.jpg"), true);
assert.equal(mayCopy("https://thumb.wikimedia.org/x/y.png"), true);
assert.equal(mayCopy("https://upload.wikimedia.org/x/y.png"), true);

// A marketplace listing is not licensed to anybody. Left alone, never published.
assert.equal(mayCopy("https://i.ebayimg.com/images/g/abc/s-l500.jpg"), false);
assert.equal(mayCopy("https://m.media-amazon.com/images/I/71x.jpg"), false);
assert.equal(mayCopy("https://164custom.com/photo.jpg"), false);
assert.equal(mayCopy(""), false);
assert.equal(mayCopy("nonsense"), false);

// A host that merely ends in the same letters is a different host.
assert.equal(mayCopy("https://notwikimedia.org.example.com/x.jpg"), false);

assert.equal(isOurs("https://matekrbcflojjooswoha.supabase.co/storage/v1/object/x.jpg"), true);
assert.equal(isOurs("https://static.wikia.nocookie.net/x.jpg"), false);
assert.equal(isOurs("https://evil-supabase.co/x.jpg"), false);

console.log("mirror-image: copies what its licence allows, and nothing else.");
