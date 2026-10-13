import { type ReactNode, useEffect, useRef } from "react";
import { Loader2, ArrowDown } from "lucide-react";

import { useCarsRefresh } from "@/lib/cars-store";
import { useCatalog } from "@/lib/catalog-store";

/** How far the finger has to travel before letting go reloads anything. */
const TRIGGER_PX = 64;
/** The furthest the page will come down, however hard it is pulled. */
const MAX_PULL_PX = 96;
const SPRING = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Pull down to reload, on touch screens only.
 *
 * It moves the page, not the chrome: the top bar is a sibling of `<main>` and
 * never sees this transform, so the pull happens underneath a header that
 * stays where it is. Nothing here runs on a desktop — a mouse has no
 * `touchstart`, and the wheel's own overscroll is the browser's business.
 *
 * Listeners are attached natively rather than through React because a pull has
 * to cancel the browser's own rubber-band, and `preventDefault` is ignored on
 * the passive handlers React gives you.
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const { refresh, refreshing } = useCarsRefresh();
  const { refreshCatalog } = useCatalog();
  const indicatorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  /** Read inside the listeners, so the effect never re-attaches them. */
  const run = useRef(async () => {});
  run.current = async () => {
    await Promise.allSettled([refresh(), refreshCatalog()]);
  };
  const busy = useRef(false);
  busy.current = refreshing;

  useEffect(() => {
    const content = contentRef.current;
    const indicator = indicatorRef.current;
    if (!content || !indicator) return;

    let tracking = false;
    let pulling = false;
    let startY = 0;
    let amount = 0;

    const draw = (px: number, animate: boolean) => {
      const t = animate ? `300ms ${SPRING}` : "0s";
      content.style.transition = `transform ${t}`;
      content.style.transform = px ? `translateY(${px}px)` : "";
      indicator.style.transition = `opacity ${t}, transform ${t}`;
      indicator.style.opacity = String(Math.min(1, px / TRIGGER_PX));
      indicator.style.transform = `translateY(${px}px) rotate(${(px / TRIGGER_PX) * 180}deg)`;
    };

    const onStart = (e: TouchEvent) => {
      // Only from the very top, and only while nothing is already loading.
      tracking = e.touches.length === 1 && window.scrollY <= 0 && !busy.current;
      pulling = false;
      amount = 0;
      if (tracking) startY = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY;
      if (!pulling) {
        // Upwards is ordinary scrolling, and so is anything once the page has
        // moved off the top under the finger.
        if (dy <= 0 || window.scrollY > 0) {
          tracking = false;
          return;
        }
        pulling = true;
      }
      if (e.cancelable) e.preventDefault();
      // Gives less the further it goes, so the end of the travel is felt.
      amount = MAX_PULL_PX * (1 - Math.exp(-Math.max(0, dy) / (MAX_PULL_PX * 1.4)));
      draw(amount, false);
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      const fire = pulling && amount >= TRIGGER_PX;
      pulling = false;
      amount = 0;
      if (!fire) {
        draw(0, true);
        return;
      }
      // Held open while it loads, so the spinner has somewhere to be seen.
      draw(TRIGGER_PX, true);
      void run.current().finally(() => draw(0, true));
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <>
      {/* Sits in the header's shadow and is dragged out from under it. */}
      <div
        ref={indicatorRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center opacity-0 md:hidden"
      >
        <span className="-mt-9 grid size-8 place-items-center rounded-full border border-border/60 bg-background/95 text-muted-foreground shadow-sm backdrop-blur">
          {refreshing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowDown className="size-4" />
          )}
        </span>
      </div>
      <div ref={contentRef} className="will-change-transform">
        {children}
      </div>
    </>
  );
}
