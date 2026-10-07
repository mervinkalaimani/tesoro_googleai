import wordmarkSvg from "../../public/viiv_home_icon.svg?raw";
import monogramSvg from "../../public/viiv_icon.svg?raw";

/**
 * The wordmark is drawn with near-black lettering, which vanishes on the dark
 * theme. Inlined rather than loaded through <img>, the lettering can follow the
 * text colour while the orange letters keep theirs.
 *
 * Two near-blacks because two marks were drawn in two sittings: #0A0A0A was
 * Tesoro's, #090908 is VIIV's. Both are listed rather than one being rounded
 * to the other, since a hex that misses by a digit fails silently — as an
 * invisible logo on the dark theme.
 */
const themed = (svg: string, id: string) =>
  svg
    .replace(/#0A0A0A/gi, "currentColor")
    .replace(/#090908/gi, "currentColor")
    // Both files come out of the same editor, so their clip-path ids can collide
    // when two marks are on one page.
    .replace(/clip0_[0-9_]+/g, id)
    // Sized by the wrapper instead: width from its class, height from viewBox.
    .replace(
      /<svg([^>]*?)\swidth="[^"]*"\sheight="[^"]*"/,
      '<svg$1 style="width:100%;height:auto"',
    );

/**
 * One drawing for both marks.
 *
 * Tesoro had a wordmark for the header and another for the splash, drawn at
 * different weights. VIIV is one file, so the two names are kept — every call
 * site asks for the mark it means — and both resolve to it.
 */
export const HOME_MARK_SVG = themed(wordmarkSvg, "viiv-home-clip");
export const SPLASH_MARK_SVG = themed(wordmarkSvg, "viiv-splash-clip");
export const MONOGRAM_SVG = themed(monogramSvg, "viiv-mono-clip");

/** The splash stays up at least this long from page start, so it reads as a splash rather than a flicker. */
const SPLASH_MIN_MS = 900;

/**
 * Fades out the splash that the server rendered into the page. It is plain HTML,
 * so it is on screen before any script has loaded, and it stays there until the
 * app knows who is signed in.
 */
export function dismissSplash() {
  const el = document.getElementById("tesoro-splash");
  if (!el || el.dataset.state) return;
  el.dataset.state = "leaving";
  window.setTimeout(
    () => {
      el.dataset.state = "hidden";
    },
    Math.max(0, SPLASH_MIN_MS - performance.now()),
  );
}

/** The server-rendered splash. Styled in styles.css, outside any layer. */
export function BootSplash() {
  return (
    <div id="tesoro-splash" aria-hidden suppressHydrationWarning>
      <span className="tesoro-splash-mark" dangerouslySetInnerHTML={{ __html: SPLASH_MARK_SVG }} />
    </div>
  );
}

export function HomeScreenMark({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="VIIV"
      className={`block text-foreground [&>svg]:block ${className}`}
      dangerouslySetInnerHTML={{ __html: HOME_MARK_SVG }}
    />
  );
}

/**
 * The single mark, for somewhere four letters will not fit.
 *
 * Inlined like the wordmark rather than loaded as an <img>, for the same
 * reason: its V is near-black, and on the dark sidebar an <img> of it is an
 * orange stroke with nothing attached to it.
 */
export function MonogramMark({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="VIIV"
      className={`block text-foreground [&>svg]:block ${className}`}
      dangerouslySetInnerHTML={{ __html: MONOGRAM_SVG }}
    />
  );
}

export function SplashMark({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="VIIV"
      className={`block text-foreground [&>svg]:block ${className}`}
      dangerouslySetInnerHTML={{ __html: SPLASH_MARK_SVG }}
    />
  );
}
