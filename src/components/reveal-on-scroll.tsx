import { useEffect } from "react";

/**
 * Cards rise into place as they scroll into view, a beat apart.
 *
 * It works on the glass cards themselves (`.card-elevated`), wherever they are,
 * so no page has to opt in: a MutationObserver finds the ones that mount, and an
 * IntersectionObserver reveals each as it enters the screen. The ones that come
 * into view together are staggered in reading order, which is the delay.
 *
 * Left alone: a card inside another card (the outer one moves, and the inner
 * ones with it), anything in a dialog, drawer or pop-up (those have their own
 * entrance), and everything when the system asks for less motion.
 */
export function RevealOnScroll() {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        const arriving = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top ||
              a.boundingClientRect.left - b.boundingClientRect.left,
          );
        arriving.forEach((e, i) => {
          const el = e.target as HTMLElement;
          io.unobserve(el);
          el.style.setProperty("--rd", `${Math.min(i, 9) * 70}ms`);
          el.classList.add("reveal-in");
        });
      },
      { rootMargin: "0px 0px -4% 0px", threshold: 0.04 },
    );

    const consider = (el: Element) => {
      if (seen.has(el)) return;
      seen.add(el);
      if (el.closest("[role=dialog], [data-radix-popper-content-wrapper], .no-reveal")) return;
      if (el.parentElement?.closest(".card-elevated")) return;
      el.classList.add("reveal");
      io.observe(el);
    };
    const scan = (root: ParentNode) => root.querySelectorAll(".card-elevated").forEach(consider);

    scan(document);
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          if (n.matches(".card-elevated")) consider(n);
          scan(n);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io.disconnect();
    };
  }, []);

  return null;
}
