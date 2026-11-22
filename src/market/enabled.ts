/**
 * Whether VIIV Shop is switched on.
 *
 * One switch for every account: the owner sets it in the Admin Console and it is
 * stored in `deployment_settings`, so it is the same for everyone and does not
 * depend on the device. Off until the owner turns it on.
 */
import { useAuth } from "@/lib/auth-store";
import { useDeploymentFlag, VIIV_SHOP_KEY } from "@/lib/deployment-settings";

/** The signed-in Viiv account's id (a demo guest counts), or null. */
export function useViivId(): string | null {
  const { user, isGuest } = useAuth();
  return user?.id ?? (isGuest ? "guest" : null);
}

/** True/false once known; null until the setting has been read, so nothing flashes. */
export function useStoreEnabled(): boolean | null {
  const flag = useDeploymentFlag(VIIV_SHOP_KEY);
  return flag.loaded ? flag.on : null;
}
