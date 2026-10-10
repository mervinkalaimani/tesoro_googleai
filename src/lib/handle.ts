/**
 * What a user ID is allowed to be.
 *
 * Six letters and two digits, at least, in any order: `mervink99`,
 * `42sanjaybirdar`, `hotwheels07`. The point is not strength — a handle is a
 * name, not a password, and nobody guesses an account by guessing its name —
 * it is that a short handle is somebody else's handle with one letter changed,
 * and a handle that is all letters reads as a real name to anybody being
 * impersonated with it.
 *
 * No React in here, because the database has the same rule and the signup
 * form, the rename dialog and the self-check all have to agree with it. There
 * is one sentence for a reason: two implementations of one rule is one too
 * many, and the SQL in the migration is the mirror of what is here.
 */

export const MIN_LETTERS = 6;
export const MIN_DIGITS = 2;
export const MAX_LENGTH = 20;

/** Lower case, trimmed. Everything below reads this, never the raw input. */
export function normaliseHandle(handle: string): string {
  return (handle ?? "").trim().toLowerCase();
}

function count(handle: string, re: RegExp): number {
  return (handle.match(re) ?? []).length;
}

/**
 * Why this handle is not allowed, or null when it is.
 *
 * One reason at a time, and the most useful one first: being told the charset
 * is wrong is no help to somebody whose problem is that they have no digits.
 */
export function handleError(handle: string): string | null {
  const h = normaliseHandle(handle);
  if (!h) return "Pick a user ID.";
  if (!/^[a-z0-9_]+$/.test(h)) return "Use lowercase letters, numbers and underscores only.";
  if (h.length > MAX_LENGTH) return `User ID must be ${MAX_LENGTH} characters or fewer.`;

  const letters = count(h, /[a-z]/g);
  const digits = count(h, /[0-9]/g);
  if (letters < MIN_LETTERS) {
    return `User ID needs at least ${MIN_LETTERS} letters — this one has ${letters}.`;
  }
  if (digits < MIN_DIGITS) {
    return `User ID needs at least ${MIN_DIGITS} numbers — this one has ${digits}.`;
  }
  return null;
}

export function isValidHandle(handle: string): boolean {
  return handleError(handle) === null;
}

/**
 * The nearest allowed handle to one that is not.
 *
 * Used to suggest rather than to assign: signup derives a handle from an email
 * address, and an address rarely has two digits in it. Letters are padded from
 * the handle itself so the suggestion still reads as the person's own name,
 * and the digits go on the end where a number on a name belongs.
 *
 * Deliberately not random: the same handle in gives the same suggestion out,
 * so the form does not shuffle under somebody who is reading it. The database
 * adds a counter when the suggestion is taken.
 */
export function suggestHandle(handle: string): string {
  let letters = normaliseHandle(handle).replace(/[^a-z]/g, "");
  if (!letters) letters = "viiver";
  while (letters.length < MIN_LETTERS) letters += letters;
  letters = letters.slice(0, MAX_LENGTH - MIN_DIGITS);

  const digits = normaliseHandle(handle).replace(/[^0-9]/g, "");
  const tail = (digits + "00").slice(0, MIN_DIGITS);
  return (letters + tail).slice(0, MAX_LENGTH);
}
