import { BadgeCheck } from "lucide-react";

/** A seller registered with VIIV (it has a saved seller profile): a solid blue badge, white check. */
export function VerifiedBadge() {
  return (
    <span title="Registered with VIIV" className="inline-flex shrink-0">
      <BadgeCheck
        className="size-5 fill-sky-500 text-sky-500 [&_path:last-child]:text-white"
        aria-label="Verified"
      />
    </span>
  );
}
