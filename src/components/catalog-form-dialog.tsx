import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Loader2,
  ScanLine,
  Sparkles,
  Store,
  Car,
  IndianRupee,
  Layers,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import type { CatalogCar, ReleaseStatus } from "@/lib/catalog";
import { generateCatalogCarId } from "@/lib/car-id";
import { formatDayMonthYear } from "@/lib/format";
import { resolveCatalogUserId } from "@/lib/catalog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SegmentControl } from "@/components/segment-control";
import { CarPhotoField } from "@/components/car-photo-field";
import { CatalogueFields, type CatalogueValues } from "@/components/catalogue-fields";
import { useCars } from "@/lib/cars-store";
import { useCatalog } from "@/lib/catalog-store";
import { carSubLine } from "@/lib/car-subline";
import { useAuth } from "@/lib/auth-store";
import { CarScanDialog, type ScanResult } from "@/components/car-scan-dialog";
import { useCarImageCandidates } from "@/lib/car-image-search";
import {
  MAKE_SEED,
  COLOUR_SEED,
  TYPE_SEED,
  BRAND_SEED,
  ASSORTMENT_SEED,
  SERIES_SEED,
  SUB_SERIES_SEED,
  SIZE_SEED,
} from "@/lib/car-options";
import { MODELS_BY_MAKE, VARIANTS_BY_MODEL } from "@/lib/car-taxonomy.generated";
import { cn } from "@/lib/utils";

const RARITIES = ["Normal", "Chase", "TH", "STH"] as const;

/** A catalogue entry's secondary line, in the spelling carSubLine expects. */
const subLineOf = (c: CatalogCar) =>
  carSubLine({
    brand: c.brand,
    assortment: c.assortment,
    series: c.series,
    subSeries: c.sub_series,
    carNumber: c.car_number,
  });

export function CatalogFormDialog({
  open,
  entry,
  catalog,
  onClose,
  onSave,
  canDelete,
  onDelete,
}: {
  open: boolean;
  entry: CatalogCar | "new" | null;
  catalog: CatalogCar[];
  onClose: () => void;
  onSave: (car: CatalogCar) => Promise<boolean>;
  canDelete?: boolean;
  onDelete?: () => void;
}) {
  const { user, profile, isAdmin } = useAuth();
  const isNew = entry === "new" || !entry;
  const currentUid = user?.id || profile?.user_id;
  const isCreator = Boolean(
    !isNew &&
    entry &&
    currentUid &&
    (entry.created_by === currentUid ||
      (user?.id && entry.created_by === user.id) ||
      (profile?.user_id && entry.created_by === profile.user_id)),
  );

  // General users will only be able to edit the image.
  // For the person who added the car, they can edit all details but not delete the casting.
  // Admins can edit all details and delete the casting.
  const canEditAll = isAdmin || isCreator || isNew;
  const isImageOnly = !canEditAll;
  const effectiveCanDelete = isAdmin && canDelete;

  const [form, setForm] = useState<Partial<CatalogCar>>({
    brand: "Hot Wheels",
    make: "",
    model: "",
    variant: "",
    year: "",
    colour: "",
    type: "",
    size: "1:64",
    assortment: "Mainline",
    series: "",
    sub_series: "",
    car_number: "",
    mrp: 179,
    name: "",
    image_url: "",
    release_status: "Released",
    rarity: "Normal",
    expected_date: null,
    is_multipack: false,
    pack_size: null,
  });

  const [saving, setSaving] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  /** Ranks the suggestion lists, the same way the car form ranks them. */
  const cars = useCars();

  /**
   * What is in the box, as car_ids in the order they should read.
   *
   * Held apart from `form` because it is not a column on the entry: it is rows
   * in another table, saved after the entry itself, once the entry is certain
   * to have an id to hang them off.
   */
  const { catalog: fullCatalog, packMembers, setPackMembers } = useCatalog();
  const [members, setMembers] = useState<string[]>([]);
  const [memberQuery, setMemberQuery] = useState("");

  const byId = useMemo(() => {
    const m = new Map<string, CatalogCar>();
    for (const c of fullCatalog) m.set(c.car_id.toUpperCase(), c);
    return m;
  }, [fullCatalog]);

  const isPack = Boolean(form.is_multipack);
  const declaredSize = Number(form.pack_size) || 0;

  /**
   * What can go in the box: anything in the catalogue that is not this entry
   * and is not itself a box, minus what is already in. The database refuses
   * both, but a list that offers them and then fails is a worse way to say so.
   */
  const memberChoices = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const chosen = new Set(members.map((id) => id.toUpperCase()));
    const selfId = entry && entry !== "new" ? entry.car_id.toUpperCase() : "";
    const out: CatalogCar[] = [];
    for (const c of fullCatalog) {
      const id = c.car_id.toUpperCase();
      if (c.is_multipack || chosen.has(id) || id === selfId) continue;
      const hay = `${c.name} ${c.make} ${c.model} ${c.variant ?? ""} ${c.brand} ${c.series}`;
      if (hay.toLowerCase().includes(q)) out.push(c);
      if (out.length >= 8) break;
    }
    return out;
  }, [memberQuery, members, fullCatalog, entry]);

  useEffect(() => {
    if (!open) return;
    if (entry && entry !== "new") {
      setForm({
        ...entry,
        year: (entry.year || "").replace(/\.0+$/, ""),
        release_status: entry.release_status ?? "Released",
        rarity: entry.rarity || "Normal",
        expected_date: entry.expected_date || null,
        image_url: entry.image_url || "",
        is_multipack: Boolean(entry.is_multipack),
        pack_size: entry.pack_size ?? null,
      });
    } else {
      setForm({
        brand: "Hot Wheels",
        make: "",
        model: "",
        variant: "",
        year: "",
        colour: "",
        type: "",
        size: "1:64",
        assortment: "Mainline",
        series: "",
        sub_series: "",
        car_number: "",
        mrp: 179,
        name: "",
        image_url: "",
        release_status: "Released",
        rarity: "Normal",
        expected_date: null,
        is_multipack: false,
        pack_size: null,
      });
    }
    setMemberQuery("");
    setMembers(entry && entry !== "new" ? (packMembers[entry.car_id] ?? []) : []);
    // packMembers is read for the entry being opened; re-running when the whole
    // map changes would throw away an edit in progress the moment any other
    // pack was saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry]);

  const catalogueValues: CatalogueValues = {
    make: form.make || "",
    model: form.model || "",
    variant: form.variant || "",
    year: form.year || "",
    colour: form.colour || "",
    type: form.type || "",
    brand: form.brand || "",
    assortment: form.assortment || "",
    series: form.series || "",
    subSeries: form.sub_series || "",
    carNumber: form.car_number || "",
    size: form.size || "1:64",
    rarity: (form.rarity as CatalogueValues["rarity"]) || "Normal",
  };

  /** camelCase in, snake_case out — the only place the two spellings meet. */
  const setCatalogueValue = <K extends keyof CatalogueValues>(k: K, v: CatalogueValues[K]) => {
    const column = ({ subSeries: "sub_series", carNumber: "car_number" } as Record<string, string>)[
      k as string
    ];
    set((column ?? k) as keyof CatalogCar, v as never);
  };

  const set = <K extends keyof CatalogCar>(key: K, value: CatalogCar[K]) =>
    setForm((f) => {
      const next = { ...f, [key]: value };
      // If user hasn't typed a custom name or if it matched previous auto-name, update name
      if (key === "make" || key === "model") {
        const prevAuto = `${f.make || ""} ${f.model || ""}`.trim();
        if (!f.name || f.name === prevAuto) {
          next.name = `${next.make || ""} ${next.model || ""}`.trim();
        }
      }
      return next;
    });

  // Image search suggestions
  const imageSuggestions = useCarImageCandidates({
    make: form.make,
    model: form.model,
    variant: form.variant,
    colour: form.colour,
    year: form.year || undefined,
    brand: form.brand,
    series: form.series,
  });

  const webSearchWords = [
    form.brand,
    form.make,
    form.model,
    form.variant,
    form.colour,
    form.year,
    form.series,
    "diecast",
  ]
    .filter(Boolean)
    .join(" ");

  const onApplyScan = (scanned: ScanResult) => {
    setForm((prev) => ({
      ...prev,
      make: scanned.make || prev.make,
      model: scanned.model || prev.model,
      variant: scanned.variant || prev.variant,
      year: scanned.year || prev.year,
      colour: scanned.colour || prev.colour,
      type: scanned.type || prev.type,
      brand: scanned.brand || prev.brand,
      assortment: scanned.assortment || prev.assortment,
      series: scanned.series || prev.series,
      sub_series: scanned.subSeries || prev.sub_series,
      car_number: scanned.carNumber || prev.car_number,
      size: scanned.size || prev.size,
      name:
        prev.name ||
        `${scanned.make || prev.make || ""} ${scanned.model || prev.model || ""}`.trim(),
    }));
    toast.success("Applied card details to catalogue form");
  };

  const isPreOrder = form.release_status === "Pre Order";
  const missingMake = !isImageOnly && !form.make?.trim();
  const missingModel = !isImageOnly && !form.model?.trim();
  const missingBrand = !isImageOnly && !form.brand?.trim();
  const missingAssortment = !isImageOnly && !form.assortment?.trim();
  const missingMrp = !isImageOnly && (!form.mrp || form.mrp <= 0);

  const hasMissing =
    !isImageOnly &&
    (missingMake || missingModel || missingBrand || missingAssortment || missingMrp);

  const save = async () => {
    if (!isImageOnly && hasMissing) {
      if (missingBrand) toast.error("Brand is required");
      else if (missingMake) toast.error("Make is required");
      else if (missingModel) toast.error("Model is required");
      else if (missingAssortment) toast.error("Assortment is required");
      else if (missingMrp) toast.error("Valid MRP (₹) is required");
      return;
    }

    setSaving(true);
    const car: CatalogCar = isImageOnly
      ? {
          ...(entry as CatalogCar),
          image_url: (form.image_url || "").trim() || null,
        }
      : {
          ...(entry && entry !== "new" ? entry : {}),
          brand: (form.brand || "Hot Wheels").trim(),
          make: (form.make || "").trim(),
          model: (form.model || "").trim(),
          variant: (form.variant || "").trim(),
          year: (form.year || "").trim() || null,
          colour: (form.colour || "").trim(),
          type: (form.type || "").trim(),
          size: (form.size || "1:64").trim(),
          assortment: (form.assortment || "Mainline").trim(),
          series: (form.series || "").trim(),
          sub_series: (form.sub_series || "").trim(),
          car_number: (form.car_number || "").trim(),
          mrp: Number(form.mrp) || 179,
          image_url: (form.image_url || "").trim() || null,
          release_status: form.release_status ?? "Released",
          rarity: form.rarity || "Normal",
          expected_date: isPreOrder ? form.expected_date || null : null,
          is_multipack: isPack,
          // Only a box has a size. Clearing it alongside the flag keeps an
          // un-ticked entry from carrying "5" around invisibly.
          pack_size: isPack ? declaredSize || null : null,
          car_id: isNew
            ? generateCatalogCarId({
                brand: form.brand || "Hot Wheels",
                make: form.make || "",
                model: form.model || "",
                assortment: form.assortment || "",
                series: form.series || "",
                subSeries: form.sub_series || "",
                carNumber: form.car_number || "",
                mrp: Number(form.mrp) || 179,
              })
            : (entry as CatalogCar).car_id,
          name: (form.name || "").trim() || `${form.make} ${form.model}`.trim(),
        };

    if (isNew && catalog.some((c) => c.car_id.toUpperCase() === car.car_id.toUpperCase())) {
      setSaving(false);
      toast.error("That casting is already in the catalogue", { description: car.car_id });
      return;
    }

    const ok = await onSave(car);

    // The contents go after the entry, never before: membership rows point at
    // the pack's car_id, and on a new casting that id does not exist until the
    // entry above has landed.
    if (ok && !isImageOnly) {
      const wanted = isPack ? members : [];
      const had = packMembers[car.car_id] ?? [];
      const changed =
        wanted.length !== had.length || wanted.some((id, i) => id !== had[i]);
      if (changed) await setPackMembers(car.car_id, wanted);
    }

    setSaving(false);
    if (ok) {
      toast.success(isNew ? "Added to the catalogue" : "Catalogue entry updated", {
        description: isNew ? car.name : "Every collection with this car now shows the change.",
      });
      onClose();
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl p-4 sm:p-6">
          {/* Header */}
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl font-bold">
                <Store className="size-5 text-primary" />
                {isNew ? "New catalogue casting" : "Edit catalogue casting"}
              </DialogTitle>
              {!isImageOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 px-3 text-xs"
                  onClick={() => setScanOpen(true)}
                >
                  <ScanLine className="size-3.5" />
                  Scan card
                </Button>
              )}
            </div>
            <DialogDescription className="text-xs">
              {isImageOnly
                ? "You can update or propose the photo for this catalogue casting."
                : isNew
                  ? "Added to the shared catalogue for everyone to browse and add to their collection."
                  : "Changes are written into this casting in the shared catalogue for all collectors."}
            </DialogDescription>
          </DialogHeader>

          {/* Provenance Metadata bar if editing */}
          {!isNew && entry && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <div>
                <span className="text-muted-foreground/75">Added by:</span>{" "}
                <span className="font-semibold text-foreground">
                  {resolveCatalogUserId(entry.created_by)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground/75">Added on:</span>{" "}
                <span className="font-semibold text-foreground">
                  {formatDayMonthYear(entry.created_at) || "—"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground/75">Last updated:</span>{" "}
                <span className="font-semibold text-foreground">
                  {formatDayMonthYear(entry.updated_at) ||
                    formatDayMonthYear(entry.created_at) ||
                    "—"}
                </span>
              </div>
            </div>
          )}

          {/* SECTION 1: Release, Rarity & MRP */}
          <div className="space-y-3 rounded-lg border border-border/80 bg-muted/20 p-3 sm:p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 items-start">
              <div className="flex flex-col space-y-1.5 w-full">
                <Label className="text-xs font-semibold">Release Status</Label>
                <SegmentControl<ReleaseStatus>
                  fill
                  disabled={isImageOnly}
                  value={form.release_status ?? "Released"}
                  onChange={(v) => set("release_status", v)}
                  className="w-full h-9"
                  options={[
                    { value: "Released", label: "Released" },
                    { value: "Pre Order", label: "Pre Order" },
                  ]}
                />
              </div>

              <div className="flex flex-col space-y-1.5 w-full">
                <Label className="text-xs font-semibold">Rarity</Label>
                <SegmentControl<string>
                  fill
                  disabled={isImageOnly}
                  value={form.rarity || "Normal"}
                  onChange={(v) => set("rarity", v)}
                  className="w-full h-9"
                  options={RARITIES.map((r) => ({ value: r, label: r }))}
                />
              </div>

              <div className="flex flex-col space-y-1.5 w-full">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <IndianRupee className="size-3" /> Retail / MRP (₹) *
                </Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  disabled={isImageOnly}
                  placeholder="179"
                  value={form.mrp || ""}
                  onChange={(e) => set("mrp", Number(e.target.value) || 0)}
                  className="h-9 bg-background w-full"
                />
              </div>

              {isPreOrder && (
                <div className="flex flex-col space-y-1.5 w-full">
                  <Label className="text-xs font-semibold">Expected Release Date</Label>
                  <Input
                    type="date"
                    disabled={isImageOnly}
                    value={form.expected_date || ""}
                    onChange={(e) => set("expected_date", e.target.value || null)}
                    className="h-9 bg-background w-full"
                  />
                </div>
              )}
            </div>
          </div>

          {/* MAIN 2-COLUMN SECTION: Left Image, Right Specifications */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Image Column (4 cols) */}
            <div className="space-y-3 lg:col-span-4">
              <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">
                  Casting Image
                </h3>
                <CarPhotoField
                  value={form.image_url || ""}
                  onChange={(url) => set("image_url", url)}
                  suggestions={imageSuggestions}
                  searchQuery={webSearchWords}
                />
              </div>
            </div>

            {/* Specifications Column (8 cols) */}
            <div className="space-y-3 lg:col-span-8">
              <div className="rounded-lg border border-border/80 bg-muted/20 p-3 sm:p-4 space-y-3">
                <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
                  <Car className="size-3.5 text-primary" />
                  <span>Casting Specifications</span>
                </h3>

                {/* A box of cars rather than one casting. The cars inside are
                    ordinary catalogue entries — the five Ferraris of a 5-pack
                    are filed in their own right — so what this adds is only the
                    fact that they come in one package. */}
                <div className="space-y-2.5 rounded-lg border border-border/80 bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <label className="flex cursor-pointer select-none items-center gap-2">
                      <input
                        type="checkbox"
                        disabled={isImageOnly}
                        checked={isPack}
                        onChange={(e) => set("is_multipack", e.target.checked)}
                        className="size-4 rounded border-input accent-primary"
                      />
                      <span className="text-xs font-semibold">This is a multipack</span>
                    </label>
                    <span className="flex-1 text-[11px] text-muted-foreground">
                      A box of cars sold together, bought once, for one price.
                    </span>
                    {isPack && (
                      <div className="flex items-center gap-2">
                        <Label className="text-[11px] text-muted-foreground">Cars in the box</Label>
                        <Input
                          type="number"
                          min={2}
                          max={24}
                          disabled={isImageOnly}
                          value={declaredSize || ""}
                          onChange={(e) => set("pack_size", Number(e.target.value) || null)}
                          className="h-8 w-16 bg-background text-center tabular-nums"
                          aria-label="Cars in the box"
                        />
                      </div>
                    )}
                  </div>

                  {isPack && (
                    <div className="space-y-2 border-t border-border/50 pt-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold">What&rsquo;s inside</span>
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                          {declaredSize
                            ? `${members.length} of ${declaredSize} listed`
                            : `${members.length} listed`}
                        </span>
                      </div>

                      {members.map((id, i) => {
                        const m = byId.get(id.toUpperCase());
                        return (
                          <div
                            key={id}
                            className="flex items-center gap-2 rounded-md border border-border bg-background/60 p-1.5"
                          >
                            <span className="w-5 shrink-0 text-center text-[11px] font-semibold tabular-nums text-muted-foreground">
                              {i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-medium">
                                {m?.name || id}
                              </div>
                              <div className="truncate text-[10px] text-muted-foreground">
                                {m ? subLineOf(m) : "Not in the catalogue"}
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              disabled={isImageOnly}
                              onClick={() => setMembers((xs) => xs.filter((x) => x !== id))}
                              aria-label={`Remove ${m?.name || id} from the pack`}
                              className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                            >
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        );
                      })}

                      <div className="relative">
                        <Input
                          disabled={isImageOnly}
                          value={memberQuery}
                          onChange={(e) => setMemberQuery(e.target.value)}
                          placeholder="Search the catalogue to add a car…"
                          className="h-8 bg-background"
                          aria-label="Add a car to the pack"
                        />
                        {memberChoices.length > 0 && (
                          <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
                            {memberChoices.map((c) => (
                              <button
                                key={c.car_id}
                                type="button"
                                onClick={() => {
                                  setMembers((xs) => [...xs, c.car_id]);
                                  setMemberQuery("");
                                }}
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-xs font-medium">{c.name}</div>
                                  <div className="truncate text-[10px] text-muted-foreground">
                                    {subLineOf(c)}
                                  </div>
                                </div>
                                <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {declaredSize > 0 && members.length !== declaredSize && (
                        <p className="text-[11px] text-muted-foreground">
                          {members.length < declaredSize
                            ? `${declaredSize - members.length} still to add — you can finish this later.`
                            : `${members.length - declaredSize} more than the box holds.`}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* The same thirteen fields the car form edits, from the same
                    component — so a brand narrows its assortments here too, and
                    the labels cannot drift apart again. Rarity is omitted: this
                    dialog keeps it upstairs beside Release Status. */}
                <CatalogueFields
                  values={catalogueValues}
                  onChange={setCatalogueValue}
                  cars={cars}
                  omit={["rarity"]}
                  disabled={isImageOnly}
                />

                <div className="space-y-1 pt-1 border-t border-border/50">
                  <Label className="text-xs">Display Name (Casting Name)</Label>
                  <Input
                    disabled={isImageOnly}
                    value={form.name || ""}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder={`${form.make || "Make"} ${form.model || "Model"}`.trim()}
                    className="h-8 bg-background"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Auto-generated from Make and Model if left blank.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="mt-2 flex flex-row items-center justify-between gap-2 border-t border-border pt-3 sm:justify-between">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={saving}
                className="text-muted-foreground hover:text-foreground"
              >
                Cancel
              </Button>
              {!isNew && effectiveCanDelete && onDelete && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onDelete}
                  disabled={saving}
                  className="gap-1.5 text-rose-500 hover:bg-rose-500/10 hover:text-rose-400 border-border"
                >
                  <Trash2 className="size-3.5" />
                  <span>Remove</span>
                </Button>
              )}
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => void save()}
              disabled={saving || hasMissing}
              className="gap-1.5 font-semibold"
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              {isNew ? "Add to catalogue" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CarScanDialog open={scanOpen} onOpenChange={setScanOpen} onApply={onApplyScan} />
    </>
  );
}
