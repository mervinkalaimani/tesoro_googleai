import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, RefreshCw, ScanLine, Sparkles, Upload } from "lucide-react";

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
import { useImagePaste } from "@/lib/paste-image";
import { useAuth } from "@/lib/auth-store";
import { scansLeft } from "@/lib/tiers";
import { cn } from "@/lib/utils";
import { authHeader } from "@/lib/api-auth";

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
 *
 * One reader, one camera. There used to be three engines — the model, an
 * on-device OCR and a box to paste text into — chosen from a switcher above a
 * picture nobody had taken yet. Two of them read worse than the one, and a
 * choice between readers is not a choice anybody has the information to make
 * before they have seen a result. So: VIIV Scan, through the lens, and the
 * upload underneath for a photograph already taken.
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
  const { profile, isGuest, reloadProfile } = useAuth();
  // The same credit the camera search spends, because it is the same route and
  // the same key. Null is no ceiling; 0 is none left.
  const left = isGuest ? null : scansLeft(profile);
  const spent = left === 0;

  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string>("");
  const [found, setFound] = useState<ScanResult | null>(null);
  const [take, setTake] = useState<Set<ScanKey>>(new Set());

  /** The live camera, when one is running. Null the rest of the time. */
  const [cam, setCam] = useState<MediaStream | null>(null);

  const lastFileRef = useRef<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Read by the stop helper and the unmount cleanup, neither of which should
  // have to wait for a re-render to know there is a camera to switch off.
  const camRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    camRef.current?.getTracks().forEach((t) => t.stop());
    camRef.current = null;
    setCam(null);
  };

  const startCamera = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // The back camera on anything that has two; ignored where there is one.
        video: { facingMode: "environment", width: { ideal: 1920 } },
      });
      camRef.current = stream;
      setCam(stream);
    } catch {
      // A refusal and an absence look the same from here, and the answer to
      // both is the same: use a photo instead.
      setError(
        "No camera, or the browser would not hand it over. Check this site's camera permission, or upload a photo.",
      );
    }
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !cam) return;
    v.srcObject = cam;
    void v.play().catch(() => {
      /* An autoplay refusal leaves a still frame; the shutter still works. */
    });
  }, [cam]);

  /**
   * The camera opens itself, once per visit.
   *
   * `tried` is what keeps a refusal from being asked for again on every render,
   * and what lets the camera be reopened by hand after a shot has been taken
   * without this effect fighting it.
   */
  const tried = useRef(false);
  useEffect(() => {
    if (!open) {
      tried.current = false;
      return;
    }
    if (tried.current || spent || preview || cam) return;
    tried.current = true;
    void startCamera();
    // startCamera is stable enough for this: it closes over setState only.
  }, [open, spent, preview, cam]);

  /**
   * A card already on the clipboard.
   *
   * While this is open it is on top of whatever opened it, so it is the one
   * that gets the paste — a car form has a picture field listening too, and one
   * Ctrl+V should scan the card, not quietly file it as the car's photo.
   */
  useImagePaste(open, (file) => void scan(file));

  /** The frame on screen, as a file the scanner can read. */
  const shoot = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", 0.92),
    );
    stopCamera();
    if (blob) await scan(new File([blob], "card.jpg", { type: "image/jpeg" }));
  };

  // One scan per visit. Reopening to do another card should not open on the
  // last card's answers.
  useEffect(() => {
    if (open) return;
    stopCamera();
    setBusy(false);
    setBusyMessage("");
    setError("");
    setFound(null);
    setTake(new Set());
    lastFileRef.current = null;
    setPreview((url) => {
      if (url) URL.revokeObjectURL(url);
      return "";
    });
  }, [open]);

  // A camera left running behind a closed dialog is a light on somebody's
  // laptop that nothing on screen explains.
  useEffect(() => () => stopCamera(), []);

  const processFields = (fields: ScanResult) => {
    const filled = FIELDS.map((f) => f.key).filter((k) => (fields[k] || "").trim());
    if (filled.length === 0) {
      setError("Nothing legible on that one. A flatter, closer shot of the card usually does it.");
      return false;
    }
    setFound(fields);
    setTake(new Set(filled));
    return true;
  };

  const scan = async (file: File | undefined | null) => {
    if (!file) return;
    if (spent) {
      setError("That is all your scans for this month. The count resets on the 1st.");
      return;
    }
    lastFileRef.current = file;
    setError("");
    setFound(null);
    setBusy(true);
    setBusyMessage("Reading the card with VIIV Scan…");
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });

    try {
      const image = await imageToBase64(file);
      // The route checks who is asking before it spends a model call on them.
      const res = await fetch("/api/scan-car", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeader()) },
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

      // The allowance lives on the profile, and one of it has just gone.
      void reloadProfile();
      processFields(body.fields);
    } catch {
      setError("That scan did not work.");
    } finally {
      setBusy(false);
      setBusyMessage("");
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
      <DialogContent className="flex w-full flex-col gap-3 overflow-hidden p-0 sm:max-h-[90vh] sm:max-w-lg max-sm:fixed max-sm:inset-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:max-w-full max-sm:rounded-none">
        {/* Left aligned at every width, with what it is and what it costs at
            the right-hand end of the title. */}
        <DialogHeader className="shrink-0 space-y-0 border-b border-border/70 p-4 pb-3 text-left sm:text-left">
          <div className="flex items-start gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <ScanLine className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
                Scan the card
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  {left !== null && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {left} left
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                    <Sparkles className="size-3" />
                    VIIV Scan
                  </span>
                </span>
              </DialogTitle>
              <DialogDescription className="mt-1 text-left text-xs text-muted-foreground">
                Photograph the blister card or packaging and the details are read off it.
              </DialogDescription>
              {left !== null && (
                <p className="mt-1 text-left text-xs text-muted-foreground">
                  {spent
                    ? "No scans left this month. The count resets on the 1st."
                    : "This will use one of your monthly VIIV Scan credits."}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4">
          {/* THE LENS, or what came back through it. */}
          <div className="relative flex items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/30 max-sm:min-h-0 max-sm:flex-1 sm:aspect-[16/10]">
            {cam ? (
              <video
                ref={videoRef}
                playsInline
                muted
                className="absolute inset-0 size-full object-cover"
              />
            ) : preview ? (
              <img src={preview} alt="" className="absolute inset-0 size-full object-contain" />
            ) : (
              <p className="px-6 text-center text-xs text-muted-foreground">
                {spent
                  ? "The count resets on the 1st, and a bigger plan lifts it."
                  : "Hold the card flat and fill the frame. The small print on the back or card face is where this comes from."}
              </p>
            )}
            {busy && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 p-4 text-center">
                <Loader2 className="size-6 animate-spin text-primary" />
                <span className="text-xs font-medium text-foreground">
                  {busyMessage || "Scanning image…"}
                </span>
              </div>
            )}
          </div>

          {/* The shutter, and the upload under it. One column: they are two
              ways to do the same thing, not two halves of a row. */}
          <div className="flex shrink-0 flex-col items-center gap-2">
            {cam ? (
              <button
                type="button"
                onClick={() => void shoot()}
                disabled={busy}
                title="Take the shot"
                aria-label="Take the shot"
                className="size-16 rounded-full border-4 border-white bg-primary shadow-lg transition-transform active:scale-95 disabled:opacity-60"
              >
                <span className="mx-auto block size-11 rounded-full bg-white/90" />
              </button>
            ) : (
              <Button
                type="button"
                className="gap-1.5"
                disabled={busy || spent}
                onClick={() => void startCamera()}
              >
                <Camera className="size-4" />
                {preview ? "Scan another card" : "Open camera"}
              </Button>
            )}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              disabled={busy || spent}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-1 size-3.5" />
              Upload an image instead
            </Button>
          </div>

          {error && (
            <p className="shrink-0 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs font-medium text-destructive">
              {error}
            </p>
          )}

          {rows.length > 0 && (
            <div className="space-y-1.5 pb-1">
              <p className="text-xs text-muted-foreground">
                {take.size} of {rows.length} will be filled in. Untick anything it got wrong.
              </p>
              <ul className="divide-y divide-border/60 rounded-lg border border-border">
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
        </div>

        {/* Recheck on the left and only when something went wrong — a second
            opinion on a photograph that read fine is a credit spent to be told
            the same thing. Save on the right, where the thing you came to do
            ends up. */}
        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t border-border/60 p-4 pt-3 sm:justify-between">
          {error && lastFileRef.current ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void scan(lastFileRef.current)}
              disabled={busy || spent}
              className="gap-1.5 text-xs"
              title="Read the same picture again"
            >
              <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
              Recheck
            </Button>
          ) : (
            <span />
          )}

          <Button
            type="button"
            onClick={apply}
            disabled={take.size === 0 || busy}
            className="gap-1.5 text-xs font-semibold"
          >
            <Check className="size-4" />
            Save {take.size ? `(${take.size})` : ""}
          </Button>
        </DialogFooter>

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
