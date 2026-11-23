import { ProChip, TierAvatar } from "@/components/tier-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PersonaPicker } from "@/components/persona-picker";
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
export function UserMenu({ sidebar = false }: { sidebar?: boolean }) {
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
          className={
            sidebar
              ? // The foot of the sidebar: the face and the name when open, the face alone on the rail.
                "flex h-11 w-full items-center gap-2.5 overflow-hidden rounded-md px-1.5 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:!px-0"
              : "size-9 rounded-full outline-none ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 shrink-0 flex items-center justify-center"
          }
        >
          <TierAvatar
            url={profile?.avatar_url}
            initials={initialsOf(name, display)}
            className="size-9 shrink-0 border border-border"
            fallbackClassName="bg-muted text-xs font-semibold"
          />
          {sidebar && (
            <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-sm font-medium transition-[opacity,width] duration-200 group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:opacity-0">
              <span className="block truncate">{display}</span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side={sidebar ? "top" : "bottom"}
        align={sidebar ? "start" : "end"}
        className="w-56"
      >
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
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Free
              </span>
            )}
          </div>
          {secondary && secondary !== display && (
            <div className="truncate text-xs text-muted-foreground">{secondary}</div>
          )}
        </div>

        <DropdownMenuSeparator />
        <PersonaPicker className="px-2 pb-1.5" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
