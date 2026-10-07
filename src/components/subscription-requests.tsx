import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BellRing, ChevronRight, RefreshCw, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { timeAgo } from "@/lib/format";
import { monthsFromTerm } from "@/lib/tiers";
import { cn } from "@/lib/utils";

/**
 * Who is waiting on an answer about a plan, on the page an admin opens first.
 *
 * There is a push notification for this already, and push is the wrong thing
 * to rely on alone: it needs VAPID keys and the service-role key on the
 * deployment, a subscription registered on the admin's own device, and a
 * browser that was willing to show it. Any of those missing and the request is
 * recorded perfectly and nobody hears about it — which is exactly what
 * happened.
 *
 * So this reads the table. It cannot fail quietly: if somebody has asked, the
 * row is here, and it stays here until an admin acts on it.
 */

type Row = {
  sno: number;
  first_name: string | null;
  last_name: string | null;
  email_id: string;
  pro_requested_at: string | null;
  pro_requested_plan: string | null;
  pro_requested_term: string | null;
  cancel_requested_at: string | null;
  pro_plan: string | null;
  pro_until: string | null;
};

/** Checked on a timer as well as on arrival, so a page left open does not go stale. */
const REFRESH_MS = 120_000;

function nameOf(u: Row): string {
  const n = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return n || u.email_id;
}

export function SubscriptionRequests() {
  const { isAdmin, isGuest } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("admin_list_users");
    setLoading(false);
    // Silent on failure: this is a panel on somebody else's dashboard, and a
    // toast about an admin list is noise to everybody who is not an admin.
    if (error) return;
    const all = (data ?? []) as Row[];
    setRows(all.filter((u) => u.pro_requested_at || u.cancel_requested_at));
  }, []);

  useEffect(() => {
    if (!isAdmin || isGuest) return;
    void load();
    // A dashboard is left open for hours. Refreshed on a timer and whenever
    // the tab comes back, which is when somebody is about to read it.
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [isAdmin, isGuest, load]);

  if (!isAdmin || isGuest || rows.length === 0) return null;

  const asking = rows.filter((u) => u.pro_requested_at);
  const leaving = rows.filter((u) => u.cancel_requested_at);

  return (
    <section className="card-elevated p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-display text-lg font-semibold">Subscription requests</h2>
        <Badge className="shrink-0">{rows.length.toLocaleString()} waiting</Badge>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto size-7 text-muted-foreground"
          onClick={() => void load()}
          aria-label="Check again"
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
        </Button>
        <Link
          to="/subscriptions"
          className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-primary hover:underline"
        >
          Subscriptions
          <ChevronRight className="size-3.5" />
        </Link>
      </div>

      <div className="mt-3 space-y-1.5">
        {asking.map((u) => {
          const plan = u.pro_requested_plan === "plus" ? "Plus" : "Pro";
          const months = monthsFromTerm(u.pro_requested_term);
          return (
            <Row key={`ask-${u.sno}`} tone="ask" icon={<BellRing className="size-3.5" />}>
              <strong className="font-semibold">{nameOf(u)}</strong> wants{" "}
              <strong className="font-semibold">{plan}</strong> for {months} month
              {months === 1 ? "" : "s"}
              <span className="text-muted-foreground"> · {u.email_id}</span>
              {u.pro_requested_at && (
                <span className="text-muted-foreground">
                  {" "}
                  · {timeAgo(new Date(u.pro_requested_at))}
                </span>
              )}
            </Row>
          );
        })}

        {leaving.map((u) => (
          <Row key={`go-${u.sno}`} tone="leave" icon={<XCircle className="size-3.5" />}>
            <strong className="font-semibold">{nameOf(u)}</strong> is not renewing
            {u.pro_plan && <> their {u.pro_plan === "plus" ? "Plus" : "Pro"} plan</>}
            <span className="text-muted-foreground"> · {u.email_id}</span>
            {u.cancel_requested_at && (
              <span className="text-muted-foreground">
                {" "}
                · {timeAgo(new Date(u.cancel_requested_at))}
              </span>
            )}
          </Row>
        ))}
      </div>
    </section>
  );
}

function Row({
  tone,
  icon,
  children,
}: {
  tone: "ask" | "leave";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      to="/subscriptions"
      className={cn(
        "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[13px] leading-snug transition-colors",
        tone === "ask"
          ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
          : "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10",
      )}
    >
      <span
        className={cn(
          "mt-0.5 shrink-0",
          tone === "ask" ? "text-primary" : "text-amber-600 dark:text-amber-400",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">{children}</span>
    </Link>
  );
}
