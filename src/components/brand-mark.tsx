import homeScreenSvg from "../../public/tesoro_home_screen_icon.svg?raw";
import splashScreenSvg from "../../public/tesoro_splash_screen_icon.svg?raw";

/**
 * The wordmarks are drawn with near-black lettering, which vanishes on the dark
 * theme. Inlined rather than loaded through <img>, the lettering can follow the
 * text colour while the gold diamond keeps its own.
 */
const themed = (svg: string, id: string) =>
  svg
    .replace(/#0A0A0A/gi, "currentColor")
    // Both files come out of the same editor, so their clip-path ids can collide
    // when two marks are on one page.
    .replace(/clip0_[0-9_]+/g, id)
    // Sized by the wrapper instead: width from its class, height from viewBox.
    .replace(
      /<svg([^>]*?)\swidth="[^"]*"\sheight="[^"]*"/,
      '<svg$1 style="width:100%;height:auto"',
    );

export const HOME_MARK_SVG = themed(homeScreenSvg, "tesoro-home-clip");
export const SPLASH_MARK_SVG = themed(splashScreenSvg, "tesoro-splash-clip");

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
      aria-label="Tesoro"
      className={`block text-foreground [&>svg]:block ${className}`}
      dangerouslySetInnerHTML={{ __html: HOME_MARK_SVG }}
    />
  );
}

export function SplashMark({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Tesoro"
      className={`block text-foreground [&>svg]:block ${className}`}
      dangerouslySetInnerHTML={{ __html: SPLASH_MARK_SVG }}
    />
  );
}
