import { useEffect, useMemo, useState } from "react";
import { Car, Loader2, Merge, Search, X } from "lucide-react";
import { toast } from "sonner";

import type { CatalogCar } from "@/lib/catalog";
import { catalogMergePreview, mergeCatalogEntries, type MergePreview } from "@/lib/catalog";
import { findDuplicateGroups, type DuplicateGroup } from "@/lib/duplicate";
import { MergePanel } from "@/components/merge-castings";
import { transformImageUrl } from "@/lib/image-transform";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentControl } from "@/components/segment-control";
import { cn } from "@/lib/utils";

/**
 * Merging duplicate catalogue entries, for an admin.
 *
 * One group at a time, and never automatically: the strongest evidence this can
 * offer — two entries sharing a collector number — is still evidence, and the
 * catalogue holds real pairs that look identical and are not.
 *
 * Merging moves the cars off the entries being dropped and onto the one kept,
 * then removes them. Only rows that point at a dropped entry change; every
 * other collection is left exactly as it was. The cars that move keep what they
 * cost, who sold them and their condition — what changes is which casting they
 * say they are.
 */

/**
 * Everything a group says about itself, as one lower-case line to search.
 *
 * Every field of every entry in it, not only the one the heading names: a pair
 * is two entries and the half you remember may be either of them.
 */
const haystack = (g: DuplicateGroup) =>
  [
    g.label,
    g.because,
    ...g.cars.flatMap((c) => [
      c.car_id,
      c.name,
      c.brand,
      c.make,
      c.model,
      c.variant,
      c.colour,
      c.assortment,
      c.series,
      c.sub_series,
      c.car_number,
      c.year,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

/**
 * Commas narrow, and every term has to land somewhere.
 *
 * "hot wheels, skyline, premium" is three conditions, not one phrase, and none
 * of them has to be in the same field as the others. Without it the only way
 * through a list this long was the two-option segment above it.
 */
const matchesQuery = (g: DuplicateGroup, query: string) => {
  const terms = query
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (terms.length === 0) return true;
  const hay = haystack(g);
  return terms.every((t) => hay.includes(t));
};

export function MergeDuplicatesDialog({
  open,
  onClose,
  catalog,
  onMerged,
}: {
  open: boolean;
  onClose: () => void;
  catalog: CatalogCar[];
  /** Refreshes the catalogue once entries have actually gone. */
  onMerged: () => Promise<void> | void;
}) {
  const groups = useMemo(() => findDuplicateGroups(catalog), [catalog]);
  const [level, setLevel] = useState<"certain" | "all">("certain");
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const base = level === "certain" ? groups.filter((g) => g.level === "certain") : groups;
    return query.trim() ? base.filter((g) => matchesQuery(g, query)) : base;
  }, [groups, level, query]);

  /** The group being worked on. Nothing is merged from the list itself. */
  const [openKey, setOpenKey] = useState<string | null>(null);
  const group = shown.find((g) => g.key === openKey) ?? null;

  const [keepId, setKeepId] = useState("");
  const [dropIds, setDropIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    if (!open) {
      setOpenKey(null);
      setLevel("certain");
      setQuery("");
    }
  }, [open]);

  // Opening a group starts from the obvious answer: keep the one filed first,
  // merge the rest into it. Both halves stay yours to change.
  useEffect(() => {
    if (!group) {
      setKeepId("");
      setDropIds([]);
      setPreview(null);
      return;
    }
    const ordered = [...group.cars].sort((a, b) =>
      (a.created_at || "").localeCompare(b.created_at || ""),
    );
    const keep = ordered[0].car_id;
    setKeepId(keep);
    setDropIds(ordered.slice(1).map((c) => c.car_id));
  }, [group]);

  // What the merge would touch, read from the database rather than guessed:
  // the client only sees its own cars, and this is about everyone's.
  useEffect(() => {
    if (!group || dropIds.length === 0) {
      setPreview(null);
      return;
    }
    let live = true;
    setLoadingPreview(true);
    catalogMergePreview(dropIds)
      .then((p) => live && setPreview(p))
      .catch((e: Error) => {
        if (live) {
          setPreview(null);
          toast.error(`Could not read what this would move: ${e.message}`);
        }
      })
      .finally(() => live && setLoadingPreview(false));
    return () => {
      live = false;
    };
  }, [group, dropIds]);

  const runMerge = async () => {
    if (!group || !keepId || dropIds.length === 0) return;
    setMerging(true);
    try {
      const res = await mergeCatalogEntries(keepId, dropIds);
      toast.success(res.merged === 1 ? "Merged one duplicate" : `Merged ${res.merged} duplicates`, {
        description:
          res.cars > 0
            ? `${res.cars} car${res.cars === 1 ? "" : "s"} now point at the entry you kept.`
            : "No collection had one of them.",
      });
      setOpenKey(null);
      await onMerged();
    } catch (e) {
      toast.error(`Could not merge: ${(e as Error).message}`);
    } finally {
      setMerging(false);
    }
  };

  const toggleDrop = (id: string) =>
    setDropIds((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !merging && onClose()}>
      <DialogContent
        hideDragHandle
        className={cn(
          "flex flex-col overflow-hidden overscroll-contain touch-pan-y",
          "w-full max-w-full sm:max-w-4xl",
          "sm:top-6 sm:translate-y-0 sm:max-h-[calc(100dvh-3rem)]",
          "max-sm:fixed max-sm:inset-0 max-sm:top-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-full max-sm:rounded-none max-sm:border-0 max-sm:p-3.5 max-sm:m-0",
        )}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{group ? "Merge these entries" : "Duplicate castings"}</DialogTitle>
          <DialogDescription>
            {group
              ? "Choose the entry to keep. The cars on the others move onto it, and nobody else's collection changes."
              : "Entries that look like the same casting. Nothing is merged until you open one and say so."}
          </DialogDescription>
        </DialogHeader>

        {!group && (
          <div className="shrink-0 space-y-2">
            <SegmentControl
              fill
              value={level}
              onChange={(v) => setLevel(v as "certain" | "all")}
              className="h-9 w-full"
              options={[
                {
                  value: "certain",
                  label: `Same number (${groups.filter((g) => g.level === "certain").length})`,
                },
                { value: "all", label: `All candidates (${groups.length})` },
              ]}
            />
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search any field — commas narrow: hot wheels, skyline, premium"
                className="h-9 bg-muted/30 pl-8 pr-8 text-xs"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear the search"
                  className="absolute right-2.5 top-2.5 cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-0.5">
          {!group ? (
            shown.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {query.trim() ? "Nothing here matches that." : "Nothing looks duplicated."}
              </p>
            ) : (
              shown.map((g) => <GroupRow key={g.key} group={g} onOpen={() => setOpenKey(g.key)} />)
            )
          ) : (
            <MergePanel
              cars={group.cars}
              because={group.because}
              keepId={keepId}
              dropIds={dropIds}
              onKeep={setKeepId}
              onToggleDrop={toggleDrop}
              preview={preview}
              loadingPreview={loadingPreview}
            />
          )}
        </div>

        <DialogFooter className="flex w-full min-w-0 shrink-0 flex-row items-center justify-between gap-2 border-t border-border/50 pt-3 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={merging}
            onClick={() => (group ? setOpenKey(null) : onClose())}
            className="text-muted-foreground hover:text-foreground"
          >
            {group ? "Back" : "Close"}
          </Button>
          {group && (
            <Button
              type="button"
              disabled={merging || !keepId || dropIds.length === 0}
              onClick={() => void runMerge()}
              className="gap-1.5 font-semibold"
            >
              {merging ? <Loader2 className="size-4 animate-spin" /> : <Merge className="size-4" />}
              Merge {dropIds.length} into this one
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroupRow({ group, onOpen }: { group: DuplicateGroup; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-background/60 p-2 text-left hover:border-primary"
    >
      <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded bg-muted">
        {group.cars[0].image_url ? (
          <img src={transformImageUrl(group.cars[0].image_url, "thumb")} alt="" className="size-full object-cover" />
        ) : (
          <Car className="size-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{group.label}</div>
        <div className="text-[10px] leading-snug text-muted-foreground">{group.because}</div>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
          group.level === "certain"
            ? "bg-primary/15 text-primary"
            : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
        )}
      >
        {group.cars.length}
      </span>
    </button>
  );
}
