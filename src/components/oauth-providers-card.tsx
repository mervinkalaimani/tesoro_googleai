import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { useOAuthProviders, type OAuthProviders } from "@/lib/deployment-settings";

const ROWS: { id: keyof OAuthProviders; label: string; hint: string }[] = [
  {
    id: "google",
    label: "Google",
    hint: "Needs the Google provider enabled in Supabase → Authentication → Providers.",
  },
  {
    id: "apple",
    label: "Apple",
    hint: "Needs an Apple Service ID and key configured in Supabase.",
  },
];

/**
 * Which sign-in providers the login screen offers.
 *
 * Off by default, and off is not cosmetic: a provider button that is visible
 * without the provider being configured in Supabase hands whoever presses it an
 * error page and no way back. Turn one on here once it is set up there and
 * signing in with it actually works.
 *
 * This is a deployment-wide switch, not a preference — everyone who opens the
 * login page sees the result — which is why it sits behind the owner.
 */
export function OAuthProvidersCard() {
  const { providers, loaded, save } = useOAuthProviders();
  const [saving, setSaving] = useState<keyof OAuthProviders | null>(null);

  const toggle = async (id: keyof OAuthProviders, on: boolean) => {
    setSaving(id);
    const res = await save({ ...providers, [id]: on });
    setSaving(null);
    if (res.error) {
      toast.error("Could not save that", { description: res.error });
      return;
    }
    toast.success(`${id === "google" ? "Google" : "Apple"} sign-in ${on ? "enabled" : "hidden"}`, {
      description: on
        ? "It now appears on the login screen."
        : "The button is hidden until it is turned back on.",
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
      <div className="min-w-0">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <KeyRound className="size-4 text-primary" />
          Sign-in providers
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Shown on the login screen to everyone. Turn one on only once it is configured in Supabase
          — an unconfigured button fails with a Supabase error page.
        </p>
      </div>

      <div className="divide-y divide-border/60">
        {ROWS.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-4 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-medium">{row.label}</div>
              <div className="text-xs text-muted-foreground">{row.hint}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {saving === row.id && <Loader2 className="size-3.5 animate-spin text-primary" />}
              <Switch
                checked={providers[row.id]}
                disabled={!loaded || saving !== null}
                onCheckedChange={(v) => void toggle(row.id, Boolean(v))}
                aria-label={`${row.label} sign-in`}
              />
            </div>
          </div>
        ))}
      </div>

      {!loaded && (
        <p className="text-xs text-muted-foreground">Reading the current setting&hellip;</p>
      )}
    </div>
  );
}
