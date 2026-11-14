import { BadgeCheck } from "lucide-react";

import type { CatalogCar } from "@/lib/catalog";

/**
 * What an admin's verification is filed under in `synced_source`. It shares the
 * columns the maker-site job writes, so the two replace each other: verifying
 * overrides a sync, and the next sync overrides the verification.
 */
export const VERIFIED_BY_ADMIN = "Verified by admin";
export const isVerifiedByAdmin = (source?: string | null) => source === VERIFIED_BY_ADMIN;

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
  const admin = isVerifiedByAdmin(car.synced_source);
  return (
    <span
      title={
        admin
          ? `${VERIFIED_BY_ADMIN} on ${when}`
          : `Photo and details checked against ${car.synced_source || "the maker's site"} on ${when}`
      }
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-black/75 px-2 py-0.5 text-xs font-semibold text-sky-300 backdrop-blur-sm ring-1 ring-sky-400/30 ${className}`}
    >
      <BadgeCheck className="size-3" /> {admin ? "Verified" : "Synced"}
    </span>
  );
}

/** The same mark as an icon on a photograph, for tiles with no room for a word. */
export function SyncedMark({ synced, source }: { synced?: boolean; source?: string | null }) {
  if (!synced) return null;
  const admin = isVerifiedByAdmin(source);
  return (
    <span
      title={
        admin ? VERIFIED_BY_ADMIN : "Synced: photo and details checked against the maker's site"
      }
      className="pointer-events-auto absolute left-1 top-1 grid size-6 place-items-center rounded-full bg-sky-500 text-white shadow-sm"
    >
      <BadgeCheck aria-label={admin ? "Verified" : "Synced"} className="size-3.5" />
    </span>
  );
}
