/**
 * The report as a file, and handing a file to the phone's own share sheet.
 *
 * The PNG is the report's HTML drawn through an SVG <foreignObject>: the page
 * is laid out by the browser as usual, serialised, and painted onto a canvas.
 * No screenshot library. The one thing it cannot do is load pictures itself,
 * so car photos are turned into data URLs first (`inlinePhotos`).
 */

/** Photos fetched and inlined; one that cannot be fetched (CORS, 404) is simply left out. */
export async function inlinePhotos(urls: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    [...new Set(urls.filter(Boolean))].map(async (u) => {
      try {
        const blob = await (await fetch(u, { signal: AbortSignal.timeout(8000) })).blob();
        if (!blob.type.startsWith("image/")) return;
        const data = await new Promise<string>((ok, no) => {
          const fr = new FileReader();
          fr.onload = () => ok(String(fr.result));
          fr.onerror = () => no(fr.error);
          fr.readAsDataURL(blob);
        });
        out.set(u, data);
      } catch {
        // Left out.
      }
    }),
  );
  return out;
}

/** Lay the HTML out off-screen, then paint it to a canvas at 2x. */
export async function renderCanvas(html: string, width: number): Promise<HTMLCanvasElement> {
  const frame = document.createElement("iframe");
  frame.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;height:10px;border:0`;
  document.body.appendChild(frame);
  try {
    await new Promise<void>((ok) => {
      frame.onload = () => ok();
      const d = frame.contentDocument!;
      d.open();
      d.write(html);
      d.close();
    });
    const doc = frame.contentDocument!;
    await doc.fonts?.ready;
    const height = Math.ceil(doc.documentElement.scrollHeight);
    const xhtml = new XMLSerializer().serializeToString(doc.documentElement);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<foreignObject x="0" y="0" width="100%" height="100%">${xhtml}</foreignObject></svg>`;
    // A data URL, not a blob URL: Chrome taints a canvas that drew a blob: SVG
    // with foreignObject, and a tainted canvas cannot be exported.
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const img = new Image();
    await new Promise<void>((ok, no) => {
      img.onload = () => ok();
      img.onerror = () => no(new Error("The report could not be drawn."));
      img.src = url;
    });
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    frame.remove();
  }
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((ok, no) =>
    c.toBlob((b) => (b ? ok(b) : no(new Error("Could not make the file."))), type, q),
  );

export const canvasToPng = (c: HTMLCanvasElement) => toBlob(c, "image/png");

/**
 * The canvas as a one-page PDF: the picture, at the size it was drawn.
 *
 * ponytail: an image, not text, so it cannot be searched or selected. It exists
 * because a share sheet needs a file and the print dialog does not produce one.
 * The real, selectable PDF is still the print route. One page keeps this to the
 * five objects a PDF needs; PDF caps a page at 14,400pt, which is ~19,000px.
 */
export async function canvasToPdf(c: HTMLCanvasElement): Promise<Blob> {
  const jpeg = new Uint8Array(await (await toBlob(c, "image/jpeg", 0.92)).arrayBuffer());
  const w = c.width * 0.375; // canvas is 2x CSS px, and 1 CSS px is 0.75pt
  const h = c.height * 0.375;
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const put = (d: Uint8Array | string) => {
    const b = typeof d === "string" ? enc.encode(d) : d;
    parts.push(b);
    size += b.length;
  };
  const obj = (n: number, body: string, stream?: Uint8Array) => {
    offsets[n] = size;
    put(`${n} 0 obj\n${body}`);
    if (stream) {
      put("\nstream\n");
      put(stream);
      put("\nendstream");
    }
    put("\nendobj\n");
  };
  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  put("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  obj(
    4,
    `<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,
    jpeg,
  );
  obj(5, `<< /Length ${content.length} >>`, enc.encode(content));
  const xref = size;
  put(`xref\n0 6\n0000000000 65535 f \n`);
  for (let i = 1; i <= 5; i++) put(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  put(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}

/** Whether this browser can hand files to the system share sheet. */
export function canShareFiles(): boolean {
  try {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      navigator.canShare?.({ files: [new File(["x"], "x.txt", { type: "text/plain" })] }) === true
    );
  } catch {
    return false;
  }
}

/** Open the native share sheet with one file. Returns false if the person closed it. */
export async function shareFile(
  blob: Blob,
  filename: string,
  title: string,
  text?: string,
): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type });
  try {
    await navigator.share({ files: [file], title, ...(text ? { text } : {}) });
    return true;
  } catch (e) {
    if ((e as Error).name === "AbortError") return false;
    throw e;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
