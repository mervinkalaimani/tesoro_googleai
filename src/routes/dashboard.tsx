import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Loader2,
  RefreshCw,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { planOf, trialDaysLeft, type PaidPlan, type Plan } from "@/lib/tiers";
import { Button } from "@/components/ui/button";
import { KpiBand, KpiTile } from "@/components/kpi";
import { SubscriptionRequests } from "@/components/subscription-requests";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

/**
 * Who is here, what they are on, and who is waiting.
 *
 * Everything on this page comes out of one call — admin_list_users, the same
 * one the Users and Subscriptions screens make — because every number here is
 * a count of those rows. A second endpoint returning pre-counted totals would
 * be a second answer to "how many people are on Pro", and the two would
 * disagree the first time a tier rule changed.
 */
type Row = {
  sno: number;
  email_id: string;
  first_name: string;
  last_name: string | null;
  user_id: string | null;
  is_admin: boolean;
  is_owner: boolean;
  is_approved: boolean;
  is_pro: boolean;
  pro_plan: string | null;
  pro_months: number | null;
  pro_since: string | null;
  pro_until: string | null;
  pro_requested_at: string | null;
  pro_requested_plan: string | null;
  trial_started_on: string | null;
  rejected_at: string | null;
  created_at: string;
};

/**
 * The length a subscription was bought for, as something to group by.
 *
 * pro_since null is the comped case -- a plan an admin switched on with no
 * end date -- and it is kept apart from the bought ones rather than counted
 * as a very long year.
 */
function termKey(u: { pro_months: number | null; pro_since: string | null }): string {
  if (!u.pro_since) return "none";
  const m = Number(u.pro_months);
  return Number.isFinite(m) && m > 0 ? String(m) : "1";
}

/** Monthly, half-yearly and yearly have names; anything else says its months. */
function termLabel(key: string): string {
  if (key === "none") return "No end date";
  if (key === "1") return "Monthly";
  if (key === "6") return "6 months";
  if (key === "12") return "Yearly";
  return `${key} months`;
}

/** Shortest first, with the open-ended ones last. */
function termOrder(a: string, b: string): number {
  if (a === "none") return 1;
  if (b === "none") return -1;
  return Number(a) - Number(b);
}

/** Thirty seconds. Long enough not to hammer, short enough to call it live. */
const REFRESH_MS = 30_000;

function daysAgo(n: number): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.getTime();
}

function joinedSince(rows: Row[], since: number): number {
  return rows.filter((u) => {
    const t = Date.parse(u.created_at);
    return Number.isFinite(t) && t >= since;
  }).length;
}

function DashboardPage() {
  const { isAdmin, status } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [at, setAt] = useState<Date | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("admin_list_users");
    setLoading(false);
    if (error) {
      // A failed background refresh says nothing: the numbers on screen are
      // still the last good ones, and a toast every thirty seconds would be
      // the loudest thing in the app.
      if (!quiet) toast.error("Could not load the numbers", { description: error.message });
      return;
    }
    setRows((data ?? []) as Row[]);
    setAt(new Date());
  }, []);

  useEffect(() => {
    if (status !== "ready" || !isAdmin) return;
    void load();
    // Paused while the tab is in the background: nobody is reading it, and a
    // phone left on this screen overnight would make 2,880 calls by morning.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, REFRESH_MS);
    const onShow = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [status, isAdmin, load]);

  const stats = useMemo(() => {
    const tiers: Record<Plan, number> = { free: 0, plus: 0, pro: 0 };
    // How long each paid plan was bought for. A subscription is a plan and a
    // length, and the length is the half that says when the money comes back
    // round -- six people on Pro monthly and six on Pro yearly are the same
    // number and a different business.
    const terms: Record<PaidPlan, Record<string, number>> = { plus: {}, pro: {} };
    let trials = 0;
    let paying = 0;
    for (const u of rows) {
      const plan = planOf(u);
      tiers[plan] += 1;
      const onTrial = !u.is_pro && !u.is_owner && trialDaysLeft(u) !== null;
      if (onTrial) trials += 1;
      else if (plan !== "free" && !u.is_owner) {
        paying += 1;
        const key = termKey(u);
        terms[plan][key] = (terms[plan][key] ?? 0) + 1;
      }
    }
    return {
      total: rows.length,
      tiers,
      terms,
      trials,
      paying,
      today: joinedSince(rows, daysAgo(0)),
      week: joinedSince(rows, daysAgo(7)),
      month: joinedSince(rows, daysAgo(30)),
      asked: rows.filter((u) => u.pro_requested_at).length,
      pending: rows.filter((u) => !u.is_approved && !u.is_owner && !u.rejected_at).length,
      admins: rows.filter((u) => u.is_admin || u.is_owner).length,
    };
  }, [rows]);

  if (status !== "ready") return null;

  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
            <ShieldAlert className="size-6" />
          </div>
          <h1 className="text-display mt-5 text-xl font-semibold tracking-tight">Admins only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This screen is about everybody's accounts, so it is not yours to open.
          </p>
        </div>
      </div>
    );
  }

  // Trial on its own, not folded into Pro. It opens the same sections, which
  // is why planOf() calls it Pro -- but this bar is about who is paying, and
  // a fortnight that ends on its own is not the same fact as a subscription.
  const bars: { label: string; n: number; className: string }[] = [
    { label: "Pro", n: stats.tiers.pro - stats.trials, className: "bg-primary" },
    { label: "Plus", n: stats.tiers.plus, className: "bg-violet-500" },
    { label: "Trial", n: stats.trials, className: "bg-amber-500" },
    { label: "Free", n: stats.tiers.free, className: "bg-muted-foreground/40" },
  ];

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-3 md:p-6">
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <h1 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">
          Admin Dashboard
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground max-sm:hidden">
            {at ? `Read at ${at.toLocaleTimeString()}` : "Reading…"}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            aria-label="Reload"
            title="Reload"
          >
            <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
          </Button>
        </div>
      </div>

      <KpiBand>
        <KpiTile
          label="Accounts"
          value={stats.total.toLocaleString()}
          sub="Everyone who has signed up"
          icon={<Users className="size-4" />}
        />
        <KpiTile
          label="Joined this week"
          value={stats.week.toLocaleString()}
          sub={`${stats.today} today · ${stats.month} in 30 days`}
          icon={<UserPlus className="size-4" />}
          tone="emerald"
          valueTone={stats.week ? "emerald" : undefined}
        />
        <KpiTile
          label="Paying"
          value={stats.paying.toLocaleString()}
          sub="Plus and Pro, not counting the owner"
          icon={<Sparkles className="size-4" />}
          tone="violet"
        />
        <KpiTile
          label="On trial"
          value={stats.trials.toLocaleString()}
          sub={stats.trials ? "Deciding right now" : "Nobody mid-trial"}
          icon={<Rocket className="size-4" />}
          tone="amber"
          valueTone={stats.trials ? "amber" : undefined}
        />
        <KpiTile
          label="Asked to upgrade"
          value={stats.asked.toLocaleString()}
          sub={stats.asked ? "Waiting on an admin" : "Nothing outstanding"}
          icon={<BellRing className="size-4" />}
          tone="amber"
          valueTone={stats.asked ? "amber" : undefined}
        />
        <KpiTile
          label="Awaiting approval"
          value={stats.pending.toLocaleString()}
          sub={stats.pending ? "New sign-ups to let in" : "Nobody waiting"}
          icon={<UserCheck className="size-4" />}
          tone="sky"
          valueTone={stats.pending ? "sky" : undefined}
        />
        <KpiTile
          label="Admins"
          value={stats.admins.toLocaleString()}
          sub="Including the owner"
          icon={<ShieldCheck className="size-4" />}
          tone="sky"
        />
      </KpiBand>

      {/* One bar rather than three numbers: the question a tier split answers
          is what the shape is, and a shape is not read off a list. */}
      <section className="card-elevated space-y-3 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Who is on what
          </h2>
          <span className="text-[11px] text-muted-foreground">
            {stats.total} account{stats.total === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
          {bars.map((b) =>
            b.n === 0 ? null : (
              <span
                key={b.label}
                className={cn("h-full", b.className)}
                style={{ width: `${(b.n / Math.max(1, stats.total)) * 100}%` }}
                title={`${b.label}: ${b.n}`}
              />
            ),
          )}
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {bars.map((b) => (
            <div key={b.label} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
              <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <span className={cn("size-2 rounded-full", b.className)} />
                {b.label}
              </dt>
              <dd className="mt-0.5 text-lg font-bold tracking-tight">{b.n}</dd>
            </div>
          ))}
        </dl>

        {/* And for the two that are bought, how long for. Drawn under the
            split rather than beside it: the first question is who is on what,
            and this is the second one. */}
        {(["pro", "plus"] as PaidPlan[]).map((plan) => {
          const entries = Object.entries(stats.terms[plan]).sort(([a], [b]) => termOrder(a, b));
          if (entries.length === 0) return null;
          return (
            <div key={plan} className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    plan === "pro" ? "bg-primary" : "bg-violet-500",
                  )}
                />
                {plan === "pro" ? "Pro" : "Plus"} by length
              </div>
              <div className="flex flex-wrap gap-1.5">
                {entries.map(([key, n]) => (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1 text-[11px]"
                  >
                    <span className="text-muted-foreground">{termLabel(key)}</span>
                    <span className="font-semibold tabular-nums">{n}</span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* The requests themselves, with the buttons that answer them. Lifted
          off the home page: an admin opening their own collection was being
          shown other people's billing, and the one screen that is about
          everybody else is this one. */}
      <SubscriptionRequests />
    </div>
  );
}
