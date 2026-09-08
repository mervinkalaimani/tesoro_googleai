import { createFileRoute } from "@tanstack/react-router";
import { Sun, Moon } from "lucide-react";
import { ACCENT_OPTIONS, useApp, type AccentColor } from "@/lib/store";
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
import { FavouriteDetector } from "@/components/favourite-detector";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings | Tesoro" },
      {
        name: "description",
        content:
          "Configure diecast dashboard theme, accent colour, investment privacy, and transit ETA settings.",
      },
      { property: "og:title", content: "Settings | Tesoro" },
      {
        property: "og:description",
        content:
          "Configure diecast dashboard theme, accent colour, investment privacy, and transit ETA settings.",
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
    setTheme,
    accentColor,
    setAccentColor,
    hideInvestment,
    setHideInvestment,
    transitEtaDays,
    setTransitEtaDays,
  } = useApp();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-display text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Personalize your Tesoro experience.</p>
      </div>

      <section className="card-elevated p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Appearance
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Theme</div>
            <div className="text-xs text-muted-foreground">Switch between light and dark mode.</div>
          </div>
          <div className="flex items-center gap-2">
            <Sun className="size-4 text-muted-foreground" />
            <Switch
              checked={theme === "dark"}
              onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
            />
            <Moon className="size-4 text-muted-foreground" />
          </div>
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
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Data diagnostics
        </h2>
        <FavouriteDetector />
      </section>

      <section className="card-elevated p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          More coming soon
        </h2>
        <p className="text-sm text-muted-foreground">
          Currency, backup / export, and shared collections are on the way.
        </p>
      </section>
    </div>
  );
}
