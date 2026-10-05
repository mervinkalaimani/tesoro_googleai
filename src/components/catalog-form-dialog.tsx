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
import { transformImageUrl } from "@/lib/image-transform";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { CatalogueFields, type CatalogueValues } from "@/components/catalogue-fields";
import { AssortmentHeader, AssortmentRow } from "@/components/assortment-rows";
import { Combobox } from "@/components/ui/combobox";
import { assortmentOptionsFor, optionsFor } from "@/lib/car-options";
import { mrpOptionsFor } from "@/lib/car-prices";
import type { Diecast } from "@/lib/types";
import { ensureAssortment, remainingAssortments } from "@/lib/assortments";
import { boxSiblings } from "@/lib/casting-group";
import { isPackAssortment, packFromAssortment } from "@/lib/pack-assortments";
import {
  CatalogueIdValue,
  ClearableInput,
  Field,
  FormSection,
  InfoTip,
} from "@/components/form-parts";
import { MultipackField } from "@/components/multipack-field";
import { DuplicatesButton, DuplicatesDialog } from "@/components/duplicates-dialog";
import { findDuplicates, matchPercent, needsCarNumber } from "@/lib/duplicate";
import { packBadge } from "@/lib/pack";
import { EditorShell, SummaryRow, ThingsLeft, type RailItem } from "@/components/editor-shell";
import { ChaseMark } from "@/components/car-marks";
import { useCars } from "@/lib/cars-store";
import { useCatalog } from "@/lib/catalog-store";
import { CatalogueLinkDialog } from "@/components/catalogue-link-dialog";
import { MergeChoiceDialog } from "@/components/merge-castings";
import { carSubLineParts } from "@/lib/car-subline";
import { buildCarName } from "@/lib/car-name";
import { useAuth } from "@/lib/auth-store";
import { CarScanDialog, type ScanResult } from "@/components/car-scan-dialog";
import { useCarImageCandidates } from "@/lib/car-image-search";
import { cn } from "@/lib/utils";

/** The first required field left empty, shown on the field itself. */
type FieldKey = keyof CatalogueValues | "mrp";
type FieldError = {
  field: FieldKey;
  message: string;
  /** Three words for the "things left" list, where the sentence will not fit. */
  short?: string;
};

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
  /** The saved entry, narrowed: "new" is not a row and has nothing to merge. */
  const savedEntry = entry && entry !== "new" ? entry : null;
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
   * Case names already in use, so the same carton is not filed four ways.
   *
   * Both pools: what people have typed on their own cars, and what the
   * catalogue already says. A case entered here is new to the catalogue and
   * old news to somebody's collection, and neither list alone has both.
   */
  const caseOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const v of optionsFor("caseNumber", cars)) {
      const t = v.trim();
      if (t) seen.add(t);
    }
    for (const c of catalog) {
      const t = (c.case_number || "").trim();
      if (t) seen.add(t);
    }
    return [...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [cars, catalog]);

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
  /**
   * The entry picked to merge with this one, and which way round it runs.
   *
   * It used to fold the other entry in and keep this one, always — the other
   * direction lived on the duplicate notice as a separate button, and which of
   * two entries deserves to be the keeper is a judgement you can only make
   * looking at both. So both are on screen, and either can be the one that
   * stays.
   */
  const [dupesOpen, setDupesOpen] = useState(false);
  const [absorb, setAbsorb] = useState<CatalogCar | null>(null);
  const [absorbPreview, setAbsorbPreview] = useState<MergePreview | null>(null);
  const [absorbBusy, setAbsorbBusy] = useState(false);
  const [mergeKeepId, setMergeKeepId] = useState("");
  const [mergeDropIds, setMergeDropIds] = useState<string[]>([]);
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
  const [showPack, setShowPack] = useState(true);
  const [showPhoto, setShowPhoto] = useState(true);
  /** Whether the photos found for this casting are open under the header card. */
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
        case_number: "",
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
    setShowPack(true);
    setShowIdentity(!isImageOnly);
    setShowAssortments(!isImageOnly);
    setShowRelease(!isImageOnly);
    setShowPhoto(true);
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

  /** The two entries in the merge, this one first. */
  const mergeCars = useMemo(
    () => (savedEntry && absorb ? [savedEntry, absorb] : []),
    [savedEntry, absorb],
  );

  /** Opens the chooser on the obvious answer: keep this one, fold the other in. */
  const startMerge = (pick: CatalogCar) => {
    if (!entryId) return;
    setAbsorb(pick);
    setMergeKeepId(entryId);
    setMergeDropIds([pick.car_id]);
  };

  // What would move, for whichever entries are ticked. Re-read on every change,
  // because flipping the keeper flips what moves.
  useEffect(() => {
    if (!absorb || mergeDropIds.length === 0) {
      setAbsorbPreview(null);
      return;
    }
    let live = true;
    setAbsorbPreview(null);
    void catalogMergePreview(mergeDropIds)
      .then((pv) => live && setAbsorbPreview(pv))
      .catch(() => live && setAbsorbPreview(null));
    return () => {
      live = false;
    };
  }, [absorb, mergeDropIds]);

  /** Runs it the way round the chooser says. */
  const absorbEntry = () => {
    if (!absorb || !entryId || !mergeKeepId || mergeDropIds.length === 0) return;
    const keepingThis = mergeKeepId === entryId;
    setAbsorbBusy(true);
    void mergeCatalogEntries(mergeKeepId, mergeDropIds)
      .then((res) => {
        const keeper = mergeCars.find((c) => c.car_id === mergeKeepId);
        toast.success(`Merged into ${keeper?.name || mergeKeepId}`, {
          description:
            res.cars > 0
              ? `${res.cars} car${res.cars === 1 ? "" : "s"} now point at it.`
              : "The other entry is gone.",
        });
        setAbsorb(null);
        setMerging(false);
        setDupesOpen(false);
        // This entry was the one folded away, so the form behind is editing a
        // row that no longer exists.
        if (!keepingThis) onClose();
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
   * What the card says under the name: series, sub-series, number.
   *
   * Not the brand or the box, which are rows of their own two lines below —
   * printed in both places they were the same fact twice, and the half that
   * tells two releases apart was the half falling off the end.
   */
  const identityLine =
    carSubLineParts(
      {
        brand: "",
        assortment: "",
        series: catalogueValues.series ?? "",
        subSeries: catalogueValues.subSeries ?? "",
        carNumber: catalogueValues.carNumber ?? "",
      },
      true,
    ).join(" · ") || "—";

  /** In the order the fields appear, so the first one flagged is the first on screen. */
  /**
   * Everything still missing, in the order it appears on screen.
   *
   * The first of them is what a failed save flags; all of them are what the
   * summary lists as still to do. One list rather than two, because two drift.
   */
  const missing = (): FieldError[] => {
    if (isImageOnly) return [];
    const out: FieldError[] = [];
    const need = (field: FieldKey, message: string, short: string) => {
      out.push({ field, message, short });
    };
    if (!form.make?.trim()) need("make", "Enter the make.", "Enter the make");
    if (!form.model?.trim()) need("model", "Enter the model.", "Enter the model");
    if (!form.brand?.trim()) need("brand", "Enter the brand.", "Enter the brand");
    if (!form.assortment?.trim())
      need("assortment", "Enter the assortment.", "Name the assortment");
    if (needsCarNumber(form.brand) && !form.car_number?.trim())
      need(
        "carNumber",
        `${form.brand?.trim()} prints a collector number on the box — it is what tells two near-identical castings apart.`,
        "Enter the car number",
      );
    if (!form.mrp || form.mrp <= 0)
      need("mrp", "Enter the retail price.", "Enter the retail price");
    for (const x of extras) {
      if (x.assortment.trim() && !(x.mrp > 0))
        need(
          "mrp",
          `Enter what ${x.assortment.trim()} costs.`,
          `Price the ${x.assortment.trim()} box`,
        );
    }
    return out;
  };

  const validate = (): FieldError | null => missing()[0] ?? null;

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

  /** Everything still to answer, each one a tap from the field that fixes it. */
  const thingsLeft = missing().map((m) => ({
    label: m.short || m.message,
    onJump: () => {
      jumpToError.current = true;
      setValidationError(m);
    },
  }));

  /** The sections, as the rail beside the form lists them. */
  const rail: RailItem[] = isImageOnly
    ? []
    : [
        {
          id: "identity",
          label: "Car details",
          status: identityBadge,
          tone: identityBadge === "not set" ? "warn" : "muted",
        },
        {
          id: "assortments",
          label: "Assortments",
          status: assortmentsBadge,
          tone: form.assortment?.trim() ? "muted" : "warn",
        },
        {
          id: "multipack",
          label: "Multipack",
          status: packBadge(isPack, declaredSize, members.length),
        },
        { id: "release", label: "Release status", status: releaseBadge },
        { id: "photo", label: "Photo", status: photoBadge },
      ];

  /**
   * The casting as it currently reads — the same card everyone else will see on
   * the catalogue page once this is filed.
   */
  const summary = (
    <div className="rounded-2xl border border-border/70 bg-card p-3">
      {/* The same frame the car's own page gives it: 4:3, rounded, white. */}
      <div className="relative mb-3 grid aspect-4/3 w-full place-items-center overflow-hidden rounded-2xl border border-border/60 bg-white">
        {form.image_url ? (
          <img
            src={form.image_url}
            alt=""
            className="absolute inset-y-0 left-1/2 h-full w-auto max-w-none -translate-x-1/2"
          />
        ) : (
          <Car className="size-8 text-muted-foreground/40" />
        )}
      </div>
      <p className="truncate text-base font-bold tracking-tight">
        {form.name?.trim() || autoName || "New casting"}
      </p>
      <p className="truncate text-[11px] text-muted-foreground">{identityLine}</p>
      <div className="mt-2.5">
        <SummaryRow label="Brand" value={form.brand} />
        <SummaryRow label="Assortment" value={form.assortment} />
        <SummaryRow label="Retail / MRP" value={form.mrp ? inrFull(Number(form.mrp)) : ""} />
        <SummaryRow label="Release" value={form.release_status} />
        <SummaryRow label="Rarity" value={form.rarity} />
        {entryId && (
          <SummaryRow label="Catalogue ID" value={<CatalogueIdValue id={entryId} href={false} />} />
        )}
      </div>
    </div>
  );

  const actions = (
    <div className="flex flex-col gap-2">
      {isNew && !isImageOnly && (
        <div className="flex items-center gap-1 rounded-xl bg-muted/50 px-2.5 py-2">
          <label className="flex min-w-0 flex-1 cursor-pointer select-none items-center gap-2.5 text-xs font-medium">
            <Checkbox checked={alsoMine} onCheckedChange={(v) => setAlsoMine(v === true)} />
            Add one to my collection
          </label>
          <InfoTip
            label="Add one to my collection"
            text="Opens the car form with this casting filled in. Leave it off to file the casting only."
          />
        </div>
      )}
      <Button
        type="submit"
        size="lg"
        disabled={saving || (isNew && duplicates.length > 0 && !confirmNotDuplicate)}
        className="w-full justify-between font-semibold"
      >
        {isNew ? "Add casting" : "Save changes"}
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
      </Button>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </Button>
        {!isNew && effectiveCanDelete && onDelete && (
          <Button
            type="button"
            variant="outline"
            onClick={onDelete}
            disabled={saving}
            className="flex-1 gap-1.5 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-400"
          >
            <Trash2 className="size-4" />
            Remove
          </Button>
        )}
      </div>
    </div>
  );

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
      const el = [...document.querySelectorAll<HTMLElement>("[data-duplicate-confirm]")].find(
        (box) => box.offsetParent !== null,
      );
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

    // Every box this entry names, as boxes. Only an admin can type one the
    // list has not heard of, and this is where typing it becomes filing it —
    // nothing else adds to the vocabulary.
    if (ok && !isImageOnly && isAdmin) {
      for (const box of [car.assortment, ...extras.map((x) => x.assortment)]) {
        if (box?.trim()) await ensureAssortment(box, car.brand);
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
          // Every section is open, so the first thing the browser would focus
          // is some way down a long form — and focusing it scrolls the form
          // there, past the fields you came to fill in. Focus the dialog
          // itself instead; the trap and Escape still work from there.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
          className={cn(
            "flex flex-col overflow-hidden overscroll-contain touch-pan-y",
            "w-full max-w-full sm:max-w-3xl lg:max-w-6xl xl:max-w-[88rem]",
            "sm:top-6 sm:translate-y-0 sm:max-h-[calc(100dvh-3rem)]",
            "max-sm:fixed max-sm:inset-0 max-sm:top-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-full max-sm:rounded-none max-sm:border-0 max-sm:p-3.5 max-sm:m-0",
          )}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden"
          >
            <EditorShell
              title={isNew ? "Add a casting" : "Update casting"}
              description={
                isImageOnly
                  ? "You can update or propose the photo for this catalogue casting."
                  : isNew
                    ? "What the casting is, and what it retails for. Everyone browses the same one."
                    : "Changes are written into this casting for every collector who owns one."
              }
              rail={rail}
              headerAction={
                !isImageOnly && (
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
                )
              }
              summary={summary}
              alerts={
                <>
                  {/* Under the preview of the casting being filed, as a count.
                      The entries themselves need the width of a dialog to be
                      worth reading, so that is where they are. */}
                  <DuplicatesButton count={duplicates.length} onClick={() => setDupesOpen(true)} />
                  {isNew && duplicates.length > 0 && (
                    <div
                      data-duplicate-confirm
                      className="space-y-2.5 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3"
                    >
                      <p className="text-[11px] font-medium text-foreground">
                        This casting matches one the catalogue already has. Add that one instead, or
                        say below that this is a different release.
                      </p>
                      <label className="flex cursor-pointer select-none items-start gap-2.5">
                        <Checkbox
                          checked={confirmNotDuplicate}
                          onCheckedChange={(checked) => setConfirmNotDuplicate(checked === true)}
                          className="mt-0.5"
                        />
                        <span className="text-[11px] font-semibold leading-tight text-foreground">
                          This is not a duplicate — it is a genuinely different release
                        </span>
                      </label>
                    </div>
                  )}
                  <ThingsLeft items={thingsLeft} done="Every required field is in" />
                </>
              }
              actions={actions}
            >
              <FormSection
                id="identity"
                title="Car details"
                description="Make, model and the details that tell releases apart."
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
                id="assortments"
                title="Assortments"
                description="Every box this casting is sold in, and what each retails for."
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
                id="multipack"
                title="Multipack"
                description="Whether this entry is a box of cars rather than one."
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
                id="release"
                title="Release status"
                description="Whether it is out yet, and which case it shipped in."
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
                        {/* Seven months, and the other seventeen are a scroll
                            away — the same list the car form shows. */}
                        <SelectContent className="max-h-[242px]">
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

                  {/* Which carton the run shipped in. It sits here and not with
                      the identity fields because it does not name the casting:
                      the same car comes back in a later case and is still the
                      same car, which is also why the ID does not read it. */}
                  <Field label="Case / Mix">
                    <Combobox
                      clearable
                      disabled={isImageOnly}
                      value={form.case_number || ""}
                      onChange={(v) => set("case_number", v)}
                      options={caseOptions}
                      placeholder="e.g. 2026 K Case"
                      searchPlaceholder="Search cases, or type a new one…"
                    />
                    <p className="px-1 pt-1 text-[11px] text-muted-foreground">
                      The case this release shipped in. A collector&rsquo;s own Case / Mix is on
                      their car and is not set from here.
                    </p>
                  </Field>
                </div>
              </FormSection>

              <FormSection
                id="photo"
                title="Photo"
                description="The picture everyone browsing the catalogue will see."
                badge={photoBadge}
                open={showPhoto}
                onToggle={() => setShowPhoto((v) => !v)}
              >
                {/* layout="split": on a desktop the frame is smaller and the
                    found photos fill the space to its right, the same as the
                    car form. A full-width frame put the suggestions below the
                    fold of the section. */}
                <CarPhotoField
                  value={form.image_url || ""}
                  onChange={(url) => set("image_url", url)}
                  suggestions={imageSuggestions}
                  searchQuery={webSearchWords}
                  layout="split"
                />
              </FormSection>
            </EditorShell>
          </form>
        </DialogContent>
      </Dialog>

      <CarScanDialog open={scanOpen} onOpenChange={setScanOpen} onApply={onApplyScan} />

      {/* Removing a catalogue entry is removing it for everybody, so it says
          which ones and does not do it until it is told to. */}
      {/* Everything that shares this casting's brand, make, model and number.
          Folding one in keeps THIS entry — the opposite direction to the
          chooser that opens next is where which of the two survives is
          settled. */}
      <Dialog
        open={merging}
        onOpenChange={(v) => {
          if (absorbBusy) return;
          setMerging(v);
          if (!v) setAbsorb(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
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
                    <img
                      src={transformImageUrl(c.image_url, "thumb")}
                      alt=""
                      className="size-full object-cover"
                    />
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
                  variant={absorb?.car_id === c.car_id ? "default" : "outline"}
                  className="h-7 shrink-0 gap-1 px-2.5 text-xs"
                  disabled={absorbBusy}
                  onClick={() => startMerge(c)}
                  title="Choose which of the two to keep"
                >
                  <Merge className="size-3.5" />
                  Merge
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Chosen after the list, not inside it: which of the two survives is a
          judgement of its own. Both the duplicate list and the brand browser
          open it, and it runs the merge whichever way round it is set. */}
      <MergeChoiceDialog
        open={absorb !== null}
        onClose={() => setAbsorb(null)}
        cars={mergeCars}
        keepId={mergeKeepId}
        dropIds={mergeDropIds}
        onKeep={(id) => {
          setMergeKeepId(id);
          // The keeper is never also merged away, and the one it replaces
          // takes its place in the list of what moves.
          setMergeDropIds(mergeCars.filter((c) => c.car_id !== id).map((c) => c.car_id));
        }}
        onToggleDrop={(id) =>
          setMergeDropIds((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))
        }
        preview={absorbPreview}
        busy={absorbBusy}
        onConfirm={absorbEntry}
      />

      {/* Everything the catalogue already has that reads like this one, wide
          enough to compare field by field. */}
      <DuplicatesDialog
        open={dupesOpen}
        onClose={() => setDupesOpen(false)}
        subject={{ ...form, car_id: entryId, name: form.name?.trim() || autoName }}
        hits={duplicates}
        useLabel="Add this car"
        onUse={(c) => {
          setDupesOpen(false);
          onClose();
          onAddExistingCar?.(c);
        }}
        // A different box is not a duplicate, and joining the two as boxes of
        // one casting keeps both. Not for a pack, which is not a box.
        onAddAsBox={
          entryId && !isPack && !isImageOnly
            ? (c) => {
                setDupesOpen(false);
                void attachEntry(c);
              }
            : undefined
        }
        // Only an admin, and only once there is an entry to fold: a merge moves
        // cars other people own, and a casting still being typed has nobody on it.
        onMerge={isAdmin && entryId ? (c) => startMerge(c) : undefined}
        busy={absorbBusy || linking}
        footer={
          !isNew && entryId && isAdmin ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setDupesOpen(false);
                setMerging(true);
              }}
            >
              <Merge className="size-3.5" />
              Browse the whole brand
            </Button>
          ) : undefined
        }
      />

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
