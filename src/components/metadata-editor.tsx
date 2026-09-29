/**
 * Everything the catalogue is described with, in one place.
 *
 * It was three rows in Advanced — Assortments, Catalogue Entries, Brand logos —
 * and the vocabulary those entries actually use, the brands and makes and
 * models and colours, could not be edited at all: a spelling lived on the cars
 * and nowhere else, so a typo was permanent. They are tabs of one editor now,
 * because they are all the same job.
 *
 * A rename rewrites every catalogue entry and every car that used the old
 * spelling, which is also how two spellings become one.
 */
import { useMemo, useState } from "react";
import { Check, Loader2, Pencil, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentControl } from "@/components/segment-control";
import { AssortmentManager } from "@/components/assortment-manager";
import { BrandLogoManager } from "@/components/brand-logo-manager";
import { CataloguePhotos } from "@/components/catalogue-photos";
import { useCatalog } from "@/lib/catalog-store";
import { META_LABEL, metaValues, renameMetaValue, type MetaField } from "@/lib/metadata-fields";

type Tab = MetaField | "assortments" | "entries" | "logos";

const TABS: { value: Tab; label: string }[] = [
  { value: "brand", label: "Brands" },
  { value: "make", label: "Makes" },
  { value: "model", label: "Models" },
  { value: "colour", label: "Colours" },
  { value: "assortments", label: "Assortments" },
  { value: "entries", label: "Entries" },
  { value: "logos", label: "Logos" },
];

const isMetaField = (t: Tab): t is MetaField =>
  t !== "assortments" && t !== "entries" && t !== "logos";

/** One field's spellings, with a rename each. */
function ValueList({ field }: { field: MetaField }) {
  const { catalog, refreshCatalog } = useCatalog();
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const values = useMemo(() => metaValues(catalog, field), [catalog, field]);
  const shown = useMemo(() => {
    const want = q.trim().toLowerCase();
    return want ? values.filter((v) => v.label.toLowerCase().includes(want)) : values;
  }, [values, q]);

  const save = async (key: string, from: string) => {
    const to = (editing?.value || "").trim();
    if (!to || to === from) {
      setEditing(null);
      return;
    }
    setBusy(key);
    const res = await renameMetaValue(field, from, to);
    setBusy(null);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    setEditing(null);
    toast.success(`${from} → ${to} · ${res.moved} row${res.moved === 1 ? "" : "s"} rewritten`);
    // The catalogue in memory still says the old thing until it is re-read.
    await refreshCatalog();
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${META_LABEL[field].toLowerCase()}…`}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {shown.length}/{values.length}
        </span>
      </div>

      <p className="border-b border-border/60 px-4 py-2 text-xs text-muted-foreground">
        Renaming rewrites every catalogue entry and every car that used the old spelling — which is
        also how two spellings become one.
      </p>

      <ul className="max-h-[28rem] divide-y divide-border/60 overflow-y-auto">
        {shown.map((v) => {
          const open = editing?.key === v.key;
          const working = busy === v.key;
          return (
            <li key={v.key} className="flex items-center gap-3 px-4 py-2.5">
              {open ? (
                <>
                  <Input
                    autoFocus
                    value={editing.value}
                    onChange={(e) => setEditing({ key: v.key, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void save(v.key, v.label);
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="h-8 text-sm"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-emerald-600"
                    onClick={() => void save(v.key, v.label)}
                  >
                    <Check className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground"
                    onClick={() => setEditing(null)}
                  >
                    <X className="size-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{v.label}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {v.count}
                  </span>
                  {working ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground"
                      title={`Rename ${v.label}`}
                      onClick={() => setEditing({ key: v.key, value: v.label })}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  )}
                </>
              )}
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="p-6 text-center text-sm text-muted-foreground">Nothing matches.</li>
        )}
      </ul>
    </div>
  );
}

export function MetadataEditor() {
  const [tab, setTab] = useState<Tab>("brand");

  return (
    <div className="space-y-4">
      <SegmentControl<Tab> value={tab} onChange={setTab} className="h-9 w-auto" options={TABS} />

      {isMetaField(tab) && <ValueList key={tab} field={tab} />}
      {tab === "assortments" && <AssortmentManager />}
      {tab === "entries" && <CataloguePhotos />}
      {tab === "logos" && <BrandLogoManager />}
    </div>
  );
}
