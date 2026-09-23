import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setUserIdPrefix } from "@/lib/car-id";
import { clearAllDrafts } from "@/lib/form-draft";

export type Profile = {
  sno: number;
  /** Login handle, chosen by the person at signup. */
  user_id: string | null;
  auth_uid: string | null;
  first_name: string;
  last_name: string | null;
  email_id: string;
  phone: string | null;
  dob: string | null;
  /** Public URL of the profile picture, or null when none has been set. */
  avatar_url: string | null;
  is_admin: boolean;
  is_approved: boolean;
  is_owner: boolean;
  /** Starts every Car ID in this collection, e.g. "MKCCB". Assigned once, never changed. */
  id_prefix?: string | null;
  created_at: string;
  /** Set when an admin rejected the request to join. */
  rejected_at?: string | null;
};

/** Mirrors is_valid_tesoro_handle() in the database. */
export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

export function handleError(handle: string): string | null {
  const h = handle.trim().toLowerCase();
  if (!h) return "Pick a user ID.";
  if (h.length < 3) return "User ID must be at least 3 characters.";
  if (h.length > 20) return "User ID must be 20 characters or fewer.";
  if (!HANDLE_PATTERN.test(h)) return "Use lowercase letters, numbers and underscores only.";
  return null;
}

/**
 * Supabase Auth stores phone numbers as digits in E.164 order with no leading
 * "+", so anything the person types is reduced to that before it is sent.
 */
export function normalizePhone(input: string): string {
  return input.replace(/[^\d]/g, "");
}

export function fullName(p: Profile | null): string {
  if (!p) return "";
  return [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
}

/**
 * "schema-missing" means the auth migration has not been applied to the Supabase
 * project yet. It is kept distinct from a plain error so the UI can tell the
 * operator what to run instead of showing a generic failure.
 */
export type AuthStatus = "loading" | "signed-out" | "pending" | "ready" | "schema-missing";

type AuthResult = { ok: boolean; error?: string };

/** Read by the handle_new_user trigger to populate tesoro_users. */
export type SignUpDetails = {
  firstName: string;
  lastName: string;
  /** The login handle the person typed. */
  userId: string;
  /** Optional; only needed for OTP sign-in. */
  phone?: string;
  /** Optional now that the handle is no longer derived from it. */
  dob?: string;
};

type Ctx = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  /** The single owner account. Strictly narrower than isAdmin. */
  isOwner: boolean;
  /** `identifier` is an email address or a login handle. */
  signIn: (identifier: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, details: SignUpDetails) => Promise<AuthResult>;
  /** Null when the check could not run, so the form can let it through. */
  checkHandle: (handle: string) => Promise<boolean | null>;
  signInWithProvider: (provider: OAuthProvider) => Promise<AuthResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  /** Demo session: bundled cars, no Supabase reads or writes at all. */
  isGuest: boolean;
  enterGuest: () => void;
  /**
   * Phone sign-in is written and wired but not surfaced: the project has no SMS
   * provider configured. The signup form still collects the number so these can
   * be switched on without asking everyone to re-register.
   */
  sendPhoneOtp: (phone: string) => Promise<AuthResult>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  reloadProfile: () => Promise<void>;
};

export type OAuthProvider = "google" | "apple";

const AuthCtx = createContext<Ctx | null>(null);

/**
 * Supabase auth errors surface as terse strings that don't tell the reader what
 * to do about them, and several are project-configuration problems rather than
 * anything the person typed.
 */
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("rate limit") || m.includes("too many requests")) {
    return "Supabase's built-in email service has hit its hourly limit. Turn off “Confirm email” in Supabase → Authentication → Sign In / Providers → Email, or wait an hour and try again.";
  }
  if (m.includes("email not confirmed")) {
    return "This email hasn't been confirmed yet. Open the link Supabase sent you, or turn off “Confirm email” in the Supabase auth settings.";
  }
  if (m.includes("invalid login credentials")) {
    return "That email or user ID and password don't match.";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "An account with this email already exists — sign in instead.";
  }
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) {
    return "Sign-ups are disabled for this Supabase project.";
  }
  // Phone sign-in needs the Phone provider switched on and an SMS provider
  // (Twilio and the rest) configured. Both are dashboard settings, so the error
  // has to say where to go rather than reading as a typo by the user.
  if (
    m.includes("phone provider") ||
    m.includes("unsupported phone provider") ||
    m.includes("phone signin is disabled") ||
    m.includes("phone logins are disabled") ||
    m.includes("sms provider")
  ) {
    return "Phone sign-in isn't switched on for this project yet. Enable it in Supabase → Authentication → Sign In / Providers → Phone, and add your SMS provider credentials there.";
  }
  // Each OAuth provider has to be switched on and given its client credentials
  // in the dashboard before the button can do anything.
  if (m.includes("provider is not enabled") || m.includes("unsupported provider")) {
    return "That sign-in provider isn't switched on for this project yet. Enable it in Supabase → Authentication → Sign In / Providers.";
  }
  if (m.includes("redirect") && (m.includes("not allowed") || m.includes("mismatch"))) {
    return "This address isn't on the project's allowed redirect list. Add it in Supabase → Authentication → URL Configuration (and check Google Cloud Console Authorized Redirect URIs).";
  }
  if (m.includes("database error saving new user") || m.includes("database error")) {
    return "Could not complete provider sign-in: an account with this email may already exist with another sign-in method, or the new user database trigger encountered an error.";
  }
  if (m.includes("bad_code_verifier") || m.includes("code_verifier")) {
    return "The sign-in code verifier expired or did not match. Please try signing in again.";
  }
  if (m.includes("invalid phone")) {
    return "That doesn't look like a valid phone number. Include the country code, e.g. +91 98765 43210.";
  }
  if (m.includes("token has expired") || m.includes("otp_expired")) {
    return "That code has expired. Request a new one.";
  }
  if (m.includes("invalid token") || m.includes("token is invalid")) {
    return "That code isn't right. Check it and try again.";
  }
  return message;
}

/** PostgREST reports an unknown table/function as 42P01, or 404 via PGRST202. */
function isMissingSchema(code?: string, message?: string): boolean {
  if (code === "42P01" || code === "PGRST202" || code === "PGRST205") return true;
  const m = (message || "").toLowerCase();
  return m.includes("does not exist") || m.includes("could not find the table");
}

/**
 * Guest Mode is kept in sessionStorage: a demo should survive a reload and the
 * odd refresh, but it should not still be waiting in the tab a week later.
 */
const GUEST_KEY = "dg.guestMode";

/**
 * Why a provider sign-in came back without a session: cancelled on Google's
 * screen, or refused. Supabase returns to "/" with the reason in the URL, and
 * the guard then moves a signed-out visitor to /login, which drops it — so the
 * person landed back on the form with no idea why. It is lifted out of the URL
 * on arrival and handed to the login page to show.
 */
const OAUTH_ERROR_KEY = "dg.oauthError";

function captureOAuthError() {
  if (typeof window === "undefined") return;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const code = hash.get("error") ?? query.get("error");
  const description = hash.get("error_description") ?? query.get("error_description");
  if (!code && !description) return;

  const message =
    code === "access_denied"
      ? "Sign-in was cancelled before it finished. Try again, or use your password."
      : friendlyAuthError(description || "That sign-in didn't complete. Try again.");
  try {
    sessionStorage.setItem(OAUTH_ERROR_KEY, message);
  } catch {
    // Storage unavailable; the person simply sees the form without the reason.
  }
  // Off the address bar, so a reload does not report the same failure twice.
  // Only ever an error here — a successful return carries a token, not these.
  window.history.replaceState(null, "", window.location.pathname);
}

/** The reason the last provider sign-in failed, once. */
export function takeOAuthError(): string | null {
  try {
    const message = sessionStorage.getItem(OAUTH_ERROR_KEY);
    if (message) sessionStorage.removeItem(OAUTH_ERROR_KEY);
    return message;
  } catch {
    return null;
  }
}

/** Stand-in profile so the shell has a name and handle to render. */
const GUEST_PROFILE: Profile = {
  sno: 0,
  user_id: "guest",
  auth_uid: null,
  first_name: "Guest",
  last_name: "",
  email_id: "Demo session",
  phone: null,
  dob: null,
  avatar_url: null,
  is_admin: false,
  is_approved: true,
  is_owner: false,
  created_at: "",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [resolving, setResolving] = useState(true);
  /**
   * Which account the profile in hand belongs to, and whether it has ever
   * finished loading.
   *
   * Both are refs because the auth listener below is registered once and would
   * otherwise close over the first render's values. They exist so a token
   * refresh can be told apart from a sign-in: see the listener.
   */
  const loadedFor = useRef<string | null>(null);
  const settledOnce = useRef(false);
  // Read in an effect rather than at init: the server render has no
  // sessionStorage, and a mismatch here would fail hydration.
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(GUEST_KEY) === "1") setIsGuest(true);
    } catch {
      // Storage unavailable (private mode); guest mode simply won't persist.
    }
  }, []);

  const enterGuest = useCallback(() => {
    try {
      sessionStorage.setItem(GUEST_KEY, "1");
    } catch {
      // Ignore; the in-memory flag below still starts the demo.
    }
    setIsGuest(true);
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    // A fresh OAuth signup creates the profile row via a Postgres trigger (handle_new_user).
    // Allow up to 3 attempts with brief delays in case of slight database trigger lag.
    let row: Profile | null = null;
    let attempts = 0;

    while (attempts < 3) {
      attempts++;
      const { data, error } = await supabase
        .from("tesoro_users")
        .select("*")
        .eq("auth_uid", userId)
        .maybeSingle();

      if (error && isMissingSchema(error.code, error.message)) {
        setSchemaMissing(true);
        setProfile(null);
        setIsAdmin(false);
        return;
      }

      if (data) {
        row = data as Profile;
        break;
      }

      if (attempts < 3) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }

    setSchemaMissing(false);
    setProfile(row);
    // Whose profile is now in hand, so the listener can tell a refreshed token
    // from a different person signing in.
    loadedFor.current = userId;
    // Car IDs are minted locally, so the generator needs this account's prefix
    // before the first car is added.
    setUserIdPrefix(row?.id_prefix ?? null);
    // The owner is always an admin, mirroring is_tesoro_admin() in the database.
    setIsAdmin(Boolean(row?.is_admin) || Boolean(row?.is_owner));
  }, []);

  useEffect(() => {
    let active = true;

    // On mount, while the URL is still the one Supabase returned to.
    captureOAuthError();

    const searchParams = new URLSearchParams(window.location.search);
    const authCode = searchParams.get("code");
    const hasHashToken =
      typeof window !== "undefined" && window.location.hash.includes("access_token");
    const isOAuthPending = Boolean(authCode || hasHashToken);

    // If returning from OAuth, ensure the splash/resolving state remains up
    // so AuthGate does not instantly kick the visitor to /login before the token exchange finishes.
    if (isOAuthPending) {
      setResolving(true);
    }

    // Register the listener before the initial getSession so a token refreshed
    // mid-flight is not missed.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);

      if (!nextSession?.user) {
        // If an OAuth code or hash token is waiting to be processed, do not prematurely
        // resolve to signed-out during the initial empty storage check.
        if (isOAuthPending && !settledOnce.current) {
          return;
        }

        setProfile(null);
        setIsAdmin(false);
        loadedFor.current = null;
        settledOnce.current = true;
        setResolving(false);
        return;
      }

      /**
       * A token refresh is not a sign-in.
       *
       * Supabase re-validates the session whenever the tab is looked at again,
       * and every hour or so besides, and each time fires this listener with
       * the same account. Going back to `resolving` for that put the splash up,
       * which unmounts the whole app — and with it whatever dialog was open. A
       * car half added in one tab was lost by glancing at another.
       *
       * So the splash is only for a session this provider has not settled yet,
       * or one that belongs to somebody else. Otherwise the profile is
       * refetched quietly underneath a screen that never goes away.
       */
      const sameAccount = loadedFor.current === nextSession.user.id;
      if (!settledOnce.current || !sameAccount) setResolving(true);

      // Supabase deadlocks if another supabase-js call is awaited inside this
      // callback, so the profile fetch is deferred to a fresh task.
      setTimeout(() => {
        if (!active) return;
        loadProfile(nextSession.user.id).finally(() => {
          if (!active) return;
          settledOnce.current = true;
          setResolving(false);
        });
      }, 0);
    });

    (async () => {
      // If returning with an OAuth code, explicitly exchange it for a session.
      if (authCode) {
        setResolving(true);
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(authCode);
          if (!active) return;

          if (data?.session?.user) {
            setSession(data.session);
            const cleanUrl = window.location.pathname + (window.location.hash || "");
            window.history.replaceState(null, "", cleanUrl);
            await loadProfile(data.session.user.id);
            settledOnce.current = true;
            setResolving(false);
            return;
          }

          if (error) {
            console.warn(
              "exchangeCodeForSession returned an error, checking active session:",
              error,
            );
            // In case Supabase client internal initialize already exchanged it concurrently:
            const { data: sessionData } = await supabase.auth.getSession();
            if (sessionData?.session?.user) {
              setSession(sessionData.session);
              const cleanUrl = window.location.pathname + (window.location.hash || "");
              window.history.replaceState(null, "", cleanUrl);
              await loadProfile(sessionData.session.user.id);
              settledOnce.current = true;
              setResolving(false);
              return;
            }

            try {
              sessionStorage.setItem(OAUTH_ERROR_KEY, friendlyAuthError(error.message));
            } catch {
              /* ignore sessionStorage restriction */
            }
            window.history.replaceState(null, "", window.location.pathname);
            settledOnce.current = true;
            setResolving(false);
            return;
          }
        } catch (err: unknown) {
          console.error("Error exchanging code for session:", err);
        }
      }

      // Standard session retrieval from storage
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        setSession(data?.session ?? null);
        if (!data?.session?.user) {
          settledOnce.current = true;
          setResolving(false);
          return;
        }
        await loadProfile(data.session.user.id);
      } catch (err: unknown) {
        console.error("Error fetching session:", err);
      } finally {
        if (active) {
          settledOnce.current = true;
          setResolving(false);
        }
      }
    })();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  /**
   * Accepts either an email address or a login handle. Supabase Auth only
   * authenticates by email, so a handle is resolved through the
   * email_for_login RPC first.
   */
  const signIn = useCallback(async (identifier: string, password: string): Promise<AuthResult> => {
    const entered = identifier.trim();
    let email = entered;

    if (!entered.includes("@")) {
      const { data, error } = await supabase.rpc("email_for_login", {
        _identifier: entered,
      });
      if (error) {
        return isMissingSchema(error.code, error.message)
          ? { ok: false, error: "User ID sign-in isn't set up yet. Run the auth migration." }
          : { ok: false, error: error.message };
      }
      if (!data) {
        return { ok: false, error: "No account found with that user ID." };
      }
      email = data as unknown as string;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { ok: false, error: friendlyAuthError(error.message) } : { ok: true };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, details: SignUpDetails): Promise<AuthResult> => {
      const phone = normalizePhone(details.phone ?? "");
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          // Read by the handle_new_user trigger to populate tesoro_users.
          data: {
            first_name: details.firstName.trim(),
            last_name: details.lastName.trim(),
            user_id: details.userId.trim().toLowerCase(),
            phone: phone ? `+${phone}` : "",
            dob: details.dob ?? "",
          },
        },
      });
      return error ? { ok: false, error: friendlyAuthError(error.message) } : { ok: true };
    },
    [],
  );

  /**
   * Returns null when the check itself failed — a missing migration or an
   * offline moment shouldn't block a signup, since the trigger de-duplicates
   * with a numeric suffix anyway.
   */
  const checkHandle = useCallback(async (handle: string): Promise<boolean | null> => {
    const h = handle.trim().toLowerCase();
    if (!HANDLE_PATTERN.test(h)) return false;
    // src/integrations/supabase/types.ts is generated from the database and
    // predates this migration, so the function is not in its RPC union yet.
    const rpc = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    const { data, error } = await rpc("tesoro_handle_available", { _handle: h });
    if (error) return null;
    return Boolean(data);
  }, []);

  /**
   * Hands off to the provider and never returns on success — the browser
   * leaves the page. supabase-js picks the session out of the URL on the way
   * back, so there is nothing to do here beyond reporting a refusal.
   */
  const signInWithProvider = useCallback(async (provider: OAuthProvider): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams:
          provider === "google" ? { access_type: "offline", prompt: "select_account" } : undefined,
      },
    });
    return error ? { ok: false, error: friendlyAuthError(error.message) } : { ok: true };
  }, []);

  /**
   * Always reports success, even for an address with no account: telling a
   * stranger which emails are registered is not worth the small convenience.
   */
  const requestPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error && /rate limit|too many/i.test(error.message)) {
      return { ok: false, error: friendlyAuthError(error.message) };
    }
    return { ok: true };
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.updateUser({ password });
    return error ? { ok: false, error: friendlyAuthError(error.message) } : { ok: true };
  }, []);

  const sendPhoneOtp = useCallback(async (phone: string): Promise<AuthResult> => {
    const digits = normalizePhone(phone);
    if (digits.length < 8) {
      return { ok: false, error: "Enter your number with its country code, e.g. +91 98765 43210." };
    }
    const { error } = await supabase.auth.signInWithOtp({
      phone: `+${digits}`,
      // Sign-in only: a number nobody has registered must not quietly mint a
      // brand-new, profile-less account.
      options: { shouldCreateUser: false },
    });
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("signups not allowed") || m.includes("user not found")) {
        return { ok: false, error: "No account is registered with that number." };
      }
      return { ok: false, error: friendlyAuthError(error.message) };
    }
    return { ok: true };
  }, []);

  const verifyPhoneOtp = useCallback(async (phone: string, token: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.verifyOtp({
      phone: `+${normalizePhone(phone)}`,
      token: token.trim(),
      type: "sms",
    });
    return error ? { ok: false, error: friendlyAuthError(error.message) } : { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    // Leaving Guest Mode is the same gesture, but there is no session to end.
    try {
      sessionStorage.removeItem(GUEST_KEY);
    } catch {
      // Ignore; the flag below is what the UI actually reads.
    }
    setIsGuest(false);
    await supabase.auth.signOut();
    setProfile(null);
    setIsAdmin(false);
    // Collections are cached per browser; leaving them would leak the previous
    // user's cars into the next sign-in on a shared machine.
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("dg.cars")) localStorage.removeItem(key);
      }
    } catch {
      // Storage may be unavailable (private mode); nothing to clean up then.
    }
    // Same reasoning for half-typed forms: a draft is the previous person's
    // work and must not greet whoever signs in next.
    clearAllDrafts();
  }, []);

  const reloadProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const status = useMemo<AuthStatus>(() => {
    // Checked before `resolving`: a guest has nothing to resolve and should not
    // sit behind the splash while Supabase is asked about a session they
    // haven't got.
    if (isGuest) return "ready";
    if (resolving) return "loading";
    if (!session?.user) return "signed-out";
    if (schemaMissing) return "schema-missing";
    // The owner account never waits for approval.
    if (!profile?.is_approved && !profile?.is_owner) return "pending";
    return "ready";
  }, [isGuest, resolving, session, schemaMissing, profile]);

  const value = useMemo<Ctx>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      profile: isGuest ? GUEST_PROFILE : profile,
      // A guest is never an admin: no admin nav, no user management.
      isAdmin: isGuest ? false : isAdmin,
      isOwner: isGuest ? false : Boolean(profile?.is_owner),
      signIn,
      signUp,
      checkHandle,
      signInWithProvider,
      requestPasswordReset,
      updatePassword,
      isGuest,
      enterGuest,
      sendPhoneOtp,
      verifyPhoneOtp,
      signOut,
      reloadProfile,
    }),
    [
      status,
      session,
      profile,
      isAdmin,
      signIn,
      signUp,
      checkHandle,
      signInWithProvider,
      requestPasswordReset,
      updatePassword,
      isGuest,
      enterGuest,
      sendPhoneOtp,
      verifyPhoneOtp,
      signOut,
      reloadProfile,
    ],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): Ctx {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
