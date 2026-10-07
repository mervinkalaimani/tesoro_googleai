import { useAuth } from "@/lib/auth-store";
import { formatDayMonthYear } from "@/lib/format";
import { FREE_CAR_LIMIT, planOf, trialDaysLeft } from "@/lib/tiers";
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
  const plan = planOf(profile);
  const trialLeft = trialDaysLeft(profile);

  // A trial reads as Pro everywhere the locks are, and as a trial everywhere
  // the account is named: it is Pro that runs out, and the number of days is
  // the only part worth saying.
  if (trialLeft !== null && !profile?.is_pro && !profile?.is_owner) {
    return (
      <span className={className}>
        <ProChip label="Trial" />
        <span className="ml-2 text-[11px] text-muted-foreground">
          {trialLeft === 1 ? "last day" : `${trialLeft} days left`}
        </span>
      </span>
    );
  }

  if (plan === "free") {
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
      <ProChip label={plan === "plus" ? "Plus" : "Pro"} />
      {profile?.pro_until && (
        <span className="ml-2 text-[11px] text-muted-foreground">
          until {formatDayMonthYear(profile.pro_until)}
        </span>
      )}
    </span>
  );
}
