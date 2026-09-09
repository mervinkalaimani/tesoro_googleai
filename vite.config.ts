// Ensure Nitro builds a standalone Node.js server for containerized Cloud Run deployments
process.env.NITRO_PRESET = process.env.NITRO_PRESET || "node-server";

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

// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [mcpPlugin()],
  },
});
