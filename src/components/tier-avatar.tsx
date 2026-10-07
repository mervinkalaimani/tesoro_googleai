import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * Somebody's picture.
 *
 * The five places that drew an avatar drew the same four lines each — the
 * frame, the photograph if there is one, the initials if there is not — so
 * they draw this instead. The tier is said in words beside the name, not
 * stamped on the face: a chip small enough not to cover a photograph was too
 * small to read.
 */
export function TierAvatar({
  url,
  initials,
  className,
  fallbackClassName,
}: {
  url?: string | null;
  initials: string;
  className?: string;
  fallbackClassName?: string;
}) {
  return (
    <Avatar className={cn("shrink-0", className)}>
      {url ? <AvatarImage src={url} alt="" /> : null}
      <AvatarFallback className={fallbackClassName}>{initials}</AvatarFallback>
    </Avatar>
  );
}

/** The tier as a word, for a row that names an account. */
export function ProChip({ label = "Pro", className }: { label?: string; className?: string }) {
  return (
    <span
      title={`${label} account`}
      className={cn(
        "rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider leading-none text-primary-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}
