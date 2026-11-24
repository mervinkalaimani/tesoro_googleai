import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const BTN =
  "glass-btn grid size-9 cursor-pointer place-items-center rounded-full text-foreground transition-transform active:scale-95 disabled:cursor-default disabled:opacity-40";

/**
 * A sideways row of cards, as on For You: arrows at the bottom right that glide a card at a time
 * on a spring (a little overshoot, then settle), and they go when every card is already in view.
 * The cards are the direct children.
 */
export function SpringRow({ children, className }: { children: ReactNode; className?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const [pos, setPos] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  const [fits, setFits] = useState(true);

  /** Pixels from one card to the next. */
  const step = () => {
    const el = track.current;
    const a = el?.children[0] as HTMLElement | undefined;
    const b = el?.children[1] as HTMLElement | undefined;
    return a && b ? b.offsetLeft - a.offsetLeft : (a?.offsetWidth ?? 1);
  };
  const settle = () => {
    cancelAnimationFrame(raf.current);
    if (track.current) track.current.style.scrollSnapType = "";
  };
  const goTo = (i: number) => {
    const el = track.current;
    if (!el) return;
    settle();
    const target = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, i * step()));
    // Snapping would fight the spring; it is handed back when the card has settled.
    el.style.scrollSnapType = "none";
    let x = el.scrollLeft;
    let v = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      v += (-170 * (x - target) - 17 * v) * dt;
      x += v * dt;
      el.scrollLeft = x;
      if (Math.abs(x - target) < 0.5 && Math.abs(v) < 6) {
        el.scrollLeft = target;
        el.style.scrollSnapType = "";
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    setPos(el.scrollLeft / step());
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 2);
  };
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const read = () => setFits(el.scrollWidth <= el.clientWidth + 2);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  const n = Array.isArray(children) ? children.length : 1;
  return (
    <>
      <div
        ref={track}
        onScroll={onScroll}
        // A finger or wheel takes over from a spring still running.
        onPointerDown={settle}
        onWheel={settle}
        className={className}
        style={{ overscrollBehaviorX: "contain" }}
      >
        {children}
      </div>
      {!fits && (
        <div className="relative z-10 -mb-5 flex items-center justify-end gap-2 pt-3">
          <button
            type="button"
            onClick={() => goTo(Math.max(0, Math.round(pos) - 1))}
            disabled={pos < 0.05}
            aria-label="Previous"
            className={BTN}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => goTo(Math.min(n - 1, Math.round(pos) + 1))}
            disabled={atEnd}
            aria-label="Next"
            className={BTN}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </>
  );
}
