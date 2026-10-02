import "./lib/jsx-dev-runtime-shim.js";
import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * The headers every response carries, set here because this is the one place
 * every response passes through -- a route's own `headers()` covers that route,
 * and the static assets have no route at all.
 *
 * No Content-Security-Policy. A policy that has not been tested against
 * Supabase, the wikis the catalogue photographs come from and the fonts would
 * either be wrong or be so wide it says nothing, and a broken app is a worse
 * outcome than a missing header. It is the next thing to add, deliberately.
 */
const SECURITY_HEADERS: Record<string, string> = {
  // A .txt that sniffs as HTML is how an upload becomes a script.
  "x-content-type-options": "nosniff",
  // Another site may know it was linked from here, never which page.
  "referrer-policy": "strict-origin-when-cross-origin",
  // Nothing embeds Tesoro, and a sign-in page in somebody's frame is a
  // clickjack waiting to happen.
  "x-frame-options": "DENY",
  // The camera is ours to use -- scanning a card and searching by photograph
  // both ask for it. Nothing else is.
  "permissions-policy": "camera=(self), microphone=(), geolocation=(), payment=()",
};

/** Adds them without overwriting anything a route set for itself. */
function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  // 204 and 304 carry no body, and handing Response one is an error.
  const body = response.status === 204 || response.status === 304 ? null : response.body;
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
