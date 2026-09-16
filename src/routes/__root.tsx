import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppProvider } from "@/lib/store";
import { CarsProvider } from "@/lib/cars-store";
import { CatalogProvider } from "@/lib/catalog-store";
import { CarDrawerProvider } from "@/components/car-details-drawer";
import { AuthProvider } from "@/lib/auth-store";
import { AuthGate } from "@/components/auth-gate";
import { Toaster } from "@/components/ui/sonner";
import { BootSplash } from "@/components/brand-mark";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      // viewport-fit=cover is what makes iOS report the home indicator's space
      // through env(safe-area-inset-bottom). Without it that value is always 0,
      // and the bottom bar sat on top of the home line.
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Tesoro — Collection Dashboard" },
      {
        name: "description",
        content:
          "A personal dashboard for tracking a diecast car collection: brands, types, spend, and inventory status.",
      },
      { property: "og:title", content: "Tesoro — Collection Dashboard" },
      {
        property: "og:description",
        content:
          "A personal dashboard for tracking a diecast car collection: brands, types, spend, and inventory status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Tesoro — Collection Dashboard" },
      {
        name: "twitter:description",
        content:
          "A personal dashboard for tracking a diecast car collection: brands, types, spend, and inventory status.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
      // One icon per browser theme: the light one carries a white tile, the
      // dark one is the bare diamond for a dark tab strip.
      {
        rel: "icon",
        href: "/tesoro_app_icon_light.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: light)",
      },
      {
        rel: "icon",
        href: "/tesoro_app_icon_dark.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: dark)",
      },
      // iPhone home screen, light or dark to match the phone. Safari only takes
      // a PNG (tesoro_app_icon_light.png is the light SVG rendered at the dark
      // icon's size), and reads the icon once, when the app is added.
      {
        rel: "apple-touch-icon",
        href: "/tesoro_app_icon_dark.png",
        sizes: "398x398",
        media: "(prefers-color-scheme: dark)",
      },
      {
        rel: "apple-touch-icon",
        href: "/tesoro_app_icon_light.png",
        sizes: "398x398",
        media: "(prefers-color-scheme: light)",
      },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

// Runs before first paint, so the stored appearance is on the element by the
// time anything is drawn. "system" is resolved here too — reading the media
// query in React instead would show the shell in the wrong theme until hydration.
const THEME_INIT = `
try {
  var t = JSON.parse(localStorage.getItem('dg.theme') || '"dark"');
  if (t === 'system') {
    t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.classList.toggle('dark', t === 'dark');
  var a = JSON.parse(localStorage.getItem('dg.accentColor') || '"crimson"');
  if (['crimson','blue','emerald','violet','amber'].indexOf(a) !== -1) document.documentElement.dataset.accent = a;
  var f = JSON.parse(localStorage.getItem('dg.fontSize') || '"-2"');
  if (['-2','-1','0','+1','+2'].indexOf(f) !== -1) document.documentElement.dataset.fontSize = f;
  else document.documentElement.dataset.fontSize = '-2';
} catch (e) { document.documentElement.classList.add('dark'); document.documentElement.dataset.fontSize = '-2'; }

window.addEventListener('vite:preloadError', function () {
  window.location.reload();
});
window.addEventListener('error', function (e) {
  var msg = (e && (e.message || (e.error && e.error.message))) || '';
  if (
    msg.indexOf('Importing a module script failed') !== -1 ||
    msg.indexOf('Failed to fetch dynamically imported module') !== -1
  ) {
    var key = 'vite_module_reload_ts';
    var last = parseInt(sessionStorage.getItem(key) || '0', 10);
    if (Date.now() - last > 4000) {
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    }
  }
});
`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className="dark"
      data-accent="crimson"
      data-font-size="-2"
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <BootSplash />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/*
          Providers stay above the outlet at every auth state. Router pathname
          updates land a render before the matched route swaps, so a gate that
          mounted providers conditionally would briefly render the outgoing page
          without its context.
        */}
        <AppProvider>
          <CarsProvider>
            <CatalogProvider>
              <CarDrawerProvider>
                <AuthGate>
                  <Outlet />
                </AuthGate>
                {/* Nothing was mounting this, so every toast in the app was
                    written to a surface that did not exist — including the one
                    explaining that a photo upload had failed because the storage
                    bucket was missing. The upload looked like it silently did
                    nothing, which is exactly what it looked like. */}
                <Toaster position="bottom-right" richColors closeButton />
              </CarDrawerProvider>
            </CatalogProvider>
          </CarsProvider>
        </AppProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
