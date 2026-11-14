import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";

const RATIO = 16 / 10; // the photo frame everywhere else
const OUT_W = 1600;

/**
 * Drag to move, wheel or slider to zoom, over a 16:10 frame; hands back the
 * cropped JPEG. "Use whole photo" skips the crop and returns the file as-is.
 */
export function PhotoCropDialog({
  file,
  onDone,
  onCancel,
}: {
  file: File | null;
  onDone: (file: File) => void;
  onCancel: () => void;
}) {
  const [src, setSrc] = useState("");
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // image centre, px from frame centre
  const box = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    setNat({ w: 0, h: 0 });
    setZoom(1);
    setPos({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const size = () => {
    const r = box.current?.getBoundingClientRect();
    return { bw: r?.width || 1, bh: r?.height || 1 };
  };
  // Scale at which the image just covers the frame, times zoom.
  const scaleFor = (z: number) => {
    const { bw, bh } = size();
    return Math.max(bw / nat.w, bh / nat.h) * z;
  };
  const clamp = (p: { x: number; y: number }, z: number) => {
    const { bw, bh } = size();
    const s = scaleFor(z);
    // Bigger than the frame: pan within the overflow. Smaller: slide within the gap.
    const mx = Math.abs(nat.w * s - bw) / 2;
    const my = Math.abs(nat.h * s - bh) / 2;
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
  };
  const setZ = (z: number) => {
    setZoom(z);
    setPos((p) => clamp(p, z));
  };

  const ready = nat.w > 0;
  // Zoom 1 fills the frame; below it the whole photo shows with margins.
  const ra = size().bw / (nat.w || 1);
  const rb = size().bh / (nat.h || 1);
  const minZoom = ready ? Math.min(ra, rb) / Math.max(ra, rb) : 1;
  const s = ready ? scaleFor(zoom) : 1;
  const { bw, bh } = size();
  const p = ready ? clamp(pos, zoom) : pos;

  // Find the non-white content (transparent counts as white), then zoom and
  // centre it so it fills the blister box — its height, or its width if wider.
  const autoCrop = (el: HTMLImageElement) => {
    const nw = el.naturalWidth;
    const nh = el.naturalHeight;
    const k = Math.min(1, 400 / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * k));
    const h = Math.max(1, Math.round(nh * k));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(el, 0, 0, w, h);
    let d: Uint8ClampedArray;
    try {
      d = ctx.getImageData(0, 0, w, h).data;
    } catch {
      return;
    }
    let x0 = w,
      y0 = h,
      x1 = -1,
      y1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] > 20 && (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235)) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    if (x1 < 0) return; // all white: nothing to crop to
    const cw = ((x1 - x0 + 1) / k) * 1.04;
    const ch = ((y1 - y0 + 1) / k) * 1.04;
    const cx = (x0 + x1 + 1) / 2 / k;
    const cy = (y0 + y1 + 1) / 2 / k;
    const { bw: fw, bh: fh } = size();
    const sc = Math.min(fh / ch, (fh * (534 / 658)) / cw);
    const base = Math.max(fw / nw, fh / nh);
    const z = Math.min(4, Math.max(Math.min(fw / nw, fh / nh) / base, sc / base));
    const sz = base * z;
    const mx = Math.abs(nw * sz - fw) / 2;
    const my = Math.abs(nh * sz - fh) / 2;
    setZoom(z);
    setPos({
      x: Math.max(-mx, Math.min(mx, -(cx - nw / 2) * sz)),
      y: Math.max(-my, Math.min(my, -(cy - nh / 2) * sz)),
    });
  };

  const apply = () => {
    const img = new Image();
    img.onload = () => {
      const left = bw / 2 + p.x - (nat.w * s) / 2;
      const top = bh / 2 + p.y - (nat.h * s) / 2;
      const c = document.createElement("canvas");
      c.width = OUT_W;
      c.height = Math.round(OUT_W / RATIO);
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      const k = c.width / bw;
      ctx.drawImage(img, left * k, top * k, nat.w * s * k, nat.h * s * k);
      c.toBlob(
        (b) => b && onDone(new File([b], "photo.jpg", { type: "image/jpeg" })),
        "image/jpeg",
        0.9,
      );
    };
    img.src = src;
  };

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Crop photo</DialogTitle>
        </DialogHeader>
        <div
          ref={box}
          className="relative w-full cursor-grab touch-none select-none overflow-hidden rounded-lg bg-muted active:cursor-grabbing"
          style={{ aspectRatio: RATIO }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { px: e.clientX, py: e.clientY, x: p.x, y: p.y };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (d && ready)
              setPos(clamp({ x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }, zoom));
          }}
          onPointerUp={() => (drag.current = null)}
          onWheel={(e) => setZ(Math.min(4, Math.max(minZoom, zoom - e.deltaY / 500)))}
        >
          {src && (
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) => {
                setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
                autoCrop(e.currentTarget);
              }}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{
                width: nat.w * s,
                height: nat.h * s,
                transform: `translate(calc(-50% + ${p.x}px), calc(-50% + ${p.y}px))`,
                opacity: ready ? 1 : 0,
              }}
            />
          )}
          {/* Guides: thirds over the frame, and the centred portrait strip the
              blister view shows (534:658, as in BlisterTile). */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-y-0 left-1/3 border-l border-white/40" />
            <div className="absolute inset-y-0 left-2/3 border-l border-white/40" />
            <div className="absolute inset-x-0 top-1/3 border-t border-white/40" />
            <div className="absolute inset-x-0 top-2/3 border-t border-white/40" />
            <div
              className="absolute inset-y-0 left-1/2 -translate-x-1/2 border-2 border-dashed border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
              style={{ aspectRatio: "534 / 658" }}
            >
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">
                Blister view
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <Slider
            min={minZoom}
            max={4}
            step={0.01}
            value={[zoom]}
            onValueChange={([z]) => setZ(z)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Drag to move. Scroll or use the slider to zoom. The dashed box is what the blister view
          shows.
        </p>
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              disabled={!ready}
              onClick={() => imgRef.current && autoCrop(imgRef.current)}
            >
              Auto crop
            </Button>
            <Button type="button" variant="ghost" onClick={() => file && onDone(file)}>
              Use whole photo
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" onClick={apply} disabled={!ready}>
              Use photo
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
