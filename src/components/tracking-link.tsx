import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { trackingPageFor } from "@/lib/tracking";

/**
 * Opens the courier's tracking form and puts the consignment number on the
 * clipboard, ready to paste into it.
 *
 * This used to be a deep link straight to the shipment. Deep links are the
 * first thing a courier's site changes — several of ours already bounced to a
 * home page, which left you looking at a tracking form with the number still
 * sitting in another tab. Two seconds of paste beats a link that silently stops
 * working.
 */
export function TrackingLink({
  partner,
  trackingId,
  className,
  compact = false,
}: {
  partner?: string | null;
  trackingId?: string | null;
  className?: string;
  /** Inline form for table cells — no box, no explanation. */
  compact?: boolean;
}) {
  const id = (trackingId || "").trim();
  const name = (partner || "").trim();
  const page = trackingPageFor(name, id);
  if (!page) return null;

  const go = () => {
    // Opened first, synchronously: a popup blocker will not allow a window that
    // waits on the clipboard promise before asking for it.
    window.open(page, "_blank", "noopener,noreferrer");
    void navigator.clipboard
      ?.writeText(id)
      .then(() =>
        toast.success("Tracking ID copied", { description: `${id} · paste into ${name}` }),
      )
      .catch(() => toast.info("Opened the tracking page", { description: `Tracking ID: ${id}` }));
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={go}
        title={`Open ${name} tracking and copy ${id}`}
        className={cn(
          "inline-flex max-w-full items-center gap-1 text-xs text-sky-500 hover:underline",
          className,
        )}
      >
        <span className="truncate">
          {name} · {id}
        </span>
        <ExternalLink className="size-3 shrink-0" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={go}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-600 hover:bg-sky-500/15 dark:text-sky-400",
        className,
      )}
    >
      <span className="min-w-0 truncate text-left">
        Track on {name}
        <span className="block text-[10px] font-normal opacity-80">
          Copies {id} to paste into their form
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <Copy className="size-3.5" />
        <ExternalLink className="size-3.5" />
      </span>
    </button>
  );
}
