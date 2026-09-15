import { useRef, useState } from "react";
import { ImageDown, Loader2, Square } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCars, useCarsActions } from "@/lib/cars-store";
import { CAR_PHOTOS_BUCKET } from "@/lib/car-photos";
import { lookupKey, searchCarImages, type CarImageLookup } from "@/lib/car-image-search";
import type { Diecast } from "@/lib/types";

/** Lookups running at once. The search fans out to several wikis per car. */
const CONCURRENCY = 3;
/** Cars saved per write, so stopping part-way keeps what was already found. */
const SAVE_EVERY = 25;

type Progress = {
  done: number;
  total: number;
  updated: number;
  unchanged: number;
  missing: number;
};

const isUploadedPhoto = (url?: string) =>
  Boolean(url && url.includes(`/storage/v1/object/public/${CAR_PHOTOS_BUCKET}/`));

const lookupOf = (c: Diecast): CarImageLookup => ({
  make: c.make,
  model: c.model,
  variant: c.variant,
  year: c.year ? String(c.year) : "",
  colour: c.colour,
  brand: c.brand,
  assortment: c.assortment,
  series: c.series,
  subSeries: c.subSeries,
  carNumber: c.carNumber,
});

/**
 * Admin → Refresh car photos: runs every car through the same photo search the
 * add-car form uses and saves the best match. Works on the signed-in account's
 * collection (the database only lets an account write its own cars).
 */
export function AdminImageRefresh() {
  const cars = useCars();
  const { bulkUpdateCars } = useCarsActions();
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [keepUploads, setKeepUploads] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);
  // A run outlives many renders; saves go through the latest store and apply
  // the new photo to the latest copy of each car, so an edit made meanwhile
  // is not written back over.
  const latest = useRef({ cars, bulkUpdateCars });
  latest.current = { cars, bulkUpdateCars };

  const targets = cars.filter((c) => {
    if (!(c.make || c.model || c.brand)) return false;
    if (onlyMissing && c.imageUrl) return false;
    if (keepUploads && isUploadedPhoto(c.imageUrl)) return false;
    return true;
  });

  const run = async () => {
    setConfirming(false);
    stopRef.current = false;
    setRunning(true);

    // Identical cars share one search.
    const groups = new Map<string, Diecast[]>();
    for (const c of targets) {
      const k = lookupKey(lookupOf(c));
      groups.set(k, [...(groups.get(k) ?? []), c]);
    }
    const queue = [...groups.values()];
    const stats: Progress = {
      done: 0,
      total: targets.length,
      updated: 0,
      unchanged: 0,
      missing: 0,
    };
    setProgress({ ...stats });

    let pending: { id: string; imageUrl: string }[] = [];
    const flush = () => {
      if (!pending.length) return;
      const byId = new Map(latest.current.cars.map((c) => [c.id, c]));
      const rows = pending.flatMap((p) => {
        const car = byId.get(p.id);
        return car ? [{ ...car, imageUrl: p.imageUrl }] : [];
      });
      pending = [];
      if (rows.length) {
        latest.current.bulkUpdateCars(
          rows,
          `refreshing ${rows.length} car photo${rows.length === 1 ? "" : "s"}`,
        );
      }
    };

    const worker = async () => {
      while (queue.length && !stopRef.current) {
        const group = queue.shift()!;
        const candidates = await searchCarImages(lookupOf(group[0]));
        const best = candidates[0]?.url;
        for (const c of group) {
          if (!best) stats.missing++;
          else if (best === c.imageUrl) stats.unchanged++;
          else {
            pending.push({ id: c.id, imageUrl: best });
            stats.updated++;
          }
          stats.done++;
        }
        if (pending.length >= SAVE_EVERY) flush();
        setProgress({ ...stats });
      }
    };

    try {
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    } finally {
      flush();
      setRunning(false);
    }

    const summary = `${stats.updated} updated · ${stats.unchanged} already current · ${stats.missing} with no match`;
    if (stopRef.current) toast.info("Photo refresh stopped", { description: summary });
    else toast.success("Photo refresh finished", { description: summary });
  };

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <section className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ImageDown className="size-4 text-muted-foreground" />
            Refresh car photos
          </h2>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Finds a new photo for every car in your collection from its brand, make, model, colour,
            year and assortment — the card when one can be found — and replaces the current one.
            Keep this page open while it runs. Each batch can be undone.
          </p>
        </div>
        {running ? (
          <Button variant="outline" onClick={() => (stopRef.current = true)} className="gap-1.5">
            <Square className="size-3.5" />
            Stop
          </Button>
        ) : (
          <Button
            onClick={() => setConfirming(true)}
            disabled={!targets.length}
            className="gap-1.5"
          >
            <ImageDown className="size-4" />
            Refresh {targets.length.toLocaleString()} {targets.length === 1 ? "photo" : "photos"}
          </Button>
        )}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2.5">
          <span className="text-sm">
            Only cars without a photo
            <span className="block text-[11px] text-muted-foreground">
              Leave existing photos alone
            </span>
          </span>
          <Switch checked={onlyMissing} onCheckedChange={setOnlyMissing} disabled={running} />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2.5">
          <span className="text-sm">
            Keep photos you uploaded
            <span className="block text-[11px] text-muted-foreground">
              Your own camera shots are not replaced
            </span>
          </span>
          <Switch checked={keepUploads} onCheckedChange={setKeepUploads} disabled={running} />
        </label>
      </div>

      {progress && (
        <div className="mt-4 space-y-1.5" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] tabular-nums text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              {running && <Loader2 className="size-3 animate-spin" />}
              {progress.done.toLocaleString()} of {progress.total.toLocaleString()} ({pct}%)
            </span>
            <span>
              {progress.updated} updated · {progress.unchanged} current · {progress.missing} no
              match
            </span>
          </div>
        </div>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace {targets.length.toLocaleString()} photos?</AlertDialogTitle>
            <AlertDialogDescription>
              {onlyMissing
                ? "Cars without a photo get the best match found."
                : "Every car's current photo is replaced with the best match found. Cars with no match keep the photo they have."}{" "}
              {keepUploads ? "Photos you uploaded are kept." : "This includes photos you uploaded."}{" "}
              It can take a while for a large collection.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void run()}>Refresh photos</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
