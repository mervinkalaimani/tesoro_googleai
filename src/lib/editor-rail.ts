/**
 * Which section of a long form the reader is currently in.
 *
 * The rail beside the form highlights one entry, and "the one at the top of
 * the scrollport" is the honest answer: a section is current from the moment
 * its heading reaches the top until the next heading takes its place. Anything
 * cleverer — most-visible, largest-intersection — makes the highlight jump
 * backwards when a short section follows a tall one.
 */
export function activeSection(tops: { id: string; top: number }[], threshold = 0): string {
  if (!tops.length) return "";
  // Scrolled above the first heading, the first section is still the one being
  // read: nothing above it belongs to any other.
  let current = tops[0]!.id;
  // DOM order is visual order, so the last heading that has passed the line wins.
  for (const s of tops) {
    if (s.top - threshold <= 0) current = s.id;
  }
  return current;
}
