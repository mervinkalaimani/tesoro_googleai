import { useCallback, useEffect, useState } from "react";
import { Camera, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useCatalog } from "@/lib/catalog-store";
import { listPendingPhotos, reviewPhoto, type PhotoSubmission } from "@/lib/photo-submissions";
import { formatDayMonthYear } from "@/lib/format";

/**
 * Photographs people have sent for castings that have none, waiting for an admin or the owner.
 *
 * Approving makes the photograph the catalogue entry's picture, with the sender's name on it, and so
 * the picture of every collection that holds the casting and has none of its own. Rejecting just
 * clears it from the list. Nothing is shown to anyone else until it is approved.
 */
export function PhotoReviewCard() {
  const { catalog, refreshCatalog } = useCatalog();
  const [items, setItems] = useState<PhotoSubmission[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => setItems(await listPendingPhotos()), []);
  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = (carId: string) => {
    const c = catalog.find((x) => x.car_id.toUpperCase() === carId.toUpperCase());
    return c ? c.name || `${c.make} ${c.model}`.trim() : carId;
  };

  const decide = async (s: PhotoSubmission, approve: boolean) => {
    setBusy(s.id);
    const res = await reviewPhoto(s, approve);
    setBusy(null);
    if ("error" in res) {
      toast.error(approve ? "Could not approve" : "Could not reject", { description: res.error });
      return;
    }
    toast.success(approve ? "Approved — it is now the catalogue photo" : "Rejected");
    // The approved one and anything else waiting for the same casting have left the list.
    await load();
    if (approve) void refreshCatalog();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Camera className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Photos waiting for approval</h2>
        {items && items.length > 0 && (
          <span className="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-bold tabular-nums text-primary">
            {items.length}
          </span>
        )}
      </div>

      {items === null ? (
        <div className="card-elevated flex items-center justify-center p-6">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="card-elevated px-4 py-3 text-sm text-muted-foreground">
          Nothing waiting. When someone sends a photo for a car with none, it lands here.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((s) => (
            <div key={s.id} className="card-elevated flex gap-3 p-3">
              <a
                href={s.image_url}
                target="_blank"
                rel="noreferrer"
                title="Open the photo"
                className="block size-24 shrink-0 overflow-hidden rounded-xl bg-muted"
              >
                <img src={s.image_url} alt="" className="size-full object-cover" loading="lazy" />
              </a>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="truncate text-sm font-semibold">{nameOf(s.car_id)}</div>
                <div className="truncate text-xs text-muted-foreground">
                  From {s.submitted_by_name || "someone"} ·{" "}
                  {formatDayMonthYear(s.created_at) || s.created_at}
                </div>
                <div className="mt-auto flex gap-2 pt-2">
                  <button
                    type="button"
                    disabled={busy === s.id}
                    onClick={() => void decide(s, true)}
                    className="inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {busy === s.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy === s.id}
                    onClick={() => void decide(s, false)}
                    className="glass-btn inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold text-foreground disabled:opacity-60"
                  >
                    <X className="size-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
