import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  ClipboardPaste,
  Images,
  Loader2,
  ScanLine,
  Upload,
  RefreshCw,
  Sparkles,
  FileText,
  Cpu,
} from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { ACCEPT_ATTR, imageToBase64 } from "@/lib/car-photos";
import { runClientOcr, parseTextToCarFields } from "@/lib/card-ocr";
import { readClipboardImage, useImagePaste } from "@/lib/paste-image";
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
  const [engine, setEngine] = useState<"ai" | "ocr" | "paste">("ai");
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string>("");
  const [pastedText, setPastedText] = useState("");
  const [found, setFound] = useState<ScanResult | null>(null);
  const [take, setTake] = useState<Set<ScanKey>>(new Set());

  /** The live webcam, when one is running. Null the rest of the time. */
  const [cam, setCam] = useState<MediaStream | null>(null);

  const lastFileRef = useRef<File | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Read by the stop helper and the unmount cleanup, neither of which should
  // have to wait for a re-render to know there is a camera to switch off.
  const camRef = useRef<MediaStream | null>(null);

  /**
   * The camera, on a machine that has one but no `capture` attribute.
   *
   * `capture="environment"` raises a phone's camera app and does nothing at all
   * on a desktop browser, so Scan a card offered a file picker and nothing else
   * to anybody on a computer — which is most of the webcams in the world.
   * getUserMedia is the other half of the same button.
   */
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
        "No camera, or the browser would not hand it over. Check this site's camera permission, or choose a photo.",
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

  /**
   * A card already on the clipboard.
   *
   * Screenshot, snipping tool, right-click-copy off a listing — on a computer
   * that is how an image is usually already in hand, and saving it to disk
   * first only to pick it back out of a file dialog is two steps for nothing.
   */
  // While this is open it is on top of whatever opened it, so it is the one
  // that gets the paste — a car form has a picture field listening too, and one
  // Ctrl+V should scan the card, not quietly file it as the car's photo.
  useImagePaste(open, (file) => void scan(file));

  /** The same thing from a button, for anybody who does not think in Ctrl+V. */
  const pasteFromClipboard = async () => {
    setError("");
    const res = await readClipboardImage();
    if ("error" in res) {
      setError(res.error);
      return;
    }
    await scan(res.file);
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
    setPastedText("");
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

  const scan = async (file: File | undefined | null, targetEngine = engine) => {
    if (!file) return;
    lastFileRef.current = file;
    setError("");
    setFound(null);
    setBusy(true);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });

    if (targetEngine === "ocr") {
      setBusyMessage("Reading text with on-device OCR…");
      try {
        const { text, fields } = await runClientOcr(file);
        if (text) setPastedText(text);
        const ok = processFields(fields);
        if (!ok && !text) {
          setError("Could not read any text on the image. Try taking a brighter, closer photo.");
        }
      } catch (err) {
        setError("On-device text scan failed. Try a different angle or photo.");
      } finally {
        setBusy(false);
        setBusyMessage("");
      }
      return;
    }

    // Default: AI Vision with automatic model fallback
    setBusyMessage("Reading the card with VIIV Scan…");
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
        const errMsg = body?.error || "That scan did not work.";
        setError(errMsg);
        return;
      }

      processFields(body.fields);
    } catch {
      setError("That scan did not work.");
    } finally {
      setBusy(false);
      setBusyMessage("");
    }
  };

  const parsePasted = () => {
    if (!pastedText.trim()) return;
    setError("");
    const parsed = parseTextToCarFields(pastedText);
    const ok = processFields(parsed);
    if (!ok) {
      setError(
        "Could not extract recognizable car fields from that text. Try pasting car details.",
      );
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

  const isQuotaError = /quota|429|resource_exhausted|rate limit/i.test(error);

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
            Photograph the blister card or packaging to automatically extract car details.
          </DialogDescription>
        </DialogHeader>

        {/* Scan Mode / Engine Switcher */}
        <div className="flex rounded-lg border border-border bg-muted/40 p-1 text-xs">
          <button
            type="button"
            onClick={() => {
              setEngine("ai");
              if (lastFileRef.current && !busy) void scan(lastFileRef.current, "ai");
            }}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 font-medium transition-colors",
              engine === "ai"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Sparkles className="size-3.5 text-primary" />
            VIIV Scan
          </button>
          <button
            type="button"
            onClick={() => {
              setEngine("ocr");
              if (lastFileRef.current && !busy) void scan(lastFileRef.current, "ocr");
            }}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 font-medium transition-colors",
              engine === "ocr"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="Local in-browser OCR (100% offline, zero API quota)"
          >
            <Cpu className="size-3.5 text-emerald-500" />
            On-Device OCR
          </button>
          <button
            type="button"
            onClick={() => setEngine("paste")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 font-medium transition-colors",
              engine === "paste"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <FileText className="size-3.5 text-blue-500" />
            Paste Text
          </button>
        </div>

        {engine === "paste" ? (
          <div className="space-y-2">
            <Textarea
              placeholder="Paste raw text from Google Lens, photo OCR, or web listing here…"
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              rows={4}
              className="text-xs font-mono"
            />
            <Button
              type="button"
              size="sm"
              onClick={parsePasted}
              disabled={!pastedText.trim()}
              className="w-full gap-1.5"
            >
              <Check className="size-3.5" />
              Extract Details from Text
            </Button>
          </div>
        ) : (
          <>
            {/* WHAT WAS PHOTOGRAPHED */}
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-dashed border-border bg-muted/30">
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
                <div className="absolute inset-0 grid place-items-center text-center text-xs text-muted-foreground">
                  <span className="px-6">
                    Hold the card flat and fill the frame. The small print on the back or card face
                    is where this comes from.
                  </span>
                </div>
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

            {cam ? (
              // The shutter replaces the row while the camera is up: there is
              // one thing to do with a live frame.
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="flex-1 gap-1.5"
                  disabled={busy}
                  onClick={() => void shoot()}
                >
                  <Camera className="size-3.5" />
                  Take the shot
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={stopCamera}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  disabled={busy}
                  // A phone raises its own camera app, which is better than a
                  // video element in a dialog. A computer has no such thing.
                  onClick={() => (touch ? cameraRef.current?.click() : void startCamera())}
                >
                  <Camera className="size-3.5" />
                  Camera
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  {touch ? <Images className="size-3.5" /> : <Upload className="size-3.5" />}
                  {found || error ? "Choose another" : touch ? "Gallery" : "Choose a photo"}
                </Button>
                {!touch && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={busy}
                    title="Or press Ctrl+V anywhere in this window"
                    onClick={() => void pasteFromClipboard()}
                  >
                    <ClipboardPaste className="size-3.5" />
                    Paste
                  </Button>
                )}
              </div>
            )}
            {!touch && !cam && (
              <p className="text-[11px] text-muted-foreground">
                A screenshot on the clipboard can be pasted straight in with Ctrl+V.
              </p>
            )}
          </>
        )}

        {error && (
          <div className="space-y-1.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <p className="font-medium">{error}</p>
            {isQuotaError && (
              <div className="pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 border-destructive/40 bg-background text-[11px] text-foreground hover:bg-muted"
                  onClick={() => {
                    setEngine("ocr");
                    if (lastFileRef.current) {
                      void scan(lastFileRef.current, "ocr");
                    }
                  }}
                >
                  <Cpu className="size-3 text-emerald-500" />
                  Switch to On-Device OCR (Quota-Free)
                </Button>
              </div>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {take.size} of {rows.length} will be filled in. Untick anything it got wrong.
            </p>
            <ul className="max-h-60 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border">
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

        {/* Footer arranged from left to right: Save (Fill in), Refresh (Recheck), Cancel */}
        <DialogFooter className="flex w-full flex-row items-center justify-between gap-2 border-t border-border/60 pt-3 sm:justify-between">
          {/* 1. Save (Left) */}
          <Button
            type="button"
            onClick={apply}
            disabled={take.size === 0 || busy}
            className="gap-1.5 text-xs font-semibold"
          >
            <Check className="size-4" />
            Save {take.size ? `(${take.size})` : ""}
          </Button>

          {/* 2. Refresh / Recheck (Middle) */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (engine === "paste") {
                parsePasted();
              } else if (lastFileRef.current) {
                void scan(lastFileRef.current, engine);
              }
            }}
            disabled={busy || (!lastFileRef.current && engine !== "paste")}
            className="gap-1.5 text-xs"
            title="Recheck the card image or text"
          >
            <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
            Recheck
          </Button>

          {/* 3. Cancel (Right) */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
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
