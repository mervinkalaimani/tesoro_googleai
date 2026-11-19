import { Camera, ImagePlus, MessageSquarePlus, RefreshCw, X } from "lucide-react";
import { useRef, useState } from "react";

import { IosGroup } from "@/components/ios-field";
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

import { api, MAX_PHOTOS } from "../db";
import { readPhoto } from "../photos";
import { useMarket, run } from "../use-market";
import { Pill } from "./bits";

/**
 * Seller: up to MAX_PHOTOS photos. Controlled; with `targetId` (a saved listing
 * or event) every change is saved at once, and buyers' open requests show here.
 * Once live a photo can only be replaced, never removed.
 */
export function PhotoEditor({
  value,
  onChange,
  targetId,
  locked,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  targetId?: string;
  /** Live: replace only. */
  locked?: boolean;
}) {
  const { s } = useMarket();
  const pick = useRef<HTMLInputElement>(null);
  const slot = useRef(-1);
  const open = targetId
    ? s.photoRequests.filter((r) => r.targetId === targetId && r.status === "open")
    : [];
  const put = (next: string[]) => {
    if (targetId) {
      const r = api.setPhotos(targetId, next);
      if (!run(r).ok) return;
    }
    onChange(next);
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    try {
      const url = await readPhoto(f);
      const i = slot.current;
      put(i >= 0 ? value.map((p, j) => (j === i ? url : p)) : [...value, url]);
    } catch {
      run({ ok: false, error: "That file isn't a photo we can read." });
    }
  };
  const ask = (i: number) => {
    slot.current = i;
    pick.current?.click();
  };
  const wanted = (i: number) => open.some((r) => r.kind === "replace" && r.index === i);
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-medium text-muted-foreground">
        Photos ({value.length}/{MAX_PHOTOS})
      </h2>
      <IosGroup>
        <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-5">
          {value.map((p, i) => (
            <div key={i} className="space-y-1">
              <div
                className={cn(
                  "relative aspect-square overflow-hidden rounded-lg border",
                  wanted(i) && "border-amber-500 ring-2 ring-amber-500/40",
                )}
              >
                <img src={p} alt={`Photo ${i + 1}`} className="size-full object-cover" />
                {!locked && (
                  <button
                    type="button"
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => put(value.filter((_, j) => j !== i))}
                    className="absolute right-1 top-1 rounded-full bg-background/90 p-1"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
              <Button
                type="button"
                variant={wanted(i) ? "default" : "outline"}
                size="sm"
                className="h-7 w-full px-1 text-xs"
                onClick={() => ask(i)}
              >
                <RefreshCw /> Replace
              </Button>
            </div>
          ))}
          {value.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => ask(-1)}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-muted/50"
            >
              <ImagePlus className="size-5" /> Add photo
            </button>
          )}
        </div>
        <input
          ref={pick}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {open.map((r) => (
          <div key={r.id} className="flex items-start gap-2 px-3.5 py-2.5 text-sm">
            <MessageSquarePlus className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <span className="min-w-0 flex-1">
              A buyer asked for{" "}
              {r.kind === "more" ? "more photos" : `a different photo ${r.index! + 1}`}
              {r.note && <span className="text-muted-foreground"> — “{r.note}”</span>}
              <span className="block text-xs text-muted-foreground">
                {r.kind === "more" ? "Add a photo to answer." : "Replace it to answer."}
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => run(api.declinePhotoRequest(r.id))}
            >
              Decline
            </Button>
          </div>
        ))}
      </IosGroup>
      {!targetId && (
        <p className="px-1 text-xs text-muted-foreground">
          Up to {MAX_PHOTOS}. Buyers can ask you for more photos or a different one; once live you
          swap a photo rather than remove it.
        </p>
      )}
    </section>
  );
}

/** Buyer: the seller's photos, with a way to ask for more or a different one. */
export function PhotoGallery({
  targetId,
  photos,
  sellerId,
  fallback,
}: {
  targetId: string;
  photos: string[];
  sellerId: string;
  /** Shown when the seller has no photos yet. */
  fallback: React.ReactNode;
}) {
  const { s, me } = useMarket();
  const [cur, setCur] = useState(0);
  const [ask, setAsk] = useState<null | "more" | "replace">(null);
  const [note, setNote] = useState("");
  const i = Math.min(cur, Math.max(photos.length - 1, 0));
  const mine = (kind: "more" | "replace", idx: number | null) =>
    s.photoRequests.some(
      (r) =>
        r.targetId === targetId &&
        r.buyerId === me?.id &&
        r.status === "open" &&
        r.kind === kind &&
        r.index === idx,
    );
  const send = () => {
    if (!ask) return;
    if (
      run(api.requestPhoto(targetId, ask, ask === "replace" ? i : null, note), "Seller asked").ok
    ) {
      setAsk(null);
      setNote("");
    }
  };
  const canAsk = !!me && me.id !== sellerId;
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border">
        {photos.length ? (
          <img
            src={photos[i]}
            alt={`Seller photo ${i + 1}`}
            className="aspect-[4/3] w-full object-cover"
          />
        ) : (
          fallback
        )}
      </div>
      {photos.length > 1 && (
        <div className="flex gap-2">
          {photos.map((p, j) => (
            <button
              key={j}
              type="button"
              aria-label={`Photo ${j + 1}`}
              onClick={() => setCur(j)}
              className={cn(
                "size-14 overflow-hidden rounded-lg border-2",
                j === i ? "border-primary" : "border-transparent opacity-70",
              )}
            >
              <img src={p} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!photos.length && <Pill>Catalogue picture only</Pill>}
        {canAsk && photos.length < MAX_PHOTOS && (
          <Button
            size="sm"
            variant="outline"
            disabled={mine("more", null)}
            onClick={() => setAsk("more")}
          >
            <Camera /> {mine("more", null) ? "Asked for more" : "Ask for more photos"}
          </Button>
        )}
        {canAsk && photos.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={mine("replace", i)}
            onClick={() => setAsk("replace")}
          >
            <RefreshCw /> {mine("replace", i) ? "Asked to replace" : "Ask for a different photo"}
          </Button>
        )}
      </div>
      <Dialog open={!!ask} onOpenChange={(o) => !o && setAsk(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {ask === "more" ? "Ask for more photos" : `Ask for a different photo ${i + 1}`}
            </DialogTitle>
            <DialogDescription>
              The seller is told right away. Sellers show up to {MAX_PHOTOS} photos.
            </DialogDescription>
          </DialogHeader>
          <textarea
            aria-label="What would you like to see?"
            rows={3}
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What would you like to see? (optional)"
            className="w-full resize-none rounded-lg border bg-transparent p-2.5 text-sm outline-none focus:border-primary"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsk(null)}>
              Cancel
            </Button>
            <Button onClick={send}>Send request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
