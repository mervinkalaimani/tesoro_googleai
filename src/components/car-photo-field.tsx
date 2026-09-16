import { useEffect, useRef, useState } from "react";
import {
  Check,
  Globe,
  ImageIcon,
  ImagePlus,
  Link2,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ACCEPT_ATTR, deleteCarPhoto, uploadCarPhoto } from "@/lib/car-photos";
import type { CarImageCandidate } from "@/lib/car-image-search";
import { WebImageSearchDialog } from "@/components/web-image-search-dialog";
import { cn } from "@/lib/utils";

/**
 * The photograph of a car: one found for you, one you take or pick, or a link.
 *
 * Desktop and touch get different affordances because the gestures are
 * different — there is no dragging a file onto a phone. On a phone it is one
 * button: the operating system's own sheet already offers camera, photo library
 * and files, and three buttons that each opened that same sheet were two too
 * many.
 */

/** Coarse pointer means a phone or tablet. */
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
  suggestions,
  searchQuery = "",
  layout = "stacked",
}: {
  value: string;
  onChange: (url: string) => void;
  className?: string;
  /** The car in words, for the web search button. Hidden when empty. */
  searchQuery?: string;
  /** Photos found from the car's details, offered under the frame. */
  suggestions?: { candidates: CarImageCandidate[]; loading: boolean };
  /**
   * "split" puts a smaller frame on the left and the found photos in the space
   * to its right, from lg up. Below lg it is the same stack as "stacked".
   */
  layout?: "stacked" | "split";
}) {
  const split = layout === "split";
  const touch = useTouchDevice();
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [broken, setBroken] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [webOpen, setWebOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const found = suggestions?.candidates ?? [];
  const chosen = found.find((c) => c.url === value);

  return (
    <div
      className={cn(
        "min-w-0 max-w-full overflow-hidden",
        split
          ? // Frame, buttons and link stack in the left column; the suggestions
            // take row 1 of the right column and span down beside them.
            "grid gap-2 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-x-5"
          : "space-y-2",
        className,
      )}
    >
      {/* THE FRAME */}
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
            {/* A card is portrait and a car is landscape: a found card is shown
                whole rather than cropped to its middle third. */}
            <img
              src={value}
              alt="Car photo"
              referrerPolicy="no-referrer"
              className={cn(
                "absolute inset-0 size-full",
                chosen?.kind === "card" ? "object-contain" : "object-cover",
              )}
              onError={() => setBroken(true)}
            />
            {chosen && (
              <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                {chosen.kind === "card" ? "Card" : "Photo"} · {chosen.source}
              </span>
            )}
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
            onClick={() => fileRef.current?.click()}
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

      {/* FOUND ONLINE */}
      {suggestions && (suggestions.loading || found.length > 0) && (
        <div
          className={cn(
            "space-y-1.5 min-w-0 max-w-full overflow-hidden",
            split && "min-w-0 lg:col-start-2 lg:row-span-4 lg:row-start-1",
          )}
        >
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            {suggestions.loading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Sparkles className="size-3 text-primary" />
            )}
            {suggestions.loading ? "Looking for this car…" : "Found from the details you typed"}
          </p>
          {found.length > 0 && (
            // w-0 min-w-full: the row scrolls inside whatever width it is
            // given, instead of reporting its full length upwards — the dialog
            // is a grid, and it widened to fit a dozen thumbnails.
            <div
              className={cn(
                "flex w-0 min-w-full snap-x gap-2 overflow-x-auto pb-1",
                // Beside the frame there is room to lay them all out.
                split && "lg:w-auto lg:flex-wrap lg:overflow-visible",
              )}
            >
              {found.map((c) => {
                const active = c.url === value;
                return (
                  <button
                    key={c.url}
                    type="button"
                    onClick={() => onChange(c.url)}
                    title={`${c.title} — ${c.source}`}
                    aria-label={`Use ${c.kind === "card" ? "card" : "photo"}: ${c.title}`}
                    aria-pressed={active}
                    className={cn(
                      "relative h-20 w-16 shrink-0 snap-start overflow-hidden rounded-md border bg-muted/40 transition",
                      split && "lg:h-28 lg:w-[5.25rem]",
                      active
                        ? "border-primary ring-2 ring-primary"
                        : "border-border hover:border-primary/60",
                    )}
                  >
                    <img
                      src={c.thumb}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="size-full object-contain"
                    />
                    {c.kind === "card" && (
                      <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-[9px] font-medium text-white">
                        Card
                      </span>
                    )}
                    {active && (
                      <span className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* THE WAYS IN */}
      {touch ? (
        <div className="space-y-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="size-4" />
            {value ? "Replace image" : "Add image"}
          </Button>
          {searchQuery.trim() && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => setWebOpen(true)}
            >
              <Globe className="size-4" />
              Search the web
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
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
          {searchQuery.trim() && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => setWebOpen(true)}
            >
              <Globe className="size-3.5" />
              Search the web
            </Button>
          )}
        </div>
      )}

      <WebImageSearchDialog
        open={webOpen}
        onOpenChange={setWebOpen}
        initialQuery={searchQuery}
        onPick={onChange}
      />

      {linkOpen && !touch && (
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

      {/* One input. On a phone, image/* with no `capture` is what makes the
          operating system offer camera, library and files in a single sheet;
          the extension list the desktop picker uses would narrow Android to a
          file browser. */}
      <input
        ref={fileRef}
        type="file"
        accept={touch ? "image/*" : ACCEPT_ATTR}
        className="sr-only"
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
