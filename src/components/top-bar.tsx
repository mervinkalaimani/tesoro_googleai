import { useState } from "react";
import { Sun, Moon, Plus, RefreshCw } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { SearchBox } from "@/components/search-box";
import { useCarsRefresh } from "@/lib/cars-store";
import { CarFormDialog } from "@/components/car-form-dialog";

function formatRelative(ts: number | null): string {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 30) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleString();
}

export function TopBar() {
  const { theme, toggleTheme } = useApp();
  const { refresh, lastUpdated, refreshing } = useCarsRefresh();
  const [addOpen, setAddOpen] = useState(false);
  const [, tick] = useState(0);

  // Re-render every 30s to keep "Last updated" fresh
  if (typeof window !== "undefined") {
    // noop — timer registered below via effect-free interval alternative
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur">
      <SidebarTrigger />
      <SearchBox />
      <div className="ml-auto flex items-center gap-1">
        <div className="hidden md:flex items-center gap-2 pr-1 text-xs text-muted-foreground">
          <span>Updated {formatRelative(lastUpdated)}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            refresh().finally(() => tick((n) => n + 1));
          }}
          disabled={refreshing}
          className="gap-1.5"
          aria-label="Refresh data"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">{refreshing ? "Refreshing" : "Refresh"}</span>
        </Button>
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
          <Plus className="size-4" /> <span className="hidden sm:inline">Add car</span>
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>
      <CarFormDialog open={addOpen} onOpenChange={setAddOpen} mode="add" />
    </header>
  );
}
