import { strict as assert } from "node:assert";

import { SITE_NAME, SITE_ORIGIN, siteUrl } from "./site";

// The whole point of this file is that two hosts cannot both claim a page, so
// the origin is absolute and it is the live domain.
assert.match(SITE_ORIGIN, /^https:\/\//, "a canonical origin is absolute and secure");
assert.ok(!SITE_ORIGIN.endsWith("/"), "no trailing slash, or every join doubles it");
assert.equal(SITE_NAME, "VIIV");

// A path is a path whether or not somebody remembered the leading slash.
assert.equal(siteUrl("/releases"), `${SITE_ORIGIN}/releases`);
assert.equal(siteUrl("releases"), `${SITE_ORIGIN}/releases`);
assert.equal(siteUrl("//releases"), `${SITE_ORIGIN}/releases`, "no protocol-relative accidents");

// The home page has one address and it ends in a slash; everything else has
// one address and does not.
assert.equal(siteUrl("/"), `${SITE_ORIGIN}/`);
assert.equal(siteUrl(), `${SITE_ORIGIN}/`);
assert.equal(siteUrl(""), `${SITE_ORIGIN}/`);
assert.equal(siteUrl("   "), `${SITE_ORIGIN}/`);

// A casting ID is already URL-safe, and the deeper path is still one join.
assert.equal(siteUrl("/catalog/HW-0001"), `${SITE_ORIGIN}/catalog/HW-0001`);

// Every URL this builds parses, which is what a crawler will try to do with it.
for (const p of ["/", "/releases", "/catalog/MBX-12", "catalog/x"]) {
  assert.doesNotThrow(() => new URL(siteUrl(p)), `${p} builds a real URL`);
}

console.log("site selfcheck: ok");
