import { createFileRoute } from "@tanstack/react-router";
import { Database, Sliders, Activity, UserRound } from "lucide-react";
import { ACCENT_OPTIONS, THEME_OPTIONS, useApp, type AccentColor } from "@/lib/store";
import { SegmentControl } from "@/components/segment-control";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AccountCard } from "@/components/account-card";
import { FavouriteDetector } from "@/components/favourite-detector";
import { ShippingIdRebuild } from "@/components/shipping-id-rebuild";
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

function SettingsPage() {
  const {
    theme,
    themePreference,
    setThemePreference,
    accentColor,
    setAccentColor,
    hideInvestment,
    setHideInvestment,
    transitEtaDays,
    setTransitEtaDays,
  } = useApp();
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
          is owner-only plumbing you touch once, so it goes last. */}
      <Tabs defaultValue="preferences" className="w-full space-y-4">
        <TabsList className={`grid w-full h-10 ${isOwner ? "grid-cols-4" : "grid-cols-3"}`}>
          <TabsTrigger
            value="preferences"
            id="settings-tab-preferences"
            className="gap-2 text-xs md:text-sm font-medium"
          >
            <Sliders className="size-4 shrink-0" />
            <span>General & Display</span>
          </TabsTrigger>
          <TabsTrigger
            value="account"
            id="settings-tab-account"
            className="gap-2 text-xs md:text-sm font-medium"
          >
            <UserRound className="size-4 shrink-0" />
            <span>Account</span>
          </TabsTrigger>
          <TabsTrigger
            value="diagnostics"
            id="settings-tab-diagnostics"
            className="gap-2 text-xs md:text-sm font-medium"
          >
            <Activity className="size-4 shrink-0" />
            <span>Diagnostics</span>
          </TabsTrigger>
          {isOwner ? (
            <TabsTrigger
              value="supabase"
              id="settings-tab-supabase"
              className="gap-2 text-xs md:text-sm font-medium"
            >
              <Database className="size-4 text-primary shrink-0" />
              <span>DB Connection</span>
            </TabsTrigger>
          ) : null}
        </TabsList>

        {/* TAB 1: GENERAL & DISPLAY PREFERENCES */}
        <TabsContent value="preferences" className="space-y-4 focus-visible:outline-none">
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

          <section className="card-elevated p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Orders
            </h2>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="eta" className="font-medium">
                  Transit ETA (days)
                </Label>
                <div className="text-xs text-muted-foreground">
                  Used to estimate expected delivery from order date.
                </div>
              </div>
              <Input
                id="eta"
                type="number"
                className="w-24"
                value={transitEtaDays}
                min={1}
                onChange={(e) => setTransitEtaDays(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </section>

          <section className="card-elevated p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              More coming soon
            </h2>
            <p className="text-sm text-muted-foreground">
              Currency, backup / export, and shared collections are on the way.
            </p>
          </section>
        </TabsContent>

        {/* TAB 2: ACCOUNT — everything signup asked for, afterwards */}
        <TabsContent value="account" className="space-y-4 focus-visible:outline-none">
          <AccountCard />
        </TabsContent>

        {/* TAB 3: DIAGNOSTICS */}
        <TabsContent value="diagnostics" className="space-y-4 focus-visible:outline-none">
          <section className="card-elevated p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Data diagnostics
            </h2>
            <div className="space-y-4">
              <ShippingIdRebuild />
              <FavouriteDetector />
            </div>
          </section>
        </TabsContent>

        {/* TAB 3: DATABASE CONNECTION — owner only */}
        {isOwner ? (
          <TabsContent value="supabase" className="space-y-4 focus-visible:outline-none">
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
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
