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
import { CarDrawerProvider } from "@/components/car-details-drawer";
import { AuthProvider } from "@/lib/auth-store";
import { AuthGate } from "@/components/auth-gate";
import { Toaster } from "@/components/ui/sonner";

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
      { name: "viewport", content: "width=device-width, initial-scale=1" },
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
      // Two marks, because a tab and a home screen are not the same surface.
      // The browser icon is the bare diamond on nothing: a tab strip and a
      // bookmark bar supply their own background, and a tile of our own colour
      // sitting in one reads as a sticker. The app icon carries its own dark
      // ground, because an installed icon is placed on a wallpaper nobody here
      // chooses and has to hold together against any of them.
      //
      // SVG first for anything that will take one, then the PNG for the rest.
      // apple-touch-icon has to be a PNG — Safari will not take an SVG, and
      // without one it saves a screenshot of the page instead.
      { rel: "icon", href: "/tesoro_browser_icon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/tesoro_browser_icon.png", type: "image/png", sizes: "220x220" },
      { rel: "apple-touch-icon", href: "/tesoro_app_icon.png", sizes: "250x250" },
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
} catch (e) { document.documentElement.classList.add('dark'); }
`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" data-accent="crimson" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
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
          </CarsProvider>
        </AppProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
