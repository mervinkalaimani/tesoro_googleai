import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Boxes, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-store";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { status, signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // A signed-in visitor has no reason to sit on the login page; the shell
  // decides whether they land on the dashboard or the pending screen.
  useEffect(() => {
    if (status === "ready" || status === "pending") {
      void navigate({ to: "/" });
    }
  }, [status, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim() || !password) {
      setError(
        mode === "signin"
          ? "Enter your email or user ID, and your password."
          : "Email and password are both required.",
      );
      return;
    }
    if (mode === "signup") {
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (!firstName.trim() || !lastName.trim() || !dob) {
        setError("First name, last name and date of birth are all required.");
        return;
      }
    }

    setBusy(true);
    const res =
      mode === "signin"
        ? await signIn(email, password)
        : await signUp(email, password, { firstName, lastName, dob });
    setBusy(false);

    if (!res.ok) {
      setError(res.error ?? "Something went wrong. Try again.");
      return;
    }

    if (mode === "signup") {
      setNotice(
        "Account created. An administrator needs to approve it before your collection unlocks.",
      );
      setPassword("");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Boxes className="size-6" />
          </div>
          <h1 className="text-display mt-4 text-2xl font-semibold tracking-tight">Tesoro</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to reach your collection.</p>
        </div>

        <Tabs
          value={mode}
          onValueChange={(v) => {
            setMode(v as "signin" | "signup");
            setError(null);
            setNotice(null);
          }}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Create account</TabsTrigger>
          </TabsList>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <TabsContent value="signup" className="mt-0 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dob">Date of birth</Label>
                <Input
                  id="dob"
                  type="date"
                  autoComplete="bday"
                  max={new Date().toISOString().slice(0, 10)}
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                />
              </div>
            </TabsContent>

            <div className="space-y-2">
              <Label htmlFor="email">{mode === "signin" ? "Email or user ID" : "Email"}</Label>
              <Input
                id="email"
                // Sign-in accepts a handle too, so it can't be type="email".
                type={mode === "signin" ? "text" : "email"}
                autoComplete={mode === "signin" ? "username" : "email"}
                placeholder={
                  mode === "signin" ? "you@example.com or mervik1703" : "you@example.com"
                }
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {mode === "signup" ? (
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              ) : null}
            </div>

            {error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground">
                {notice}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </Tabs>

        {mode === "signup" ? (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Your user ID is generated from your name and date of birth — five letters of your first
            name, your last initial, then the day and month you were born. New accounts start with
            no access until an admin approves them.
          </p>
        ) : null}
      </div>
    </div>
  );
}
