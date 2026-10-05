import { AlertTriangle, Car, ChevronRight, Link2, Merge, Plus } from "lucide-react";

import type { CatalogCar } from "@/lib/catalog";
import type { DuplicateHit } from "@/lib/duplicate";
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
 * What the catalogue already has that looks like what is being typed.
 *
 * A count under the preview, and the entries themselves a tap behind it. They
 * used to be in the form, above the fields, where they were long enough to
 * push the form off the screen on the one occasion they appeared — and still
 * too narrow to answer the question they raise. The question is "is this the
 * same car", and answering it means reading both descriptions side by side:
 * every field, the price, the ID, in the same columns, which needs the width
 * of the whole dialog rather than a column of it.
 *
 * The entry being typed is the first row, so the comparison is a row of the
 * same table rather than a thing to remember from the screen behind.
 */

export function DuplicatesButton({
  count,
  onClick,
  className,
}: {
  count: number;
  onClick: () => void;
  className?: string;
}) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-xl border border-amber-500/60 bg-amber-500/15 px-3 py-2.5 text-left transition-colors hover:bg-amber-500/25",
        className,
      )}
    >
      <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="min-w-0 flex-1 text-xs font-semibold">
        {count} duplicate{count === 1 ? "" : "s"} found
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** Enough of a catalogue entry to print a row. The form being filled in has no entry yet. */
export type DuplicateSubject = Partial<CatalogCar> & { car_id?: string; name?: string };

export function DuplicatesDialog({
  open,
  onClose,
  subject,
  hits,
  onUse,
  useLabel = "Add this car",
  onAddAsBox,
  onMerge,
  busy,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  /** The entry being added or edited, printed as the first row to compare against. */
  subject: DuplicateSubject;
  hits: DuplicateHit[];
  /** Take this entry instead of filing a second one. */
  onUse?: (car: CatalogCar) => void;
  useLabel?: string;
  /**
   * Keep both, with this one as another box of the same casting. A different
   * box is not a duplicate: Mainline and Premium are two real entries.
   */
  onAddAsBox?: (car: CatalogCar) => void;
  /** Fold one of the two away. Which one survives is chosen in the next dialog. */
  onMerge?: (car: CatalogCar) => void;
  busy?: boolean;
  /** One more way out, where the caller has one — "browse the whole brand". */
  footer?: React.ReactNode;
}) {
  const box = (v?: string | null) => (v || "").trim().toLowerCase();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent
        hideDragHandle
        className={cn(
          "flex flex-col overflow-hidden",
          "w-full max-w-full sm:max-w-5xl xl:max-w-6xl",
          "sm:top-6 sm:translate-y-0 sm:max-h-[calc(100dvh-3rem)]",
          "max-sm:fixed max-sm:inset-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none max-sm:border-0 max-sm:p-3.5 max-sm:m-0",
        )}
      >
        <DialogHeader className="shrink-0 text-left">
          <DialogTitle>
            {hits.length} duplicate{hits.length === 1 ? "" : "s"} found
          </DialogTitle>
          <DialogDescription>
            Entries the catalogue already has that read like this one. Nothing happens to any of
            them until you say so.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
          <EntryRow car={subject} tone="subject" />

          <p className="px-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Already in the catalogue
          </p>

          {hits.map(({ car, because, match }) => (
            <EntryRow
              key={car.car_id}
              car={car}
              match={match}
              because={because}
              actions={
                <>
                  {onAddAsBox && box(car.assortment) !== box(subject.assortment) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      className="h-7 shrink-0 gap-1 px-2.5 text-xs"
                      title={`Keep both, with ${car.assortment || "this box"} as another box of this casting`}
                      onClick={() => onAddAsBox(car)}
                    >
                      <Link2 className="size-3.5" />
                      Add as a box
                    </Button>
                  )}
                  {onMerge && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      className="h-7 shrink-0 gap-1 px-2.5 text-xs"
                      title="Choose which of the two to keep"
                      onClick={() => onMerge(car)}
                    >
                      <Merge className="size-3.5" />
                      Merge
                    </Button>
                  )}
                  {onUse && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      className="h-7 shrink-0 gap-1 px-2.5 text-xs font-semibold"
                      onClick={() => onUse(car)}
                    >
                      <Plus className="size-3.5" />
                      {useLabel}
                    </Button>
                  )}
                </>
              }
            />
          ))}
        </div>

        <DialogFooter className="flex w-full shrink-0 flex-row items-center justify-between gap-2 border-t border-border/50 pt-3 sm:justify-between">
          {footer ?? <span />}
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One entry, with every field that tells two of them apart.
 *
 * The same cells in the same order for the one being typed and for the ones it
 * might duplicate, because reading down a column is the comparison — a row that
 * dropped its empty fields would put a different fact under each heading.
 */
function EntryRow({
  car,
  match,
  because,
  actions,
  tone,
}: {
  car: DuplicateSubject;
  match?: number;
  because?: string;
  actions?: React.ReactNode;
  tone?: "subject";
}) {
  const subject = tone === "subject";
  return (
    <div
      className={cn(
        "rounded-lg border p-2.5",
        subject ? "border-primary/60 bg-primary/5" : "border-border bg-background/60",
      )}
    >
      <div className="flex items-start gap-2.5">
        {match !== undefined && (
          <span
            className={cn(
              "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
              match >= 95
                ? "bg-amber-500/25 text-amber-800 dark:text-amber-300"
                : "bg-muted text-muted-foreground",
            )}
            title="How much of the description matches"
          >
            {match}%
          </span>
        )}
        <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded bg-muted">
          {car.image_url ? (
            <img
              src={transformImageUrl(car.image_url, "thumb")}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <Car className="size-4 text-muted-foreground" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold">{car.name?.trim() || "—"}</span>
            {subject && (
              <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                This one
              </span>
            )}
          </div>
          <div className="text-[11px] leading-snug text-muted-foreground">
            {carSubLine({
              brand: car.brand ?? "",
              assortment: car.assortment ?? "",
              series: car.series ?? "",
              subSeries: car.sub_series ?? "",
              carNumber: car.car_number ?? "",
            })}
          </div>

          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            <Cell label="Catalogue ID" value={car.car_id} mono />
            <Cell label="Colour" value={car.colour} />
            <Cell label="Year" value={car.year} />
            <Cell label="Retail" value={car.mrp ? inrFull(Number(car.mrp)) : ""} />
            <Cell label="Rarity" value={car.rarity} />
            <Cell label="Filed" value={formatDayMonthYear(car.created_at)} />
          </div>

          {because && (
            <p className="mt-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
              {because}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">{actions}</div>
        )}
      </div>
    </div>
  );
}

/** A labelled value, printed empty as a dash: a blank is an answer too. */
function Cell({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | number | null;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div className={cn("truncate text-[11px] font-medium", mono && "font-mono")}>
        {String(value ?? "").trim() || "—"}
      </div>
    </div>
  );
}
