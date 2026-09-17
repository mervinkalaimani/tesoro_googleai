// Production startup script for containerized deployment (Cloud Run)
import { createRequire } from "node:module";

try {
  const require = createRequire(import.meta.url);
  const jsxDevRuntime = require("react/jsx-dev-runtime");
  const jsxRuntime = require("react/jsx-runtime");
  if (typeof jsxDevRuntime.jsxDEV !== "function" && jsxRuntime.jsx) {
    jsxDevRuntime.jsxDEV = (type, props, key) => jsxRuntime.jsx(type, props, key);
  }
} catch {
  // Ignore if already shimmed or unavailable
}

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

process.env.PORT = process.env.PORT || "3000";
process.env.HOST = process.env.HOST || "0.0.0.0";
process.env.NITRO_PORT = process.env.PORT;
process.env.NITRO_HOST = process.env.HOST;

console.log(`[Tesoro] Starting server on ${process.env.HOST}:${process.env.PORT}...`);
await import("./.output/server/index.mjs");
