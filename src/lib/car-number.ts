/**
 * Ordering by the number printed on the card.
 *
 * A car number is printed, not counted: "213/250", "042", "11/12", "#5", or
 * nothing at all. Read as text, 42 comes after 213; read as a number, "11/12"
 * and "11/250" are the same car. So the comparison is the browser's own
 * numeric collation, which reads each run of digits as a number and the rest as
 * letters — 042 and 42 land together, 11/12 sorts before 11/250, and HW-5 sorts
 * before HW-42.
 *
 * A car with no number goes last whichever way the arrow points. "Not printed"
 * is not a low number, and a page that opens with forty blanks has buried what
 * you asked to see.
 */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/**
 * What was typed, from its first letter or digit on. "#80" is the number 80
 * with the hash a card reader left on it, and a lone dash is somebody writing
 * "none" into a box that wanted a number — punctuation in front would sort
 * both of them ahead of 1, which is neither what they say nor what they are.
 */
const printed = (v: unknown) =>
  String(v ?? "")
    .trim()
    .replace(/^[^\p{L}\p{N}]+/u, "");

/** Ascending. Multiply by -1 for descending — the blanks stay at the bottom. */
export function compareCarNumbers(a: unknown, b: unknown, sign: 1 | -1 = 1): number {
  const x = printed(a);
  const y = printed(b);
  if (!x || !y) return x === y ? 0 : x ? -1 : 1;
  return collator.compare(x, y) * sign;
}
