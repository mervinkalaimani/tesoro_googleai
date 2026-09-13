import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ACCENT_OPTIONS, THEME_OPTIONS, useApp, type AccentColor } from "@/lib/store";
import { SegmentControl } from "@/components/segment-control";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AccountCard } from "@/components/account-card";
import { FavouriteDetector } from "@/components/favourite-detector";
import { IdRebuild } from "@/components/shipping-id-rebuild";
import { OAuthProvidersCard } from "@/components/oauth-providers-card";
import { SupabaseSyncCard } from "@/components/supabase-sync-card";
import { useAuth } from "@/lib/auth-store";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings | Tesoro" },
      {
        name: "description",
        content:
          "Configure diecast dashboard Supabase database connection, URLs, table names, theme, and settings.",
      },
      { property: "og:title", content: "Settings | Tesoro" },
      {
        property: "og:description",
        content:
          "Configure diecast dashboard Supabase database connection, URLs, table names, theme, and settings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

type SettingsTab = "preferences" | "account" | "diagnostics" | "supabase";

/** Set from package.json (and the commit, on Vercel) in vite.config.ts. */
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "dev";

function SettingsPage() {
  const {
    theme,
    themePreference,
    setThemePreference,
    accentColor,
    setAccentColor,
    hideInvestment,
    setHideInvestment,
  } = useApp();
  const [tab, setTab] = useState<SettingsTab>("preferences");
  // The connection settings point the whole app at a database. Anyone who can
  // edit them can redirect every other user's collection, so they belong to the
  // owner alone — not to admins, who manage people rather than infrastructure.
  const { isOwner } = useAuth();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-display text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          {isOwner
            ? "Configure your Supabase database, cloud connection, and personal preferences."
            : "Set your theme, display preferences, and diagnostics."}
        </p>
      </div>

      {/* General first: it is what most visits are for. The database connection
          is owner-only plumbing you touch once, so it goes last.

          The same segment control as every other page, rather than a tab strip
          of its own. Four labels do not fit across a phone, so it scrolls
          sideways instead of squashing them. */}
      <SegmentControl
        value={tab}
        onChange={setTab}
        options={[
          { value: "preferences", label: "General & Display" },
          { value: "account", label: "Account" },
          { value: "diagnostics", label: "Diagnostics" },
          ...(isOwner ? [{ value: "supabase" as const, label: "DB Connection" }] : []),
        ]}
        className="w-full text-sm md:w-auto [&>button]:px-3 [&>button]:py-1.5"
      />

      <div className="space-y-4">
        {/* TAB 1: GENERAL & DISPLAY PREFERENCES */}
        {tab === "preferences" && (
          <div className="space-y-4">
            <section className="card-elevated p-5">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Appearance
                </h2>
                <span className="text-xs text-muted-foreground">
                  Saved to your account — the same on every device you sign in on.
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium">Theme</div>
                  <div className="text-xs text-muted-foreground">
                    {themePreference === "system"
                      ? `Following your device, which is currently ${theme}.`
                      : "Auto follows your device's light and dark setting."}
                  </div>
                </div>
                <SegmentControl
                  value={themePreference}
                  onChange={setThemePreference}
                  options={THEME_OPTIONS}
                  className="h-9 text-sm"
                />
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-border pt-5">
                <div>
                  <div className="font-medium">Accent colour</div>
                  <div className="text-xs text-muted-foreground">
                    Applies to buttons, highlights, charts, and active navigation.
                  </div>
                </div>
                <Select value={accentColor} onValueChange={(v) => setAccentColor(v as AccentColor)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCENT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>

            <section className="card-elevated p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Privacy
              </h2>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Hide investment value</div>
                  <div className="text-xs text-muted-foreground">
                    Mask the total spend in the sidebar until you tap the eye.
                  </div>
                </div>
                <Switch checked={hideInvestment} onCheckedChange={setHideInvestment} />
              </div>
            </section>

            <footer className="space-y-0.5 pt-4 text-center text-xs text-muted-foreground">
              <p>© Mervin K</p>
              <p>with love from Chennai</p>
              <p className="font-mono text-[11px]">ver {APP_VERSION}</p>
            </footer>
          </div>
        )}

        {/* TAB 2: ACCOUNT — everything signup asked for, afterwards */}
        {tab === "account" && <AccountCard />}

        {/* TAB 3: DIAGNOSTICS */}
        {tab === "diagnostics" && (
          <section className="card-elevated p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Data diagnostics
            </h2>
            <div className="space-y-4">
              <IdRebuild kind="shipping" />
              <IdRebuild kind="order" />
              <FavouriteDetector />
            </div>
          </section>
        )}

        {/* TAB 4: DATABASE CONNECTION — owner only */}
        {isOwner && tab === "supabase" ? (
          <div className="space-y-4">
            {/* Above the connection card: this is about what visitors can see,
                which is a more common thing to change than the database the
                whole app points at. */}
            <section className="card-elevated p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Login screen
              </h2>
              <OAuthProvidersCard />
            </section>
            <SupabaseSyncCard />
          </div>
        ) : null}
      </div>
    </div>
  );
}
