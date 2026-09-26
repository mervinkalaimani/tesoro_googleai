import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, ScanLine, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { CatalogCar, ReleaseStatus } from "@/lib/catalog";
import { generateCatalogCarId } from "@/lib/car-id";
import { formatDayMonthYear, inrFull } from "@/lib/format";
import { resolveCatalogUserId } from "@/lib/catalog";
import { localDay } from "@/lib/delivery-watch";
import { releasedOnInput, releasedOnStamp } from "@/lib/released";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SegmentControl } from "@/components/segment-control";
import { CarPhotoField } from "@/components/car-photo-field";
import { PhotoCandidateStrip, PhotoThumbButton } from "@/components/photo-picker";
import { CatalogueFields, type CatalogueValues } from "@/components/catalogue-fields";
import { ClearableInput, Field, FormSection } from "@/components/form-parts";
import { MultipackField } from "@/components/multipack-field";
import { DuplicateNotice } from "@/components/duplicate-notice";
import { findDuplicates, needsCarNumber } from "@/lib/duplicate";
import { packBadge } from "@/lib/pack";
import { ChaseMark } from "@/components/car-marks";
import { useCars } from "@/lib/cars-store";
import { useCatalog } from "@/lib/catalog-store";
import { carSubLine } from "@/lib/car-subline";
import { useAuth } from "@/lib/auth-store";
import { CarScanDialog, type ScanResult } from "@/components/car-scan-dialog";
import { useCarImageCandidates } from "@/lib/car-image-search";
import { cn } from "@/lib/utils";

const RARITIES = ["Normal", "Chase", "TH", "STH"] as const;

/** The first required field left empty, shown on the field itself. */
type FieldKey = keyof CatalogueValues | "mrp";
type FieldError = { field: FieldKey; message: string };

/** The fields that live behind "What the casting is". */
const IDENTITY_FIELDS = new Set<FieldKey>([
  "make",
  "model",
  "variant",
  "year",
  "colour",
  "type",
  "brand",
  "assortment",
  "series",
  "subSeries",
  "carNumber",
  "size",
  "rarity",
]);

export function CatalogFormDialog({
  open,
  entry,
  catalog,
  onClose,
  onSave,
  onAddExistingCar,
  canDelete,
  onDelete,
}: {
  open: boolean;
  entry: CatalogCar | "new" | null;
  catalog: CatalogCar[];
  onClose: () => void;
  onSave: (car: CatalogCar) => Promise<boolean>;
  onAddExistingCar?: (car: CatalogCar) => void;
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

  const [confirmNotDuplicate, setConfirmNotDuplicate] = useState(false);
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
  const { packMembers, setPackMembers } = useCatalog();
  const [members, setMembers] = useState<string[]>([]);

  /**
   * The four groups. Which casting it is and what it costs are open, because
   * every required field is in them and a shut group would be a form that looks
   * finished while being empty. The pack opens only when there is one, and the
   * photo only when it is the one thing this person may change.
   */
  const [showIdentity, setShowIdentity] = useState(true);
  const [showRelease, setShowRelease] = useState(true);
  const [showPack, setShowPack] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  /** Whether the photos found for this casting are open under the header card. */
  const [pickingPhoto, setPickingPhoto] = useState(false);
  /** Whether a second copy of this dialog is open, filing a pack member. */
  const [addingMember, setAddingMember] = useState(false);

  const [validationError, setValidationError] = useState<FieldError | null>(null);
  /** Set by Save, so the field is scrolled to once its group is open. */
  const jumpToError = useRef(false);

  const isPack = Boolean(form.is_multipack);
  const declaredSize = Number(form.pack_size) || 0;

  useEffect(() => {
    if (!open) return;
    setValidationError(null);
    setConfirmNotDuplicate(false);
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
    const existing = entry && entry !== "new" ? (packMembers[entry.car_id] ?? []) : [];
    setMembers(existing);
    // A pack is shown open, because a shut "Multipack" header is the one thing
    // on this form nobody thinks to look inside.
    setShowPack(Boolean(entry && entry !== "new" && entry.is_multipack));
    setShowIdentity(!isImageOnly);
    setShowRelease(!isImageOnly);
    setShowPhoto(isImageOnly);
    setPickingPhoto(false);
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
    setValidationError((e) => (e && e.field === k ? null : e));
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

  const errorFor = (k: FieldKey) =>
    validationError?.field === k ? validationError.message : undefined;

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
    setValidationError(null);
    setShowIdentity(true);
    toast.success("Applied card details to catalogue form");
  };

  const isPreOrder = form.release_status === "Pre Order";

  /** The standard secondary line, so the card reads like a car anywhere else. */
  const identityLine = carSubLine({
    brand: catalogueValues.brand,
    assortment: catalogueValues.assortment,
    series: catalogueValues.series,
    subSeries: catalogueValues.subSeries,
    carNumber: catalogueValues.carNumber,
  });

  /** In the order the fields appear, so the first one flagged is the first on screen. */
  const validate = (): FieldError | null => {
    if (isImageOnly) return null;
    if (!form.make?.trim()) return { field: "make", message: "Enter the make." };
    if (!form.model?.trim()) return { field: "model", message: "Enter the model." };
    if (!form.brand?.trim()) return { field: "brand", message: "Enter the brand." };
    if (!form.assortment?.trim()) return { field: "assortment", message: "Enter the assortment." };
    if (needsCarNumber(form.brand) && !form.car_number?.trim())
      return {
        field: "carNumber",
        message: `${form.brand?.trim()} prints a collector number on the box — it is what tells two near-identical castings apart.`,
      };
    if (!form.mrp || form.mrp <= 0) return { field: "mrp", message: "Enter the retail price." };
    return null;
  };

  /** What the catalogue already has that looks like this. */
  const duplicates = useMemo(
    () =>
      isImageOnly
        ? []
        : findDuplicates(
            {
              brand: form.brand,
              make: form.make,
              model: form.model,
              variant: form.variant,
              colour: form.colour,
              assortment: form.assortment,
              series: form.series,
              subSeries: form.sub_series,
              carNumber: form.car_number,
              year: form.year,
            },
            catalog,
            { excludeCarId: entry && entry !== "new" ? entry.car_id : "" },
          ),
    [
      isImageOnly,
      catalog,
      entry,
      form.brand,
      form.make,
      form.model,
      form.variant,
      form.colour,
      form.assortment,
      form.series,
      form.sub_series,
      form.car_number,
      form.year,
    ],
  );

  // Once the flagged field is rendered — its group may have to be opened first —
  // bring it into view and put the caret in it.
  useEffect(() => {
    if (!jumpToError.current || !validationError) return;
    jumpToError.current = false;
    if (IDENTITY_FIELDS.has(validationError.field)) setShowIdentity(true);
    else setShowRelease(true);
    const frame = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-field="${validationError.field}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.querySelector<HTMLElement>("input, [role=combobox], button")?.focus({
        preventScroll: true,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [validationError]);

  /** Each section says what it holds, so a shut one still tells you something. */
  const identityBadge = form.make?.trim()
    ? [form.make, form.model].filter(Boolean).join(" ").trim() || "not set"
    : "not set";
  const releaseBadge = `${form.release_status ?? "Released"} · ${inrFull(Number(form.mrp) || 0)}`;
  const photoBadge = form.image_url ? "photo set" : "no photo";

  const save = async () => {
    const error = validate();
    if (error) {
      jumpToError.current = true;
      setValidationError(error);
      return;
    }
    setValidationError(null);

    // Prevent adding duplicate catalogue entries unless user confirms it's a different release
    if (isNew && duplicates.length > 0 && !confirmNotDuplicate) {
      toast.error("Duplicate casting detected in catalogue", {
        description:
          "Please add the existing car instead, or confirm below that this is a different release.",
      });
      const el = document.getElementById("duplicate-confirmation-box");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
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
          // A pre-order has not been released, so it carries no date — the same
          // clearing the database does when a casting goes back to Pre Order.
          // A released one keeps what is typed, or nothing, and the trigger
          // fills nothing in from the first copy anybody received.
          released_at: isPreOrder ? null : releasedOnStamp(form.released_at),
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
      const changed = wanted.length !== had.length || wanted.some((id, i) => id !== had[i]);
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
        {/* The same shell Add a car uses: a column with one scrolling middle, so
            the title stays at the top and Cancel/Save stay at the bottom however
            long the form gets, and a phone gets the whole screen rather than a
            card it has to pinch. */}
        <DialogContent
          hideDragHandle
          className={cn(
            "flex flex-col overflow-hidden overscroll-contain touch-pan-y",
            "w-full max-w-full sm:max-w-3xl lg:max-w-4xl",
            "sm:top-6 sm:translate-y-0 sm:max-h-[calc(100dvh-3rem)]",
            "max-sm:fixed max-sm:inset-0 max-sm:top-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-full max-sm:rounded-none max-sm:border-0 max-sm:p-3.5 max-sm:m-0",
          )}
        >
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle>{isNew ? "Add a casting" : "Update casting"}</DialogTitle>
              {!isImageOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 gap-1.5 px-3 text-xs"
                  onClick={() => setScanOpen(true)}
                >
                  <ScanLine className="size-3.5" />
                  Scan card
                </Button>
              )}
            </div>
            <DialogDescription>
              {isImageOnly
                ? "You can update or propose the photo for this catalogue casting."
                : isNew
                  ? "What the casting is, and what it retails for. Everyone browses the same one."
                  : "Changes are written into this casting for every collector who owns one."}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col gap-4 overflow-x-hidden"
          >
            {/* The only part that scrolls. `min-h-0` is what lets it: without it
                a flex child refuses to shrink below its content and the footer is
                pushed off the bottom of the dialog instead. */}
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-0.5">
              {/* What the casting is, as one line you read rather than thirteen
                  fields you re-check. The fields are still here, one tap down. */}
              <section className="overflow-hidden rounded-lg border border-border bg-muted/30">
                <div className="flex items-start gap-3 p-3">
                  {/* Same tap-the-photo-to-fix-it as the car form. The search
                      has already run by the time this card is drawn. */}
                  <PhotoThumbButton
                    url={form.image_url || ""}
                    picking={pickingPhoto}
                    onClick={() => setPickingPhoto((v) => !v)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {form.name?.trim() ||
                          `${form.make || ""} ${form.model || ""}`.trim() ||
                          "New casting"}
                      </span>
                      <ChaseMark
                        rarity={(form.rarity as CatalogueValues["rarity"]) || "Normal"}
                        className="size-3.5 shrink-0"
                      />
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">{identityLine}</p>
                    {!isNew && entry && (
                      <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/75">
                        {entry.car_id}
                      </p>
                    )}
                  </div>
                </div>

                {pickingPhoto && (
                  <PhotoCandidateStrip
                    search={imageSuggestions}
                    value={form.image_url || ""}
                    onPick={(url) => {
                      set("image_url", url);
                      setPickingPhoto(false);
                    }}
                    emptyHint="Nothing found — Photo below takes a file or a link"
                  />
                )}

                {/* Who filed it and who last touched it — the same two pairs the
                    details drawer shows, in the same order. */}
                {!isNew && entry && (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                    <div className="truncate">
                      Added by{" "}
                      <span className="font-medium text-foreground">
                        {resolveCatalogUserId(entry.created_by)}
                      </span>
                    </div>
                    <div className="truncate">
                      Added on{" "}
                      <span className="font-medium text-foreground">
                        {formatDayMonthYear(entry.created_at) || "—"}
                      </span>
                    </div>
                    <div className="truncate">
                      Updated by{" "}
                      <span className="font-medium text-foreground">
                        {entry.updated_by ? resolveCatalogUserId(entry.updated_by) : "—"}
                      </span>
                    </div>
                    <div className="truncate">
                      Updated on{" "}
                      <span className="font-medium text-foreground">
                        {formatDayMonthYear(entry.updated_at) || "—"}
                      </span>
                    </div>
                  </div>
                )}
              </section>

              {/* Above the fields, not below them: by the time the catalogue
                  already has this casting, the useful moment is before the rest
                  of it is typed out. */}
              <DuplicateNotice
                hits={duplicates}
                onAddThisCar={(c) => {
                  onClose();
                  onAddExistingCar?.(c);
                }}
              />

              {isNew && duplicates.length > 0 && (
                <div
                  id="duplicate-confirmation-box"
                  className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 space-y-2.5 transition-all"
                >
                  <p className="text-xs font-medium text-foreground">
                    This casting matches an existing catalogue entry. Please click{" "}
                    <strong>Add this car</strong> above to add the existing car to your collection.
                    Adding a duplicate entry is blocked unless confirmed below.
                  </p>
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <Checkbox
                      id="confirm-not-duplicate"
                      checked={confirmNotDuplicate}
                      onCheckedChange={(checked) => setConfirmNotDuplicate(checked === true)}
                      className="mt-0.5"
                    />
                    <span className="text-xs font-semibold text-foreground leading-tight">
                      I confirm this is not a duplicate entry and is a genuinely different release
                    </span>
                  </label>
                </div>
              )}

              <FormSection
                title="What the casting is"
                badge={identityBadge}
                badgeTone={identityBadge === "not set" ? "warn" : "muted"}
                open={showIdentity}
                onToggle={() => setShowIdentity((v) => !v)}
              >
                {/* The same thirteen fields the car form edits, from the same
                    component — so a brand narrows its assortments here too, and
                    the labels cannot drift apart again. Rarity is omitted: this
                    dialog keeps it beside Release Status. */}
                <CatalogueFields
                  values={catalogueValues}
                  onChange={setCatalogueValue}
                  cars={cars}
                  omit={["rarity"]}
                  disabled={isImageOnly}
                  errorFor={(k) => errorFor(k)}
                />

                <div className="mt-3 border-t border-border/50 pt-3">
                  <Field label="Display name">
                    <ClearableInput
                      disabled={isImageOnly}
                      value={form.name || ""}
                      onChange={(e) => set("name", e.target.value)}
                      placeholder={`${form.make || "Make"} ${form.model || "Model"}`.trim()}
                      aria-label="Display name"
                    />
                    <p className="pt-1 text-[11px] text-muted-foreground">
                      Built from make and model if you leave it blank.
                    </p>
                  </Field>
                </div>
              </FormSection>

              <FormSection
                title="Release & price"
                badge={releaseBadge}
                open={showRelease}
                onToggle={() => setShowRelease((v) => !v)}
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Release status">
                    <SegmentControl<ReleaseStatus>
                      fill
                      disabled={isImageOnly}
                      value={form.release_status ?? "Released"}
                      onChange={(v) => set("release_status", v)}
                      className="h-9 w-full"
                      options={[
                        { value: "Released", label: "Released" },
                        { value: "Pre Order", label: "Pre Order" },
                      ]}
                    />
                  </Field>

                  <Field label="Rarity">
                    <SegmentControl<string>
                      fill
                      disabled={isImageOnly}
                      value={form.rarity || "Normal"}
                      onChange={(v) => set("rarity", v)}
                      className="h-9 w-full"
                      options={RARITIES.map((r) => ({ value: r, label: r }))}
                    />
                  </Field>

                  <Field label="Retail / MRP * (INR)" name="mrp" error={errorFor("mrp")}>
                    <ClearableInput
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      disabled={isImageOnly}
                      placeholder="e.g. 179"
                      value={form.mrp ?? ""}
                      onChange={(e) => {
                        set("mrp", e.target.value === "" ? 0 : Number(e.target.value));
                        setValidationError((x) => (x && x.field === "mrp" ? null : x));
                      }}
                      aria-label="Retail price"
                    />
                  </Field>

                  {isPreOrder ? (
                    <Field label="Expected release date">
                      <ClearableInput
                        type="date"
                        disabled={isImageOnly}
                        value={form.expected_date || ""}
                        onChange={(e) => set("expected_date", e.target.value || null)}
                        aria-label="Expected release date"
                      />
                    </Field>
                  ) : (
                    <Field label="Released on">
                      <ClearableInput
                        type="date"
                        disabled={isImageOnly}
                        max={localDay()}
                        value={releasedOnInput(form.released_at)}
                        onChange={(e) => set("released_at", e.target.value || null)}
                        aria-label="Released on"
                      />
                      <p className="px-1 pt-1 text-[11px] text-muted-foreground">
                        What Recently Released dates this by. Left empty, the day the first
                        collector receives one fills it in.
                      </p>
                    </Field>
                  )}
                </div>
              </FormSection>

              <FormSection
                title="Multipack"
                badge={packBadge(isPack, declaredSize, members.length)}
                open={showPack}
                onToggle={() => setShowPack((v) => !v)}
              >
                <MultipackField
                  isPack={isPack}
                  packSize={declaredSize}
                  members={members}
                  onPackChange={(v) => set("is_multipack", v)}
                  onSizeChange={(v) => set("pack_size", v)}
                  onMembersChange={setMembers}
                  disabled={isImageOnly}
                  canEditMembers={isAdmin}
                  selfCarId={entry && entry !== "new" ? entry.car_id : ""}
                  onAddNew={isAdmin ? () => setAddingMember(true) : undefined}
                  addNewLabel="New casting"
                />
              </FormSection>

              <FormSection
                title="Photo"
                badge={photoBadge}
                open={showPhoto}
                onToggle={() => setShowPhoto((v) => !v)}
              >
                <CarPhotoField
                  value={form.image_url || ""}
                  onChange={(url) => set("image_url", url)}
                  suggestions={imageSuggestions}
                  searchQuery={webSearchWords}
                />
              </FormSection>
            </div>

            {/* Cancel left, Save right, at the foot of the dialog at every width —
                outside the scroller, so they are where you left them however far
                down the form you are. */}
            <DialogFooter className="flex shrink-0 w-full min-w-0 flex-row items-center justify-between gap-2 border-t border-border/50 pt-3 sm:justify-between">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
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
                    onClick={onDelete}
                    disabled={saving}
                    className="gap-1.5 border-border text-rose-500 hover:bg-rose-500/10 hover:text-rose-400"
                  >
                    <Trash2 className="size-4" />
                    <span className="max-sm:sr-only">Remove</span>
                  </Button>
                )}
              </div>
              <Button
                type="submit"
                disabled={saving || (isNew && duplicates.length > 0 && !confirmNotDuplicate)}
                className="gap-1.5 font-semibold"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                {isNew ? "Add casting" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CarScanDialog open={scanOpen} onOpenChange={setScanOpen} onApply={onApplyScan} />

      {/* Filing a member that the catalogue has never heard of, without losing
          the pack you are in the middle of describing. It is this same dialog
          stacked over itself: a pack member is an ordinary casting, so there is
          no second form to keep in step. Saving adds it to the list, which is
          the reason you opened it. */}
      {addingMember && (
        <CatalogFormDialog
          open
          entry="new"
          catalog={catalog}
          onClose={() => setAddingMember(false)}
          onSave={async (car) => {
            const ok = await onSave(car);
            if (ok) {
              setMembers((m) => (m.includes(car.car_id) ? m : [...m, car.car_id]));
              setAddingMember(false);
            }
            return ok;
          }}
        />
      )}
    </>
  );
}
