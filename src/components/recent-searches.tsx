import { Clock, X } from "lucide-react";

import { useRecentSearches } from "@/lib/recent-searches";

/**
 * What you searched for last, as chips at the top of the search tray.
 *
 * Each carries its own cross, because the one you want gone is usually a typo
 * sitting next to four you want kept, and Clear sits at the end of the row
 * where it cannot be hit by mistake on the way to a chip.
 */
export function RecentSearches({ onPick }: { onPick: (q: string) => void }) {
  const { recent, forget, clear } = useRecentSearches();
  if (recent.length === 0) return null;

  return (
    <section>
      <div className="mb-1.5 flex items-center gap-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Clock className="size-3" />
        <span>Recent</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {recent.map((q) => (
          <span
            key={q}
            className="inline-flex max-w-full items-center rounded-full border border-border/80 bg-card pr-0.5 text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10"
          >
            <button
              type="button"
              onClick={() => onPick(q)}
              className="min-w-0 cursor-pointer truncate py-1 pl-2.5 pr-1 text-left active:scale-[0.97]"
            >
              {q}
            </button>
            <button
              type="button"
              aria-label={`Remove “${q}” from recent searches`}
              title="Remove"
              onClick={() => forget(q)}
              className="grid size-5 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={clear}
          className="cursor-pointer rounded-full px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Clear
        </button>
      </div>
    </section>
  );
}
