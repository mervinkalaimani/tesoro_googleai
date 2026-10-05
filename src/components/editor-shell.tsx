import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { activeSection } from "@/lib/editor-rail";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * The frame the three long forms are filled in through: add a car, update a
 * car, and file a casting in the catalogue.
 *
 * All three are the same shape — a stack of sections, a handful of things that
 * have to be answered before it can be saved, and one button that saves it.
 * They had three different answers to "where am I in this" and three different
 * footers. This is one: a rail on the left that says which sections exist and
 * what is in them, the form down the middle, and on the right what the thing
 * being saved currently looks like with the save button under it.
 *
 * On a phone there is no room for either side column, so the rail becomes a
 * row of chips above the form and everything from the right column that is
 * still true — what is missing, and the buttons — becomes a bar across the
 * bottom.
 */

export type RailItem = {
  /** Matches the `id` on the FormSection it scrolls to. */
  id: string;
  label: string;
  /** What is in the section, in two or three words. */
  status?: string;
  /** "warn" when the status is naming something still missing. */
  tone?: "muted" | "warn";
};

export type ShellStep = { id: number; label: string };

/**
 * Bring a section to the top of the box it scrolls in.
 *
 * Not scrollIntoView: that scrolls every ancestor that can scroll, and the
 * outermost of them is the page behind the dialog — which takes the dialog's
 * own header off the screen with it. This moves exactly one box.
 */
export function scrollToSection(el: Element | null, smooth = false) {
  if (!el) return;
  let box = el.parentElement;
  while (box && box.scrollHeight <= box.clientHeight) box = box.parentElement;
  if (!box) return;
  const top = box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top;
  box.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
}

export function EditorShell({
  title,
  description,
  steps,
  current = 1,
  onStep,
  rail = [],
  headerAction,
  summary,
  alerts,
  actions,
  children,
}: {
  title: string;
  description: string;
  /** Omitted by a form that is not walked in steps — the catalogue's. */
  steps?: ShellStep[];
  current?: number;
  /** Going back to a step already walked. Steps ahead are never clickable. */
  onStep?: (id: number) => void;
  rail?: RailItem[];
  /** One button beside the title — the card scanner, where a form has one. */
  headerAction?: React.ReactNode;
  /** Desktop only: what is being saved, as it currently reads. */
  summary?: React.ReactNode;
  /** What is still missing. Shown beside the form, and above the buttons on a phone. */
  alerts?: React.ReactNode;
  /** Save, cancel, delete. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState("");
  // The sections themselves are the caller's children, so the rail finds them
  // by id rather than being handed their nodes.
  const ids = rail.map((r) => r.id).join("|");

  useEffect(() => {
    const el = scroller.current;
    if (!el || !ids) return;
    const read = () => {
      const base = el.getBoundingClientRect().top;
      const tops: { id: string; top: number }[] = [];
      for (const id of ids.split("|")) {
        const node = el.querySelector(`[data-section="${id}"]`);
        if (node) tops.push({ id, top: node.getBoundingClientRect().top - base });
      }
      setActive(activeSection(tops, 8));
    };
    // A form opens at its first section. Something focusing a control part way
    // down it on mount would otherwise decide where it opens for you.
    el.scrollTop = 0;
    read();
    el.addEventListener("scroll", read, { passive: true });
    return () => el.removeEventListener("scroll", read);
  }, [ids]);

  const jump = (id: string) => {
    scrollToSection(scroller.current?.querySelector(`[data-section="${id}"]`) ?? null, true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <DialogHeader className="shrink-0 gap-0 space-y-0 text-left">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {steps && (
              // A phone has no room for the pills, so the step is said in words
              // where the title is.
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary sm:hidden">
                {title} · step {current} of {steps.length}
              </p>
            )}
            <DialogTitle className="truncate text-xl font-bold tracking-tight sm:text-2xl">
              {title}
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">{description}</DialogDescription>
          </div>
          {steps && (
            <StepPills steps={steps} current={current} onStep={onStep} className="hidden sm:flex" />
          )}
          {headerAction}
        </div>

        {steps && (
          <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-muted sm:hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${(current / steps.length) * 100}%` }}
            />
          </div>
        )}

        {rail.length > 0 && (
          <div className="-mx-0.5 mt-2.5 flex gap-1.5 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
            {rail.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => jump(r.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  active === r.id
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {r.label}
                {r.tone === "warn" && (
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 rounded-full",
                      active === r.id ? "bg-background" : "bg-primary",
                    )}
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </DialogHeader>

      <div
        className={cn(
          "grid min-h-0 flex-1 gap-4",
          rail.length > 0 && summary
            ? "lg:grid-cols-[10rem_minmax(0,1fr)_18rem]"
            : rail.length > 0
              ? "lg:grid-cols-[10rem_minmax(0,1fr)]"
              : summary
                ? "lg:grid-cols-[minmax(0,1fr)_18rem]"
                : "",
        )}
      >
        {rail.length > 0 && (
          <nav aria-label="Sections" className="hidden min-w-0 lg:block">
            <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Sections
            </p>
            {rail.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => jump(r.id)}
                aria-current={active === r.id || undefined}
                className={cn(
                  "block w-full rounded-lg px-2.5 py-2 text-left transition-colors",
                  active === r.id ? "bg-muted" : "hover:bg-muted/50",
                )}
              >
                <span className="block truncate text-[13px] font-medium">{r.label}</span>
                {r.status && (
                  <span
                    className={cn(
                      "block truncate text-[11px]",
                      r.tone === "warn" ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                  </span>
                )}
              </button>
            ))}
          </nav>
        )}

        <div
          ref={scroller}
          className="min-h-0 space-y-3 overflow-y-auto overflow-x-hidden pr-0.5 lg:pr-1.5"
        >
          {children}
        </div>

        {summary && (
          <aside className="hidden min-h-0 min-w-0 flex-col gap-2.5 lg:flex">
            <div className="min-h-0 flex-1 overflow-y-auto">{summary}</div>
            {alerts}
            {actions}
          </aside>
        )}
      </div>

      {/* The same alerts and buttons again rather than moved: only one of the
          two is ever on screen, and a portal to swap them between columns costs
          more than the markup it saves. */}
      <div
        className={cn("shrink-0 space-y-2 border-t border-border/60 pt-3", summary && "lg:hidden")}
      >
        {alerts}
        {actions}
      </div>
    </div>
  );
}

function StepPills({
  steps,
  current,
  onStep,
  className,
}: {
  steps: ShellStep[];
  current: number;
  onStep?: (id: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("shrink-0 items-center gap-1 rounded-full bg-muted p-1", className)}>
      {steps.map((s) => {
        const done = current > s.id;
        const here = current === s.id;
        return (
          <button
            key={s.id}
            type="button"
            disabled={s.id > current}
            onClick={() => done && onStep?.(s.id)}
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
              here
                ? "bg-card text-foreground shadow-sm"
                : done
                  ? "text-foreground hover:bg-card/60"
                  : "cursor-not-allowed text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                here
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-foreground text-background"
                    : "bg-border text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3" /> : s.id}
            </span>
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One line of the right-hand summary. A row with nothing in it still prints,
 * as a dash: a blank where a seller goes is the question, not an omission.
 */
export function SummaryRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/60 py-1.5 text-[13px] first:border-t-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium">{value || "—"}</span>
    </div>
  );
}

/**
 * What is still missing, each one a tap from the field that fixes it. Empty is
 * worth saying too: "every required field is in" is the only thing on the
 * screen that answers "can I press save yet".
 */
export function ThingsLeft({
  items,
  done,
}: {
  items: { label: string; onJump?: () => void }[];
  done?: string;
}) {
  if (!items.length) {
    if (!done) return null;
    return (
      <p className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-[13px] font-medium">
        <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        {done}
      </p>
    );
  }
  return (
    <div className="rounded-xl bg-primary/10 p-2.5">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
        {items.length} thing{items.length > 1 ? "s" : ""} left
      </p>
      <div className="mt-1 max-h-28 overflow-y-auto lg:max-h-none">
        {items.map((i) => (
          <button
            key={i.label}
            type="button"
            onClick={i.onJump}
            className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-[11px] font-medium text-primary hover:bg-primary/10"
          >
            <span className="min-w-0 flex-1 truncate">{i.label}</span>
            {i.onJump && <ChevronRight className="size-3.5 shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  );
}
