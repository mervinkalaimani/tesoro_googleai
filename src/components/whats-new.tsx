/**
 * What's new, twice: a mark in the top bar that goes away once read, and the
 * whole list in Settings.
 *
 * The mark is deliberately temporary. A permanent button for a changelog earns
 * its place in the corner about once a fortnight; the rest of the time it is
 * furniture. So it appears when there is a build you have not seen, shows the
 * last two, and removes itself when you close it. Settings keeps everything.
 */
import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import {
  LATEST_BUILD,
  readSeen,
  releasesFor,
  releasesSince,
  stamp,
  writeSeen,
  type Release,
} from "@/lib/whats-new";

/** How many builds the top bar shows. The rest are in Settings. */
const IN_THE_BAR = 2;

export function WhatsNewStar() {
  const { isAdmin } = useAuth();
  // Read once: a changelog does not change while the tab is open, and reading
  // it in state is what lets the mark disappear the moment it is closed.
  const [seen, setSeen] = useState(readSeen);
  const [open, setOpen] = useState(false);

  // Whether to show the mark at all is one question; what it shows is another.
  // It appears because there is a build you have not seen, and then shows the
  // last two whatever you have seen — the one before is the context for the one
  // you missed.
  if (releasesSince(seen).length === 0) return null;
  const fresh = releasesFor(isAdmin).slice(0, IN_THE_BAR);
  if (fresh.length === 0) return null;

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        // Marked read on the way out rather than on the way in, or the panel
        // would unmount from under whoever is reading it.
        if (!v) {
          writeSeen(LATEST_BUILD);
          setSeen(LATEST_BUILD);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-9 shrink-0 rounded-full"
          title={`What's new in build ${LATEST_BUILD}`}
          aria-label="What's new"
        >
          <Sparkles className="size-4.5" />
          <span className="absolute right-1 top-1 size-2 rounded-full border-2 border-background bg-violet-500" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-1.5rem))] max-h-[min(32rem,calc(100svh-5rem))] overflow-y-auto p-0"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-popover px-3 py-2.5">
          <h2 className="text-sm font-semibold">What&apos;s new</h2>
          <span className="text-[11px] text-muted-foreground">Build {LATEST_BUILD}</span>
        </div>
        <div className="space-y-4 px-3 py-3">
          {fresh.map((r) => (
            <ReleaseBlock key={r.build} release={r} />
          ))}
          <p className="border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
            Everything that has changed is in Settings → What&apos;s new.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Every build, for the Settings page. */
export function WhatsNewList() {
  const { isAdmin } = useAuth();
  return (
    <div className="space-y-4">
      {releasesFor(isAdmin).map((r) => (
        <div
          key={r.build}
          className="rounded-2xl border border-border/80 bg-card px-4 py-3.5 shadow-xs"
        >
          <ReleaseBlock release={r} />
        </div>
      ))}
    </div>
  );
}

function ReleaseBlock({ release }: { release: Release }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <h3 className="text-sm font-semibold text-foreground">Build {release.build}</h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">{stamp(release.at)}</span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {release.changes.map((c, i) => (
          <li key={i} className="flex gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "mt-1.5 size-1.5 shrink-0 rounded-full",
                c.key ? "bg-primary" : "bg-muted-foreground/40",
              )}
            />
            <span
              className={cn(
                "text-xs leading-relaxed",
                c.key ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {c.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
