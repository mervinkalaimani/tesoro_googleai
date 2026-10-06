import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * Somebody's picture, with a PRO chip on it when they have paid.
 *
 * The five places that drew an avatar drew the same four lines each — the
 * frame, the photograph if there is one, the initials if there is not — so the
 * chip would have been positioned five times and five times slightly
 * differently. One component instead, and the badge is a prop.
 *
 * Bottom-right, overlapping the frame, with a ring in the page's background
 * colour so it reads as sitting on top of the picture rather than inside it.
 */
export function TierAvatar({
  url,
  initials,
  pro = false,
  className,
  fallbackClassName,
  chipClassName,
}: {
  url?: string | null;
  initials: string;
  pro?: boolean;
  className?: string;
  fallbackClassName?: string;
  /** Bigger avatars want a bigger chip. */
  chipClassName?: string;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar className={className}>
        {url ? <AvatarImage src={url} alt="" /> : null}
        <AvatarFallback className={fallbackClassName}>{initials}</AvatarFallback>
      </Avatar>
      {pro && <ProChip className={chipClassName} />}
    </span>
  );
}

/** The chip on its own, for a row that names a tier without drawing a face. */
export function ProChip({ className, inline }: { className?: string; inline?: boolean }) {
  return (
    <span
      title="Pro account"
      className={cn(
        "rounded-full bg-primary font-bold uppercase leading-none text-primary-foreground",
        inline
          ? "px-1.5 py-0.5 text-[9px] tracking-wider"
          : // Half the width of the smallest avatar it sits on, and no wider:
            // tracking on a three-letter word at 7px bought nothing but a chip
            // that covered the face it was meant to badge.
            "absolute -bottom-px -right-px border border-background px-[3px] py-[2px] text-[7px] tracking-tight shadow-sm",
        className,
      )}
    >
      Pro
    </span>
  );
}
