/**
 * The brand logos, one upload each.
 *
 * The brands are not a list somebody keeps — they are whatever the catalogue
 * spells — so this is every brand in it, commonest first, with a slot for its
 * mark. PNG or SVG: a logo arrives as one of those two, and neither is
 * re-encoded on the way up, because rasterising a logo loses the transparency
 * it is drawn on.
 */
import { useMemo, useRef, useState } from "react";
import { Check, ClipboardPaste, Link2, Loader2, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCatalog } from "@/lib/catalog-store";
import { BRAND_LOGO_ACCEPT, uploadBrandLogo } from "@/lib/car-photos";
import { brandKey, clearBrandLogo, logoMap, setBrandLogo, useBrandLogos } from "@/lib/brand-logos";
import { readClipboardImage } from "@/lib/paste-image";

export function BrandLogoManager() {
  const { catalog } = useCatalog();
  const rows = useBrandLogos();
  const [busy, setBusy] = useState<string | null>(null);
  // A logo somebody else is already hosting. One row at a time, the way the
  // assortment list renames: 52 inputs to hold one URL is 51 too many.
  const [linking, setLinking] = useState<{ key: string; url: string } | null>(null);
  // One input, pointed at whichever brand was clicked: 52 hidden file inputs is
  // 52 elements to hold one value.
  const picker = useRef<HTMLInputElement>(null);
  const target = useRef<string>("");

  const logos = useMemo(() => logoMap(rows), [rows]);

  const brands = useMemo(() => {
    const counts = new Map<string, { label: string; n: number }>();
    for (const c of catalog) {
      const label = (c.brand || "").trim();
      if (!label) continue;
      const k = brandKey(label);
      const at = counts.get(k);
      if (at) at.n += 1;
      else counts.set(k, { label, n: 1 });
    }
    return [...counts.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  }, [catalog]);

  const pick = (key: string) => {
    target.current = key;
    picker.current?.click();
  };

  const onFile = async (file: File | undefined, forKey = target.current) => {
    const key = forKey;
    if (!file || !key) return;
    const label = brands.find((b) => b.key === key)?.label ?? key;

    setBusy(key);
    const up = await uploadBrandLogo(file);
    if ("error" in up) {
      setBusy(null);
      toast.error(up.error);
      return;
    }
    const err = await setBrandLogo(label, up.url);
    setBusy(null);
    if (err) toast.error(err);
    else toast.success(`${label} has a logo`);
  };

  // A logo is usually already copied off the brand's own page. There are 52
  // rows and a bare Ctrl+V could not say which one it meant, so this is a
  // button on the row rather than a listener on the window.
  const pasteFor = async (key: string) => {
    const res = await readClipboardImage();
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    await onFile(res.file, key);
  };

  const saveLink = async (key: string, label: string) => {
    const url = (linking?.url || "").trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast.error("That needs to be a http or https link.");
      return;
    }
    setBusy(key);
    const err = await setBrandLogo(label, url);
    setBusy(null);
    if (err) {
      toast.error(err);
      return;
    }
    setLinking(null);
    toast.success(`${label} has a logo`);
  };

  const remove = async (key: string, label: string) => {
    setBusy(key);
    const err = await clearBrandLogo(label);
    setBusy(null);
    if (err) toast.error(err);
    else toast.success(`${label}'s logo removed`);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
      <input
        ref={picker}
        type="file"
        accept={BRAND_LOGO_ACCEPT}
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          // Cleared, so choosing the same file twice still fires a change.
          e.target.value = "";
        }}
      />

      <p className="border-b border-border/60 px-4 py-3 text-xs text-muted-foreground">
        These are the marks the catalogue&apos;s brand filter shows. Upload a PNG, SVG, JPG or WebP,
        up to 5&nbsp;MB, paste a copied image, or paste a link to one.
      </p>

      <ul className="divide-y divide-border/60">
        {brands.map((b) => {
          const src = logos.get(b.key);
          const working = busy === b.key;
          const open = linking?.key === b.key;
          // What the frame shows while a link is being typed: the thing being
          // pasted, not the thing it is about to replace. A URL is not a
          // picture until something draws it, and finding that out after
          // saving is the wrong order.
          const typed = open ? (linking?.url ?? "").trim() : "";
          const preview = typed || src;
          return (
            <li key={b.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="grid h-9 w-16 shrink-0 place-items-center rounded-md bg-muted/40">
                {preview ? (
                  <img
                    key={preview}
                    src={preview}
                    alt=""
                    className="max-h-7 max-w-14 object-contain"
                    onError={(e) => {
                      e.currentTarget.style.visibility = "hidden";
                    }}
                    onLoad={(e) => {
                      e.currentTarget.style.visibility = "visible";
                    }}
                  />
                ) : (
                  <span className="text-[10px] uppercase text-muted-foreground">none</span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{b.label}</span>
                <span className="text-xs text-muted-foreground">
                  {b.n} {b.n === 1 ? "casting" : "castings"}
                </span>
              </span>
              {working ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground"
                    title={`Paste a link to ${b.label}'s logo`}
                    onClick={() =>
                      setLinking((at) => (at?.key === b.key ? null : { key: b.key, url: "" }))
                    }
                  >
                    <Link2 className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground"
                    title={`Paste a copied image as ${b.label}'s logo`}
                    onClick={() => void pasteFor(b.key)}
                  >
                    <ClipboardPaste className="size-3.5" />
                  </Button>
                  {src && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      title={`Remove ${b.label}'s logo`}
                      onClick={() => void remove(b.key, b.label)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => pick(b.key)}
                  >
                    <Upload className="size-3.5" />
                    {src ? "Replace" : "Upload"}
                  </Button>
                </>
              )}
              {open && (
                <span className="flex w-full items-center gap-2 pl-[4.75rem] pt-2 sm:w-auto sm:flex-1">
                  <Input
                    autoFocus
                    value={linking?.url ?? ""}
                    placeholder="https://…/logo.svg"
                    onChange={(e) => setLinking({ key: b.key, url: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveLink(b.key, b.label);
                      if (e.key === "Escape") setLinking(null);
                    }}
                    className="h-8 text-xs"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-emerald-600"
                    onClick={() => void saveLink(b.key, b.label)}
                    title="Use this link"
                  >
                    <Check className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground"
                    onClick={() => setLinking(null)}
                    title="Cancel"
                  >
                    <X className="size-4" />
                  </Button>
                </span>
              )}
            </li>
          );
        })}
        {brands.length === 0 && (
          <li className="p-6 text-center text-sm text-muted-foreground">
            The catalogue has no brands yet.
          </li>
        )}
      </ul>
    </div>
  );
}
