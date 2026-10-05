import { Car, Check, Loader2, Merge, Users } from "lucide-react";

import type { CatalogCar, MergePreview } from "@/lib/catalog";
import { resolveCatalogUserId } from "@/lib/catalog";
import { carSubLine } from "@/lib/car-subline";
import { formatDayMonthYear, inrFull } from "@/lib/format";
import { transformImageUrl } from "@/lib/image-transform";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Choosing which of several entries survives a merge.
 *
 * Which one is the keeper is a judgement, not a rule: the oldest is the usual
 * answer and the one this opens on, but the better photograph, the better name
 * or the ID somebody has already written down are all reasons to keep the
 * other. So both halves are yours to change — which one stays, and which of the
 * rest come with it.
 *
 * Lived inside the Duplicates screen until the catalogue form needed the same
 * question. The state belongs to the caller: one of them keeps it in a dialog
 * footer and the other beside a list of candidates.
 */

export const mergeSubLine = (c: CatalogCar) =>
  carSubLine({
    brand: c.brand,
    assortment: c.assortment,
    series: c.series,
    subSeries: c.sub_series,
    carNumber: c.car_number,
  });

/** The entry kept and the ones merged in, as the merge would run today. */
export function MergePanel({
  cars,
  because,
  keepId,
  dropIds,
  onKeep,
  onToggleDrop,
  preview,
  loadingPreview,
}: {
  cars: CatalogCar[];
  /** One line on why these are together. Omitted when the caller said it already. */
  because?: string;
  keepId: string;
  dropIds: string[];
  onKeep: (id: string) => void;
  onToggleDrop: (id: string) => void;
  preview: MergePreview | null;
  loadingPreview: boolean;
}) {
  return (
    <div className="space-y-2">
      {because && <p className="text-[11px] text-muted-foreground">{because}</p>}

      {cars.map((c) => {
        const keeping = c.car_id === keepId;
        const dropping = dropIds.includes(c.car_id);
        return (
          <div
            key={c.car_id}
            className={cn(
              "rounded-lg border p-2",
              keeping
                ? "border-primary/60 bg-primary/5"
                : dropping
                  ? "border-border bg-background/60"
                  : "border-border/50 bg-muted/20 opacity-70",
            )}
          >
            <div className="flex items-start gap-2.5">
              <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded bg-muted">
                {c.image_url ? (
                  <img
                    src={transformImageUrl(c.image_url, "thumb")}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <Car className="size-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium">{c.name}</div>
                {/* Wraps rather than truncates: brand, box, series, sub-series
                    and number is the whole of what tells two near-identical
                    entries apart, and it was the line being cut off. */}
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {mergeSubLine(c)}
                </div>
                <div className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground/75">
                  {c.car_id} · {inrFull(Number(c.mrp) || 0)} ·{" "}
                  {formatDayMonthYear(c.created_at) || "no date"}
                  {!c.image_url && " · no photo"}
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 border-t border-border/50 pt-2">
              {keeping ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  <Check className="size-3" /> Keeping this one
                </span>
              ) : (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => onKeep(c.car_id)}
                  >
                    Keep this instead
                  </Button>
                  <label className="flex cursor-pointer select-none items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={dropping}
                      onChange={() => onToggleDrop(c.car_id)}
                      className="size-3.5 rounded border-input accent-primary"
                    />
                    <span className="text-[11px] text-muted-foreground">Merge into the keeper</span>
                  </label>
                </>
              )}
            </div>
          </div>
        );
      })}

      {/* Whose collections this touches, read from the database — the client can
          only see its own cars, and a merge is about everyone's. */}
      <div className="rounded-lg border border-border bg-muted/30 p-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Users className="size-3.5 text-primary" />
          What this moves
        </div>
        {loadingPreview ? (
          <p className="mt-1 text-[11px] text-muted-foreground">Checking…</p>
        ) : !preview ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Pick at least one entry to merge in.
          </p>
        ) : preview.cars === 0 ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Nobody owns the entries being merged, so no collection changes.
          </p>
        ) : (
          <div className="mt-1 space-y-0.5">
            <p className="text-[11px] text-muted-foreground">
              {preview.cars} car{preview.cars === 1 ? " moves" : "s move"} onto the entry you keep.
              Every other car is left alone.
            </p>
            {preview.owners.map((o) => (
              <p key={o.user_id} className="text-[11px] text-foreground">
                {resolveCatalogUserId(o.user_id)} — {o.cars} car{o.cars === 1 ? "" : "s"}
              </p>
            ))}
            {preview.packs > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {preview.packs} multipack link{preview.packs === 1 ? "" : "s"} repointed.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The panel as a dialog of its own: what is kept, what is folded into it.
 *
 * A step after the list rather than inside it. The list answers "are these the
 * same casting"; this answers "then which one survives", and they are different
 * enough questions that reading the second one half way down the first was how
 * the wrong entry got kept.
 */
export function MergeChoiceDialog({
  open,
  onClose,
  cars,
  keepId,
  dropIds,
  onKeep,
  onToggleDrop,
  preview,
  busy,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  cars: CatalogCar[];
  keepId: string;
  dropIds: string[];
  onKeep: (id: string) => void;
  onToggleDrop: (id: string) => void;
  preview: MergePreview | null;
  busy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-3rem)] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader className="shrink-0 text-left">
          <DialogTitle>Which one do you keep?</DialogTitle>
          <DialogDescription>
            The cars on the entries you merge in move onto the one you keep, and nobody else&rsquo;s
            collection changes. The entries merged in are removed, and that cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
          <MergePanel
            cars={cars}
            keepId={keepId}
            dropIds={dropIds}
            onKeep={onKeep}
            onToggleDrop={onToggleDrop}
            preview={preview}
            loadingPreview={preview === null && dropIds.length > 0}
          />
        </div>

        <DialogFooter className="flex w-full shrink-0 flex-row items-center justify-between gap-2 border-t border-border/50 pt-3 sm:justify-between">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="gap-1.5 font-semibold"
            disabled={busy || !keepId || dropIds.length === 0}
            onClick={onConfirm}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Merge className="size-4" />}
            {busy ? "Merging…" : `Merge ${dropIds.length} into the keeper`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
