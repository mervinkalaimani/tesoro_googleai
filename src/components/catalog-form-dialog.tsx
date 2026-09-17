import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, ScanLine, Sparkles, Store, Car, IndianRupee, Layers } from "lucide-react";
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

export function CatalogFormDialog({
  open,
  entry,
  catalog,
  onClose,
  onSave,
}: {
  open: boolean;
  entry: CatalogCar | "new" | null;
  catalog: CatalogCar[];
  onClose: () => void;
  onSave: (car: CatalogCar) => Promise<boolean>;
}) {
  const isNew = entry === "new" || !entry;

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
  });

  const [saving, setSaving] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

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
      });
    }
  }, [open, entry]);

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

  // Autocomplete options derived from taxonomy & catalog
  const makeOptions = useMemo(() => {
    const setMakes = new Set<string>(MAKE_SEED);
    for (const c of catalog) if (c.make) setMakes.add(c.make);
    return [...setMakes].sort().map((m) => ({ value: m, label: m }));
  }, [catalog]);

  const modelOptions = useMemo(() => {
    const makeKey = (form.make || "").toLowerCase();
    const taxonomyModels = (MODELS_BY_MAKE as Record<string, string[]>)[makeKey] || [];
    const setModels = new Set<string>(taxonomyModels);
    for (const c of catalog) {
      if (form.make && c.make?.toLowerCase() === makeKey && c.model) {
        setModels.add(c.model);
      }
    }
    return [...setModels].sort().map((m) => ({ value: m, label: m }));
  }, [form.make, catalog]);

  const variantOptions = useMemo(() => {
    const modelKey = (form.model || "").toLowerCase();
    const taxonomyVariants = (VARIANTS_BY_MODEL as Record<string, string[]>)[modelKey] || [];
    const setVariants = new Set<string>(taxonomyVariants);
    for (const c of catalog) {
      if (form.model && c.model?.toLowerCase() === modelKey && c.variant) {
        setVariants.add(c.variant);
      }
    }
    return [...setVariants].sort().map((v) => ({ value: v, label: v }));
  }, [form.model, catalog]);

  const brandOptions = useMemo(() => {
    const setBrands = new Set<string>(BRAND_SEED);
    for (const c of catalog) if (c.brand) setBrands.add(c.brand);
    return [...setBrands].sort().map((b) => ({ value: b, label: b }));
  }, [catalog]);

  const assortmentOptions = useMemo(() => {
    const setAssortments = new Set<string>(ASSORTMENT_SEED);
    for (const c of catalog) if (c.assortment) setAssortments.add(c.assortment);
    return [...setAssortments].sort().map((a) => ({ value: a, label: a }));
  }, [catalog]);

  const colourOptions = useMemo(() => {
    const setColours = new Set<string>(COLOUR_SEED);
    for (const c of catalog) if (c.colour) setColours.add(c.colour);
    return [...setColours].sort().map((c) => ({ value: c, label: c }));
  }, [catalog]);

  const typeOptions = useMemo(() => {
    const setTypes = new Set<string>(TYPE_SEED);
    for (const c of catalog) if (c.type) setTypes.add(c.type);
    return [...setTypes].sort().map((t) => ({ value: t, label: t }));
  }, [catalog]);

  const sizeOptions = useMemo(() => SIZE_SEED.map((s) => ({ value: s, label: s })), []);

  const seriesOptions = useMemo(() => {
    const setSeries = new Set<string>(SERIES_SEED);
    for (const c of catalog) if (c.series) setSeries.add(c.series);
    return [...setSeries].sort().map((s) => ({ value: s, label: s }));
  }, [catalog]);

  const subSeriesOptions = useMemo(() => {
    const setSubSeries = new Set<string>(SUB_SERIES_SEED);
    for (const c of catalog) if (c.sub_series) setSubSeries.add(c.sub_series);
    return [...setSubSeries].sort().map((s) => ({ value: s, label: s }));
  }, [catalog]);

  // Image search suggestions
  const { candidates: imageSuggestions } = useCarImageCandidates({
    make: form.make,
    model: form.model,
    variant: form.variant,
    colour: form.colour,
    year: form.year,
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
      rarity: (scanned.rarity as string) || prev.rarity,
      name:
        prev.name ||
        `${scanned.make || prev.make || ""} ${scanned.model || prev.model || ""}`.trim(),
    }));
    toast.success("Applied card details to catalogue form");
  };

  const isPreOrder = form.release_status === "Pre Order";
  const missingMake = !form.make?.trim();
  const missingModel = !form.model?.trim();
  const missingBrand = !form.brand?.trim();
  const missingAssortment = !form.assortment?.trim();
  const missingMrp = !form.mrp || form.mrp <= 0;

  const hasMissing = missingMake || missingModel || missingBrand || missingAssortment || missingMrp;

  const save = async () => {
    if (hasMissing) {
      if (missingBrand) toast.error("Brand is required");
      else if (missingMake) toast.error("Make is required");
      else if (missingModel) toast.error("Model is required");
      else if (missingAssortment) toast.error("Assortment is required");
      else if (missingMrp) toast.error("Valid MRP (₹) is required");
      return;
    }

    setSaving(true);
    const car: CatalogCar = {
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
            </div>
            <DialogDescription className="text-xs">
              {isNew
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Release Status</Label>
                <SegmentControl<ReleaseStatus>
                  value={form.release_status ?? "Released"}
                  onChange={(v) => set("release_status", v)}
                  options={[
                    { value: "Released", label: "Released" },
                    { value: "Pre Order", label: "Pre Order" },
                  ]}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Rarity</Label>
                <SegmentControl<string>
                  value={form.rarity || "Normal"}
                  onChange={(v) => set("rarity", v)}
                  options={RARITIES.map((r) => ({ value: r, label: r }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <IndianRupee className="size-3" /> Retail / MRP (₹) *
                </Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="179"
                  value={form.mrp || ""}
                  onChange={(e) => set("mrp", Number(e.target.value) || 0)}
                  className="h-9 bg-background"
                />
              </div>

              {isPreOrder && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Expected Release Date</Label>
                  <Input
                    type="date"
                    value={form.expected_date || ""}
                    onChange={(e) => set("expected_date", e.target.value || null)}
                    className="h-9 bg-background"
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

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Brand *</Label>
                    <Combobox
                      clearable
                      value={form.brand || ""}
                      onChange={(v) => set("brand", v)}
                      options={brandOptions}
                      placeholder="Brand"
                      searchPlaceholder="Search brands…"
                      className="h-8 bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Make *</Label>
                    <Combobox
                      clearable
                      value={form.make || ""}
                      onChange={(v) => set("make", v)}
                      options={makeOptions}
                      placeholder="Make"
                      searchPlaceholder="Search makes…"
                      className="h-8 bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Model *</Label>
                    <Combobox
                      clearable
                      value={form.model || ""}
                      onChange={(v) => set("model", v)}
                      options={modelOptions}
                      placeholder="Model"
                      searchPlaceholder="Search models…"
                      className="h-8 bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Variant</Label>
                    <Combobox
                      clearable
                      value={form.variant || ""}
                      onChange={(v) => set("variant", v)}
                      options={variantOptions}
                      placeholder="Variant"
                      searchPlaceholder="Search variants…"
                      className="h-8 bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Year</Label>
                    <Input
                      value={form.year || ""}
                      onChange={(e) => set("year", e.target.value)}
                      placeholder="e.g. 2024"
                      className="h-8 bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Colour</Label>
                    <Combobox
                      clearable
                      value={form.colour || ""}
                      onChange={(v) => set("colour", v)}
                      options={colourOptions}
                      placeholder="Colour"
                      searchPlaceholder="Search colours…"
                      className="h-8 bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Vehicle Type</Label>
                    <Combobox
                      clearable
                      value={form.type || ""}
                      onChange={(v) => set("type", v)}
                      options={typeOptions}
                      placeholder="Type"
                      searchPlaceholder="Search types…"
                      className="h-8 bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Scale / Size</Label>
                    <Combobox
                      clearable
                      value={form.size || "1:64"}
                      onChange={(v) => set("size", v)}
                      options={sizeOptions}
                      placeholder="Scale"
                      searchPlaceholder="Search scales…"
                      className="h-8 bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Assortment *</Label>
                    <Combobox
                      clearable
                      value={form.assortment || "Mainline"}
                      onChange={(v) => set("assortment", v)}
                      options={assortmentOptions}
                      placeholder="Assortment"
                      searchPlaceholder="Search assortments…"
                      className="h-8 bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Series</Label>
                    <Combobox
                      clearable
                      value={form.series || ""}
                      onChange={(v) => set("series", v)}
                      options={seriesOptions}
                      placeholder="Series"
                      searchPlaceholder="Search series…"
                      className="h-8 bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Sub Series</Label>
                    <Combobox
                      clearable
                      value={form.sub_series || ""}
                      onChange={(v) => set("sub_series", v)}
                      options={subSeriesOptions}
                      placeholder="Sub series"
                      searchPlaceholder="Search sub series…"
                      className="h-8 bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Car Number</Label>
                    <Input
                      value={form.car_number || ""}
                      onChange={(e) => set("car_number", e.target.value)}
                      placeholder="e.g. 3/5 or 142/250"
                      className="h-8 bg-background"
                    />
                  </div>
                </div>

                <div className="space-y-1 pt-1 border-t border-border/50">
                  <Label className="text-xs">Display Name (Casting Name)</Label>
                  <Input
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
