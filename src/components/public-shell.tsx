/**
 * The chrome on a page anybody may read.
 *
 * Deliberately not `AppShell` — a visitor who has never signed in has no
 * collection for a sidebar to be about, and the only thing these pages want
 * from them is curiosity. Two pages wear it: a casting, and what is coming.
 */
import { Link } from "@tanstack/react-router";

import { HomeScreenMark } from "@/components/brand-mark";
import { useAuth } from "@/lib/auth-store";

export function PublicShell({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const signedIn = status === "ready" || status === "pending";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <HomeScreenMark className="size-7" />
            <span className="text-display text-sm font-semibold tracking-tight">Tesoro</span>
          </Link>
          <Link
            to="/releases"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Coming soon
          </Link>
          {/* These pages render the same for everybody, so somebody already
              signed in would otherwise be invited to sign in again. The server
              renders it as "loading", which reads as signed out, and it settles
              a moment later — the same swap every other page makes. */}
          <Link
            to={signedIn ? "/inventory" : "/login"}
            className="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-foreground/30"
          >
            {signedIn ? "My cars" : "Sign in"}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-4xl px-4 pb-10 text-[11px] text-muted-foreground">
        Tesoro is a collection tracker. Catalogue entries are contributed by its collectors.
      </footer>
    </div>
  );
}
