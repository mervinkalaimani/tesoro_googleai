import { AlertTriangle, Clock } from "lucide-react";

import { openProDialog } from "@/components/pro-dialog";

import { useAuth } from "@/lib/auth-store";
import { useCars } from "@/lib/cars-store";
import { formatDayMonthYear } from "@/lib/format";
import {
  FREE_CAR_LIMIT,
  TRIAL_REMIND_DAYS,
  proStatus,
  trialDaysLeft,
  trimWarning,
} from "@/lib/tiers";

/**
 * The two things a subscription has to say out loud.
 *
 * One is that it is about to end. The other is that a collection is over the
 * free limit and some of it will be put away — and that one is not dismissible,
 * because it is about somebody's cars. A notice you can click away is a notice
 * that was clicked away on the day it mattered.
 *
 * Both read the profile already in context and the rows already loaded. No
 * fetch, and nothing here decides anything: the database sets the clock and
 * does the trimming, this only reads the date off it.
 */
export function TierBanner() {
  const { profile, isGuest } = useAuth();
  const cars = useCars();

  // A demo has no subscription to warn about.
  if (isGuest || !profile) return null;

  const trim = trimWarning(profile.over_limit_since, cars.length);
  if (trim) {
    return (
      <Bar tone="loud" icon={<AlertTriangle className="size-4 shrink-0" />}>
        <strong className="font-semibold">
          {trim.goes} car{trim.goes === 1 ? "" : "s"} will be put away
        </strong>{" "}
        on {formatDayMonthYear(trim.on)}
        {trim.daysLeft > 0 && ` — ${trim.daysLeft} day${trim.daysLeft === 1 ? "" : "s"} from now`}.
        A free account keeps {FREE_CAR_LIMIT}; the oldest {FREE_CAR_LIMIT} stay. Nothing is deleted,
        and every car comes back the moment this account is on Pro.
      </Bar>
    );
  }

  // The last days of a trial, and only those: a fortnight of being told the
  // fortnight is running is a fortnight of being told nothing.
  const trialLeft = trialDaysLeft(profile);
  if (trialLeft !== null && trialLeft <= TRIAL_REMIND_DAYS && !profile.is_pro) {
    return (
      <Bar tone="loud" icon={<AlertTriangle className="size-4 shrink-0" />}>
        <strong className="font-semibold">
          Your trial ends {trialLeft === 1 ? "today" : `in ${trialLeft} days`}
        </strong>{" "}
        — after that, Favourites, Collection, Duplicates, Habit, Sellers, My Orders, Pre Orders and
        the card scanner lock. Your cars are not affected: a trial keeps the same {FREE_CAR_LIMIT}
        -car limit, so there is nothing above the line to lose.{" "}
        <button
          type="button"
          onClick={() => openProDialog("Your trial is ending — pick a plan to keep everything")}
          className="font-semibold underline underline-offset-2"
        >
          Pick a plan
        </button>
        .
      </Bar>
    );
  }

  const { state, daysLeft } = proStatus(profile);
  if (state !== "expiring") return null;
  return (
    <Bar tone="quiet" icon={<Clock className="size-4 shrink-0" />}>
      <strong className="font-semibold">
        Pro ends {daysLeft === 0 ? "today" : `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
      </strong>{" "}
      — {formatDayMonthYear(profile.pro_until)}. After that, Favourites, Collection, Duplicates,
      Habit, Sellers and My Orders lock, and the collection is capped at {FREE_CAR_LIMIT} cars.
    </Bar>
  );
}

function Bar({
  tone,
  icon,
  children,
}: {
  tone: "quiet" | "loud";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "loud" ? "alert" : "status"}
      className={
        tone === "loud"
          ? "flex items-start gap-2.5 border-b border-amber-500/50 bg-amber-500/15 px-4 py-2.5 text-[13px] leading-snug text-foreground"
          : "flex items-start gap-2.5 border-b border-border/60 bg-muted/50 px-4 py-2 text-[13px] leading-snug text-muted-foreground"
      }
    >
      <span className={tone === "loud" ? "mt-0.5 text-amber-600 dark:text-amber-400" : "mt-0.5"}>
        {icon}
      </span>
      <p className="min-w-0">{children}</p>
    </div>
  );
}
