/** Shrink a picked photo to a ~1000px JPEG data URL so five of them fit in the demo store. */
// ponytail: data URLs in localStorage; move to object storage (URL strings) with a real backend.
export async function readPhoto(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.75);
}
