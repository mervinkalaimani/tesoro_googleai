/**
 * The frosted surface the bottom bar is made of.
 *
 * One definition, because the bar is several separate pills that have to read
 * as one material: the tabs, the Home circle, the Search circle and the search
 * field that replaces them. The field was carrying its own version of this and
 * missing the hairline along its top, so it read as a box with no top edge
 * sitting on a bar that had one.
 *
 * `before:` is the highlight: a one-pixel gradient along the top, which is what
 * gives a translucent panel an edge against a dark page. Whatever uses this
 * sets `before:inset-x-*` for how far in from the corners the highlight runs.
 */
export const NAV_GLASS = `pointer-events-auto relative border border-black/10 bg-background/80 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.4)]
  backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-background/70
  before:pointer-events-none before:absolute before:top-0 before:h-px
  before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent dark:before:via-white/20`;
