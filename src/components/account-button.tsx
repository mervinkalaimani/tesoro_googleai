import { isIso } from "@/lib/status";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronRight, Eye, EyeOff, Settings, Table } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UserMenu } from "@/components/user-menu";
import { useCars } from "@/lib/cars-store";
import { useAuth, fullName } from "@/lib/auth-store";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import { inrFull } from "@/lib/format";

/** "Mervin Kalaimani" -> "MK"; a single name gives one letter. */
function initialsOf(name: string, fallback: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return (fallback.trim()[0] || "?").toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The avatar in the top bar's corner. A bare face, no label: on a desktop it
 * opens the account dropdown, on a phone the menu sheet that used to hang off
 * the bottom bar.
 */
export function AccountButton() {
  return (
    <>
      <span className="hidden md:inline-flex">
        <UserMenu />
      </span>
      <span className="inline-flex md:hidden">
        <MobileAccountMenu />
      </span>
    </>
  );
}

function MobileAccountMenu() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { profile, isAdmin, isOwner, isGuest } = useAuth();
  const { hideInvestment, setHideInvestment, query } = useApp();
  const allCars = useCars();
  const [localReveal, setLocalReveal] = useState(false);

  const name = fullName(profile);
  const display = name || profile?.email_id || "Signed in";

  // ISO rows are wishlist entries, not cars owned — the same exclusion the
  // sidebar's totals make.
  const stats = useMemo(() => {
    const rows = filterRows(allCars, query).filter((r) => !isIso(r.status));
    return {
      total: rows.length,
      spent: rows.reduce((s, r) => s + (r.spent || 0), 0),
    };
  }, [allCars, query]);

  const hidden = hideInvestment && !localReveal;
  const close = () => setMenuOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-label={`Menu — signed in as ${display}`}
        aria-expanded={menuOpen}
        className="size-9 rounded-full outline-none ring-offset-background transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 shrink-0 flex items-center justify-center"
      >
        <Avatar className="size-9 border border-border">
          {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
          <AvatarFallback className="bg-muted text-xs font-semibold">
            {initialsOf(name, display)}
          </AvatarFallback>
        </Avatar>
      </button>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85svh] overflow-y-auto rounded-t-[2.5rem] border-t border-border p-4 pb-[max(2rem,calc(env(safe-area-inset-bottom)+1rem))]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>

          {/* 1. User Details */}
          <div className="flex items-center gap-3.5 rounded-2xl border border-border/80 bg-muted/40 p-3.5 shadow-xs">
            <Avatar className="size-12 border border-border shadow-xs">
              {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
              <AvatarFallback className="bg-muted text-sm font-semibold">
                {initialsOf(name, display)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">{display}</span>
                {isOwner && (
                  <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                    Owner
                  </span>
                )}
                {!isOwner && isAdmin && (
                  <span className="shrink-0 rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-medium text-sky-500">
                    Admin
                  </span>
                )}
                {isGuest && (
                  <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-500">
                    Demo
                  </span>
                )}
              </div>
              {profile?.email_id && (
                <div className="truncate text-xs text-muted-foreground">{profile.email_id}</div>
              )}
            </div>
          </div>

          {/* 2. Cars list & Cost details */}
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Link
              to="/inventory"
              onClick={close}
              className="group block rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-colors hover:bg-muted/40 active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Cars list
                </div>
                <Table className="size-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
              </div>
              <div className="text-display mt-1 text-xl font-bold tabular-nums text-foreground">
                {stats.total.toLocaleString()}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">View diecast inventory</div>
            </Link>

            <div className="rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs">
              <div className="flex items-center justify-between gap-1">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Cost details
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="-mr-1 size-6 shrink-0"
                  onClick={() => {
                    if (hideInvestment) setLocalReveal((v) => !v);
                    else setHideInvestment(true);
                  }}
                  aria-label={hidden ? "Show cost details" : "Hide cost details"}
                >
                  {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </Button>
              </div>
              <div className="text-display mt-1 truncate text-xl font-bold tabular-nums text-foreground">
                {hidden ? "••••••" : inrFull(stats.spent)}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">Total spent on cars</div>
            </div>
          </div>

          {/* 3. Settings */}
          <div className="mt-3 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
            <Link
              to="/settings"
              onClick={close}
              className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 active:bg-muted/60"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                <Settings className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">Settings</div>
                <div className="text-xs text-muted-foreground">
                  Account, display, notifications &amp; admin controls
                </div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
