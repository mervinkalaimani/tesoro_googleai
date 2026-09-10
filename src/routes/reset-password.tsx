import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Boxes, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-store";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

/**
 * Where the emailed recovery link lands. Supabase turns the token in the URL
 * into a real session before this renders, so the only thing left to do is set
 * a new password — without this page the link would sign someone in and never
 * ask them for one.
 */
function ResetPasswordPage() {
  const { status, updatePassword } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Give supabase-js a moment to read the token out of the URL before deciding
  // the link was bad.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSettled(true), 1500);
    return () => clearTimeout(id);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setBusy(true);
    const res = await updatePassword(password);
    setBusy(false);

    if (!res.ok) {
      setError(res.error ?? "Could not update the password. Try the link again.");
      return;
    }
    setDone(true);
    setTimeout(() => void navigate({ to: "/" }), 1600);
  }

  const linkExpired = settled && status === "signed-out";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Boxes className="size-6" />
          </div>
          <h1 className="text-display mt-4 text-2xl font-semibold tracking-tight">
            Choose a new password
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {linkExpired
              ? "This reset link is no longer valid."
              : "Set a password you'll use to sign in from now on."}
          </p>
        </div>

        {linkExpired ? (
          <Button className="w-full" onClick={() => void navigate({ to: "/login" })}>
            Back to sign in
          </Button>
        ) : done ? (
          <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-center text-sm text-foreground">
            Password updated. Taking you to your collection…
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>

            {error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Update password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
