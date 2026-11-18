import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Mail, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { PhoneField } from "@/components/phone-field";
import { TierAvatar } from "@/components/tier-avatar";
import { TierLine } from "@/components/tier-line";
import { Button } from "@/components/ui/button";
import { IosGroup, IosInput, IosRow } from "@/components/ios-field";
import { supabase } from "@/integrations/supabase/client";
import { ACCEPT_ATTR, deleteAvatar, uploadAvatar } from "@/lib/car-photos";
import { useAuth, fullName, normalizePhone } from "@/lib/auth-store";

/**
 * Everything signup asked for, in one place, editable afterwards.
 *
 * Two fields are deliberately not editable here. The user ID is pinned by the
 * row-level policy — it is how other people refer to you, and the database
 * refuses to change it — and the email address is what the account authenticates
 * with, so changing it is an auth flow rather than a text field (an admin can do
 * it from the Admin page).
 */

/** The generated Database types predate avatar_url; narrowed for this one call. */
type LooseClient = {
  from: (table: string) => {
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

type Fields = {
  first_name: string;
  last_name: string;
  phone: string;
  dob: string;
};

function fieldsOf(
  p: {
    first_name: string;
    last_name: string | null;
    phone: string | null;
    dob: string | null;
  } | null,
): Fields {
  return {
    first_name: p?.first_name ?? "",
    last_name: p?.last_name ?? "",
    phone: p?.phone ?? "",
    // A date input wants YYYY-MM-DD and nothing else; a stored timestamp has
    // more than that on the end.
    dob: (p?.dob ?? "").slice(0, 10),
  };
}

export function AccountCard() {
  const { profile, session, isGuest, requestPasswordReset, updatePassword, reloadProfile } =
    useAuth();

  const baseline = useMemo(() => fieldsOf(profile), [profile]);
  const [fields, setFields] = useState<Fields>(baseline);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFields(baseline);
  }, [baseline]);

  const dirty = (Object.keys(baseline) as (keyof Fields)[]).some((k) => fields[k] !== baseline[k]);
  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setFields((f) => ({ ...f, [k]: v }));

  const name = fullName(profile);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  /** Writes straight to the profile row; RLS decides what is allowed. */
  const writeProfile = async (patch: Record<string, unknown>): Promise<boolean> => {
    const uid = session?.user?.id;
    if (!uid) return false;
    const { error } = await (supabase as unknown as LooseClient)
      .from("tesoro_users")
      .update(patch)
      .eq("auth_uid", uid);
    if (error) {
      toast.error("Could not save that", { description: error.message });
      return false;
    }
    await reloadProfile();
    return true;
  };

  const save = async () => {
    if (!fields.first_name.trim()) {
      toast.error("A first name is needed");
      return;
    }
    setSaving(true);
    const digits = normalizePhone(fields.phone);
    const ok = await writeProfile({
      first_name: fields.first_name.trim(),
      last_name: fields.last_name.trim(),
      phone: digits ? `+${digits}` : null,
      // An empty date column is NULL, not "".
      dob: fields.dob.trim() || null,
    });
    setSaving(false);
    if (ok) toast.success("Saved");
  };

  const takePhoto = async (file: File | undefined | null) => {
    if (!file) return;
    setPhotoBusy(true);
    const res = await uploadAvatar(file);
    if ("error" in res) {
      setPhotoBusy(false);
      toast.error("Could not set that picture", { description: res.error });
      return;
    }
    const previous = profile?.avatar_url || "";
    const ok = await writeProfile({ avatar_url: res.url });
    setPhotoBusy(false);
    // Only once the new one is recorded: a failed write that had already
    // deleted the old picture would leave the account with neither.
    if (ok && previous) void deleteAvatar(previous);
  };

  const removePhoto = async () => {
    const previous = profile?.avatar_url || "";
    if (!previous) return;
    setPhotoBusy(true);
    const ok = await writeProfile({ avatar_url: null });
    setPhotoBusy(false);
    if (ok) void deleteAvatar(previous);
  };

  const changePassword = async () => {
    if (password.length < 8) {
      toast.error("Use at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Those two do not match");
      return;
    }
    setPwBusy(true);
    const res = await updatePassword(password);
    setPwBusy(false);
    if (!res.ok) {
      toast.error("Could not change it", { description: res.error });
      return;
    }
    setPassword("");
    setConfirm("");
    toast.success("Password changed");
  };

  const emailLink = async () => {
    const email = profile?.email_id || "";
    if (!email) return;
    setPwBusy(true);
    const res = await requestPasswordReset(email);
    setPwBusy(false);
    if (!res.ok) {
      toast.error("Could not send it", { description: res.error });
      return;
    }
    toast.success(`A reset link is on its way to ${email}`);
  };

  if (isGuest) {
    return (
      <section className="card-elevated p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Your account
        </h2>
        <p className="text-sm text-muted-foreground">
          The demo has no account behind it. Sign in to edit your details.
        </p>
      </section>
    );
  }

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3 px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your details
          </h2>
          {/* What this account is, in the words the rest of the app uses. */}
          {!isGuest && <TierLine />}
        </div>

        {/* The way iOS Settings lays it out: grouped rows, the name on the left
            and the answer on the right. */}
        <IosGroup>
          {/* PICTURE */}
          <div className="flex items-center gap-3.5 px-3.5 py-3">
            <TierAvatar
              url={profile?.avatar_url}
              initials={initials}
              className="size-14 border border-border"
              fallbackClassName="bg-muted text-lg font-semibold"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[15px]">Profile picture</div>
              <p className="text-xs text-muted-foreground">JPG, PNG or WebP. Shown in the bar.</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={photoBusy}
                onClick={() => fileRef.current?.click()}
              >
                {photoBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                {profile?.avatar_url ? "Replace" : "Choose"}
              </Button>
              {profile?.avatar_url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-rose-500 hover:bg-rose-500/10 hover:text-rose-400"
                  disabled={photoBusy}
                  aria-label="Remove picture"
                  onClick={() => void removePhoto()}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT_ATTR}
              className="sr-only"
              onChange={(e) => {
                void takePhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>

          {/* WHAT SIGNUP ASKED FOR */}
          <IosRow label="First name">
            <IosInput
              label="First name"
              value={fields.first_name}
              onChange={(v) => set("first_name", v)}
              autoComplete="given-name"
            />
          </IosRow>
          <IosRow label="Last name">
            <IosInput
              label="Last name"
              value={fields.last_name}
              onChange={(v) => set("last_name", v)}
              autoComplete="family-name"
            />
          </IosRow>
          <IosRow label="Phone">
            <PhoneField value={fields.phone} onChange={(v) => set("phone", v)} />
          </IosRow>
          <IosRow label="Date of birth">
            <IosInput
              label="Date of birth"
              type="date"
              value={fields.dob}
              onChange={(v) => set("dob", v)}
            />
          </IosRow>
          <IosRow label="User ID">
            <IosInput label="User ID" value={profile?.user_id ?? ""} onChange={() => {}} readOnly />
          </IosRow>
          <IosRow label="Email">
            <IosInput label="Email" value={profile?.email_id ?? ""} onChange={() => {}} readOnly />
          </IosRow>
        </IosGroup>
        <p className="px-1 pt-1 text-xs text-muted-foreground">
          Your user ID is how you sign in and how others refer to you. It cannot be changed.
          Changing your email changes how you sign in, so an admin does it for you.
        </p>

        <div className="flex items-center justify-end gap-2 pt-2">
          {dirty && (
            <Button type="button" variant="ghost" onClick={() => setFields(baseline)}>
              Discard
            </Button>
          )}
          <Button type="button" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            Save changes
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Password
        </h2>
        <IosGroup>
          <IosRow label="New password">
            <IosInput
              label="New password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
          </IosRow>
          <IosRow label="Repeat it">
            <IosInput
              label="Repeat the password"
              type="password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              placeholder="Type it again"
            />
          </IosRow>
        </IosGroup>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {/* For the case this form cannot help with: someone who is signed in on
              a device but no longer remembers what they typed. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            disabled={pwBusy || !profile?.email_id}
            onClick={() => void emailLink()}
          >
            <Mail className="size-3.5" />
            Email me a reset link instead
          </Button>
          <Button
            type="button"
            disabled={pwBusy || !password || !confirm}
            onClick={() => void changePassword()}
          >
            {pwBusy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            Change password
          </Button>
        </div>
      </div>
    </>
  );
}
