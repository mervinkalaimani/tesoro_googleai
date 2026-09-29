/**
 * What a paste is worth taking, and who gets it when two fields are listening.
 */
export {};

// The module registers a window listener the moment something starts
// listening, so there has to be a window before it is imported.
const listeners = new Map<string, (e: unknown) => void>();
(globalThis as Record<string, unknown>).window = {
  addEventListener: (t: string, f: (e: unknown) => void) => listeners.set(t, f),
  removeEventListener: (t: string) => listeners.delete(t),
};

const { imageOnClipboardEvent, pushPasteHandler } = await import("@/lib/paste-image");

let checks = 0;
function ok(cond: boolean, what: string) {
  checks++;
  if (!cond) throw new Error(`FAILED: ${what}`);
}

/** A paste event as the browser hands it over. */
const pasteOf = (...items: { type: string; file: unknown }[]) => {
  let prevented = false;
  return {
    event: {
      clipboardData: { items: items.map((i) => ({ type: i.type, getAsFile: () => i.file })) },
      preventDefault: () => {
        prevented = true;
      },
    },
    prevented: () => prevented,
  };
};

const png = { name: "shot.png" };

// What is on the clipboard.
ok(
  imageOnClipboardEvent(pasteOf({ type: "image/png", file: png }).event as never) === png,
  "an image on the clipboard is the file it carries",
);
ok(
  imageOnClipboardEvent(pasteOf({ type: "text/plain", file: png }).event as never) === null,
  "pasted text is not a picture",
);
ok(
  imageOnClipboardEvent(
    pasteOf({ type: "text/html", file: null }, { type: "image/jpeg", file: png }).event as never,
  ) === png,
  "copying from a web page brings HTML alongside the image; the image is found",
);
ok(imageOnClipboardEvent({} as never) === null, "an event with no clipboard is not a picture");

// Who gets it. A card scanner opens over a form that already has a picture
// field: one Ctrl+V must do one thing, and it must be the thing on top.
const got: string[] = [];
const stopField = pushPasteHandler(() => got.push("field"));
const fire = () => listeners.get("paste")!(pasteOf({ type: "image/png", file: png }).event);

fire();
ok(got.join() === "field", "the only field listening gets the paste");

const stopScanner = pushPasteHandler(() => got.push("scanner"));
fire();
ok(got.join() === "field,scanner", "the field that opened last gets it, and only it");

stopScanner();
fire();
ok(got.join() === "field,scanner,field", "closing the top one hands the paste back");

// Text still reaches whatever the cursor is in.
const plain = pasteOf({ type: "text/plain", file: png });
listeners.get("paste")!(plain.event);
ok(!plain.prevented(), "a paste with no image is left alone");

const image = pasteOf({ type: "image/png", file: png });
listeners.get("paste")!(image.event);
ok(image.prevented(), "a paste with an image is taken");

stopField();
ok(!listeners.has("paste"), "nothing listening means no listener left on the window");
listeners.get("paste")?.(image.event);
ok(got.filter((g) => g === "field").length === 3, "a closed field is not called again");

console.log(`ok — ${checks} checks`);
