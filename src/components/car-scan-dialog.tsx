import { useEffect, useRef, useState } from "react";
import { Camera, Check, Images, Loader2, ScanLine, Upload } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ACCEPT_ATTR, imageToBase64 } from "@/lib/car-photos";

/**
 * Photograph the card, keep what it read.
 *
 * Typing a casting in is twelve fields of small print off the back of a
 * blister, and most of it is printed right there. This takes a picture of it
 * instead and proposes what it found — proposes, not applies: a scan is a
 * reading of a photograph, and the person holding the card is the one who knows
 * whether it got the series right.
 *
 * Everything comes back ticked and everything can be unticked, and a field the
 * scan left blank is not offered at all. Nothing already typed into the form is
 * touched unless its row is ticked.
 */

/** Mirrors the server route's field list, in the order the form asks for them. */
const FIELDS = [
  { key: "make", label: "Make" },
  { key: "model", label: "Model" },
  { key: "variant", label: "Variant" },
  { key: "year", label: "Year" },
  { key: "colour", label: "Colour" },
  { key: "type", label: "Type" },
  { key: "brand", label: "Brand" },
  { key: "assortment", label: "Assortment" },
  { key: "series", label: "Series" },
  { key: "subSeries", label: "Sub series" },
  { key: "carNumber", label: "Car number" },
  { key: "size", label: "Scale" },
] as const;

export type ScanKey = (typeof FIELDS)[number]["key"];
export type ScanResult = Partial<Record<ScanKey, string>>;

/** Coarse pointer means a phone: offer the camera first, because there is one. */
function useTouchDevice(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    setTouch(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setTouch(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return touch;
}

export function CarScanDialog({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The ticked fields, applied over whatever the form currently holds. */
  onApply: (fields: ScanResult) => void;
}) {
  const touch = useTouchDevice();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string>("");
  const [found, setFound] = useState<ScanResult | null>(null);
  const [take, setTake] = useState<Set<ScanKey>>(new Set());

  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // One scan per visit. Reopening to do another card should not open on the
  // last card's answers.
  useEffect(() => {
    if (open) return;
    setBusy(false);
    setError("");
    setFound(null);
    setTake(new Set());
    setPreview((url) => {
      if (url) URL.revokeObjectURL(url);
      return "";
    });
  }, [open]);

  const scan = async (file: File | undefined | null) => {
    if (!file) return;
    setError("");
    setFound(null);
    setBusy(true);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });

    try {
      const image = await imageToBase64(file);
      const res = await fetch("/api/scan-car", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(image),
      });
      const body = (await res.json().catch(() => null)) as {
        fields?: ScanResult;
        error?: string;
      } | null;

      if (!res.ok || !body?.fields) {
        setError(body?.error || "That scan did not work.");
        return;
      }

      const fields = body.fields;
      const filled = FIELDS.map((f) => f.key).filter((k) => (fields[k] || "").trim());
      if (filled.length === 0) {
        setError(
          "Nothing legible on that one. A flatter, closer shot of the card usually does it.",
        );
        return;
      }
      setFound(fields);
      setTake(new Set(filled));
    } catch {
      setError("That scan did not work.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: ScanKey) =>
    setTake((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const apply = () => {
    if (!found) return;
    const out: ScanResult = {};
    for (const key of take) {
      const v = (found[key] || "").trim();
      if (v) out[key] = v;
    }
    onApply(out);
    onOpenChange(false);
  };

  const rows = found
    ? FIELDS.filter((f) => (found[f.key] || "").trim())
    : ([] as { key: ScanKey; label: string }[]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
              <ScanLine className="size-3.5" />
            </span>
            Scan the card
          </DialogTitle>
          <DialogDescription>
            Photograph the blister card or the box. What it reads comes back as a list you can
            correct before any of it reaches the form.
          </DialogDescription>
        </DialogHeader>

        {/* WHAT WAS PHOTOGRAPHED */}
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-dashed border-border bg-muted/30">
          {preview ? (
            <img src={preview} alt="" className="absolute inset-0 size-full object-contain" />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-center text-xs text-muted-foreground">
              <span className="px-6">
                Hold the card flat and fill the frame. The small print on the back is where most of
                this comes from.
              </span>
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 grid place-items-center gap-2 bg-background/70">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {touch && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              disabled={busy}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className="size-3.5" />
              Camera
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={touch ? "flex-1 gap-1.5" : "gap-1.5"}
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {touch ? <Images className="size-3.5" /> : <Upload className="size-3.5" />}
            {found || error ? "Try another" : touch ? "Gallery" : "Choose a photo"}
          </Button>
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {rows.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {take.size} of {rows.length} will be filled in. Untick anything it got wrong.
            </p>
            <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border">
              {rows.map((f) => (
                <li key={f.key}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2">
                    <Checkbox
                      checked={take.has(f.key)}
                      onCheckedChange={() => toggle(f.key)}
                      aria-label={`Use the scanned ${f.label.toLowerCase()}`}
                    />
                    <span className="w-24 shrink-0 text-[11px] text-muted-foreground">
                      {f.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {found?.[f.key]}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={apply} disabled={take.size === 0} className="gap-1.5">
            <Check className="size-4" />
            Fill in {take.size || ""} {take.size === 1 ? "field" : "fields"}
          </Button>
        </DialogFooter>

        {/* `capture` is what raises the camera rather than the gallery. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            void scan(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          onChange={(e) => {
            void scan(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
