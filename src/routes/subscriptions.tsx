import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Loader2, RefreshCw, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { formatDayMonthYear } from "@/lib/format";
import {
  TRIM_GRACE_DAYS,
  ceilingFor,
  paidPlanOf,
  planOf,
  trialDaysLeft,
  trialLastDay,
  type PaidPlan,
  type Plan,
} from "@/lib/tiers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { KpiBand, KpiTile } from "@/components/kpi";
import { SegmentControl } from "@/components/segment-control";
import { cn } from "@/lib/utils";

/**
 * Who is paying, for what, and until when.
 *
 * Split out of the Users screen, which had grown a column for the plan, one for
 * the end date, one for what somebody had asked for, and two buttons — on a
 * table already eight columns wide and about something else. Users answers "may
 * this person sign in"; this answers "what have they got", which is every
 * question about a plan including turning one off.
 */

export const Route = createFileRoute("/subscriptions")({
  component: SubscriptionsPage,
});

type Row = {
  sno: number;
  auth_uid: string | null;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email_id: string;
  is_owner: boolean;
  is_pro: boolean;
  pro_plan: string | null;
  pro_months: number | null;
  pro_since: string | null;
  pro_until: string | null;
  trial_started_on: string | null;
  pro_requested_at: string | null;
  pro_requested_plan: string | null;
  pro_requested_term: string | null;
  car_count: number;
};

const MONTH_CHOICES = [1, 3, 6, 12] as const;

/**
 * No end date at all.
 *
 * Not a very large number of months: a plan with no *start* date is the comped
 * account the model already has — tesoro_plan() skips the expiry check when
 * pro_since is null — so forever is the absence of a date rather than a date
 * far away. A date far away is a date that eventually arrives.
 */
const FOREVER = "forever" as const;
type Length = number | typeof FOREVER;

const TERM_MONTHS: Record<string, number> = { month: 1, half: 6, year: 12 };

/**
 * A plan that has ended but is still inside the fortnight before the sweep
 * trims anything.
 *
 * Renewing is the whole point of the window, so the row stays on this screen
 * and the button stays live until it closes. After that the account is simply
 * free and belongs with everybody else: a list of subscriptions that keeps
 * every subscription that ever ended is an archive, not a worklist.
 */
function inGracePeriod(u: Row): boolean {
  if (!u.pro_since || !u.pro_until) return false;
  const left = daysLeft(u.pro_until);
  return left !== null && left < 0 && -left <= TRIM_GRACE_DAYS;
}

const nameOf = (u: Row) =>
  [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email_id;

/** Days from today to a date, counting calendar days. */
function daysLeft(until: string | null): number | null {
  if (!until) return null;
  const [y, m, d] = until.split("-").map(Number);
  if (!y || !m || !d) return null;
  const end = new Date(y, m - 1, d);
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end.getTime() - a.getTime()) / 86400000);
}

function SubscriptionsPage() {
  const { isAdmin, status } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busySno, setBusySno] = useState<number | null>(null);
  const [segment, setSegment] = useState<"paying" | "asked" | "all">("paying");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("admin_list_users");
    setLoading(false);
    if (error) {
      toast.error("Could not load accounts", { description: error.message });
      return;
    }
    setRows((data ?? []) as Row[]);
  }, []);

  useEffect(() => {
    if (status === "ready" && isAdmin) void load();
  }, [status, isAdmin, load]);

  const planNow = (u: Row): Plan => planOf(u);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((u) => {
      if (segment === "paying" && planNow(u) === "free" && !inGracePeriod(u)) return false;
      if (segment === "asked" && !u.pro_requested_at) return false;
      if (!q) return true;
      return `${nameOf(u)} ${u.email_id} ${u.user_id ?? ""}`.toLowerCase().includes(q);
    });
  }, [rows, segment, query]);

  const paying = rows.filter((u) => planNow(u) !== "free" && !u.is_owner).length;
  const waiting = rows.filter((u) => u.pro_requested_at).length;
  const expiring = rows.filter((u) => {
    const d = daysLeft(u.pro_until);
    return planNow(u) !== "free" && d !== null && d >= 0 && d <= 7;
  }).length;

  /**
   * Sets the plan and how long it runs for, in one write.
   *
   * The start date comes with them: a subscription granted today that runs six
   * months ends in six months, and pro_until is the database's arithmetic on
   * those two rather than a date anybody types.
   */
  const grant = useCallback(
    async (u: Row, plan: PaidPlan, length: Length) => {
      const forever = length === FOREVER;
      setBusySno(u.sno);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("tesoro_users")
        .update({
          is_pro: true,
          pro_plan: plan,
          // pro_months is left as it was when there is no date for it to count
          // from: it is the length of a run, and forever has none.
          ...(forever ? {} : { pro_months: length }),
          pro_since: forever ? null : u.pro_since || new Date().toISOString().slice(0, 10),
          // Granting answers the ask.
          pro_requested_at: null,
          pro_requested_plan: null,
          pro_requested_term: null,
        })
        .eq("sno", u.sno);
      setBusySno(null);
      if (error) {
        toast.error("Could not change the plan", { description: error.message });
        return;
      }
      const name = plan === "plus" ? "Plus" : "Pro";
      toast.success(
        forever ? `${name}, no end date` : `${name} for ${length} month${length === 1 ? "" : "s"}`,
        { description: u.email_id },
      );
      void load();
    },
    [load],
  );

  /**
   * Back to free.
   *
   * is_pro alone is turned off: pro_plan, pro_since and pro_months are left
   * exactly as they were, so putting somebody back on is one press rather than
   * a re-entry of everything they used to have, and the account page can still
   * say what they last held.
   */
  const removePlan = useCallback(
    async (u: Row) => {
      setBusySno(u.sno);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("tesoro_users")
        .update({ is_pro: false })
        .eq("sno", u.sno);
      setBusySno(null);
      if (error) {
        toast.error("Could not remove the plan", { description: error.message });
        return;
      }
      toast.success("Back to free", { description: u.email_id });
      void load();
    },
    [load],
  );

  /** Starts the run again from today, keeping the plan and the length. */
  const renew = useCallback(
    async (u: Row) => {
      const plan = (u.pro_plan === "plus" ? "plus" : "pro") as PaidPlan;
      setBusySno(u.sno);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("tesoro_users")
        .update({
          is_pro: true,
          pro_plan: plan,
          pro_since: new Date().toISOString().slice(0, 10),
        })
        .eq("sno", u.sno);
      setBusySno(null);
      if (error) {
        toast.error("Could not renew", { description: error.message });
        return;
      }
      toast.success("Renewed from today", { description: u.email_id });
      void load();
    },
    [load],
  );

  if (status !== "ready") {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-display text-xl font-semibold tracking-tight">Admins only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This screen is about everybody&rsquo;s subscriptions, so it is not yours to open.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-3 py-4 md:px-6">
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <Link
          to="/settings"
          className="inline-flex items-center gap-1 rounded-lg py-1 pr-2 text-[15px] font-medium text-primary transition-opacity hover:opacity-75"
        >
          <ChevronLeft className="-ml-1 size-5" />
          <span>Settings</span>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight md:text-xl">Subscriptions</h1>
        <div className="w-16" aria-hidden />
      </div>

      <KpiBand>
        <KpiTile
          label="Paying"
          value={paying.toLocaleString()}
          sub="Plus and Pro, not counting the owner"
          icon={<Sparkles className="size-4" />}
        />
        <KpiTile
          label="Waiting"
          value={waiting.toLocaleString()}
          sub={waiting ? "Asked and not yet granted" : "Nobody waiting"}
          icon={<Users className="size-4" />}
          tone="amber"
          valueTone={waiting ? "amber" : undefined}
        />
        <KpiTile
          label="Ending soon"
          value={expiring.toLocaleString()}
          sub="Within a week"
          icon={<RefreshCw className="size-4" />}
          tone="sky"
        />
      </KpiBand>

      <div className="flex flex-wrap items-center gap-2">
        <SegmentControl
          value={segment}
          onChange={(v) => setSegment(v as typeof segment)}
          options={[
            { value: "paying", label: `Paying (${paying})` },
            { value: "asked", label: `Asked (${waiting})` },
            { value: "all", label: `Everyone (${rows.length})` },
          ]}
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or email"
          className="h-9 max-w-xs bg-muted/30 text-xs"
        />
        <Button variant="outline" size="sm" onClick={() => void load()} className="ml-auto gap-1.5">
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          Reload
        </Button>
      </div>

      {loading ? (
        <Loader2 className="mx-auto my-16 size-5 animate-spin text-muted-foreground" />
      ) : shown.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {segment === "paying"
            ? "Nobody is on a paid plan yet."
            : segment === "asked"
              ? "Nobody has asked."
              : "No accounts match."}
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((u) => (
            <SubscriptionRow
              key={u.sno}
              user={u}
              plan={planNow(u)}
              busy={busySno === u.sno}
              onGrant={(plan, length) => void grant(u, plan, length)}
              onRenew={() => void renew(u)}
              onRemove={() => void removePlan(u)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SubscriptionRow({
  user: u,
  plan,
  busy,
  onGrant,
  onRenew,
  onRemove,
}: {
  user: Row;
  plan: Plan;
  busy: boolean;
  onGrant: (plan: PaidPlan, length: Length) => void;
  onRenew: () => void;
  onRemove: () => void;
}) {
  // A trial is Pro for a fortnight and nobody paid for it, so it is said as
  // itself here: an admin reading "Pro, ends never" about a trial would be
  // reading the wrong thing about the one row that is about to change.
  const trialLeft = u.is_pro || u.is_owner ? null : trialDaysLeft(u);
  const trialEnd = trialLastDay(u);
  const left = trialLeft ?? daysLeft(u.pro_until);
  const ceiling = ceilingFor(paidPlanOf(u));
  const noEnd = trialLeft === null && plan !== "free" && !u.pro_since;
  const grace = inGracePeriod(u);
  // The control shows what they are on, free included: taking somebody off a
  // plan is the same kind of act as putting them on one, and hiding it behind
  // its own icon made the way back the only unlabelled thing on the row.
  const planValue: Plan = plan;
  const lengthValue: string = noEnd ? FOREVER : String(u.pro_months ?? 1);
  const wanted = u.pro_requested_plan === "plus" ? "plus" : "pro";
  const wantedMonths = TERM_MONTHS[u.pro_requested_term ?? "month"] ?? 1;

  return (
    <div className="card-elevated px-3 py-2">
      {/* One line: who, what they are on, and what that means. The controls
          sit at the end of it rather than under it — a list of subscriptions
          is read down the left and acted on at the right. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-[2]">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold">{nameOf(u)}</span>
            {u.is_owner && (
              <Badge variant="outline" className="shrink-0 border-border text-muted-foreground">
                Owner
              </Badge>
            )}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">{u.email_id}</div>
        </div>

        {/* A grid rather than a row of whatever width each value happens to
            be: these are read down the list as much as across one, and the
            plan is the first thing the eye goes to, so it is a column too. */}
        <div className="grid shrink-0 grid-cols-[3.5rem_6.5rem_7rem_5.5rem] items-center text-[11px]">
          <Badge
            className={cn(
              "w-fit",
              trialLeft !== null
                ? "bg-amber-500/15 text-amber-600 hover:bg-amber-500/15 dark:text-amber-400"
                : plan === "pro"
                  ? ""
                  : plan === "plus"
                    ? "bg-sky-500/15 text-sky-600 hover:bg-sky-500/15 dark:text-sky-400"
                    : "bg-muted text-muted-foreground hover:bg-muted",
            )}
          >
            {trialLeft !== null
              ? "Trial"
              : plan === "free"
                ? "Free"
                : plan === "plus"
                  ? "Plus"
                  : "Pro"}
          </Badge>
          <Fact label="Cars">
            {u.car_count.toLocaleString()}
            {ceiling !== null && (
              <span className="text-muted-foreground"> / {ceiling.toLocaleString()}</span>
            )}
          </Fact>
          <Fact label="Ends">
            {trialEnd && trialLeft !== null
              ? formatDayMonthYear(trialEnd)
              : noEnd
                ? "never"
                : u.pro_until
                  ? formatDayMonthYear(u.pro_until)
                  : "—"}
          </Fact>
          <Fact label="Left">
            {left === null ? (
              plan === "free" ? (
                "—"
              ) : (
                "∞"
              )
            ) : (
              <span
                className={cn(
                  left < 0 && "text-muted-foreground",
                  left >= 0 && left <= 7 && "text-amber-600 dark:text-amber-400",
                )}
              >
                {left < 0 ? `ended ${-left}d ago` : `${left}d`}
              </span>
            )}
          </Fact>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Which plan, then how long. Changing either grants it: there is no
              Apply, because a half-set subscription is not a thing to leave
              lying around. */}
          <SegmentControl<Plan>
            value={planValue}
            disabled={busy || u.is_owner}
            onChange={(p) =>
              p === "free" ? onRemove() : onGrant(p, noEnd ? FOREVER : (u.pro_months ?? 1))
            }
            className="h-7"
            options={[
              { value: "free", label: "Free" },
              { value: "plus", label: "Plus" },
              { value: "pro", label: "Pro" },
            ]}
          />
          {/* Nothing to be the length of while they are on free. */}
          <SegmentControl<string>
            value={lengthValue}
            disabled={busy || plan === "free"}
            onChange={(v) => onGrant(planValue as PaidPlan, v === FOREVER ? FOREVER : Number(v))}
            className="h-7"
            options={[
              ...MONTH_CHOICES.map((m) => ({ value: String(m), label: `${m}m` })),
              { value: FOREVER, label: "Forever" },
            ]}
          />
          {/* Always drawn, so the row does not change width when a plan has
              no run to restart. Forever has no end to move and free has no
              plan, so both are present and dead rather than missing. */}
          <Button
            variant="ghost"
            size="icon"
            disabled={busy || !u.pro_since || (plan === "free" && !grace)}
            onClick={onRenew}
            className="size-7 shrink-0"
            aria-label={`Renew ${nameOf(u)} from today`}
            title={
              !u.pro_since
                ? "No end date to move"
                : plan === "free" && !grace
                  ? "Ended more than " + TRIM_GRACE_DAYS + " days ago"
                  : "Start the run again from today, keeping the plan and length"
            }
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* What they asked for, so granting it is one press rather than a
          reading exercise. */}
      {u.pro_requested_at && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-2.5 py-1.5">
          <Sparkles className="size-3.5 shrink-0 text-primary" />
          <span className="text-[11px] font-medium">
            Asked for {wanted === "plus" ? "Plus" : "Pro"}, {wantedMonths} month
            {wantedMonths === 1 ? "" : "s"}
          </span>
          <Button
            size="sm"
            disabled={busy}
            className="ml-auto h-6 px-2.5 text-[11px]"
            onClick={() => onGrant(wanted as PaidPlan, wantedMonths)}
          >
            Grant it
          </Button>
        </div>
      )}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-muted-foreground">{label} </span>
      <span className="font-medium">{children}</span>
    </span>
  );
}
