const SEL = ".card-elevated, .haze";

/** A soft glow in the theme colour under the pointer on any card. CSS paints it from --mx/--my/--h. */
export function startCardHaze(): () => void {
  let cur: HTMLElement | null = null;
  const off = () => cur?.style.setProperty("--h", "0");
  const move = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const el = (e.target as Element | null)?.closest<HTMLElement>(SEL) ?? null;
    if (el !== cur) {
      off();
      cur = el;
    }
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
    el.style.setProperty("--h", "1");
  };
  document.addEventListener("pointermove", move, { passive: true });
  document.addEventListener("pointerleave", off);
  return () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerleave", off);
  };
}
