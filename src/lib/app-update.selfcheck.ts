/**
 * The fingerprint is the whole mechanism, so it is the thing to check: a
 * deploy must read as a change, and a reordering or an unhashed file must not.
 */
import { fingerprintHtml, fingerprintOf } from "@/lib/app-update";

let checks = 0;
function ok(cond: boolean, what: string) {
  checks++;
  if (!cond) throw new Error(`FAILED: ${what}`);
}

const buildA = `<!doctype html><html><head>
  <link rel="stylesheet" href="/_build/assets/app-A1b2C3d4.css">
  <script type="module" src="/_build/assets/client-Zz9Yy8Xx.js"></script>
  <script src="/sw-register.js"></script>
  <link rel="icon" href="/tesoro_app_icon_light.svg">
</head><body></body></html>`;

const sameBuildDifferentOrder = `<!doctype html><html><head>
  <script type="module" src="/_build/assets/client-Zz9Yy8Xx.js"></script>
  <link rel="icon" href="/tesoro_app_icon_light.svg">
  <script src="/sw-register.js"></script>
  <link rel="stylesheet" href="/_build/assets/app-A1b2C3d4.css">
</head><body></body></html>`;

const buildB = buildA.replace("client-Zz9Yy8Xx.js", "client-Qq1Ww2Ee.js");

ok(fingerprintHtml(buildA) !== "", "a built page has a fingerprint at all");
ok(
  fingerprintHtml(buildA) === fingerprintHtml(sameBuildDifferentOrder),
  "the same build in a different order is the same build",
);
ok(fingerprintHtml(buildA) !== fingerprintHtml(buildB), "a new bundle name is a new build");

// Unhashed files never change their names, so they can only add noise.
ok(!fingerprintHtml(buildA).includes("sw-register"), "an unhashed script is not part of it");
ok(!fingerprintHtml(buildA).includes(".svg"), "an icon is not part of it");

// A page with nothing hashed — dev, or a login redirect — says nothing rather
// than saying "changed".
ok(fingerprintHtml("<html><body>hello</body></html>") === "", "no bundles, no fingerprint");

ok(
  fingerprintOf(["/a-A1b2C3.js", "/a-A1b2C3.js"]) === "/a-A1b2C3.js",
  "the same file twice counts once",
);
ok(
  fingerprintOf(["https://x.test/_build/assets/c-A1b2C3.js"]) === "/_build/assets/c-A1b2C3.js",
  "an absolute URL is compared by its path",
);

console.log(`app-update.selfcheck: ${checks} checks passed`);
