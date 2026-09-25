import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Ban, Clock, Database, LogOut, RefreshCw } from "lucide-react";
import { SplashMark, dismissSplash } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth-store";
import { announceNewUser } from "@/lib/push-client";

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md text-center">{children}</div>
    </div>
  );
}

/**
 * What is under the boot splash while the session is resolved: the same mark in
 * the same place, so the splash fading out reveals no change at all.
 */
function Splash() {
  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <SplashMark className="w-[min(62vw,300px)]" />
    </div>
  );
}

function PendingApproval() {
  const { profile, signOut, reloadProfile } = useAuth();
  const rejected = Boolean(profile?.rejected_at);

  // Pushes the admins' phones. The server only does it once per account, so a
  // reload or a second tab is not another ping.
  useEffect(() => {
    if (profile && !rejected) void announceNewUser();
  }, [profile?.sno, rejected]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Centered>
      <div className="mx-auto grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
        {rejected ? <Ban className="size-6" /> : <Clock className="size-6" />}
      </div>
      <h1 className="text-display mt-5 text-xl font-semibold tracking-tight">
        {rejected ? "Request not approved" : "Waiting for approval"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {profile?.email_id ? (
          <span className="font-medium">{profile.email_id}</span>
        ) : (
          "This account"
        )}{" "}
        {rejected
          ? "was not given access. If you think that is a mistake, get in touch with the administrator."
          : "is registered, but an administrator has to grant access before your collection appears."}
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
  // All of these render bare. The recovery link signs the visitor in on
  // arrival, so without the exemption the reset page would appear inside the
  // app shell; the policy and the terms have to be readable by somebody who
  // has not signed in, which is the whole point of them.
  const BARE = ["/login", "/reset-password", "/privacy", "/terms"];
  const isBareRoute = BARE.includes(pathname);

  useEffect(() => {
    if (status === "signed-out" && !isBareRoute) {
      void navigate({ to: "/login" });
    }
  }, [status, isBareRoute, navigate]);

  // The splash lifts once there is something other than a splash to show.
  const settled = isBareRoute || (status !== "loading" && status !== "signed-out");
  useEffect(() => {
    if (settled) dismissSplash();
  }, [settled]);

  if (isBareRoute) return <>{children}</>;

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
