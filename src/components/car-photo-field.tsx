import { useEffect, useRef, useState } from "react";
import { Camera, ImageIcon, Images, Link2, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ACCEPT_ATTR, deleteCarPhoto, uploadCarPhoto } from "@/lib/car-photos";

/**
 * The photograph of a car: take one, pick one, drop one in, or paste a link.
 *
 * Desktop and touch get different affordances because the gestures are
 * different — there is no dragging a file onto a phone, and no camera to open
 * on most desktops. The frame itself is the drop target and the button, so on a
 * desktop there is nothing to find: the picture is where you click.
 */

/** Coarse pointer means a phone or tablet: offer the camera, not a drop zone. */
function useTouchDevice(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    // After mount only. This renders on the server too, and a first client
    // render that already knew would not match it.
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    setTouch(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setTouch(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return touch;
}

export function CarPhotoField({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (url: string) => void;
  className?: string;
}) {
  const touch = useTouchDevice();
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [broken, setBroken] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");

  // Three inputs rather than one: the OS picker they raise is different, and on
  // a phone that difference is the whole point of the three buttons.
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setBroken(false);
  }, [value]);

  const take = async (file: File | undefined | null) => {
    if (!file) return;
    setBusy(true);
    const res = await uploadCarPhoto(file);
    setBusy(false);
    if ("error" in res) {
      toast.error("Could not add that photo", { description: res.error });
      return;
    }
    // Replacing: the old one is ours and nothing else points at it.
    if (value) void deleteCarPhoto(value);
    onChange(res.url);
  };

  const remove = () => {
    const old = value;
    onChange("");
    setLink("");
    void deleteCarPhoto(old);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (touch) return;
    void take(e.dataTransfer.files?.[0]);
  };

  const applyLink = () => {
    const url = link.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast.error("That does not look like a link", {
        description: "It should start with https://",
      });
      return;
    }
    onChange(url);
    setLinkOpen(false);
  };

  const hidden = "sr-only";

  return (
    <div className={`space-y-2 ${className}`}>
      {/* THE FRAME
          object-cover, and the frame has a fixed aspect ratio — the picture
          fills it edge to edge and the overflow is cropped, so no photograph
          ever sits in a letterbox of dead space whatever shape it came in. */}
      <div
        onDragOver={(e) => {
          if (touch) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative aspect-[16/10] w-full overflow-hidden rounded-lg border-2 border-dashed transition-colors ${
          dragOver ? "border-primary bg-primary/10" : "border-border bg-muted/30"
        }`}
      >
        {value && !broken ? (
          <>
            <img
              src={value}
              alt="Car photo"
              className="absolute inset-0 size-full object-cover"
              onError={() => setBroken(true)}
            />
            <button
              type="button"
              onClick={remove}
              title="Remove this photo"
              aria-label="Remove this photo"
              className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg border border-white/20 bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-rose-600/80"
            >
              <Trash2 className="size-4" />
            </button>
          </>
        ) : (
          <button
            type="button"
            // On a desktop the frame is the button. On a phone it is not: the
            // three buttons below say which picker they open, and a frame that
            // silently picks one of them for you is a coin toss.
            onClick={() => (touch ? galleryRef.current?.click() : fileRef.current?.click())}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            {busy ? (
              <Loader2 className="size-6 animate-spin text-primary" />
            ) : (
              <ImageIcon className="size-6" />
            )}
            <span className="text-xs font-medium">
              {busy
                ? "Uploading…"
                : broken
                  ? "That image would not load"
                  : touch
                    ? "No photo yet"
                    : "Drop a photo here, or click to browse"}
            </span>
            {!touch && !busy && (
              <span className="text-[10px] text-muted-foreground">JPG, PNG or WebP</span>
            )}
          </button>
        )}

        {busy && value && (
          <div className="absolute inset-0 grid place-items-center bg-background/60">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        )}
      </div>

      {/* THE WAYS IN */}
      <div className="flex flex-wrap gap-1.5">
        {touch ? (
          <>
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              disabled={busy}
              onClick={() => galleryRef.current?.click()}
            >
              <Images className="size-3.5" />
              Gallery
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-3.5" />
              Files
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-3.5" />
            {value ? "Replace" : "Choose a file"}
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5"
          disabled={busy}
          onClick={() => {
            setLink(value && !/\/storage\/v1\/object\/public\//.test(value) ? value : "");
            setLinkOpen((v) => !v);
          }}
        >
          <Link2 className="size-3.5" />
          Link
        </Button>
      </div>

      {linkOpen && (
        <div className="flex gap-1.5">
          <Input
            autoFocus
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              // The photo field can sit inside a form; Enter here means "use
              // this link", not "save the car".
              e.preventDefault();
              applyLink();
            }}
            placeholder="https://… direct image link"
            className="h-8"
          />
          <Button type="button" size="sm" className="h-8 shrink-0" onClick={applyLink}>
            Use
          </Button>
        </div>
      )}

      {/* `capture` is what raises the camera rather than the gallery; without it
          both buttons would open the same sheet. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className={hidden}
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className={hidden}
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_ATTR}
        className={hidden}
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
