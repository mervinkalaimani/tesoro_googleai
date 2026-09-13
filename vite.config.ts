// Nitro's preset decides the shape of the build. "node-server" writes
// .output/server/index.mjs — a standalone Node server, which is what a
// containerized Cloud Run deployment needs and what `npm start` runs.
//
// Vercel needs .vercel/output instead, so forcing node-server there produced a
// build that succeeded and left Vercel with nothing it could serve. Name the
// preset explicitly rather than relying on auto-detection: the nitro plugin
// inside @lovable.dev/vite-tanstack-config defaults to cloudflare, not to the
// host it happens to be running on.
process.env.NITRO_PRESET =
  process.env.NITRO_PRESET || (process.env.VERCEL ? "vercel" : "node-server");

// Ensure Supabase points to the correct user project (matekrbcflojjooswoha) with matching publishable key
if (
  !process.env.VITE_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL.includes("pllpyzsfuhpsmqbxgarw")
) {
  process.env.VITE_SUPABASE_URL = "https://matekrbcflojjooswoha.supabase.co";
  process.env.SUPABASE_URL = "https://matekrbcflojjooswoha.supabase.co";
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_t8mahOsDrNTnt-YeFGkgTA_ugnPJrpu";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_t8mahOsDrNTnt-YeFGkgTA_ugnPJrpu";
  process.env.VITE_SUPABASE_PROJECT_ID = "matekrbcflojjooswoha";
  process.env.SUPABASE_PROJECT_ID = "matekrbcflojjooswoha";
}

// The version shown at the foot of Settings. Notion is the source of truth —
// the newest "Phase" on the Tesoro Project Kanban (v0.7 Active Dev -> 0.7.0) —
// read at build time when NOTION_TOKEN is set on the deployment. Without it
// (local dev, a fork) package.json's version is used, which is kept in step by
// hand. "(alpha)" until the app says otherwise, then the commit on Vercel so
// "which build am I looking at" has an answer. Set as a VITE_ variable because
// the config below injects those into the app.
{
  const { version: pkgVersion } = JSON.parse(
    readFileSync(new URL("./package.json", import.meta.url), "utf8"),
  ) as { version?: string };
  const phase = await latestPhase().catch((err: unknown) => {
    console.warn(`[version] Could not read the version from Notion: ${String(err)}`);
    return null;
  });
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7);
  process.env.VITE_APP_VERSION = [
    `${phase?.version || pkgVersion || "0.0.0"} (alpha)`,
    sha && `· ${sha}`,
  ]
    .filter(Boolean)
    .join(" ");
}

// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "node:path";
import { readFileSync } from "node:fs";
// @ts-expect-error — plain .mjs shared with the release workflow; no type declarations.
import { latestPhase } from "./scripts/notion-version.mjs";
import type { Plugin } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// @lovable.dev/mcp-js asserts its resolved routesDir sits under the project root with a
// plain `startsWith`, but compares Vite's `config.root` (always POSIX slashes, even on
// Windows) against `path.resolve()` output (backslashes on Windows) — so the check throws
// on every Windows path. Hand its configResolved hook a platform-native root instead.
// No-op on Linux/macOS, where path.resolve returns the identical string.
function withNativeRoot(plugin: Plugin): Plugin {
  const hook = plugin.configResolved;
  if (typeof hook !== "function") return plugin;
  return {
    ...plugin,
    configResolved(config) {
      const nativeRoot = new Proxy(config, {
        get: (target, prop, receiver) =>
          prop === "root" ? path.resolve(target.root) : Reflect.get(target, prop, receiver),
      });
      return hook.call(this, nativeRoot);
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [withNativeRoot(mcpPlugin())],
  },
});
