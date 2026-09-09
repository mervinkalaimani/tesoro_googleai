import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Boxes, Clock, Database, Loader2, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth-store";

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md text-center">{children}</div>
    </div>
  );
}

function Splash() {
  return (
    <Centered>
      <div className="mx-auto grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
        <Boxes className="size-6" />
      </div>
      <Loader2 className="mx-auto mt-6 size-5 animate-spin text-muted-foreground" />
    </Centered>
  );
}

function PendingApproval() {
  const { profile, signOut, reloadProfile } = useAuth();
  return (
    <Centered>
      <div className="mx-auto grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Clock className="size-6" />
      </div>
      <h1 className="text-display mt-5 text-xl font-semibold tracking-tight">
        Waiting for approval
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {profile?.email_id ? (
          <span className="font-medium">{profile.email_id}</span>
        ) : (
          "This account"
        )}{" "}
        is registered, but an administrator has to grant access before your collection appears.
      </p>
      {profile?.user_id ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Your user ID is{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
            {profile.user_id}
          </code>{" "}
          — you can sign in with it instead of your email.
        </p>
      ) : null}
      <div className="mt-6 flex justify-center gap-2">
        <Button variant="outline" onClick={() => void reloadProfile()}>
          <RefreshCw className="size-4" />
          Check again
        </Button>
        <Button variant="ghost" onClick={() => void signOut()}>
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>
    </Centered>
  );
}

function SchemaMissing() {
  const { signOut } = useAuth();
  return (
    <Centered>
      <div className="mx-auto grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Database className="size-6" />
      </div>
      <h1 className="text-display mt-5 text-xl font-semibold tracking-tight">
        Database not migrated
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign-in worked, but <code className="text-foreground">tesoro_users</code> isn't set up for
        auth yet. Run{" "}
        <code className="text-foreground">
          supabase/migrations/20260909120000_multi_user_auth.sql
        </code>{" "}
        in the Supabase SQL editor, then reload.
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        Signing up with an email that already has a row links to it and keeps its admin flag.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Button variant="outline" onClick={() => window.location.reload()}>
          <RefreshCw className="size-4" />
          Reload
        </Button>
        <Button variant="ghost" onClick={() => void signOut()}>
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>
    </Centered>
  );
}

/**
 * Decides what a visitor may see. The login page renders bare; every other
 * route only reaches the app shell once the session is approved. Data fetching
 * is gated separately in the stores, which watch the same auth status.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isLoginRoute = pathname === "/login";

  useEffect(() => {
    if (status === "signed-out" && !isLoginRoute) {
      void navigate({ to: "/login" });
    }
  }, [status, isLoginRoute, navigate]);

  if (isLoginRoute) return <>{children}</>;

  switch (status) {
    case "loading":
    case "signed-out":
      return <Splash />;
    case "schema-missing":
      return <SchemaMissing />;
    case "pending":
      return <PendingApproval />;
    default:
      return <AppShell>{children}</AppShell>;
  }
}
