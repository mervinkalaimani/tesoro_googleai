import { useEffect } from "react";

import { useSidebar } from "@/components/ui/sidebar";

/** How close to the edge a touch has to start to count as an edge swipe. */
const EDGE_PX = 28;
/** How far it has to travel inward before the sidebar opens. */
const TRAVEL_PX = 60;
/** Beyond this much vertical movement it is a scroll, not a swipe. */
const SLOP_PX = 40;

/**
 * Opens the navigation with a swipe in from either side of the screen.
 *
 * Reaching the menu meant aiming for a 40px button in the corner of the top bar
 * — the one place on a phone that is hardest to reach one-handed. Both edges
 * work: the drawer itself comes from the left, but a right-handed thumb starts
 * at the right, and there is nothing else bound to either edge to conflict with.
 *
 * Listens on the document rather than wrapping the page in a handler, so it
 * cannot interfere with anything that is scrolling or dragging inside it.
 */
export function EdgeSwipe() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    if (!isMobile || openMobile) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const fromLeft = t.clientX <= EDGE_PX;
      const fromRight = t.clientX >= window.innerWidth - EDGE_PX;
      tracking = fromLeft || fromRight;
      startX = t.clientX;
      startY = t.clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dy > SLOP_PX) {
        tracking = false;
        return;
      }
      // Inward: rightward from the left edge, leftward from the right one.
      const inward = startX <= EDGE_PX ? dx : -dx;
      if (inward > TRAVEL_PX) {
        tracking = false;
        setOpenMobile(true);
      }
    };

    const stop = () => {
      tracking = false;
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", stop, { passive: true });
    document.addEventListener("touchcancel", stop, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", stop);
      document.removeEventListener("touchcancel", stop);
    };
  }, [isMobile, openMobile, setOpenMobile]);

  return null;
}
