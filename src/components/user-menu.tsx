import { Link } from "@tanstack/react-router";
import { Settings, Wrench } from "lucide-react";

import { ProChip, TierAvatar } from "@/components/tier-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth, fullName } from "@/lib/auth-store";
import { planOf } from "@/lib/tiers";

/** "Mervin Kalaimani" -> "MK"; a single name gives one letter. */
function initialsOf(name: string, fallback: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return (fallback.trim()[0] || "?").toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Who is signed in, in the far corner of the top bar.
 *
 * This was the bottom of the sidebar — a place you only saw with the sidebar
 * open, and which collapsed away entirely on the icon rail. The corner is where
 * every other application on the machine puts it, so it is the first place
 * anyone looks for Settings, admin, and the way out.
 */
export function UserMenu() {
  const { profile, isAdmin } = useAuth();
  const plan = planOf(profile);

  const name = fullName(profile);
  const display = name || profile?.email_id || "Signed in";
  const secondary = profile?.user_id || profile?.email_id || "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account: ${display}`}
          title={display}
          className="size-9 rounded-full outline-none ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 shrink-0 flex items-center justify-center"
        >
          <TierAvatar
            url={profile?.avatar_url}
            initials={initialsOf(name, display)}
            className="size-9 border border-border"
            fallbackClassName="bg-muted text-xs font-semibold"
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* The name is the heading, not a menu item: it is what the avatar
            stands for, and there is nothing to do to it here. */}
        <div className="px-2 py-1.5">
          {/* The tier beside the name: this menu is the one place the account
              is named, so it is where "which account is this" belongs. */}
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{display}</span>
            {plan !== "free" ? (
              <ProChip label={plan === "plus" ? "Plus" : "Pro"} className="shrink-0" />
            ) : (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Free
              </span>
            )}
          </div>
          {secondary && secondary !== display && (
            <div className="truncate text-xs text-muted-foreground">{secondary}</div>
          )}
        </div>

        <DropdownMenuSeparator />

        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link
              to="/settings"
              search={{ tab: "advanced" }}
              className="cursor-pointer gap-2 font-medium text-primary"
            >
              <Wrench className="size-4" />
              Admin Console
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem asChild>
          <Link to="/settings" className="cursor-pointer gap-2">
            <Settings className="size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
