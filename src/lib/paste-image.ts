/**
 * An image on the clipboard.
 *
 * Screenshot, snipping tool, right-click-copy off a listing — on a computer
 * that is usually how a picture is already in hand, and saving it to disk only
 * to pick it back out of a file dialog is two steps for nothing.
 *
 * Two ways in, because browsers give two. The paste event carries the file with
 * it and needs no permission, so that is what every picture field listens for.
 * `navigator.clipboard.read()` needs one and is sometimes refused outright, so
 * the button is only ever an offer and says so when it fails.
 *
 * The listeners are stacked rather than each holding its own `window` handler:
 * a card scanner opens on top of a form that already has a picture field, and
 * one Ctrl+V must not both scan the card and file it as the car's photo. The
 * last field to start listening is the one on top, so it is the one that gets
 * the paste.
 */
import { useEffect, useRef } from "react";

/** The image the paste carries, if it carries one. */
export function imageOnClipboardEvent(e: ClipboardEvent): File | null {
  const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
  return item?.getAsFile() ?? null;
}

type Handler = (file: File) => void;

const stack: Handler[] = [];

function onPaste(e: ClipboardEvent) {
  const top = stack[stack.length - 1];
  if (!top) return;
  const file = imageOnClipboardEvent(e);
  if (!file) return;
  e.preventDefault();
  top(file);
}

/** Starts listening; returns the way to stop. Exported so it can be checked. */
export function pushPasteHandler(h: Handler): () => void {
  stack.push(h);
  if (stack.length === 1) window.addEventListener("paste", onPaste);
  return () => {
    const at = stack.indexOf(h);
    if (at >= 0) stack.splice(at, 1);
    if (stack.length === 0) window.removeEventListener("paste", onPaste);
  };
}

/** Takes the paste while `enabled`, unless something above it is listening. */
export function useImagePaste(enabled: boolean, onFile: Handler) {
  // Kept in a ref so a caller's inline arrow does not resubscribe every
  // render — and so the handler that runs is always the current one.
  const latest = useRef(onFile);
  latest.current = onFile;

  useEffect(() => {
    if (!enabled) return;
    return pushPasteHandler((file) => latest.current(file));
  }, [enabled]);
}

/** The Paste button's half: ask for the clipboard, or say why not. */
export async function readClipboardImage(): Promise<{ file: File } | { error: string }> {
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (!type) continue;
      const blob = await item.getType(type);
      return { file: new File([blob], `pasted.${type.split("/")[1] || "png"}`, { type }) };
    }
    return { error: "Nothing on the clipboard that looks like an image." };
  } catch {
    return {
      error: "The browser would not read the clipboard. Ctrl+V into this window works too.",
    };
  }
}
