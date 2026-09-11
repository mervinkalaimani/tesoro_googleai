import { Link } from "@tanstack/react-router";
import { LogOut, Settings, ShieldCheck } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth, fullName } from "@/lib/auth-store";

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
  const { profile, isAdmin, isGuest, signOut } = useAuth();

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
          className="ml-0.5 rounded-full outline-none ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Avatar className="size-8 border border-border">
            {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
            <AvatarFallback className="bg-muted text-xs font-semibold">
              {initialsOf(name, display)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* The name is the heading, not a menu item: it is what the avatar
            stands for, and there is nothing to do to it here. */}
        <div className="px-2 py-1.5">
          <div className="truncate text-sm font-medium">{display}</div>
          {secondary && secondary !== display && (
            <div className="truncate text-xs text-muted-foreground">{secondary}</div>
          )}
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link to="/settings" className="cursor-pointer gap-2">
            <Settings className="size-4" />
            Settings
          </Link>
        </DropdownMenuItem>

        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link to="/admin" className="cursor-pointer gap-2">
              <ShieldCheck className="size-4" />
              Admin
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={() => void signOut()}
          className="cursor-pointer gap-2 text-rose-500 focus:bg-rose-500/10 focus:text-rose-400"
        >
          <LogOut className="size-4" />
          {isGuest ? "Leave demo" : "Logout"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
