import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Mail, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      <section className="card-elevated p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Your details
        </h2>

        {/* PICTURE */}
        <div className="flex items-center gap-4 border-b border-border pb-5">
          <Avatar className="size-16 border border-border">
            {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
            <AvatarFallback className="bg-muted text-lg font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1.5">
            <div className="text-sm font-medium">Profile picture</div>
            <div className="flex flex-wrap gap-1.5">
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
                {profile?.avatar_url ? "Replace" : "Choose a file"}
              </Button>
              {profile?.avatar_url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-rose-500 hover:bg-rose-500/10 hover:text-rose-400"
                  disabled={photoBusy}
                  onClick={() => void removePhoto()}
                >
                  <Trash2 className="size-3.5" />
                  Remove
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">JPG, PNG or WebP. Shown in the bar.</p>
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
        <div className="grid grid-cols-1 gap-3 pt-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">First name</Label>
            <Input
              value={fields.first_name}
              onChange={(e) => set("first_name", e.target.value)}
              autoComplete="given-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Last name</Label>
            <Input
              value={fields.last_name}
              onChange={(e) => set("last_name", e.target.value)}
              autoComplete="family-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Phone</Label>
            <Input
              value={fields.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+91 98765 43210"
              autoComplete="tel"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Date of birth</Label>
            <Input type="date" value={fields.dob} onChange={(e) => set("dob", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">User ID</Label>
            <Input
              value={profile?.user_id ?? ""}
              readOnly
              className="cursor-not-allowed bg-muted/60"
            />
            <p className="text-[11px] text-muted-foreground">
              How you sign in, and how others refer to you. It cannot be changed.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input
              value={profile?.email_id ?? ""}
              readOnly
              className="cursor-not-allowed bg-muted/60"
            />
            <p className="text-[11px] text-muted-foreground">
              Changing this changes how you sign in — an admin does it for you.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-4">
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
      </section>

      <section className="card-elevated p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Password
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">New password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Repeat it</Label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          {/* For the case this form cannot help with: someone who is signed in on
              a device but no longer remembers what they typed, and would rather
              not invent a new one here in the open. */}
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
      </section>
    </>
  );
}
