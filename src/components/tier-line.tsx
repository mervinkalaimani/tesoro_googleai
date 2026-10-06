import { useAuth } from "@/lib/auth-store";
import { formatDayMonthYear } from "@/lib/format";
import { FREE_CAR_LIMIT, proStatus } from "@/lib/tiers";
import { ProChip } from "@/components/tier-avatar";

/**
 * What this account is, in one line.
 *
 * "Pro" and "Pro until the 6th" are different facts and only one of them needs
 * doing something about, so the date is said whenever there is one. A comped
 * account has none, and showing it an expiry it does not have would be
 * inventing a deadline.
 */
export function TierLine({ className }: { className?: string }) {
  const { profile } = useAuth();
  const { state } = proStatus(profile);

  if (state === "lapsed") {
    return (
      <span className={className}>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Free
        </span>
        <span className="ml-2 text-[11px] text-muted-foreground">up to {FREE_CAR_LIMIT} cars</span>
      </span>
    );
  }

  return (
    <span className={className}>
      <ProChip inline />
      {profile?.pro_until && (
        <span className="ml-2 text-[11px] text-muted-foreground">
          until {formatDayMonthYear(profile.pro_until)}
        </span>
      )}
    </span>
  );
}
