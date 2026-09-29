import { useEffect, useMemo, useRef, useState } from "react";
import { Car, Check, Link2, Loader2, Merge, Plus, ScanLine, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import type { CatalogCar, ReleaseStatus } from "@/lib/catalog";
import { generateCatalogCarId } from "@/lib/car-id";
import { formatDayMonthYear, inrFull } from "@/lib/format";
import { catalogMergePreview, mergeCatalogEntries, resolveCatalogUserId } from "@/lib/catalog";
import type { MergePreview } from "@/lib/catalog";
import { localDay } from "@/lib/delivery-watch";
import { expectedByOptions, expectedByValue } from "@/lib/date-utils";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CarPhotoField } from "@/components/car-photo-field";
import { PhotoCandidateStrip, PhotoThumbButton } from "@/components/photo-picker";
import { CatalogueFields, type CatalogueValues } from "@/components/catalogue-fields";
import { AssortmentHeader, AssortmentRow } from "@/components/assortment-rows";
import { Combobox } from "@/components/ui/combobox";
import { assortmentOptionsFor } from "@/lib/car-options";
import { mrpOptionsFor } from "@/lib/car-prices";
import type { Diecast } from "@/lib/types";
import { remainingAssortments } from "@/lib/assortments";
import { boxSiblings } from "@/lib/casting-group";
import { isPackAssortment, packFromAssortment } from "@/lib/pack-assortments";
import { ClearableInput, Field, FormSection } from "@/components/form-parts";
import { MultipackField } from "@/components/multipack-field";
import { DuplicateNotice } from "@/components/duplicate-notice";
import { findDuplicates, matchPercent, needsCarNumber } from "@/lib/duplicate";
import { packBadge } from "@/lib/pack";
import { ChaseMark } from "@/components/car-marks";
import { useCars } from "@/lib/cars-store";
import { useCatalog } from "@/lib/catalog-store";
import { CatalogueLinkDialog } from "@/components/catalogue-link-dialog";
import { carSubLineParts } from "@/lib/car-subline";
import { buildCarName } from "@/lib/car-name";
import { useAuth } from "@/lib/auth-store";
import { CarScanDialog, type ScanResult } from "@/components/car-scan-dialog";
import { useCarImageCandidates } from "@/lib/car-image-search";
import { cn } from "@/lib/utils";

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
  /** The entry being edited, when there is one: what a merge folds away. */
  const entryId = entry && entry !== "new" ? entry.car_id : "";
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
    brand: "",
    make: "",
    model: "",
    variant: "",
    year: "",
    colour: "",
    type: "",
    size: "1:64",
    assortment: "",
    series: "",
    sub_series: "",
    car_number: "",
    mrp: 0,
    name: "",
    image_url: "",
    release_status: "Released",
    rarity: "Normal",
    expected_date: null,
    is_multipack: false,
    pack_size: null,
  });

  /**
   * The other boxes this casting is sold in, one row each.
   *
   * The casting is what the form above describes; an assortment is the box it
   * came in, and one casting is genuinely sold in several -- a Matchbox Bronco
   * is Mainline at 179 and Moving Parts at 399. Each is its own catalogue entry,
   * because an owned car points at the exact box it came out of, and castingKey
   * already leaves assortment out so they read as one card in the catalogue.
   *
   * The first box is form.assortment / form.mrp: the entry being edited. These
   * are the extra ones. A row that came from the catalogue carries its car_id
   * and is saved back to it; a row typed here has none and is filed as new.
   */
  const [extras, setExtras] = useState<{ assortment: string; mrp: number; car_id?: string }[]>([]);
  /**
   * A box of cars and a car sold in several boxes are different things, and one
   * entry cannot be both: a multipack IS the product, so it has one assortment
   * and one price. Ticking Multipack while other assortments are on file asks
   * first, because saying yes removes those catalogue entries for everybody.
   */
  /**
   * The entry this one is being folded into, once somebody has asked.
   *
   * The duplicate notice is where a duplicate is actually noticed -- while
   * looking straight at both of them -- so the fix belongs there rather than in
   * a separate admin screen. Every car pointing at the entry being edited moves
   * to the one picked, and this entry goes.
   */
  const [mergeTo, setMergeTo] = useState<CatalogCar | null>(null);
  const [mergePreview, setMergePreview] = useState<MergePreview | null>(null);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [packConfirm, setPackConfirm] = useState(false);
  const [packBusy, setPackBusy] = useState(false);
  const [confirmNotDuplicate, setConfirmNotDuplicate] = useState(false);
  /**
   * Whether filing this casting should also put a copy in your collection.
   *
   * Off. Filing a casting is a contribution to the catalogue, not a purchase --
   * most of what gets typed in here is a car somebody saw listed, and a pre-order
   * appearing in your own list because you described one is a row you then have
   * to go and delete.
   */
  const [alsoMine, setAlsoMine] = useState(false);
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
  const { packMembers, setPackMembers, addCatalogCar, updateCatalogCar, deleteCatalogCar } =
    useCatalog();
  const [members, setMembers] = useState<string[]>([]);
  /** Open while choosing an existing entry to file as another box of this one. */
  const [picking, setPicking] = useState(false);
  /** Open while looking at the entries that could be folded into this one. */
  const [merging, setMerging] = useState(false);
  /** The one chosen to fold in, and what would move with it. */
  const [absorb, setAbsorb] = useState<CatalogCar | null>(null);
  const [absorbPreview, setAbsorbPreview] = useState<MergePreview | null>(null);
  const [absorbBusy, setAbsorbBusy] = useState(false);
  const [linking, setLinking] = useState(false);

  /**
   * The four groups. Which casting it is and what it costs are open, because
   * every required field is in them and a shut group would be a form that looks
   * finished while being empty. The pack opens only when there is one, and the
   * photo only when it is the one thing this person may change.
   */
  const [showIdentity, setShowIdentity] = useState(true);
  const [showAssortments, setShowAssortments] = useState(true);
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
    setAlsoMine(false);
    setPackConfirm(false);
    setPackBusy(false);
    setMergeTo(null);
    setMergePreview(null);
    setMergeBusy(false);
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
        brand: "",
        make: "",
        model: "",
        variant: "",
        year: "",
        colour: "",
        type: "",
        size: "1:64",
        assortment: "",
        series: "",
        sub_series: "",
        car_number: "",
        mrp: 0,
        name: "",
        image_url: "",
        release_status: "Released",
        rarity: "Normal",
        expected_date: null,
        is_multipack: false,
        pack_size: null,
      });
    }
    // The boxes already on file for this casting, cheapest first, minus the one
    // being edited. Typed rows and filed rows look the same on screen; only the
    // car_id says which is which.
    setExtras(
      entry && entry !== "new"
        ? boxSiblings(entry, catalog)
            .sort((a, b) => (Number(a.mrp) || 0) - (Number(b.mrp) || 0))
            .map((c) => ({
              assortment: c.assortment || "",
              mrp: Number(c.mrp) || 0,
              car_id: c.car_id,
            }))
        : [],
    );
    const existing = entry && entry !== "new" ? (packMembers[entry.car_id] ?? []) : [];
    setMembers(existing);
    // A pack is shown open, because a shut "Multipack" header is the one thing
    // on this form nobody thinks to look inside.
    setShowPack(Boolean(entry && entry !== "new" && entry.is_multipack));
    setShowIdentity(!isImageOnly);
    setShowAssortments(!isImageOnly);
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
    // An assortment is one brand's own range, so it cannot outlive a change of
    // brand: Qube Carz under Matchbox is a box that does not exist. Anything the
    // new brand also sells is kept.
    // The box name carries both answers: "5 Pack" is a multipack of five.
    // Leaving one of those names puts it back to a single car.
    if (k === "assortment" && namedExtras.length === 0) {
      const pack = packFromAssortment(String(v));
      if (pack) {
        set("is_multipack", true);
        if (pack.size) set("pack_size", pack.size);
      } else if (isPackAssortment(form.assortment)) {
        set("is_multipack", false);
        set("pack_size", null);
      }
    }
    if (k === "brand") {
      const sold = new Set(
        assortmentOptionsFor(assortmentPool, String(v)).map((a) => a.trim().toLowerCase()),
      );
      const keeps = (a: string) => Boolean(a.trim()) && sold.has(a.trim().toLowerCase());
      setForm((fm) => (keeps(fm.assortment || "") ? fm : { ...fm, assortment: "" }));
      setExtras((rows) => rows.filter((x) => keeps(x.assortment)));
    }
  };

  const NAME_PARTS = ["make", "model", "variant", "year", "type", "series"] as const;
  const nameOf = (c: Partial<CatalogCar>) =>
    buildCarName({
      make: c.make,
      model: c.model,
      variant: c.variant,
      year: c.year ?? undefined,
      type: c.type,
      series: c.series,
    });

  const set = <K extends keyof CatalogCar>(key: K, value: CatalogCar[K]) =>
    setForm((f) => {
      const next = { ...f, [key]: value };
      // The name follows the casting until somebody types their own. Variant is
      // part of it -- "Nissan Skyline R34" and "Nissan Skyline" are two castings
      // and were one name.
      if ((NAME_PARTS as readonly string[]).includes(key as string)) {
        if (!f.name || f.name === nameOf(f)) next.name = nameOf(next);
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

  /**
   * The assortments this brand sells.
   *
   * The catalogue joins your own cars in the pool: this form files castings for
   * everybody, and a brand you happen to own nothing of would otherwise narrow
   * to nothing and fall back to the whole vocabulary.
   */
  const assortmentPool = useMemo(
    () =>
      [...cars, ...catalog.map((c) => ({ brand: c.brand, assortment: c.assortment }))] as Diecast[],
    [cars, catalog],
  );
  const brandAssortments = useMemo(
    () => assortmentOptionsFor(assortmentPool, form.brand || ""),
    [assortmentPool, form.brand],
  );
  /**
   * What is left to choose. "when clicked, show another row with remaining
   * assortments" -- a box already named on another row is not one of them, and
   * the row's own value stays in its list so it can still be seen.
   */
  const assortmentOptions = (current: string) =>
    remainingAssortments(
      brandAssortments,
      [form.assortment || "", ...extras.map((x) => x.assortment)],
      current,
    );

  /**
   * A pre-order is due in a month, not on a day: nobody knows the date, and a
   * date picker asks for one. Held as the 1st of the month, which is what the
   * car form has always done, so the calendar and the reminders read one shape.
   */
  const eta = expectedByValue(form.expected_date);
  const etaOptions = useMemo(
    () => expectedByOptions(form.expected_date ?? ""),
    [form.expected_date],
  );

  /** The other boxes actually named -- a blank row is not a second assortment. */
  const namedExtras = extras.filter((x) => x.assortment.trim());
  /** Of those, the ones already in the catalogue. The rest are only on screen. */
  const filedExtras = namedExtras.filter((x) => x.car_id);

  /**
   * Ticking Multipack when this casting is filed in other boxes too. Those
   * entries are other people's catalogue, so nothing happens until it is
   * confirmed; an entry somebody owns a copy from refuses to be deleted, and
   * then the tick does not happen either.
   */
  const onPackChange = (v: boolean) => {
    if (v && namedExtras.length > 0) {
      setPackConfirm(true);
      return;
    }
    set("is_multipack", v);
  };

  /**
   * The entries that could be this same casting filed twice.
   *
   * Requiring brand, name, make, model and number to agree outright found
   * nothing on almost every entry, which is the wrong answer: the same casting
   * in Mainline and in Premium carries two different collector numbers, and its
   * name is as often "'21 Ford Bronco" on one and "Ford Bronco" on the other.
   *
   * So the spine is the brand plus any one of: the same car number, the same
   * make and model, the same name, or the same make in the same series or
   * sub-series. Everything else is scored rather than demanded.
   *
   * The Mini GT T1 Microbus is the case that set this: two entries, both
   * number 1191, one filed as model "T1" variant "Microbus" in Mizu Design and
   * the other as model "T1 Microbus" variant "Mizu" in Mijo Exclusive. They
   * agree on almost nothing a string comparison can see, and they are one car. The percentage on each row is how
   * much of the description the two share, the same figure the duplicate notice
   * shows, and the list is closest first. The judgement stays yours; this only
   * puts the right dozen in front of you.
   */
  const mergeCandidates = useMemo(() => {
    const flat = (v: string | null | undefined) => (v || "").trim().toLowerCase();
    const key = (v: string | null | undefined) => flat(v).replace(/\s+/g, "");
    const brand = key(form.brand);
    const name = flat(form.name);
    const make = flat(form.make);
    const model = flat(form.model);
    const number = flat(form.car_number);
    const series = flat(form.series);
    const subSeries = flat(form.sub_series);
    if (!brand) return [];

    const fields = {
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
    };

    return catalog
      .filter((c) => {
        if (c.car_id === entryId || key(c.brand) !== brand) return false;
        // Any one of these is reason enough to put it in front of you; the
        // percentage says how much of the rest it agrees with.
        return (
          (!!number && flat(c.car_number) === number) ||
          (!!make && !!model && flat(c.make) === make && flat(c.model) === model) ||
          (!!name && flat(c.name) === name) ||
          (!!make &&
            flat(c.make) === make &&
            ((!!series && flat(c.series) === series) ||
              (!!subSeries && flat(c.sub_series) === subSeries)))
        );
      })
      .map((car) => ({ car, match: matchPercent(fields, car) }))
      .sort((x, y) => y.match - x.match || x.car.car_id.localeCompare(y.car.car_id))
      .slice(0, 12);
  }, [
    catalog,
    entryId,
    form.brand,
    form.name,
    form.make,
    form.model,
    form.variant,
    form.colour,
    form.assortment,
    form.series,
    form.sub_series,
    form.car_number,
    form.year,
  ]);

  /** Folds the chosen entry into this one: this entry is the one that stays. */
  const absorbEntry = () => {
    if (!absorb || !entryId) return;
    setAbsorbBusy(true);
    void mergeCatalogEntries(entryId, [absorb.car_id])
      .then((res) => {
        toast.success(`${absorb.name || absorb.car_id} folded in`, {
          description:
            res.cars > 0
              ? `${res.cars} car${res.cars === 1 ? "" : "s"} now point at this entry.`
              : "The other entry is gone.",
        });
        setAbsorb(null);
        setMerging(false);
      })
      .catch((e: Error) => toast.error(e.message || "Could not merge the castings"))
      .finally(() => setAbsorbBusy(false));
  };

  /**
   * An entry that is already in the catalogue, filed as another box of this
   * casting.
   *
   * Which boxes a casting comes in is worked out from the description, so
   * joining a group means agreeing with it: the entry keeps its own id, box,
   * price and photograph, and takes this casting's brand, make, model, variant,
   * series, sub-series and number. Anything else would be a second grouping
   * mechanism nobody could see.
   */
  const attachEntry = async (pick: CatalogCar) => {
    setPicking(false);
    if (entryId && pick.car_id === entryId) return;
    if (extras.some((x) => x.car_id === pick.car_id)) {
      toast.info(`${pick.assortment || pick.car_id} is already one of these boxes`);
      return;
    }
    setLinking(true);
    const ok = await updateCatalogCar({
      ...pick,
      brand: form.brand || pick.brand,
      make: form.make || pick.make,
      model: form.model || pick.model,
      variant: form.variant ?? pick.variant,
      series: form.series ?? pick.series,
      sub_series: form.sub_series ?? pick.sub_series,
      car_number: form.car_number ?? pick.car_number,
      standalone: false,
    });
    setLinking(false);
    if (!ok) {
      toast.error("That entry could not be moved");
      return;
    }
    setExtras((rows) => [
      ...rows,
      { assortment: pick.assortment || "", mrp: Number(pick.mrp) || 0, car_id: pick.car_id },
    ]);
    toast.success(`${pick.assortment || pick.car_id} is a box of this casting now`, {
      description: "It keeps its own ID, price and photograph.",
    });
  };

  /** The other direction: this box is its own product, not one of these. */
  const detachEntry = async (carId: string) => {
    const target = catalog.find((c) => c.car_id === carId);
    if (!target) return;
    setLinking(true);
    const ok = await updateCatalogCar({ ...target, standalone: true });
    setLinking(false);
    if (!ok) {
      toast.error("That entry could not be separated");
      return;
    }
    setExtras((rows) => rows.filter((x) => x.car_id !== carId));
    toast.success(`${target.assortment || carId} is its own casting now`, {
      description: "It stays in the catalogue, on its own.",
    });
  };

  const confirmPack = async () => {
    setPackBusy(true);
    const kept: typeof extras = [];
    for (const box of extras) {
      if (!box.assortment.trim()) continue;
      // A row typed here and never saved is nothing to delete.
      if (!box.car_id) continue;
      const res = await deleteCatalogCar(box.car_id);
      if (!res.deleted) kept.push(box);
    }
    setExtras(kept);
    setPackBusy(false);
    setPackConfirm(false);
    if (kept.length > 0) {
      toast.error(`${kept.length} of them could not be removed`, {
        description: "Somebody owns a copy filed under that entry. Multipack is left off.",
      });
      return;
    }
    set("is_multipack", true);
  };

  /** What a blank Display name becomes: make, model and variant, as everywhere else. */
  const autoName = buildCarName({
    make: form.make,
    model: form.model,
    variant: form.variant,
    year: form.year ?? undefined,
    type: form.type,
    series: form.series,
  });

  /**
   * The standard secondary line, so the card reads like a car anywhere else,
   * with the colour after the number: two castings can share a number, and the
   * colour is what says which release this one is.
   */
  const identityLine =
    [
      ...carSubLineParts({
        brand: catalogueValues.brand,
        assortment: catalogueValues.assortment,
        series: catalogueValues.series,
        subSeries: catalogueValues.subSeries,
        carNumber: catalogueValues.carNumber,
      }),
      catalogueValues.colour?.trim(),
    ]
      .filter(Boolean)
      .join(" · ") || "—";

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
    for (const x of extras) {
      if (x.assortment.trim() && !(x.mrp > 0))
        return { field: "mrp", message: `Enter what ${x.assortment.trim()} costs.` };
    }
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
  const releaseBadge = `${form.release_status ?? "Released"}`;
  /** Every box this casting is sold in, including the one being edited. */
  const boxes = useMemo(
    () => [
      { assortment: (form.assortment || "").trim(), mrp: Number(form.mrp) || 0 },
      ...extras.filter((x) => x.assortment.trim()),
    ],
    [form.assortment, form.mrp, extras],
  );
  const assortmentsBadge =
    boxes.length > 1
      ? `${boxes.length} boxes · ${inrFull(Math.min(...boxes.map((x) => x.mrp)))} – ${inrFull(Math.max(...boxes.map((x) => x.mrp)))}`
      : `${boxes[0].assortment || "not set"} · ${inrFull(boxes[0].mrp)}`;
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
          brand: (form.brand || "").trim(),
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
                brand: form.brand || "",
                make: form.make || "",
                model: form.model || "",
                assortment: form.assortment || "",
                series: form.series || "",
                subSeries: form.sub_series || "",
                carNumber: form.car_number || "",
                mrp: Number(form.mrp) || 179,
              })
            : (entry as CatalogCar).car_id,
          name:
            (form.name || "").trim() || autoName || `${form.make ?? ""} ${form.model ?? ""}`.trim(),
        };

    if (isNew && catalog.some((c) => c.car_id.toUpperCase() === car.car_id.toUpperCase())) {
      setSaving(false);
      toast.error("That casting is already in the catalogue", { description: car.car_id });
      return;
    }

    const ok = await onSave(car);

    // The other boxes, after the entry itself. Each is a whole catalogue entry
    // of the same casting: everything the form says, with its own assortment,
    // its own price and its own ID. A row that came with one is written back to
    // it; a row typed here is filed, and the ids already handed out this pass go
    // to generateCatalogCarId so two new boxes cannot claim the same one.
    if (ok && !isImageOnly) {
      const handedOut: { id: string; car: Parameters<typeof generateCatalogCarId>[0] }[] = [];
      for (const box of extras) {
        const assortment = box.assortment.trim();
        if (!assortment || !(box.mrp > 0)) continue;
        const fields = {
          brand: car.brand,
          make: car.make,
          model: car.model,
          assortment,
          series: car.series || "",
          subSeries: car.sub_series || "",
          carNumber: car.car_number || "",
          mrp: box.mrp,
        };
        const sibling: CatalogCar = {
          ...car,
          assortment,
          mrp: box.mrp,
          car_id: box.car_id || generateCatalogCarId(fields, handedOut),
          // Its own box, but the same casting: a pack is described once, on the
          // entry the form is actually editing.
          is_multipack: false,
          pack_size: null,
        };
        if (!box.car_id) handedOut.push({ id: sibling.car_id, car: fields });
        const saved = box.car_id ? await updateCatalogCar(sibling) : await addCatalogCar(sibling);
        if (!saved) {
          toast.error(`Could not file the ${assortment} box`, { description: sibling.car_id });
        }
      }
    }

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
      // Only if it was asked for. The add-a-car form opens on top with this
      // casting filled in, so the seller and what it cost are yours to enter --
      // the catalogue entry alone says nothing about a purchase.
      if (isNew && alsoMine) onAddExistingCar?.(car);
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
              {/* Pinned to the top of the scroller: which casting this is, is
                  the one thing you need while filling in everything below it.
                  The tint moved off the box and onto its rows because a sticky
                  box must be opaque — bg-muted/30 let the fields scroll through
                  it. */}
              <section className="sticky top-0 z-20 overflow-hidden rounded-lg border border-border bg-background shadow-sm">
                <div className="flex items-start gap-3 bg-muted/30 p-3">
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
                  {/* Beside the name, because merging is about this casting
                      rather than about any one of its fields. Only on an entry
                      that exists, and only for an admin: a merge moves other
                      people's cars. */}
                  {!isNew && entryId && isAdmin && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5"
                      onClick={() => setMerging(true)}
                      title="Other entries that look like this same casting"
                    >
                      <Merge className="size-3.5" />
                      Merge
                      {mergeCandidates.length > 0 && (
                        <span className="rounded bg-amber-500/20 px-1 text-[10px] font-bold tabular-nums text-amber-700 dark:text-amber-300">
                          {mergeCandidates.length}
                        </span>
                      )}
                    </Button>
                  )}
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
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
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
                // Only an admin, and only once there is an entry to fold: the
                // same bar the Duplicates screen keeps, and a casting still
                // being typed has no cars on it to move.
                onMergeToThis={
                  isAdmin && entryId
                    ? (dupe) => {
                        setMergeTo(dupe);
                        setMergePreview(null);
                        void catalogMergePreview([entryId]).then(setMergePreview);
                      }
                    : undefined
                }
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
                    the labels cannot drift apart again. The assortment is
                    omitted: it has a section of its own, because a casting can
                    be sold in more than one box. */}
                <CatalogueFields
                  values={catalogueValues}
                  onChange={setCatalogueValue}
                  cars={cars}
                  omit={["assortment"]}
                  disabled={isImageOnly}
                  errorFor={(k) => errorFor(k)}
                />

                <div className="mt-3 border-t border-border/50 pt-3">
                  <Field label="Display name">
                    <ClearableInput
                      disabled={isImageOnly}
                      value={form.name || ""}
                      onChange={(e) => set("name", e.target.value)}
                      placeholder={autoName || "Make Model Variant"}
                      aria-label="Display name"
                    />
                    <p className="pt-1 text-[11px] text-muted-foreground">
                      Built from make, model and variant if you leave it blank.
                    </p>
                  </Field>
                </div>
              </FormSection>

              {/* One casting, every box it is sold in. Deliberately before
                  Release & price: which boxes exist decides what the prices are
                  a list of, and the release date is the casting's either way. */}
              <FormSection
                title="Assortments"
                badge={assortmentsBadge}
                badgeTone={boxes[0].assortment ? "muted" : "warn"}
                open={showAssortments}
                onToggle={() => setShowAssortments((v) => !v)}
              >
                <AssortmentHeader />
                <div className="space-y-2">
                  <AssortmentRow
                    assortment={form.assortment || ""}
                    mrp={Number(form.mrp) || 0}
                    options={assortmentOptions(form.assortment || "")}
                    cars={cars}
                    brand={form.brand || ""}
                    allowCustom={isAdmin}
                    disabled={isImageOnly || !form.brand}
                    assortmentError={errorFor("assortment")}
                    onAssortment={(v) => setCatalogueValue("assortment", v)}
                    onMrp={(v) => {
                      set("mrp", v);
                      setValidationError((x) => (x && x.field === "mrp" ? null : x));
                    }}
                  />
                  {!isPack &&
                    extras.map((x, i) => (
                      <AssortmentRow
                        key={x.car_id ?? `new-${i}`}
                        assortment={x.assortment}
                        mrp={x.mrp}
                        options={assortmentOptions(x.assortment)}
                        cars={cars}
                        brand={form.brand || ""}
                        allowCustom={isAdmin}
                        disabled={isImageOnly || !form.brand}
                        filedAs={x.car_id}
                        onAssortment={(v) =>
                          setExtras((rows) =>
                            rows.map((r, j) => (j === i ? { ...r, assortment: v } : r)),
                          )
                        }
                        onMrp={(v) => {
                          setExtras((rows) => rows.map((r, j) => (j === i ? { ...r, mrp: v } : r)));
                          setValidationError((e) => (e && e.field === "mrp" ? null : e));
                        }}
                        // A row already on file is a catalogue entry other people
                        // may own a copy from, so it is not something this form
                        // throws away. Removing it is the Remove button on that
                        // entry, with the count of cars it would orphan.
                        onRemove={
                          x.car_id
                            ? undefined
                            : () => setExtras((rows) => rows.filter((_, j) => j !== i))
                        }
                        onDetach={
                          x.car_id && isAdmin ? () => void detachEntry(x.car_id!) : undefined
                        }
                      />
                    ))}
                </div>
                {!isImageOnly && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2.5 gap-1.5"
                    disabled={isPack || !form.brand}
                    onClick={() => setExtras((rows) => [...rows, { assortment: "", mrp: 0 }])}
                  >
                    <Plus className="size-4" />
                    Add an assortment
                  </Button>
                )}
                {!isImageOnly && isAdmin && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-2 mt-2.5 gap-1.5"
                    disabled={isPack || !form.brand || linking}
                    onClick={() => setPicking(true)}
                    title="A box of this casting that is already in the catalogue under its own entry"
                  >
                    {linking ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Link2 className="size-4" />
                    )}
                    Add from catalogue
                  </Button>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {isPack
                    ? "A multipack is the product, so it has one assortment and one price. Untick Multipack below to file this casting in more than one box."
                    : "Each box is its own catalogue entry with its own ID and price, and they read as one casting in the catalogue. Everything above — colour, series, car number — is shared by all of them."}
                </p>
              </FormSection>

              <FormSection
                title="Release status"
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

                  {isPreOrder ? (
                    <Field label="Expected by">
                      <Select
                        disabled={isImageOnly}
                        value={eta}
                        onValueChange={(v) => set("expected_date", v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Month and year" />
                        </SelectTrigger>
                        <SelectContent>
                          {etaOptions.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="px-1 pt-1 text-[11px] text-muted-foreground">
                        Saved as the 1st of that month, which is where the calendar puts it.
                      </p>
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
                  onPackChange={onPackChange}
                  onSizeChange={(v) => set("pack_size", v)}
                  onMembersChange={setMembers}
                  // Same rule as Add a car: a casting filed in more than one
                  // box is not itself a box, and a tick that opens a dialog
                  // offering to delete those boxes reads as a tick that does
                  // not work.
                  disabled={isImageOnly || (!isPack && namedExtras.length > 0)}
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

            {isNew && !isImageOnly && (
              <label className="flex shrink-0 cursor-pointer select-none items-start gap-2.5 border-t border-border/50 pt-3 text-xs text-muted-foreground">
                <Checkbox
                  checked={alsoMine}
                  onCheckedChange={(v) => setAlsoMine(v === true)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-foreground">Add one to my collection</span> —
                  opens the car form with this casting filled in. Leave it off to file the casting
                  only.
                </span>
              </label>
            )}

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

      {/* Folding one entry into another moves other people's cars, so it says
          how many before it does anything. */}
      <Dialog open={mergeTo !== null} onOpenChange={(v) => !v && !mergeBusy && setMergeTo(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>Merge this casting into {mergeTo?.name}?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">{mergeTo?.name}</span> is kept, with
                everything it already says.{" "}
                <span className="font-mono text-[11px]">{mergeTo?.car_id}</span>
              </p>
              <p>
                {mergePreview === null
                  ? "Counting what would move…"
                  : mergePreview.cars === 0
                    ? "Nobody owns a copy filed under this entry, so only the entry itself goes."
                    : `${mergePreview.cars} car${mergePreview.cars === 1 ? "" : "s"} across ${mergePreview.owners.length} collection${mergePreview.owners.length === 1 ? "" : "s"} move${mergePreview.cars === 1 ? "s" : ""} to it${mergePreview.packs > 0 ? `, and ${mergePreview.packs} pack membership${mergePreview.packs === 1 ? "" : "s"}` : ""}. What each person paid, their status and their photographs are untouched.`}
              </p>
              <p>
                This entry — <span className="font-mono text-[11px]">{entryId}</span> — is then
                removed, and that cannot be undone.
              </p>
            </div>
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeTo(null)} disabled={mergeBusy}>
              Cancel
            </Button>
            <Button
              disabled={mergeBusy || mergePreview === null}
              className="gap-1.5"
              onClick={() => {
                if (!mergeTo || !entryId) return;
                setMergeBusy(true);
                void mergeCatalogEntries(mergeTo.car_id, [entryId])
                  .then((res) => {
                    toast.success(`Merged into ${mergeTo.name}`, {
                      description:
                        res.cars > 0
                          ? `${res.cars} car${res.cars === 1 ? "" : "s"} now point at it.`
                          : "The duplicate entry is gone.",
                    });
                    setMergeTo(null);
                    onClose();
                  })
                  .catch((e: Error) => toast.error(e.message || "Could not merge the castings"))
                  .finally(() => setMergeBusy(false));
              }}
            >
              {mergeBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {mergeBusy ? "Merging…" : "Merge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Removing a catalogue entry is removing it for everybody, so it says
          which ones and does not do it until it is told to. */}
      {/* Everything that shares this casting's brand, make, model and number.
          Folding one in keeps THIS entry — the opposite direction to the
          "Merge to this" button on the duplicate notice, which folds this one
          away. Both exist because which of two entries is the keeper is a
          judgement, not a rule. */}
      <Dialog
        open={merging}
        onOpenChange={(v) => {
          if (absorbBusy) return;
          setMerging(v);
          if (!v) setAbsorb(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogTitle>Merge into this casting</DialogTitle>
          <DialogDescription>
            {mergeCandidates.length === 0
              ? "Nothing else in the catalogue is this brand and this casting."
              : "Closest first, by how much of the description they share. Folding one in moves every car on it here and removes it."}
          </DialogDescription>

          <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
            {mergeCandidates.map(({ car: c, match }) => (
              <div
                key={c.car_id}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2"
              >
                {/* How much of the description the two share — the same figure
                    the duplicate notice shows, so the two read alike. */}
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                    match >= 90
                      ? "bg-amber-500/25 text-amber-800 dark:text-amber-300"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {match}%
                </span>
                <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded bg-muted">
                  {c.image_url ? (
                    <img src={c.image_url} alt="" className="size-full object-cover" />
                  ) : (
                    <Car className="size-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{c.name || "—"}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {[c.assortment, c.series, c.sub_series].filter(Boolean).join(" · ") || "—"}
                  </div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground/75">
                    {c.car_id} · {inrFull(Number(c.mrp) || 0)}
                  </div>
                </div>
                {/* A different box is not always a duplicate. Two entries of
                    one casting in Mainline and in Premium are both real, and
                    what you want there is for them to read as one casting with
                    two boxes — not for one of them to be swallowed. */}
                {(c.assortment || "").trim().toLowerCase() !==
                  (form.assortment || "").trim().toLowerCase() && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 gap-1 px-2.5 text-xs"
                    disabled={absorbBusy || linking || isPack}
                    title={`Keep both, with ${c.assortment || "this box"} as another box of this casting`}
                    onClick={() => {
                      setMerging(false);
                      void attachEntry(c);
                    }}
                  >
                    <Link2 className="size-3.5" />
                    Add as a box
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 gap-1 px-2.5 text-xs"
                  disabled={absorbBusy}
                  onClick={() => {
                    setAbsorb(c);
                    setAbsorbPreview(null);
                    void catalogMergePreview([c.car_id]).then(setAbsorbPreview);
                  }}
                >
                  <Merge className="size-3.5" />
                  Fold in
                </Button>
              </div>
            ))}
          </div>

          {absorb && (
            <div className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
              <p className="font-semibold text-foreground">
                Fold {absorb.name || absorb.car_id} into this entry?
              </p>
              <p className="text-muted-foreground">
                {absorbPreview === null
                  ? "Counting what would move…"
                  : absorbPreview.cars === 0
                    ? "Nobody owns a copy filed under it, so only the entry itself goes."
                    : `${absorbPreview.cars} car${absorbPreview.cars === 1 ? "" : "s"} across ${absorbPreview.owners.length} collection${absorbPreview.owners.length === 1 ? "" : "s"} move${absorbPreview.cars === 1 ? "s" : ""} here${absorbPreview.packs > 0 ? `, and ${absorbPreview.packs} pack membership${absorbPreview.packs === 1 ? "" : "s"}` : ""}. What each person paid, their status and their photographs are untouched.`}
              </p>
              <p className="text-muted-foreground">
                <span className="font-mono text-[11px]">{absorb.car_id}</span> is then removed, and
                that cannot be undone.
              </p>
              <div className="flex justify-end gap-2 pt-0.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={absorbBusy}
                  onClick={() => setAbsorb(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={absorbBusy || absorbPreview === null}
                  onClick={absorbEntry}
                >
                  {absorbBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  {absorbBusy ? "Merging…" : "Merge"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reuses the list that answers "which casting is this?" everywhere else,
          ordered by how much of the description it agrees with. */}
      <CatalogueLinkDialog
        open={picking}
        onClose={() => setPicking(false)}
        car={
          {
            brand: form.brand || "",
            make: form.make || "",
            model: form.model || "",
            variant: form.variant || "",
            colour: form.colour || "",
            series: form.series || "",
            subSeries: form.sub_series || "",
            carNumber: form.car_number || "",
            assortment: "",
          } as unknown as Diecast
        }
        onPick={(pick) => void attachEntry(pick)}
        title="Add a box from the catalogue"
      />

      <Dialog open={packConfirm} onOpenChange={(v) => !v && !packBusy && setPackConfirm(false)}>
        <DialogContent className="max-w-md">
          <DialogTitle>Make this a multipack?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                A multipack is the product itself, so it has one assortment and one price. This
                casting is filed in {namedExtras.length + 1}{" "}
                {namedExtras.length + 1 === 1 ? "box" : "boxes"}.
              </p>
              <p>
                <span className="font-medium text-foreground">
                  {form.assortment || "The first box"}
                </span>{" "}
                is kept.{" "}
                {filedExtras.length > 0
                  ? "These are removed from the catalogue for everybody, and that cannot be undone:"
                  : "These have not been filed yet, so they are only dropped from this form:"}
              </p>
              <ul className="space-y-1">
                {namedExtras.map((x) => (
                  <li key={x.car_id ?? x.assortment} className="text-foreground">
                    {x.assortment} · {inrFull(x.mrp)}
                    {x.car_id ? (
                      <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                        {x.car_id}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {filedExtras.length > 0 ? (
                <p>An entry somebody already owns a copy from is refused, and nothing changes.</p>
              ) : null}
            </div>
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPackConfirm(false)} disabled={packBusy}>
              Cancel
            </Button>
            <Button onClick={() => void confirmPack()} disabled={packBusy} className="gap-1.5">
              {packBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : filedExtras.length > 0 ? (
                <Trash2 className="size-4" />
              ) : (
                <Check className="size-4" />
              )}
              {packBusy
                ? "Removing…"
                : filedExtras.length > 0
                  ? "Remove and make it a pack"
                  : "Make it a pack"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
