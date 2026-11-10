import { BadgeCheck } from "lucide-react";

import type { CatalogCar } from "@/lib/catalog";

/**
 * Marks a catalogue entry the maker-site job has checked: its photo and number
 * come from the maker's own listing. Nothing renders for an entry that has not
 * been through it, so most of the catalogue stays exactly as it was.
 */
export function SyncedBadge({
  car,
  className = "",
}: {
  car: Pick<CatalogCar, "synced_at" | "synced_source">;
  className?: string;
}) {
  if (!car.synced_at) return null;
  const when = new Date(car.synced_at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return (
    <span
      title={`Photo and details checked against ${car.synced_source || "the maker's site"} on ${when}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-black/75 px-2 py-0.5 text-xs font-semibold text-sky-300 backdrop-blur-sm ring-1 ring-sky-400/30 ${className}`}
    >
      <BadgeCheck className="size-3" /> Synced
    </span>
  );
}
