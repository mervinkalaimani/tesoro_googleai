/**
 * Whether VIIV Shop is switched on for this person.
 *
 * The owner sets one of three in the Admin Console, kept in `deployment_settings` so it
 * is the same on every device: off, for testing (admins, the demo account and the owner
 * only), or for everyone. Off until the owner decides.
 */
import { useAuth } from "@/lib/auth-store";
import { useShopMode } from "@/lib/deployment-settings";

/** The signed-in Viiv account's id (a demo guest counts), or null. */
export function useViivId(): string | null {
  const { user, isGuest } = useAuth();
  return user?.id ?? (isGuest ? "guest" : null);
}

/** True/false once known; null until the setting has been read, so nothing flashes. */
export function useStoreEnabled(): boolean | null {
  const { mode, loaded } = useShopMode();
  const { isAdmin, isOwner, isGuest } = useAuth();
  if (!loaded) return null;
  if (mode === "everyone") return true;
  if (mode === "testing") return isAdmin || isOwner || isGuest;
  return false;
}
