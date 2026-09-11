import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { ArrowLeft, Boxes, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth, handleError, type OAuthProvider } from "@/lib/auth-store";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

/**
 * Sign-up is deliberately two steps: the first screen asks only what an
 * account strictly needs, and everything that describes the person is gathered
 * afterwards, once they have committed to signing up.
 */
type View = "signin" | "signup" | "signup-details" | "reset";

/** Brand marks are inlined: lucide has no trademarked provider logos. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.42 2.2-1.25 3.02-.99.99-2.13 1.56-3.36 1.46-.03-1.2.44-2.32 1.24-3.14.85-.87 2.19-1.5 3.37-1.34zM20.7 17.02c-.6 1.38-.89 1.99-1.66 3.2-1.08 1.7-2.6 3.81-4.48 3.83-1.67.02-2.1-1.09-4.37-1.08-2.27.01-2.74 1.1-4.41 1.08-1.88-.02-3.32-1.93-4.4-3.62C-1.66 16.7-1.98 10.2 1.02 6.9c1.42-1.58 3.16-2.5 4.8-2.5 1.68 0 2.73 1.1 4.12 1.1 1.35 0 2.17-1.1 4.11-1.1 1.46 0 3.01.79 4.11 2.16-3.61 1.98-3.02 7.13.54 8.46z" />
    </svg>
  );
}

const PROVIDERS: { id: OAuthProvider; label: string; mark: () => ReactElement }[] = [
  { id: "google", label: "Google", mark: GoogleMark },
  { id: "apple", label: "Apple", mark: AppleMark },
];

function LoginPage() {
  const {
    status,
    signIn,
    signUp,
    checkHandle,
    signInWithProvider,
    requestPasswordReset,
    enterGuest,
  } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState<View>("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [userId, setUserId] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [resetEmail, setResetEmail] = useState("");

  const [handleState, setHandleState] = useState<"idle" | "checking" | "free" | "taken">("idle");
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // A signed-in visitor has no reason to sit on the login page; the shell
  // decides whether they land on the dashboard or the pending screen.
  useEffect(() => {
    if (status === "ready" || status === "pending") {
      void navigate({ to: "/" });
    }
  }, [status, navigate]);

  // Availability is checked as they type, debounced so each keystroke isn't a
  // round trip. The trigger still de-duplicates server-side, so this is a
  // courtesy rather than the guarantee.
  useEffect(() => {
    if (view !== "signup-details") return;
    const trimmed = userId.trim().toLowerCase();
    if (!trimmed || handleError(trimmed)) {
      setHandleState("idle");
      return;
    }
    setHandleState("checking");
    let cancelled = false;
    const id = setTimeout(() => {
      void checkHandle(trimmed).then((available) => {
        if (cancelled) return;
        // null means the check couldn't run; don't accuse a valid handle.
        setHandleState(available === null ? "idle" : available ? "free" : "taken");
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [userId, view, checkHandle]);

  function go(next: View) {
    setView(next);
    setError(null);
    setNotice(null);
  }

  async function onProvider(provider: OAuthProvider) {
    setError(null);
    setNotice(null);
    setOauthBusy(provider);
    const res = await signInWithProvider(provider);
    // On success the browser is already navigating away; only a refusal lands here.
    if (!res.ok) {
      setError(res.error ?? "Could not start that sign-in. Try again.");
      setOauthBusy(null);
    }
  }

  async function onCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim() || !password) {
      setError(
        view === "signin"
          ? "Enter your email or user ID, and your password."
          : "Email and password are both required.",
      );
      return;
    }

    if (view === "signup") {
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      // Nothing is created yet — step two collects the rest, then submits.
      go("signup-details");
      return;
    }

    setBusy(true);
    const res = await signIn(email, password);
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Something went wrong. Try again.");
  }

  async function onDetails(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are both required.");
      return;
    }
    const badHandle = handleError(userId);
    if (badHandle) {
      setError(badHandle);
      return;
    }
    if (handleState === "taken") {
      setError("That user ID is already taken. Pick another.");
      return;
    }

    setBusy(true);
    const res = await signUp(email, password, { firstName, lastName, userId, phone, dob });
    setBusy(false);

    if (!res.ok) {
      setError(res.error ?? "Something went wrong. Try again.");
      return;
    }
    setNotice(
      "Account created. An administrator needs to approve it before your collection unlocks.",
    );
    setPassword("");
  }

  async function onReset(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!resetEmail.trim()) {
      setError("Enter the email address on your account.");
      return;
    }

    setBusy(true);
    const res = await requestPasswordReset(resetEmail);
    setBusy(false);

    if (!res.ok) {
      setError(res.error ?? "Could not send the reset link. Try again.");
      return;
    }
    // Deliberately unconditional: never reveal whether an address is registered.
    setNotice(
      `If an account exists for ${resetEmail.trim()}, a reset link is on its way. Check your inbox and spam folder.`,
    );
  }

  const errorBox = error ? (
    <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {error}
    </p>
  ) : null;

  const noticeBox = notice ? (
    <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground">
      {notice}
    </p>
  ) : null;

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Boxes className="size-6" />
          </div>
          <h1 className="text-display mt-4 text-2xl font-semibold tracking-tight">Tesoro</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {view === "reset"
              ? "We'll email you a link to set a new one."
              : view === "signup-details"
                ? "Almost there — tell us who you are."
                : "Sign in to reach your collection."}
          </p>
        </div>

        {view === "reset" ? (
          <form onSubmit={onReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resetEmail">Email</Label>
              <Input
                id="resetEmail"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
              />
            </div>

            {errorBox}
            {noticeBox}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Send reset link
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => go("signin")}>
              <ArrowLeft className="size-4" />
              Back to sign in
            </Button>
          </form>
        ) : view === "signup-details" ? (
          <form onSubmit={onDetails} className="space-y-4">
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
              <Label htmlFor="userId">User ID</Label>
              <div className="relative">
                <Input
                  id="userId"
                  autoComplete="username"
                  placeholder="Pick a user ID"
                  className="pr-9"
                  value={userId}
                  // Mirrors unique_tesoro_handle() in the database, so what the
                  // field shows is what the account will actually get.
                  onChange={(e) =>
                    setUserId(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9_]/g, "")
                        .slice(0, 20),
                    )
                  }
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                  {handleState === "checking" ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : handleState === "free" ? (
                    <Check className="size-4 text-emerald-500" />
                  ) : handleState === "taken" ? (
                    <X className="size-4 text-destructive" />
                  ) : null}
                </span>
              </div>
              <p
                className={`text-xs ${
                  handleState === "taken" ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {handleState === "taken"
                  ? "Already taken — pick another."
                  : handleState === "free"
                    ? "Available."
                    : "3–20 characters: lowercase letters, numbers and underscores."}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dob">
                Date of birth <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="dob"
                type="date"
                autoComplete="bday"
                max={new Date().toISOString().slice(0, 10)}
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">
                Phone number <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Stored for later — sign-in by one-time code isn&apos;t switched on yet.
              </p>
            </div>

            {errorBox}
            {noticeBox}

            <Button type="submit" className="w-full" disabled={busy || Boolean(notice)}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Create account
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => go("signup")}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </form>
        ) : (
          <>
            <Tabs value={view} onValueChange={(v) => go(v as View)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* One pair of buttons for both tabs: with a provider, signing in
                and signing up are the same action. */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              {PROVIDERS.map(({ id, label, mark: Mark }) => (
                <Button
                  key={id}
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  disabled={oauthBusy !== null || busy}
                  onClick={() => void onProvider(id)}
                >
                  {oauthBusy === id ? <Loader2 className="size-4 animate-spin" /> : <Mark />}
                  {label}
                </Button>
              ))}
            </div>

            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                or use a password
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={onCredentials} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{view === "signin" ? "Email or user ID" : "Email"}</Label>
                <Input
                  id="email"
                  // Sign-in accepts a user ID too, so it can't be type="email".
                  type={view === "signin" ? "text" : "email"}
                  autoComplete={view === "signin" ? "username" : "email"}
                  placeholder={view === "signin" ? "Email or user ID" : "you@example.com"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              {/* "Forgot password?" sits beside the label but comes after the
                  field in the DOM, so tabbing runs email → password → forgot
                  rather than stopping at the link on the way in. Positioned
                  rather than reordered: a positive tabindex would fix this one
                  form and break the order of the page around it. */}
              <div className="relative space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={view === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                {view === "signin" ? (
                  <button
                    type="button"
                    className="absolute right-0 top-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={() => {
                      setResetEmail(email.includes("@") ? email : "");
                      go("reset");
                    }}
                  >
                    Forgot password?
                  </button>
                ) : null}
                {view === "signup" ? (
                  <p className="text-xs text-muted-foreground">At least 8 characters.</p>
                ) : null}
              </div>

              {errorBox}
              {noticeBox}

              <Button type="submit" className="w-full" disabled={busy || oauthBusy !== null}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {view === "signin" ? "Sign in" : "Continue"}
              </Button>
            </form>
          </>
        )}
      </div>

      {/* Deliberately faint: a way in for anyone who wants to look around, not
          a call to action competing with signing in. */}
      <button
        type="button"
        onClick={enterGuest}
        className="absolute bottom-4 right-5 text-[11px] text-muted-foreground/35 underline underline-offset-2 transition-colors hover:text-muted-foreground"
      >
        Guest Mode
      </button>
    </div>
  );
}
