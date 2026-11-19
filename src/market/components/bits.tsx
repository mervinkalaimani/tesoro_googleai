import { Link } from "@tanstack/react-router";
import { AlertCircle, BadgeCheck, Clock, ShieldQuestion } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { discountPct, ORDER_LABEL, rupees } from "../format";
import type { CatalogueItem, OrderStatus, Verification } from "../types";

const HEX: Record<string, string> = {
  red: "#d93a2f",
  white: "#e9e9ee",
  blue: "#2f6fd9",
  black: "#2b2b30",
  green: "#2f9d5b",
  silver: "#aeb4bd",
  yellow: "#f2c230",
  orange: "#ef6413",
  grey: "#80858f",
  gray: "#80858f",
  purple: "#7a4fd0",
  gold: "#c9a24a",
  beige: "#d8c8a6",
  brown: "#7a5436",
  maroon: "#7b1f2a",
  pink: "#e86aa6",
  teal: "#2a9aa0",
};

/** Local placeholder: a car silhouette in the casting's colour. The catalogue has no photos yet. */
export function CarImage({
  item,
  className,
}: {
  item: Pick<CatalogueItem, "name" | "colour" | "brand" | "imageUrl">;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (item.imageUrl && !broken)
    return (
      <img
        src={item.imageUrl}
        alt={item.name}
        loading="lazy"
        onError={() => setBroken(true)}
        className={cn("aspect-[4/3] w-full object-cover", className)}
      />
    );
  const fill = HEX[item.colour.toLowerCase().split(/[ /]/)[0]] ?? "#8b8f99";
  return (
    <div
      className={cn(
        "relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-b from-muted to-muted/40",
        className,
      )}
    >
      <svg
        viewBox="0 0 200 150"
        role="img"
        aria-label={`${item.colour} ${item.name}, placeholder illustration`}
        className="absolute inset-0 size-full"
      >
        <ellipse cx="100" cy="112" rx="70" ry="6" fill="currentColor" opacity="0.12" />
        <path
          d="M30 98 L38 80 Q42 72 52 70 L78 66 L96 48 Q100 44 108 44 L132 44 Q140 44 146 52 L158 68 L172 74 Q180 78 180 90 L180 98 Z"
          fill={fill}
          stroke="rgba(0,0,0,.35)"
          strokeWidth="1.5"
        />
        <path
          d="M92 52 L82 66 H122 L116 52 Z M126 52 L134 66 H152 L142 52 Z"
          fill="rgba(255,255,255,.55)"
        />
        <circle cx="62" cy="100" r="13" fill="#1b1b1d" />
        <circle cx="62" cy="100" r="5.5" fill="#bfc3ca" />
        <circle cx="150" cy="100" r="13" fill="#1b1b1d" />
        <circle cx="150" cy="100" r="5.5" fill="#bfc3ca" />
      </svg>
      <span className="absolute left-2 top-2 rounded bg-background/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/80 backdrop-blur">
        {item.brand}
      </span>
    </div>
  );
}

export function Pill({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "good" | "warn" | "bad" | "brand";
  className?: string;
}) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    good: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    bad: "bg-red-500/15 text-red-600 dark:text-red-400",
    brand: "bg-primary/15 text-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function VerifyPill({ v }: { v: Verification }) {
  const Icon = v === "Verified" ? BadgeCheck : v === "Pending" ? Clock : ShieldQuestion;
  return (
    <Pill tone={v === "Verified" ? "good" : v === "Pending" ? "warn" : "muted"}>
      <Icon className="size-3" aria-hidden /> {v}
    </Pill>
  );
}

export function OrderPill({ status }: { status: OrderStatus }) {
  const tone = {
    processing: "warn",
    shipped: "brand",
    delivered: "good",
    cancelled: "bad",
  } as const;
  return <Pill tone={tone[status]}>{ORDER_LABEL[status]}</Pill>;
}

/** Selling price with MRP struck through, only when the MRP is actually higher. */
export function Price({ price, mrp, big }: { price: number; mrp?: number | null; big?: boolean }) {
  const pct = discountPct(mrp ?? null, price);
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className={cn("font-semibold tabular-nums", big ? "text-2xl" : "text-base")}>
        {rupees(price)}
      </span>
      {pct > 0 && (
        <>
          <span
            className="text-xs text-muted-foreground tabular-nums line-through"
            aria-label={`MRP ${rupees(mrp!)}`}
          >
            {rupees(mrp!)}
          </span>
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            {pct}% off
          </span>
        </>
      )}
    </span>
  );
}

export function PageTitle({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-display text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Errors that matter stay on the page; toasts are for "saved". */
export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> <span>{children}</span>
    </p>
  );
}

export function SignInNeeded({ what }: { what: string }) {
  return (
    <Empty
      title={`Sign in to ${what}`}
      body="The store uses your Viiv login: one account, buyer and seller."
      action={
        <Button asChild>
          <Link to="/login">Sign in to Viiv</Link>
        </Button>
      }
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("card-elevated p-4", className)}>{children}</div>;
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block text-sm", className)}>
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-base md:text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export function Sel({
  value,
  onChange,
  options,
  any,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  any?: string;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    >
      {any !== undefined && <option value="">{any}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/** Confirm before anything deliberate or destructive. */
export function Confirm({
  trigger,
  title,
  body,
  confirm,
  danger,
  onConfirm,
}: {
  trigger: (open: () => void) => ReactNode;
  title: string;
  body: ReactNode;
  confirm: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {trigger(() => setOpen(true))}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>{body}</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              className={
                danger
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              onClick={onConfirm}
            >
              {confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function itemLine(i: CatalogueItem) {
  return [i.scale, i.series, i.assortment, i.variant].filter(Boolean).join(" · ");
}
