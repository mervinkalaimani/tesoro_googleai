import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Loader2, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { useCars } from "@/lib/cars-store";
import { SegmentControl } from "@/components/segment-control";
import { CarThumb } from "@/components/car-thumb";
import { StatusPill } from "@/components/status-pill";
import type { Diecast } from "@/lib/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatDayMonthYear, inrFull } from "@/lib/format";
import { isInHand } from "@/lib/status";
import { cn } from "@/lib/utils";

/**
 * The activity log, as a timeline: one card per change, grouped by day.
 *
 *   Added Ferrari 296 GTB with 8 fields                                   11:27 am
 *   You updated the Status of Ferrari 296 GTB with MKCCB/BBR/BOX/001      6:05 pm
 *
 * It reads tesoro_change_log, which the database fills by trigger, so nothing
 * here records anything. A person sees changes to their own collection; an admin
 * sees everyone's and can narrow it to their own.
 */

type Change = { from?: unknown; to?: unknown };

type Entry = {
  id: number;
  at: string;
  actor_id: string | null;
  actor_name: string | null;
  owner_id: string | null;
  source: "car" | "catalogue";
  action: "add" | "edit" | "delete";
  row_key: string;
  catalog_id: string | null;
  title: string | null;
  order_id: string | null;
  shipping_id: string | null;
  changes: Record<string, Change>;
  /** Set on an entry written afterwards from existing records, not at the time. */
  backfill?: "record" | "estimated" | null;
};

/** The generated types do not know this table, so it is read through a loose one. */
type LooseQuery = PromiseLike<{
  data: unknown;
  error: { message?: string; code?: string } | null;
}> & {
  eq: (col: string, val: string) => LooseQuery;
  or: (filter: string) => LooseQuery;
  order: (col: string, opts: { ascending: boolean }) => LooseQuery;
  range: (from: number, to: number) => LooseQuery;
};
type LooseClient = { from: (table: string) => { select: (cols: string) => LooseQuery } };
const db = () => supabase as unknown as LooseClient;

const PAGE = 50;

/** Column names as people say them. */
const LABEL: Record<string, string> = {
  O_Date: "Ordered on",
  Date: "Received on",
  "Transit Info / ETA": "Transit info",
  "Image URL": "Photo",
  image_url: "Photo",
  "Order Info": "Order info",
  car_number: "Car number",
  sub_series: "Sub series",
  release_status: "Release status",
  synced_at: "Checked on",
  synced_source: "Verified by",
  expected_date: "Expected on",
  "Car Rating": "Car rating",
  "Card Rating": "Card rating",
};

const PHOTO_KEYS = new Set(["Image URL", "image_url"]);

const MONEY = new Set(["Spent", "Paid", "MRP", "Shipping Cost", "mrp"]);

const label = (k: string) => LABEL[k] ?? k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function show(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (MONEY.has(key)) {
    const n = Number(String(v).replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(n)) return inrFull(n);
  }
  if (key === "O_Date" || key === "Date" || key === "Expected Date" || key === "expected_date") {
    return formatDayMonthYear(String(v)) || String(v);
  }
  if (key === "synced_at") return formatDayMonthYear(String(v)) || String(v);
  if (key === "Image URL" || key === "image_url") return "changed";
  return String(v);
}

/** "Nov 13", with the year only when it is not this one. */
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
};

/** One key per calendar day, so a day's cards are gathered under one heading. */
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

const clock = (iso: string) =>
  new Date(iso)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(" AM", " am")
    .replace(" PM", " pm");

const PALETTE = [
  "bg-rose-500/20 text-rose-500",
  "bg-amber-500/20 text-amber-500",
  "bg-emerald-500/20 text-emerald-500",
  "bg-sky-500/20 text-sky-500",
  "bg-violet-500/20 text-violet-500",
  "bg-fuchsia-500/20 text-fuchsia-500",
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

const tint = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

function Person({ name }: { name: string }) {
  return (
    <Avatar className="size-10">
      <AvatarFallback className={cn("text-xs font-semibold", tint(name))}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

/** The part of a sentence that is a thing, rather than the words around it. */
const Bold = ({ children }: { children: ReactNode }) => (
  <span className="font-semibold text-foreground">{children}</span>
);

export function ChangeLog({
  rowKey,
  openCar,
  origin,
}: {
  /** One car's own log: only its changes, with no filters and the car left unnamed. */
  rowKey?: string;
  /** Opens a car's full details. The log cannot import the drawer that now shows it. */
  openCar?: (car: Diecast) => void;
  /**
   * Who filed the row and when, from the row itself. The log only began when it
   * was switched on, so an entry filed before then has no "added" line of its
   * own; this stands in as the oldest one.
   */
  origin?: { name: string; at: string };
}) {
  const single = Boolean(rowKey);
  const { user, isAdmin, isOwner } = useAuth();
  const cars = useCars();
  const everyone = isAdmin || isOwner;

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  /** The entry whose fields are open in the panel. */
  const [open, setOpen] = useState<Entry | null>(null);
  /** What the panel shows for it: the change itself, or the car as it is now. */
  const [view, setView] = useState<"change" | "car">("change");

  const [source, setSource] = useState<"all" | "car" | "catalogue">("all");
  const [action, setAction] = useState<"all" | Entry["action"]>("all");
  const [scope, setScope] = useState<"mine" | "everyone">("mine");
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");

  // The search waits for a pause in typing rather than asking on every key.
  useEffect(() => {
    const t = setTimeout(() => setTerm(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const fetchPage = useCallback(
    async (from: number) => {
      let q = db().from("tesoro_change_log").select("*");
      // One car's log is found by its ID, not by whose collection or what was typed.
      if (rowKey) {
        return q
          .eq("row_key", rowKey)
          .order("at", { ascending: false })
          .range(from, from + PAGE - 1);
      }
      if (source !== "all") q = q.eq("source", source);
      if (action !== "all") q = q.eq("action", action);
      if (everyone && scope === "mine" && user?.id) q = q.eq("owner_id", user.id);
      if (term) {
        // Commas and parentheses would end the filter early.
        const t = term.replace(/[,()%]/g, " ");
        q = q.or(
          ["title", "row_key", "order_id", "shipping_id", "actor_name"]
            .map((c) => `${c}.ilike.%${t}%`)
            .join(","),
        );
      }
      return q.order("at", { ascending: false }).range(from, from + PAGE - 1);
    },
    [source, action, scope, term, everyone, user?.id, rowKey],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const { data, error: err } = await fetchPage(0);
      if (cancelled) return;
      if (err) {
        // The table not existing yet is a state, not a failure: the migration
        // has not been applied.
        const gone = err.code === "42P01" || err.code === "PGRST205";
        setMissing(gone);
        setError(gone ? null : (err.message ?? "Could not load the log."));
        setEntries([]);
        setMore(false);
      } else {
        setMissing(false);
        const rows = (data as Entry[]) ?? [];
        setEntries(rows);
        setMore(rows.length === PAGE);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const loadMore = async () => {
    setLoading(true);
    const { data } = await fetchPage(entries.length);
    const rows = (data as Entry[]) ?? [];
    setEntries((prev) => [...prev, ...rows]);
    setMore(rows.length === PAGE);
    setLoading(false);
  };

  const byId = useMemo(() => new Map(cars.map((c) => [c.id, c])), [cars]);

  // A photo change is its own line, however many other fields were saved with it.
  const separated = useMemo(
    () =>
      entries.flatMap((e): Entry[] => {
        if (e.action !== "edit") return [e];
        const all = Object.entries(e.changes ?? {});
        const photo = all.filter(([k]) => PHOTO_KEYS.has(k));
        if (photo.length === 0 || photo.length === all.length) return [e];
        return [
          { ...e, changes: Object.fromEntries(all.filter(([k]) => !PHOTO_KEYS.has(k))) },
          { ...e, id: e.id + 0.5, changes: Object.fromEntries(photo) },
        ];
      }),
    [entries],
  );

  const shownEntries = useMemo(() => {
    if (!origin?.at || more || loading || separated.some((e) => e.action === "add")) {
      return separated;
    }
    const filed: Entry = {
      id: -1,
      at: origin.at,
      actor_id: null,
      actor_name: origin.name || null,
      owner_id: null,
      source: "catalogue",
      action: "add",
      row_key: rowKey ?? "",
      catalog_id: null,
      title: null,
      order_id: null,
      shipping_id: null,
      changes: {},
    };
    return [...separated, filed];
  }, [separated, origin, more, loading, rowKey]);

  const days = useMemo(() => {
    const out: { key: string; label: string; items: Entry[] }[] = [];
    for (const e of shownEntries) {
      const k = dayKey(e.at);
      const last = out[out.length - 1];
      if (last && last.key === k) last.items.push(e);
      else out.push({ key: k, label: dayLabel(e.at), items: [e] });
    }
    return out;
  }, [shownEntries]);

  const isMe = (e: Entry) => Boolean(e.actor_id && e.actor_id === user?.id);
  // The catalogue is everybody's, so who changed an entry is named even when it
  // was you; "You" is for your own collection.
  const isYou = (e: Entry) => isMe(e) && e.source !== "catalogue";
  const whoName = (e: Entry) => {
    if (isYou(e)) return "You";
    // First name only: the full name is more than a log line needs.
    if (e.actor_name) return e.actor_name.trim().split(/\s+/)[0];
    if (isMe(e)) return "You";
    return e.actor_id ? "Someone" : "System";
  };

  /** The car's name: a way to its details when it is still in the collection. */
  const itemName = (e: Entry) => {
    const name = e.title || e.row_key;
    const car = e.source === "car" && e.action !== "delete" ? byId.get(e.row_key) : null;
    if (!car) return <Bold>{name}</Bold>;
    return (
      <button
        type="button"
        onClick={(ev) => {
          ev.stopPropagation();
          setOpen(e);
          setView("car");
        }}
        className="cursor-pointer font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline"
      >
        {name}
      </button>
    );
  };

  /** "3 fields", as words: the card is what opens them. */
  const fieldsCount = (e: Entry) => {
    const n = Object.keys(e.changes ?? {}).length;
    return (
      <Bold>
        {n} {n === 1 ? "field" : "fields"}
      </Bold>
    );
  };

  const idTag = (e: Entry) => (
    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
      {e.row_key}
    </span>
  );

  /** A car needs no label here; a catalogue entry does, to tell it from one. */
  const noun = (e: Entry) => (e.source === "car" ? "" : "catalogue entry ");

  /** The sentence for one entry. */
  const sentence = (e: Entry): ReactNode => {
    // Your own changes say what happened, not who did it: it is you, and the
    // other people are named.
    const you = isYou(e);
    const who = you ? null : <Bold>{whoName(e)}</Bold>;
    const by = who ? <> by {who}</> : null;
    const verb = (w: string) => (you ? w[0].toUpperCase() + w.slice(1) : w);
    const keys = Object.keys(e.changes ?? {});
    // Verifying writes two columns; it reads as one act.
    if (e.action === "edit" && e.changes?.synced_source !== undefined) {
      const on = Boolean(e.changes.synced_source.to);
      const act = on ? "verified" : "removed the verification of";
      return single ? (
        <>
          {on ? "Verified" : "Verification removed"}
          {by}
        </>
      ) : (
        <>
          {who} {verb(act)} {noun(e)}
          {itemName(e)}
        </>
      );
    }
    // A car's own log does not name the car: it is the page it is on. Short:
    // what happened, then by whom.
    if (single) {
      if (e.action === "add") return <>Added{by}</>;
      if (e.action === "delete") return <>Deleted{by}</>;
      return keys.length === 1 ? (
        <>
          <Bold>{label(keys[0])}</Bold> updated{by}
        </>
      ) : (
        <>
          {fieldsCount(e)} updated{by}
        </>
      );
    }
    if (e.action === "add") {
      return (
        <>
          {who} {verb("added")} {noun(e)}
          {itemName(e)}
        </>
      );
    }
    if (e.action === "delete") {
      return (
        <>
          {who} {verb("deleted")} {noun(e)}
          {itemName(e)} with {idTag(e)}
        </>
      );
    }
    if (keys.length === 1) {
      const k = keys[0];
      return (
        <>
          {who} {verb("updated")} the <Bold>{label(k)}</Bold> of {itemName(e)} with {idTag(e)}
        </>
      );
    }
    return (
      <>
        {who} {verb("updated")} {fieldsCount(e)} of {itemName(e)} with {idTag(e)}
      </>
    );
  };

  /** What a single-field update turned into, under the sentence like the status in a task log. */
  const outcome = (e: Entry) => {
    const keys = Object.keys(e.changes ?? {});
    if (e.action !== "edit" || keys.length !== 1) return null;
    const k = keys[0];
    // "changed → changed" says nothing: the sentence already names the photo.
    if (PHOTO_KEYS.has(k)) return null;
    const c = e.changes[k];
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground line-through decoration-muted-foreground/40">
          {show(k, c.from)}
        </span>
        <ArrowRight className="size-3 text-muted-foreground/60" />
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
          {show(k, c.to)}
        </span>
      </div>
    );
  };

  /** Every field of one change. */
  /** A card opens its change; the same card again closes it. */
  const toggleChange = (e: Entry) => {
    if (open?.id === e.id && view === "change") {
      setOpen(null);
    } else {
      setOpen(e);
      setView("change");
    }
  };

  /** The car as it is now, for the panel. */
  const carRows = (c: Diecast): [string, string][] => {
    const money = (n: number | undefined) => (n ? inrFull(n) : "");
    const day = (v: string | undefined) => (v ? formatDayMonthYear(v) || v : "");
    const arrived = isInHand(c.status);
    const rows: [string, string][] = [
      ["Brand", c.brand],
      ["Number", c.carNumber],
      ["Series", c.series],
      ["Sub series", c.subSeries],
      ["Assortment", c.assortment],
      ["Colour", c.colour],
      ["Type", c.type],
      ["Size", c.size],
      ["Seller", c.seller],
      ["Order ID", c.orderId],
      ["Shipping ID", c.shippingId],
      ["Ordered on", day(c.orderDate)],
      [arrived ? "Received on" : "Expected on", day(arrived ? c.date : c.expectedDate)],
      ["Courier", c.deliveryPartner ?? ""],
      ["Tracking", c.trackingId ?? ""],
      ["Paid", money(c.paid)],
      ["Cost", money(c.spent)],
      ["MRP", money(c.mrp)],
      ["Car condition", c.carCondition ?? ""],
      ["Card condition", c.cardCondition ?? ""],
    ];
    return rows.filter(([, v]) => (v || "").trim());
  };

  const fieldsPanel = (entry: Entry) => {
    // A car's own log is already on the car, so there is no "Car now" to switch to.
    const car = !single && entry.source === "car" ? byId.get(entry.row_key) : undefined;
    const showing = view === "car" && car ? "car" : "change";
    return (
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-border/60 p-4">
          <div className="min-w-0">
            {/* A car's own log is already on the car: no name or ID to repeat. */}
            {!single && (
              <h3 className="truncate text-sm font-semibold text-foreground">
                {entry.title || entry.row_key}
              </h3>
            )}
            <p
              className={cn(
                "text-xs text-muted-foreground",
                single ? "font-semibold text-foreground" : "mt-0.5",
              )}
            >
              {entry.action === "add" ? "Added" : entry.action === "delete" ? "Deleted" : "Updated"}{" "}
              {isYou(entry) ? "" : `by ${whoName(entry)} `}on{" "}
              {formatDayMonthYear(new Date(entry.at))}
              {entry.backfill === "estimated" ? " (estimated)" : ` at ${clock(entry.at)}`}
            </p>
            {!single && entry.row_key && (
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">{entry.row_key}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(null)}
            aria-label="Close"
            className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        {car && (
          <div className="border-b border-border/60 p-2.5">
            <SegmentControl
              value={showing}
              onChange={setView}
              options={[
                { value: "change", label: "This change" },
                { value: "car", label: "Car now" },
              ]}
              fill
            />
          </div>
        )}
        {showing === "car" && car ? (
          <div>
            <CarThumb car={car} className="aspect-[16/10] w-full border-b border-border/60" />
            <div className="flex items-center justify-between gap-2 px-4 pt-3">
              <StatusPill status={car.status} />
              {openCar && (
                <Button size="sm" variant="outline" onClick={() => openCar(car)}>
                  Open full details
                </Button>
              )}
            </div>
            <dl className="divide-y divide-border/60 px-4 pb-1">
              {carRows(car).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {k}
                  </dt>
                  <dd className="min-w-0 truncate text-right text-sm font-semibold text-foreground">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <dl className="divide-y divide-border/60 px-4">
            {Object.entries(entry.changes ?? {}).map(([k, c]) => (
              <div key={k} className="py-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {label(k)}
                </dt>
                <dd className="mt-1 text-sm">
                  {entry.action === "edit" ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-muted-foreground line-through decoration-muted-foreground/40">
                        {show(k, c.from)}
                      </span>
                      <ArrowRight className="size-3.5 text-muted-foreground/60" />
                      <span className="font-semibold text-foreground">{show(k, c.to)}</span>
                    </span>
                  ) : (
                    <span className="font-semibold text-foreground">
                      {show(k, entry.action === "add" ? c.to : c.from)}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {!single && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search a car, order or shipping ID, or a person"
              aria-label="Search the activity log"
              className="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <SegmentControl
            value={source}
            onChange={setSource}
            options={[
              { value: "all", label: "All" },
              { value: "car", label: "Cars" },
              { value: "catalogue", label: "Catalogue" },
            ]}
            className="w-auto"
          />
          <SegmentControl
            value={action}
            onChange={setAction}
            options={[
              { value: "all", label: "Any" },
              { value: "add", label: "Added" },
              { value: "edit", label: "Updated" },
              { value: "delete", label: "Deleted" },
            ]}
            className="w-auto"
          />
          {everyone && (
            <SegmentControl
              value={scope}
              onChange={setScope}
              options={[
                { value: "mine", label: "Mine" },
                { value: "everyone", label: "Everyone" },
              ]}
              className="w-auto"
            />
          )}
        </div>
      )}

      {missing && !single && (
        <div className="rounded-2xl border border-border/80 bg-card p-6 text-center text-sm text-muted-foreground">
          The activity log is not switched on yet. It starts recording once its database migration
          has been applied.
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
          {error}
        </div>
      )}

      {!missing && !error && !loading && shownEntries.length === 0 && (
        <div className="rounded-2xl border border-border/80 bg-card p-6 text-center text-sm text-muted-foreground">
          {single
            ? "No changes recorded for this car yet."
            : term || source !== "all" || action !== "all"
              ? "Nothing matches."
              : "No changes recorded yet. Edits made from now on will show up here."}
        </div>
      )}

      <div className={cn("gap-6", open && !single && "lg:grid lg:grid-cols-[minmax(0,1fr)_22rem]")}>
        <div className="min-w-0 space-y-5">
          {days.map((d) => (
            <section key={d.key}>
              <span className="inline-block rounded-full bg-muted px-3.5 py-1 text-sm font-medium text-muted-foreground">
                {d.label}
              </span>

              {/* The dotted rail the day's cards hang from. */}
              <ol
                className={cn("relative mt-3 pl-9 sm:pl-12", single ? "space-y-1.5" : "space-y-3")}
              >
                <span
                  aria-hidden
                  className="absolute bottom-3 left-2.5 top-0 border-l-2 border-dotted border-border"
                />
                {d.items.map((e) => (
                  <li key={e.id} className="relative">
                    <span
                      aria-hidden
                      className="absolute -left-[1.6rem] top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-border bg-background sm:-left-[2.1rem]"
                    />
                    <span
                      aria-hidden
                      className="absolute -left-[1rem] top-1/2 w-3 -translate-y-1/2 border-t-2 border-dotted border-border sm:-left-[1.5rem] sm:w-5"
                    />
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleChange(e)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          toggleChange(e);
                        }
                      }}
                      title="Show every field of this change"
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border bg-card shadow-sm transition-colors hover:border-primary/40",
                        single ? "px-3 py-2" : "p-3.5",
                        open?.id === e.id
                          ? "border-primary/60 ring-1 ring-primary/30"
                          : "border-border/60",
                      )}
                    >
                      {!isYou(e) && !single && <Person name={whoName(e)} />}
                      <div className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
                        {sentence(e)}
                        {outcome(e)}
                      </div>
                      <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                        {e.backfill === "estimated" ? (
                          <span
                            title="Added before the log existed. The day is the order or received date, as the real day was not recorded."
                            className="rounded border border-dashed border-border px-1.5 py-0.5"
                          >
                            estimated
                          </span>
                        ) : (
                          clock(e.at)
                        )}
                      </div>
                    </div>
                    {open?.id === e.id && (
                      <div className={cn("mt-2", !single && "lg:hidden")}>{fieldsPanel(e)}</div>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ))}

          {loading && (
            <div className="flex justify-center py-4 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          )}

          {more && !loading && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => void loadMore()}>
                Load older changes
              </Button>
            </div>
          )}
        </div>

        {/* Wide enough, the fields sit beside the timeline and stay in view as
            it scrolls; narrower, they open under the card that was clicked. */}
        {open && !single && (
          <aside className="hidden lg:block">
            <div className="sticky top-4">{fieldsPanel(open)}</div>
          </aside>
        )}
      </div>
    </div>
  );
}
