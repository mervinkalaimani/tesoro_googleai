import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCarImageCandidates } from "@/lib/car-image-search";
import { catalogueKey, useCatalogueSearch, type CatalogueCar } from "@/lib/catalogue-search";
import { useAuth } from "@/lib/auth-store";
import { RARITIES, RARITY_LABEL, rarityOf, type Rarity } from "@/lib/rarity";
import { CAR_CONDITIONS, CARD_CONDITIONS, cardGradeForCarGrade, describe } from "@/lib/condition";
import { formatDayMonthYear, inrFull } from "@/lib/format";
import { ChaseMark } from "@/components/car-marks";
import { StarRating } from "@/components/star-rating";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Diecast } from "@/lib/types";
import { useCarsActions, useCars } from "@/lib/cars-store";
import { buildCarName } from "@/lib/car-name";
import { carSubLine } from "@/lib/car-subline";
import { mrpOptionsFor, topSellers, assortmentChipsFor } from "@/lib/car-prices";
import { useSuggestionPool } from "@/lib/suggestion-pool";
import {
  assortmentOptionsFor,
  modelOptionsFor,
  optionsFor,
  variantOptionsFor,
  yearOptionsFor,
} from "@/lib/car-options";
import {
  CAR_DRAFT_KEY,
  carEditDraftKey,
  clearDraft,
  readDraft,
  writeDraft,
} from "@/lib/form-draft";
import { setCachedCarImage } from "@/lib/car-image";
import { toDateInputValue, deriveMonth, monthEtaToDate } from "@/lib/date-utils";
import { DELIVERY_PARTNER_NAMES } from "@/lib/tracking";
import { TrackingLink } from "@/components/tracking-link";
import { isoMatchesFor } from "@/lib/iso-match";
import { IsoSuggestions } from "@/components/iso-suggestions";
import {
  catalogEntryMatches,
  findCatalogEntry,
  generateCatalogCarId,
  isCatalogCarId,
  isPlaceholderId,
} from "@/lib/car-id";
import { useCatalog } from "@/lib/catalog-store";
import { catalogCarToCatalogueCar } from "@/lib/catalog";
import { diecastToCatalogCar } from "@/lib/catalog";
import { CarPhotoField } from "@/components/car-photo-field";
import { PhotoCandidateStrip, PhotoThumbButton } from "@/components/photo-picker";
import { MultipackField } from "@/components/multipack-field";
import { DuplicateNotice } from "@/components/duplicate-notice";
import { findDuplicates, needsCarNumber } from "@/lib/duplicate";
import { packBadge } from "@/lib/pack";
import { ClearableInput, Field, FormSection, PillButton, PillRow } from "@/components/form-parts";
import { SegmentControl } from "@/components/segment-control";
import { CatalogueFields, type CatalogueValues } from "@/components/catalogue-fields";
import { CarScanDialog, type ScanResult } from "@/components/car-scan-dialog";
import { StatusUpdateDialog } from "@/components/status-update-dialog";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  Car,
  IndianRupee,
  Calendar,
  ChevronRight,
  ChevronLeft,
  Check,
  Layers,
  Upload,
  RotateCcw,
  ScanLine,
  Trash2,
  Info,
  X,
  ClipboardCheck,
  Search,
  Loader2,
} from "lucide-react";

const STATUS_OPTIONS = STATUSES;

/** The last segment, which is not an answer but a way to reach the rest. */
const OTHER = "\u0000other";

/**
 * The handful of usual answers as one row, everything else behind "Other".
 *
 * Assortment and seller are both long lists with a very short head — Hot Wheels
 * has fourteen assortments and you buy from four of them; the collection knows
 * forty sellers and three of them account for most of the money. A dropdown
 * makes you open it every time to pick the thing you almost always pick. A row
 * of four makes the common case one tap and costs the rare case one extra.
 *
 * "Other" is sticky once chosen, so the search box does not vanish underneath
 * you while you are typing into it, and it shows itself when the current value
 * is not one of the chips — editing a car bought from someone unusual opens
 * with that someone already in view.
 */
function SegmentOrOther({
  label,
  name,
  error,
  info,
  value,
  onChange,
  chips,
  options,
  placeholder,
  searchPlaceholder,
  hint,
}: {
  label: string;
  name?: string;
  error?: string;
  info?: string;
  value: string;
  onChange: (v: string) => void;
  chips: string[];
  options: string[];
  placeholder: string;
  searchPlaceholder: string;
  hint?: string;
}) {
  const [stuck, setStuck] = useState(false);
  const known = chips.some((c) => c.toLowerCase() === (value || "").toLowerCase());
  const showList = stuck || (Boolean(value) && !known) || chips.length === 0;

  return (
    <Field label={label} name={name} error={error} info={info}>
      {chips.length > 0 && (
        <SegmentControl
          fill
          value={showList ? OTHER : value}
          options={[
            ...chips.map((c) => ({ value: c, label: c })),
            { value: OTHER, label: "Other" },
          ]}
          onChange={(v) => {
            if (v === OTHER) {
              setStuck(true);
              return;
            }
            setStuck(false);
            onChange(v);
          }}
        />
      )}
      {showList && (
        <div className={chips.length > 0 ? "mt-2" : undefined}>
          <Combobox
            clearable
            value={value}
            onChange={(v) => onChange(v)}
            options={options}
            placeholder={placeholder}
            searchPlaceholder={searchPlaceholder}
            ariaLabel={label}
          />
        </div>
      )}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </Field>
  );
}
import {
  STATUSES,
  isInHand,
  isIso as statusIsIso,
  isOpenOrder,
  isPreOrder as statusIsPreOrder,
  needsTransit,
  normaliseStatus,
} from "@/lib/status";

const PAYMENT_OPTIONS = ["Pending", "Partial", "Paid"];

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SPENT_INFO = "The total amount you've spent to purchase the car.";
const PAID_INFO = "The amount you've paid till now.";

interface CarFormData {
  make: string;
  model: string;
  variant: string;
  year: string;
  colour: string;
  type: string;
  series: string;
  subSeries: string;
  carNumber: string;
  caseNumber: string;
  brand: string;
  assortment: string;
  size: string;
  spent: number | "";
  mrp: number | "";
  shippingCost: number | "";
  payment: string;
  seller: string;
  status: string;
  paid: number | "";
  balance: number | "";
  transitInfo: string;
  deliveryPartner: string;
  trackingId: string;
  orderDate: string;
  expectedDate: string;
  official: boolean;
  rarity: Rarity;
  carCondition: string;
  cardCondition: string;
  carRating: number;
  cardRating: number;
  favourite: boolean;
  imageUrl: string;
  /**
   * What you call this copy, when the assembled name is not what you call it.
   *
   * Blank means "whatever make and model say", which is the usual answer. It is
   * written to your row and nowhere else — the catalogue keeps its own name, and
   * so does every other collection that owns the same casting.
   */
  displayName: string;
}

/** The name a car assembles from its own fields, before anyone types over it. */
function derivedName(f: {
  make?: string;
  model?: string;
  variant?: string;
  year?: string;
  type?: string;
  series?: string;
}): string {
  return buildCarName(f) || `${f.make || ""} ${f.model || ""}`.trim();
}

/**
 * Picked from the seller list when a car had no seller — a gift, a swap, a find.
 * Saved as a blank seller: a car with "No seller" in the column would give
 * every such car one shared, meaningless order and shipping ID.
 */
const NO_SELLER = "No seller";

/**
 * A casting's catalogue fields over a form: what the car *is*. What this
 * purchase cost, who sold it and when stay as they were.
 */
function catalogueFields(car: CatalogueCar, f: CarFormData): CarFormData {
  return {
    ...f,
    make: car.make || "",
    model: car.model || "",
    variant: car.variant || "",
    year: car.year || "",
    colour: car.colour || "",
    type: car.type || "",
    brand: car.brand || "",
    assortment: car.assortment || "",
    series: car.series || "",
    subSeries: car.subSeries || "",
    carNumber: car.carNumber || "",
    // The catalogue has no case number: it belongs to the car, not the casting.
    caseNumber: (car as Partial<Diecast>).caseNumber || f.caseNumber,
    size: car.size || f.size,
    rarity: rarityOf(car),
    mrp: car.mrp ? car.mrp : f.mrp,
    // What you paid starts as what it lists at — the common case, and one
    // fewer field to fill. Typing over it is the whole point of the field.
    spent: car.mrp ? car.mrp : f.spent,
    imageUrl: f.imageUrl || car.imageUrl || "",
  };
}

function getBlankForm(): CarFormData {
  const today = new Date().toISOString().slice(0, 10);
  return {
    make: "",
    model: "",
    variant: "",
    year: "",
    colour: "",
    type: "",
    series: "",
    subSeries: "",
    carNumber: "",
    caseNumber: "",
    brand: "",
    assortment: "",
    size: "1:64",
    spent: "",
    mrp: "",
    shippingCost: "",
    // Pending, not Paid: a car is logged when it is ordered and the money
    // usually moves afterwards. Paid was the old default and quietly recorded
    // a settled purchase for every pre-order.
    payment: "Pending",
    seller: "",
    // Most cars are catalogued the day they are ordered, long before they
    // arrive; "Available" as the default was wrong more often than right.
    status: "Ordered",
    paid: "",
    balance: 0,
    transitInfo: "",
    deliveryPartner: "",
    trackingId: "",
    orderDate: today,
    expectedDate: "",
    official: false,
    rarity: "Normal",
    carCondition: "",
    cardCondition: "",
    carRating: 0,
    cardRating: 0,
    favourite: false,
    imageUrl: "",
    displayName: "",
  };
}

/** The saved car as form values — the baseline an edit is measured against. */
function formFromCar(initial: Diecast): CarFormData {
  return {
    make: initial.make || "",
    model: initial.model || "",
    variant: initial.variant || "",
    year: initial.year || "",
    colour: initial.colour || "",
    type: initial.type || "",
    series: initial.series || "",
    subSeries: initial.subSeries || "",
    carNumber: initial.carNumber || "",
    caseNumber: initial.caseNumber || "",
    brand: initial.brand || "",
    assortment: initial.assortment || "",
    size: initial.size || "1:64",
    spent: initial.spent !== undefined && initial.spent !== null ? initial.spent : "",
    mrp: initial.mrp !== undefined && initial.mrp !== null ? initial.mrp : "",
    shippingCost:
      initial.shippingCost !== undefined && initial.shippingCost !== null
        ? initial.shippingCost
        : "",
    payment: initial.payment || "Paid",
    seller: initial.seller || "",
    status: normaliseStatus(initial.status) || "In Hand",
    paid: initial.paid !== undefined && initial.paid !== null ? initial.paid : "",
    balance: initial.balance !== undefined && initial.balance !== null ? initial.balance : 0,
    transitInfo: initial.transitInfo || "",
    deliveryPartner: initial.deliveryPartner || "",
    trackingId: initial.trackingId || "",
    orderDate:
      toDateInputValue(initial.orderDate || initial.date) || new Date().toISOString().slice(0, 10),
    // The month recorded in the ETA note is a real answer for a pre-order that
    // has never had anything better ("Mar 2027" -> the 10th of that month).
    expectedDate: toDateInputValue(
      initial.expectedDate ||
        (isInHand(initial.status) ? initial.date : "") ||
        monthEtaToDate(initial.transitInfo),
    ),
    official: Boolean(initial.official),
    rarity: rarityOf(initial),
    carCondition: initial.carCondition || "",
    cardCondition: initial.cardCondition || "",
    carRating: initial.carRating || 0,
    cardRating: initial.cardRating || 0,
    favourite: Boolean(initial.favourite),
    imageUrl: initial.imageUrl || "",
    // Only a name that is not the assembled one counts as an override. Seeding
    // the field with the derived name would make every car look renamed, and
    // would freeze that spelling the next time make or model changed.
    displayName: initial.name && initial.name !== derivedName(initial) ? initial.name : "",
  };
}

/** Both sides always carry the same keys, so one pass over them is enough. */
function sameForm(a: CarFormData, b: CarFormData): boolean {
  return (Object.keys(a) as (keyof CarFormData)[]).every((k) => a[k] === b[k]);
}

type CarDraft = { form: CarFormData; step: number };

/**
 * Two steps: which car, then your copy of it.
 *
 * It was five — car details, cost, transit, image, summary — and the first of
 * them asked for sixteen fields the catalogue already knows. Picking a catalogue
 * entry fills fourteen, so the search became the step and everything that is
 * true of *this purchase* became the other one. The summary went with them: it
 * existed because five steps make it easy to lose track of what you typed, and
 * on one screen you are already looking at it.
 */
const WIZARD_STEPS = [
  { id: 1, label: "Which car", title: "Which car", icon: Search },
  { id: 2, label: "Your copy", title: "Your copy", icon: IndianRupee },
];
const LAST_STEP = WIZARD_STEPS.length;

export function CarFormDialog({
  open,
  onOpenChange,
  initial,
  mode,
  onSwitchToBulk,
  prefill,
  prefillStatus = "PO",
  onSaved,
  draftScope,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Diecast | null;
  mode: "add" | "edit";
  /**
   * Add mode only: hands off to the bulk dialog, optionally carrying cars to
   * prefill it with — the ISO matches, when several turn up at once.
   */
  onSwitchToBulk?: (seed?: Diecast[]) => void;
  /**
   * Add mode only: a casting to start from (Home's "Recently pre-ordered"),
   * with its catalogue fields filled in and the status set to Pre Order.
   */
  prefill?: CatalogueCar | null;
  /** The status a prefilled form starts on. Pre Order unless the caller knows better. */
  prefillStatus?: string;
  /**
   * The row as it was saved, with the IDs the store assigned it. A caller that
   * opened this dialog to get a casting on file — the pack member picker — needs
   * to know which catalogue entry came out of it.
   */
  onSaved?: (car: Diecast) => void;
  /**
   * Keeps this wizard's half-finished draft apart from another's. Only a
   * dialog opened over the top of another needs one.
   */
  draftScope?: string;
}) {
  const { addCar, updateCar } = useCarsActions();
  const cars = useCars();
  // Option lists come from the shared catalogue as well as your own cars, so a
  // new account is not typing into empty dropdowns. See suggestion-pool.ts.
  const pool = useSuggestionPool();
  const { isGuest, isAdmin } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState<CarFormData>(getBlankForm());
  // A broken image is the photo field's business now — it shows the failure in
  // the frame where the picture would have been.
  // Per-car: dismissing is "not this one", not "never show me these".
  const [isoDismissed, setIsoDismissed] = useState(false);
  /** The first required field left empty, shown on the field itself. */
  const [validationError, setValidationError] = useState<FieldError | null>(null);
  /** Set by Next / Add car, so the field is scrolled to once it is on screen. */
  const jumpToError = useRef(false);
  /** True when this session's form came back from storage rather than blank. */
  const [restored, setRestored] = useState(false);
  /** Set once the draft for this open has been read, so the save can begin. */
  const [draftReady, setDraftReady] = useState(false);
  /** Edit mode only: the delete confirmation raised from the footer. */
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** The card scanner, raised from the catalogue fields it fills in. */
  const [scanOpen, setScanOpen] = useState(false);
  /**
   * Step two's three groups. The catalogue fields start shut because a picked car
   * has already filled them in; they open on their own when the car was entered
   * by hand, or when one of them fails validation and has to be shown.
   */
  const [showIdentity, setShowIdentity] = useState(false);
  /** Whether the photos found for this car are open under the identity card. */
  const [pickingPhoto, setPickingPhoto] = useState(false);
  /** Whether a second wizard is open over this one, filing a pack member. */
  const [addingMember, setAddingMember] = useState(false);
  const [showPurchase, setShowPurchase] = useState(true);
  const [showCondition, setShowCondition] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
  /**
   * Whether step two's summary describes a car the catalogue filled in. Only for
   * the badge: a car entered by hand has nothing to claim credit for.
   */
  const [fromCatalogue, setFromCatalogue] = useState(false);

  /**
   * Whether the casting this row is a copy of is a box of cars, and what is in
   * it. Not part of `form`, because none of it belongs to your copy — it is the
   * casting's, shared with everyone who owns one, and it is written to the
   * catalogue rather than to the car.
   *
   * It is here because adding a car is the other way a casting gets filed: a
   * 2-pack nobody has catalogued yet would otherwise have to be entered once
   * here and marked a second time on the Catalog page.
   */
  const [isPack, setIsPack] = useState(false);
  const [packSize, setPackSize] = useState(0);
  const [packList, setPackList] = useState<string[]>([]);
  /** Until this is touched, the pack fields follow whatever casting is picked. */
  const packTouched = useRef(false);
  const [showPack, setShowPack] = useState(false);

  /**
   * An ISO row is a car you are looking for, not one you bought. There is no
   * seller, no order, nothing spent and nothing to settle, so those four leave
   * the form and are stored as NA instead of as blanks or meaningless zeroes.
   */
  const isIso = statusIsIso(form.status);
  /** Still coming, so a courier and a tracking number can exist. */
  const stillComing = isOpenOrder(form.status);
  /** A pre-order has a release month, never a shipping date. */
  const isPreOrder = statusIsPreOrder(form.status);
  /**
   * In hand. The courier and the tracking number stop mattering, but what the
   * delivery cost is still part of what the car cost, so shipping stays.
   */
  const hasArrived = isInHand(form.status);
  /**
   * Only a car actually moving has a courier and a consignment number.
   * Ordered and On Hold are both waiting on somebody else to send it, so the
   * only thing worth recording is when it is due.
   */
  const showTransit = needsTransit(form.status);

  /**
   * Editing an owned car cannot change what the casting is: that entry is shared
   * with everyone else who owns one. Everything about *this copy* stays yours to
   * correct, which now includes the seller, the order date and the MRP — they
   * used to sit in a read-only rail, so a mistyped seller was permanent.
   */
  const isEdit = mode === "edit";

  const catalogueValues: CatalogueValues = {
    make: form.make,
    model: form.model,
    variant: form.variant,
    year: form.year,
    colour: form.colour,
    type: form.type,
    brand: form.brand,
    assortment: form.assortment,
    series: form.series,
    subSeries: form.subSeries,
    carNumber: form.carNumber,
    size: form.size,
    rarity: form.rarity,
  };
  const templateOriginRef = useRef<{
    colour?: string;
    variant?: string;
    make?: string;
    model?: string;
    imageUrl?: string;
  }>({
    colour: prefill?.colour,
    variant: prefill?.variant,
    make: prefill?.make,
    model: prefill?.model,
    imageUrl: prefill?.imageUrl,
  });

  const setCatalogueValue = <K extends keyof CatalogueValues>(k: K, v: CatalogueValues[K]) => {
    if (
      k === "colour" &&
      templateOriginRef.current.colour &&
      v !== templateOriginRef.current.colour
    ) {
      // If user changes colour away from template, clear template image so candidate search can run
      if (form.imageUrl && form.imageUrl === templateOriginRef.current.imageUrl) {
        setForm((f) => ({ ...f, imageUrl: "" }));
        autoImage.current = "";
        declinedImageKey.current = "";
      }
    }
    set(k as keyof CarFormData, v as CarFormData[keyof CarFormData]);
  };

  /** The standard secondary line, so the summary reads like a car anywhere else. */
  const identityLine = carSubLine({
    brand: form.brand,
    assortment: form.assortment,
    series: form.series,
    subSeries: form.subSeries,
    carNumber: form.carNumber,
    caseNumber: form.caseNumber,
  });

  /** What this brand and assortment has cost before, most used first. */
  const mrpChoices = useMemo(
    () => mrpOptionsFor(pool, form.brand, form.assortment),
    [pool, form.brand, form.assortment],
  );
  /** At most four prices on the segment; the rest are reached through Other. */
  const mrpSegments = useMemo(() => mrpChoices.slice(0, 4), [mrpChoices]);
  const [mrpTyped, setMrpTyped] = useState(false);
  const mrpIsKnown = !mrpTyped && mrpSegments.includes(Number(form.mrp));
  /** Who this collection buys from most, for one tap. */
  const sellerChips = useMemo(() => topSellers(cars, 3), [cars]);
  // The grades as the segment control wants them. The descriptions stay in the
  // combobox lists the edit rail still uses.
  const carConditionSegments = useMemo(
    () => CAR_CONDITIONS.map((c) => ({ value: c.value, label: c.value })),
    [],
  );
  const cardConditionSegments = useMemo(
    () => CARD_CONDITIONS.map((c) => ({ value: c.value, label: c.value })),
    [],
  );
  const paymentSegments = useMemo(() => PAYMENT_OPTIONS.map((o) => ({ value: o, label: o })), []);

  /**
   * A pre-order's window, held in expectedDate as the 1st of the month so one
   * column carries both and nothing downstream has to learn a second shape.
   */
  const etaMonth = form.expectedDate ? String(Number(form.expectedDate.slice(5, 7)) - 1) : "";
  const etaYear = form.expectedDate ? form.expectedDate.slice(0, 4) : "";
  const thisYear = new Date().getFullYear();
  const ETA_YEARS = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2, thisYear + 3];
  const setEta = (monthIdx: string, year: string) => {
    if (!monthIdx || !year) {
      set("expectedDate", "");
      return;
    }
    set("expectedDate", `${year}-${String(Number(monthIdx) + 1).padStart(2, "0")}-01`);
  };

  /** Each section says what it holds, so it can stay shut and still be read. */
  const purchaseBadge = isIso
    ? "NA — still looking"
    : form.seller.trim()
      ? `${form.payment} · ${form.seller.trim()}`
      : `${form.payment} · seller needed`;
  const purchaseBadgeTone: "muted" | "warn" = !isIso && !form.seller.trim() ? "warn" : "muted";
  const conditionBadge =
    [form.carCondition, form.cardCondition].filter(Boolean).length > 0
      ? `${[form.carCondition, form.cardCondition].filter(Boolean).length} of 2 set`
      : "not set";
  const extrasBadge =
    form.caseNumber.trim() ||
    (form.transitInfo.trim() ? "note added" : form.imageUrl ? "photo set" : "nothing yet");

  const fromPrefill = mode === "add" && !initial && Boolean(prefill);
  const isClone = mode === "add" && Boolean(initial);
  // A pre-filled form keeps its draft apart, so opening one never overwrites
  // (or clears) an unfinished car the person was adding by hand.
  // The scope keeps a wizard opened *from inside another wizard* off the outer
  // one's draft: they would otherwise share a key, so the inner form would open
  // pre-filled with the outer car and then overwrite it keystroke by keystroke.
  const draftKey =
    (mode === "add"
      ? fromPrefill
        ? `${CAR_DRAFT_KEY}:prefill`
        : isClone
          ? `${CAR_DRAFT_KEY}:clone`
          : CAR_DRAFT_KEY
      : carEditDraftKey(initial?.id ?? "")) + (draftScope ? `:${draftScope}` : "");

  /**
   * What the dialog was opened for, as a value rather than an object.
   *
   * `initial` and `prefill` arrive as objects, and a caller is free to build
   * one inside its own render — catalog.tsx does, inline in the JSX. Meanwhile
   * the cars store reloads every 15 seconds and the catalogue listens for
   * realtime pushes, so every one of those re-rendered the parent, handed this
   * dialog a structurally identical but brand-new `prefill`, and re-ran the
   * seed effect below: the half-filled form replaced by the blank one, mid
   * sentence, over and over.
   *
   * Keyed on what the casting is rather than on which object it arrived in, it
   * re-seeds when the dialog is opened on a different car and not otherwise.
   */
  const seedKey = [
    mode,
    initial?.id ?? "",
    prefill ? `${prefill.catalogId ?? ""}~${catalogueKey(prefill)}` : "",
    prefillStatus,
  ].join("|");

  // Rebuilt per open rather than held in state: it is what "unchanged" means
  // for this dialog, and both the restore and the save below compare against it.
  const baseline = useMemo(
    () =>
      initial
        ? formFromCar(initial)
        : fromPrefill && prefill
          ? { ...catalogueFields(prefill, getBlankForm()), status: prefillStatus }
          : getBlankForm(),
    // A blank form stamps today's date, so it must not be rebuilt on every
    // render — only when the dialog opens or what it was opened for changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, seedKey],
  );

  useEffect(() => {
    if (!open) {
      setDraftReady(false);
      return;
    }
    setValidationError(null);
    setIsoDismissed(false);
    setIsoStatusCar(null);

    // Pick up where the last session left off. On mobile this is the whole
    // point: a locked phone can have the tab evicted and reloaded underneath a
    // half-filled form, and the person comes back to an empty one otherwise.
    // A pre-filled open always starts from the casting it was opened for.
    const draft = fromPrefill || isClone ? null : readDraft<CarDraft>(draftKey);
    if (draft?.form) {
      // Spread over the baseline so a draft written before a field existed
      // still restores, rather than arriving with the field undefined.
      setForm({ ...baseline, ...draft.form });
      setCurrentStep(mode === "add" ? Math.min(LAST_STEP, Math.max(1, draft.step || 1)) : 1);
      setRestored(true);
    } else {
      setForm(baseline);
      setCurrentStep(isClone ? 2 : 1);
      setRestored(false);
    }
    // A pre-filled open has already answered step one — the casting was chosen,
    // off a catalogue entry or a pre-order. Rows are filled in and identity fields
    // are kept open so they can be reviewed and edited as needed.
    if (fromPrefill || isClone) {
      setFromCatalogue(true);
      setShowIdentity(true);
      setCurrentStep(2);
      if (prefill) {
        templateOriginRef.current = {
          colour: prefill.colour,
          variant: prefill.variant,
          make: prefill.make,
          model: prefill.model,
          imageUrl: prefill.imageUrl,
        };
      }
    } else {
      // Otherwise back to how a fresh dialog starts: a previous pre-filled open
      // must not leave the next by-hand one thinking it came from the catalogue.
      setFromCatalogue(false);
      setShowIdentity(false);
      templateOriginRef.current = {};
    }
    setPickingPhoto(false);
    setDraftReady(true);
    // prefill is read above but is deliberately not a dependency: seedKey
    // already covers a change of casting, and it is the object identity that
    // was firing this effect on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seedKey, baseline, draftKey, mode, fromPrefill, isClone]);

  // The save. Every keystroke lands here, and an untouched form clears the key
  // rather than leaving a draft that says nothing.
  //
  // Gated on draftReady because the restore above only schedules its state: on
  // that same commit this effect would still see the blank form and delete the
  // draft it had just read.
  useEffect(() => {
    if (!open || !draftReady) return;
    if (sameForm(form, baseline)) {
      clearDraft(draftKey);
      return;
    }
    writeDraft<CarDraft>(draftKey, { form, step: currentStep });
  }, [open, draftReady, form, currentStep, baseline, draftKey]);

  const discard = () => {
    clearDraft(draftKey);
    setForm(baseline);
    setCurrentStep(1);
    setRestored(false);
    setValidationError(null);
  };

  const set = <K extends keyof CarFormData>(k: K, v: CarFormData[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    // Filling in the field that was flagged clears the flag.
    setValidationError((e) => (e && e.field === k ? null : e));
  };
  const errorFor = (k: keyof CarFormData) =>
    validationError?.field === k ? validationError.message : undefined;

  /**
   * What the card scanner read, over the top of what is in the form.
   *
   * Only the rows the person left ticked arrive here, and only ones with a
   * value, so this can be a flat merge: a field the scan did not fill in keeps
   * whatever was typed, and a field it did fill in is one they chose to take.
   */
  const applyScan = (fields: ScanResult) => {
    setForm((f) => ({ ...f, ...fields }));
    setValidationError(null);
    // A scan answers step one the same way picking a car does, so it moves on
    // with the fields open: what a camera read is worth checking.
    if (mode === "add" && currentStep === 1) {
      setFromCatalogue(false);
      setShowIdentity(true);
      setCurrentStep(2);
    }
  };

  /**
   * A car already in the collection, picked from the search at the top: its
   * catalogue fields copied in, so a second copy of a casting — or the same
   * casting in another colour — starts from what is known. What this purchase
   * cost, who sold it and when are this car's own, so they are left alone.
   */
  const applyExisting = (car: CatalogueCar) => {
    templateOriginRef.current = {
      colour: car.colour,
      variant: car.variant,
      make: car.make,
      model: car.model,
      imageUrl: car.imageUrl,
    };
    setForm((f) => {
      const next = catalogueFields(car, f);
      // What this brand and assortment has cost before, for the entries that
      // carry no price of their own.
      const known = mrpOptionsFor(pool, next.brand, next.assortment);
      const mrp = next.mrp === "" ? (known[0] ?? "") : next.mrp;
      // Spent starts equal to MRP: you normally pay list, and a figure you can
      // correct beats an empty box you must fill. Only when it is untouched.
      const spent = f.spent === "" ? mrp : f.spent;
      const paid = next.payment === "Paid" ? spent : next.paid;
      const balance = Math.max(0, (Number(spent) || 0) - (Number(paid) || 0));
      return { ...next, mrp, spent, paid, balance };
    });
    setValidationError(null);
    toast.success("Filled rows from catalogue", {
      description: "You can modify any fields (colour, variant, year, etc.) for this car.",
    });
  };

  /**
   * A car can only be graded below Mint once it is out of the blister, so any
   * grade but Mint carries the card grade with it.
   */
  const setCarCondition = (v: string) => {
    setForm((f) => {
      const implied = cardGradeForCarGrade(v);
      return { ...f, carCondition: v, cardCondition: implied ?? f.cardCondition };
    });
    setValidationError((e) => (e && e.field === "carCondition" ? null : e));
  };

  /**
   * Step one, resolved: a catalogue entry fills the rows in as a template.
   * Identity fields stay open and visible because fields are subjected to change.
   */
  const pickFromCatalogue = (car: CatalogueCar) => {
    applyExisting(car);
    setFromCatalogue(true);
    setShowIdentity(true);
    setCurrentStep(2);
  };

  /** The other way through step one: nothing to copy, so the fields open. */
  const startByHand = () => {
    setValidationError(null);
    setFromCatalogue(false);
    setShowIdentity(true);
    setCurrentStep(2);
  };

  /**
   * Automatically derives balance based on amount paid and spent.
   * If user updates spent:
   */
  const handleSpentChange = (val: number | "") => {
    setForm((prev) => {
      const next = { ...prev, spent: val };
      const numSpent = typeof val === "number" ? val : 0;
      if (prev.payment === "Paid") {
        next.paid = val;
        next.balance = 0;
      } else if (prev.payment === "Pending") {
        next.paid = 0;
        next.balance = numSpent;
      } else {
        const numPaid = typeof prev.paid === "number" ? prev.paid : 0;
        next.balance = Math.max(0, numSpent - numPaid);
      }
      return next;
    });
  };

  /**
   * When user updates paid:
   * Automate balance = Math.max(0, spent - paid)
   * And align payment status accordingly
   */
  const handlePaidChange = (val: number | "") => {
    setForm((prev) => {
      const next = { ...prev, paid: val };
      const numSpent = typeof prev.spent === "number" ? prev.spent : 0;
      const numPaid = typeof val === "number" ? val : 0;
      const balance = Math.max(0, numSpent - numPaid);
      next.balance = balance;

      if (balance === 0 && numSpent > 0) {
        next.payment = "Paid";
      } else if (numPaid === 0) {
        next.payment = "Pending";
      } else {
        next.payment = "Partial";
      }
      return next;
    });
  };

  const handlePaymentChange = (p: string) => {
    setForm((prev) => {
      const next = { ...prev, payment: p };
      const numSpent = typeof prev.spent === "number" ? prev.spent : 0;
      if (p === "Paid") {
        next.paid = prev.spent;
        next.balance = 0;
      } else if (p === "Pending") {
        next.paid = 0;
        next.balance = numSpent;
      } else if (p === "Partial") {
        const numPaid = typeof prev.paid === "number" ? prev.paid : 0;
        next.balance = Math.max(0, numSpent - numPaid);
      }
      return next;
    });
  };

  // Suggestions are the seed list merged with whatever the collection already
  // uses, so every catalogue field learns this person's own vocabulary.
  const makeOptions = useMemo(() => optionsFor("make", cars), [cars]);
  const modelOptions = useMemo(() => modelOptionsFor(cars, form.make), [cars, form.make]);
  // One level below the model: "R34" only means something once you know it is a
  // Skyline.
  const variantOptions = useMemo(
    () => variantOptionsFor(cars, form.make, form.model),
    [cars, form.make, form.model],
  );
  const yearOptions = useMemo(() => yearOptionsFor(cars), [cars]);
  const caseOptions = useMemo(() => optionsFor("caseNumber", cars), [cars]);
  const colourOptions = useMemo(() => optionsFor("colour", cars), [cars]);
  const typeOptions = useMemo(() => optionsFor("type", cars), [cars]);
  const brandOptions = useMemo(() => optionsFor("brand", cars), [cars]);
  // An assortment belongs to its brand the way a model belongs to its make:
  // "Qube Carz" is Mini GT's, and offering it under Matchbox helped nobody.
  const assortmentOptions = useMemo(
    () => assortmentOptionsFor(pool, form.brand),
    [pool, form.brand],
  );
  const sizeOptions = useMemo(() => optionsFor("size", pool), [pool]);
  const seriesOptions = useMemo(() => optionsFor("series", pool), [pool]);
  const subSeriesOptions = useMemo(() => optionsFor("subSeries", pool), [pool]);
  /** The four this brand uses most; the rest sit behind Other. */
  const assortmentChips = useMemo(() => assortmentChipsFor(pool, form.brand), [pool, form.brand]);
  // Sellers are never seeded — the list is only ever the ones this collection
  // has actually bought from.
  const sellerOptions = useMemo(
    () => optionsFor("seller", cars).filter((s) => s.toLowerCase() !== NO_SELLER.toLowerCase()),
    [cars],
  );
  /**
   * ISO entries this car might be. Recomputed as the catalogue fields change,
   * which is cheap: it is one pass over the collection comparing seven strings,
   * and it stops early once fewer than three fields have anything in them.
   */
  const isoMatches = useMemo(
    () =>
      isoMatchesFor(
        cars,
        {
          make: form.make,
          model: form.model,
          variant: form.variant,
          series: form.series,
          subSeries: form.subSeries,
          brand: form.brand,
          assortment: form.assortment,
        },
        // Editing an ISO car must not suggest the car being edited.
        { excludeId: initial?.id },
      ),
    [
      cars,
      initial?.id,
      form.make,
      form.model,
      form.variant,
      form.series,
      form.subSeries,
      form.brand,
      form.assortment,
    ],
  );

  const { catalog, addCatalogCar, updateCatalogCar, packMembers, setPackMembers } = useCatalog();

  // The catalogue entry this car is: the one picked on the Catalog page while
  // its details still describe it, otherwise the one with the same details.
  const existingCatalogMatch = useMemo(() => {
    if (!form.make.trim() && !form.model.trim()) return null;
    const fields = {
      brand: form.brand,
      make: form.make,
      model: form.model,
      assortment: form.assortment,
      series: form.series,
      subSeries: form.subSeries,
      carNumber: form.carNumber,
      mrp: form.mrp,
      variant: form.variant,
      colour: form.colour,
    };
    const picked = prefill?.catalogId
      ? catalog.find((c) => c.car_id === prefill.catalogId)
      : undefined;
    if (picked && catalogEntryMatches(picked, fields)) return picked;
    const found = findCatalogEntry(fields);
    return (found && catalog.find((c) => c.car_id === found.car_id)) || null;
  }, [
    catalog,
    prefill?.catalogId,
    form.brand,
    form.make,
    form.model,
    form.assortment,
    form.series,
    form.subSeries,
    form.carNumber,
    form.mrp,
    form.variant,
    form.colour,
  ]);

  const derivedCatalogCarId = useMemo(
    () =>
      existingCatalogMatch?.car_id ??
      generateCatalogCarId(
        {
          brand: form.brand,
          make: form.make,
          model: form.model,
          assortment: form.assortment,
          series: form.series,
          subSeries: form.subSeries,
        },
        cars.filter((c) => isCatalogCarId(c.id)).map((c) => ({ id: c.id, car: c })),
      ),
    [
      existingCatalogMatch,
      cars,
      form.brand,
      form.make,
      form.model,
      form.assortment,
      form.series,
      form.subSeries,
    ],
  );

  /**
   * The casting's pack, as the catalogue currently has it. This is the baseline
   * the save below compares against, so a car added to an existing pack writes
   * nothing to the catalogue at all.
   */
  const catalogPack = useMemo(
    () => ({
      isPack: Boolean(existingCatalogMatch?.is_multipack),
      size: Number(existingCatalogMatch?.pack_size) || 0,
      members: existingCatalogMatch ? (packMembers[existingCatalogMatch.car_id] ?? []) : [],
    }),
    [existingCatalogMatch, packMembers],
  );

  // A fresh open starts from the catalogue again, and so does every pick from
  // the search — until the pack fields are touched, at which point they are the
  // person's answer and picking nothing else should overwrite them.
  useEffect(() => {
    if (!open) {
      packTouched.current = false;
      return;
    }
    if (packTouched.current) return;
    setIsPack(catalogPack.isPack);
    setPackSize(catalogPack.size);
    setPackList(catalogPack.members);
    setShowPack(catalogPack.isPack);
  }, [open, catalogPack]);

  /**
   * The ISO entry whose status is being changed. Opening the dialog rather than
   * filling this form: the catalogue fields are already recorded on that row —
   * retyping them here only risks disagreeing with it — and what is actually
   * missing is what happened to the car, which is what the dialog asks.
   */
  const [isoStatusCar, setIsoStatusCar] = useState<Diecast | null>(null);

  const sendIsoToBulk = (matches: Diecast[]) => {
    clearDraft(draftKey);
    setIsoDismissed(true);
    onSwitchToBulk?.(matches);
  };

  /**
   * Photos of this car, looked up from what has been typed. In the wizard the
   * search starts as soon as step 1 is done, so by step 4 the picture is
   * already waiting; editing searches straight away.
   */
  const imageSearch = useCarImageCandidates(
    {
      make: form.make,
      model: form.model,
      variant: form.variant,
      year: form.year,
      colour: form.colour,
      brand: form.brand,
      assortment: form.assortment,
      series: form.series,
      subSeries: form.subSeries,
      carNumber: form.carNumber,
    },
    open && (mode === "edit" || currentStep >= 2),
  );

  /** The car in words, for the "Search the web" button under the photo. */
  const webSearchWords = [
    form.brand,
    form.year,
    form.make,
    form.model,
    form.variant,
    form.colour,
    form.assortment,
    form.series,
    form.carNumber,
  ]
    .map((v) => (v || "").trim())
    .filter(Boolean)
    .join(" ");

  // What the wizard put in the frame by itself, and the car it gave up on
  // because the person removed that pick. A photo they chose is never replaced.
  const autoImage = useRef("");
  const declinedImageKey = useRef("");
  useEffect(() => {
    if (open) return;
    autoImage.current = "";
    declinedImageKey.current = "";
  }, [open]);

  useEffect(() => {
    if (mode !== "add" || !open) return;
    const best = imageSearch.candidates[0];
    if (!best || declinedImageKey.current === imageSearch.key) return;
    setForm((f) => {
      if (f.imageUrl && f.imageUrl !== autoImage.current) return f;
      if (f.imageUrl === best.url) return f;
      autoImage.current = best.url;
      return { ...f, imageUrl: best.url };
    });
  }, [mode, open, imageSearch.key, imageSearch.candidates]);

  const setImage = (url: string) => {
    if (!url && form.imageUrl === autoImage.current) declinedImageKey.current = imageSearch.key;
    set("imageUrl", url);
  };

  const previewName = useMemo(() => {
    return (
      form.displayName.trim() ||
      buildCarName({
        make: form.make,
        model: form.model,
        variant: form.variant,
        year: form.year,
        type: form.type,
        series: form.series,
      }) ||
      `${form.make || "Make"} ${form.model || "Model"}`.trim()
    );
  }, [form.displayName, form.make, form.model, form.variant, form.year, form.type, form.series]);

  // Validation per step
  const validateStep = (step: number): FieldError | null => {
    const need = (field: keyof CarFormData, message: string): FieldError => ({ field, message });
    // In the order the fields appear, so the first one flagged is the first on screen.
    if (step === 1) {
      // Step one is the search. Nothing can be right yet unless a car was picked
      // or the manual route filled these in, and both land on step two.
      if (!form.make.trim()) return need("make", "Pick a car, or enter one by hand.");
      if (!form.model.trim()) return need("model", "Enter the model.");
    } else if (step === 2) {
      // The catalogue fields first: they sit above the purchase on this step.
      if (!form.type.trim()) return need("type", "Enter the type.");
      if (!form.brand.trim()) return need("brand", "Enter the brand.");
      if (!form.assortment.trim()) return need("assortment", "Enter the assortment.");
      // Hot Wheels and Matchbox print a position in a series; every other brand
      // prints a number that belongs to the casting, and it is what tells two
      // near-identical ones apart.
      if (needsCarNumber(form.brand) && !form.carNumber.trim())
        return need(
          "carNumber",
          `${form.brand.trim()} prints a collector number on the box — enter it so this casting can be told from its near-twins.`,
        );
      if (!form.status.trim()) return need("status", "Pick a status.");
      // Everything below describes a purchase, and an ISO row is not one.
      if (isIso) return null;
      if (!form.seller.trim())
        return need("seller", `Pick a seller, or "${NO_SELLER}" if there wasn't one.`);
      if (!form.orderDate.trim()) return need("orderDate", "Pick the order date.");
      if (form.mrp === "" || form.mrp === null) return need("mrp", "Enter the MRP.");
      if (form.spent === "" || form.spent === null) return need("spent", "Enter what it cost.");
      if (!form.payment.trim()) return need("payment", "Pick a payment status.");
    }
    return null;
  };

  // Once the flagged field is rendered (a step change may be needed first),
  // bring it into view and put the caret in it.
  /** The fields that live behind "Edit these details". */
  const CATALOGUE_FIELDS = new Set<keyof CarFormData>([
    "make",
    "model",
    "variant",
    "year",
    "colour",
    "type",
    "brand",
    // assortment is deliberately absent: it moved to Seller & payment.
    "series",
    "subSeries",
    "carNumber",
    "size",
    "rarity",
  ]);

  useEffect(() => {
    if (!jumpToError.current || !validationError) return;
    jumpToError.current = false;
    // Opening it first: scrolling to a field inside a shut group scrolls to
    // nothing, and the person is told to fix something they cannot see.
    if (CATALOGUE_FIELDS.has(validationError.field)) setShowIdentity(true);
    if (!CATALOGUE_FIELDS.has(validationError.field)) setShowPurchase(true);
    const frame = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-field="${validationError.field}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.querySelector<HTMLElement>("input, [role=combobox], button")?.focus({
        preventScroll: true,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [validationError, currentStep]);

  const handleNext = () => {
    const error = validateStep(currentStep);
    if (error) {
      jumpToError.current = true;
      setValidationError(error);
      return;
    }
    setValidationError(null);
    setCurrentStep((s) => Math.min(LAST_STEP, s + 1));
  };

  const handleBack = () => {
    setValidationError(null);
    setCurrentStep((s) => Math.max(1, s - 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Nothing submits a half-walked wizard. The footer's last button is the only
    // way to catalogue a car, and it only exists on the summary — so a submit
    // arriving from anywhere else (a stray Enter, a browser autofill) is not an
    // intent to save, it is an accident to swallow.
    if (mode === "add" && currentStep < LAST_STEP) return;
    setValidationError(null);

    // Validate all steps if submitting
    for (let s = 1; s <= LAST_STEP; s++) {
      const err = validateStep(s);
      if (err) {
        jumpToError.current = true;
        setValidationError(err);
        if (mode === "add") setCurrentStep(s);
        return;
      }
    }

    const make = form.make.trim();
    const model = form.model.trim();
    const colour = form.colour.trim();
    const type = form.type.trim();
    const brand = form.brand.trim();
    const assortment = form.assortment.trim();
    const status = form.status.trim();
    /**
     * An ISO row records that the question did not apply rather than leaving the
     * fields blank, which would read as "not filled in yet". Only the two text
     * columns can actually hold "NA": spent, paid and balance are numbers, so
     * they stay at zero — which is also what every total wants them to be.
     */
    const iso = statusIsIso(status);
    const payment = iso ? "NA" : form.payment.trim();
    const seller = iso ? "NA" : form.seller.trim() === NO_SELLER ? "" : form.seller.trim();
    const orderDate = iso ? "" : form.orderDate.trim();

    const spent = iso ? 0 : Number(form.spent) || 0;
    const mrp = Number(form.mrp) || 0;
    const shippingCost = iso || form.shippingCost === "" ? 0 : Number(form.shippingCost) || 0;
    const paid = iso
      ? 0
      : form.paid === ""
        ? payment === "Paid"
          ? spent
          : 0
        : Number(form.paid) || 0;
    // Automated balance guarantee
    const balance = Math.max(0, spent - paid);

    // What you call it wins over what the fields assemble. It is written to
    // this row only — nothing here touches the catalogue's own name.
    const name =
      form.displayName.trim() ||
      derivedName({
        make,
        model,
        variant: form.variant,
        year: form.year,
        type,
        series: form.series,
      });

    const orderMonth = deriveMonth(orderDate);
    // `date` is the day the car *arrived*, and now that expectedDate has a
    // column of its own it stops standing in for it. A pre-order given an
    // arrival date reads as delivered to everything downstream: the shipping ID
    // stops being numbered /PO/, and the month charts count it as bought.
    const arrived = isInHand(status);
    const date = arrived
      ? form.expectedDate.trim() || initial?.date?.trim() || orderDate
      : isOpenOrder(status)
        ? ""
        : initial?.date?.trim() || "";
    const month = deriveMonth(date) || orderMonth;

    // An edit keeps the car's own ID; a new car is numbered by the store, which
    // can see the whole collection. The catalogue ID says which casting it is.
    const carId = isEdit && initial?.id && !isPlaceholderId(initial.id) ? initial.id : "";

    const payload: Diecast = {
      id: carId,
      catalogId: derivedCatalogCarId || initial?.catalogId,
      sno: isEdit ? initial?.sno : undefined,
      name,
      make,
      model,
      variant: form.variant.trim(),
      year: form.year.trim(),
      colour,
      type,
      series: form.series.trim(),
      subSeries: form.subSeries.trim(),
      carNumber: form.carNumber.trim(),
      caseNumber: form.caseNumber.trim() || undefined,
      brand,
      assortment,
      size: form.size.trim() || "1:64",
      spent,
      mrp,
      shippingCost,
      payment,
      seller,
      status,
      paid,
      balance,
      transitInfo: form.transitInfo.trim(),
      deliveryPartner: form.deliveryPartner.trim() || undefined,
      trackingId: form.trackingId.trim() || undefined,
      // Blank for a conversion: an ISO row never had a seller or dates to
      // derive one from, so the store computes it fresh from what was just
      // entered rather than carrying nothing forward.
      shippingId: isEdit ? initial?.shippingId || "" : "",
      // Both IDs are derived on save; an edit carries the existing one
      // forward so an unrelated change does not look like a renumber.
      orderId: isEdit ? initial?.orderId || "" : "",
      orderDate,
      orderMonth,
      expectedDate: form.expectedDate.trim(),
      date,
      month,
      official: form.official,
      rarity: form.rarity,
      chase: form.rarity !== "Normal",
      carCondition: form.carCondition.trim(),
      cardCondition: form.cardCondition.trim(),
      carRating: form.carRating,
      cardRating: form.cardRating,
      favourite: form.favourite,
      imageUrl: form.imageUrl.trim() || undefined,
    };

    // A new car of a casting the catalogue already describes takes the
    // catalogue's description, whatever was typed — the database does the same
    // on insert. Later edits to the car are the owner's own.
    const entry = catalog.find((c) => c.car_id.toUpperCase() === carId.toUpperCase());
    if (entry && mode === "add") {
      Object.assign(payload, {
        brand: entry.brand,
        make: entry.make,
        model: entry.model,
        variant: entry.variant || "",
        colour: entry.colour || "",
        type: entry.type || "",
        assortment: entry.assortment,
        series: entry.series,
        subSeries: entry.sub_series,
        carNumber: entry.car_number,
        size: entry.size || payload.size,
        mrp: Number(entry.mrp) || 0,
        year: entry.year || "",
        // The catalogue's name, unless you typed one of your own for this copy.
        name: form.displayName.trim() || entry.name || payload.name,
      });
    }

    if (payload.imageUrl) {
      setCachedCarImage(
        {
          brand: payload.brand,
          make: payload.make,
          model: payload.model,
          variant: payload.variant,
          colour: payload.colour,
          name: payload.name,
        },
        payload.imageUrl,
      );
    }

    // The casting's pack, written to the catalogue rather than to this row —
    // and written *before* the car, deliberately. Saving a car files its casting
    // too, with an insert that ignores an id already there; going second would
    // mean the flag lost that race silently.
    //
    // Nothing is written when the catalogue already says this, which is the
    // usual case: buying a second copy of a 5-pack restates no facts.
    //
    // Editing counts as well as adding. It used to be adds only, so opening a
    // pack you already own and listing what is in it saved nothing at all — the
    // contents went back to what they were the moment the dialog closed.
    if (payload.catalogId) {
      const packId = payload.catalogId;
      const wanted = isPack ? packList : [];
      const sizeChanged = isPack && packSize !== catalogPack.size;
      const flagChanged = isPack !== catalogPack.isPack || sizeChanged;
      const membersChanged =
        wanted.length !== catalogPack.members.length ||
        wanted.some((id, i) => id !== catalogPack.members[i]);

      if (flagChanged) {
        const packFields = {
          is_multipack: isPack,
          // Only a box has a size, so un-ticking clears it rather than leaving
          // a "5" the entry carries around invisibly.
          pack_size: isPack ? packSize || null : null,
        };
        if (existingCatalogMatch) {
          // Only admins may rewrite a casting everyone shares. For anyone else
          // the pack is recorded on the Catalog page instead, so the car still
          // saves rather than failing on a permission it never needed.
          if (isAdmin) await updateCatalogCar({ ...existingCatalogMatch, ...packFields });
        } else {
          await addCatalogCar({
            ...diecastToCatalogCar(payload),
            car_id: packId,
            ...packFields,
          });
        }
      }
      // The contents are a table of their own, and an admin-only one.
      if (membersChanged && isAdmin) await setPackMembers(packId, wanted);
    }

    // The store's copy, not the payload: it carries the IDs that were assigned
    // on the way in, which is what a caller waiting on the casting needs.
    const saved = mode === "add" ? addCar(payload) : (updateCar(payload), payload);
    onSaved?.(saved);

    // The car is saved; the draft has nothing left to protect.
    clearDraft(draftKey);
    setRestored(false);
    onOpenChange(false);
  };

  /**
   * Everything that is true of *your copy* of a casting: what it cost, where
   * it is, what condition it is in, and the photo and notes you keep with it.
   *
   * One definition, rendered by both modes. Adding a car shows it as step two;
   * editing one shows it on its own. They were two different forms over the
   * same fields, which is how edit ended up with a Payment dropdown after add
   * had segments, and a read-only rail listing a seller you could not correct.
   */
  /**
   * Castings the catalogue already has that look like the one being typed.
   *
   * Only when it was entered by hand. Picking one from the search is not a way
   * to create a duplicate — it is the opposite — and editing a car cannot
   * change the casting at all.
   */
  const duplicates = useMemo(
    () =>
      isEdit || fromCatalogue
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
              subSeries: form.subSeries,
              carNumber: form.carNumber,
              year: form.year,
            },
            catalog,
            { excludeCarId: derivedCatalogCarId },
          ),
    [
      isEdit,
      fromCatalogue,
      catalog,
      derivedCatalogCarId,
      form.brand,
      form.make,
      form.model,
      form.variant,
      form.colour,
      form.assortment,
      form.series,
      form.subSeries,
      form.carNumber,
      form.year,
    ],
  );

  const copyFields = (
    <div className="space-y-3">
      {/* Above the summary, so it is read before the purchase is filled in.
          "Use this" is the whole point: the fix for a duplicate is to pick the
          entry that already exists, which is one tap from here. */}
      <DuplicateNotice
        hits={duplicates}
        onUse={(c) => pickFromCatalogue(catalogCarToCatalogueCar(c))}
      />
      {/* What the car is, as one line you confirm rather than sixteen
                  fields you fill. The fields are still here, one tap down. */}
      {/* Pinned to the top of the scroller: which car this is, is the one thing
          you need while filling in everything below it. The tint moved off the
          section and onto its rows because a sticky box must be opaque —
          bg-muted/30 let the fields scroll through it. */}
      <section
        className={cn(
          "overflow-hidden rounded-lg border border-border bg-background",
          // Opened, the fields make it taller than the scroller, and a sticky
          // box that tall pins over everything below it instead of yielding.
          !showIdentity && "sticky top-0 z-20 shadow-sm",
        )}
      >
        <div className="flex items-start gap-3 bg-muted/30 p-3">
          {/* The thumbnail is the button for fixing it — see photo-picker.tsx,
              which the catalogue's own dialog shares. */}
          <PhotoThumbButton
            url={form.imageUrl}
            picking={pickingPhoto}
            onClick={() => setPickingPhoto((v) => !v)}
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <TruncatedName
                name={previewName || "New casting"}
                className="text-sm font-semibold text-foreground"
              />
              <ChaseMark rarity={form.rarity} className="size-3.5 shrink-0" />
            </div>
            <p className="truncate text-[11px] text-muted-foreground">{identityLine}</p>
            {fromCatalogue && !isEdit && (
              <span className="mt-1.5 inline-flex rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                Filled from the catalogue
              </span>
            )}
          </div>
          {/* Adding, you can go back and pick a different casting.
                      Editing, the car is the car. */}
          {!isEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => {
                setValidationError(null);
                setCurrentStep(1);
              }}
            >
              Change
            </Button>
          )}
        </div>

        {/* What the search turned up for this car, as a row you scroll. The
            same candidates Photo & notes shows further down — this is the
            shortcut, not a second search. Choosing one closes the row, because
            the picture in the card above is the answer. */}
        {pickingPhoto && (
          <PhotoCandidateStrip
            search={imageSearch}
            value={form.imageUrl}
            onPick={(url) => {
              setImage(url);
              setPickingPhoto(false);
            }}
          />
        )}

        <button
          type="button"
          onClick={() => setShowIdentity((v) => !v)}
          aria-expanded={showIdentity}
          className="flex w-full items-center gap-2 border-t border-border bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {isEdit ? "What the car is" : "Edit these details"}
          <ChevronRight
            className={cn("ml-auto size-3.5 transition-transform", showIdentity && "rotate-90")}
          />
        </button>
        {showIdentity && (
          <div className="border-t border-border bg-background p-3">
            <CatalogueFields
              values={catalogueValues}
              onChange={setCatalogueValue}
              cars={pool}
              errorFor={(k) => errorFor(k as keyof CarFormData)}
              disabled={isEdit}
              allowCarNumberEdit={true}
              omit={["assortment"]}
              chain={!isEdit && !fromCatalogue}
            />
            {/* Not disabled on an edit, unlike everything above it. The name is
                the one thing here that is yours rather than the casting's: it is
                written to your row and to nothing else, so the catalogue and
                everyone else's copy keep whatever they already say. */}
            <div className="mt-3 border-t border-border/50 pt-3">
              <Field label="Display name">
                <ClearableInput
                  value={form.displayName}
                  onChange={(e) => set("displayName", e.target.value)}
                  placeholder={derivedName(form) || "Make Model"}
                  aria-label="Display name"
                />
                <p className="pt-1 text-[11px] text-muted-foreground">
                  What you call this one. Blank builds it from make and model. Yours only — the
                  catalogue and other collections are not touched.
                </p>
              </Field>
            </div>
            <p className="mt-2.5 text-[11px] text-muted-foreground">
              {isEdit
                ? "The casting is shared with everyone who owns one, so it is edited in the catalogue. Only the Car Number and the display name can be updated here."
                : "You can adjust any fields (colour, variant, year, car number, etc.) for this car. If the details describe a different release, a unique Catalog ID will be assigned."}
            </p>
          </div>
        )}
      </section>

      {/* Whether the casting is a box rather than a car — the same control the
          catalogue form has, because this is the other place a casting gets
          filed. It is written to the catalogue, not to your copy: the box is
          one row you own whichever way it is counted. */}
      <FormSection
        title="Multipack"
        badge={packBadge(isPack, packSize, packList.length)}
        open={showPack}
        onToggle={() => setShowPack((v) => !v)}
      >
        <MultipackField
          isPack={isPack}
          packSize={packSize}
          members={packList}
          onPackChange={(v) => {
            packTouched.current = true;
            setIsPack(v);
          }}
          onSizeChange={(v) => {
            packTouched.current = true;
            setPackSize(v ?? 0);
          }}
          onMembersChange={(ids) => {
            packTouched.current = true;
            setPackList(ids);
          }}
          disabled={!isAdmin}
          canEditMembers={isAdmin}
          onAddNew={isAdmin ? () => setAddingMember(true) : undefined}
          selfCarId={derivedCatalogCarId}
        />
        <p className="mt-2.5 text-[11px] text-muted-foreground">
          {isAdmin
            ? "The box and what is in it are part of the shared catalogue, so this is what everyone who owns one sees. The cars inside stop being listed on their own."
            : "The box is shared with everyone who owns one, so it is edited in the catalogue rather than here."}
        </p>
      </FormSection>

      {/* The purchase. Open by default: every required field on this
                  step is in here, and shut it would be a form that looks
                  finished while being empty. */}
      <FormSection
        title="Seller & payment"
        badge={purchaseBadge}
        badgeTone={purchaseBadgeTone}
        open={showPurchase}
        onToggle={() => setShowPurchase((v) => !v)}
      >
        {/* Each answered by tapping rather than typing, in the order you know
            the answers in: which box it came in, where it has got to, who sold
            it, when, what it lists at, what you actually paid, and whether that
            money has moved. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Assortment leads, and it is here rather than up in Which Car
              because it is the one identity field that is really about the
              purchase: it decides which retail prices the form can offer, and
              a Matchbox Bronco is 179 as Mainline and 399 as Moving Parts. */}
          <SegmentOrOther
            label="Assortment *"
            name="assortment"
            error={errorFor("assortment")}
            value={form.assortment}
            onChange={(v) => set("assortment", v)}
            chips={assortmentChips}
            options={assortmentOptions}
            placeholder={form.brand ? `Which ${form.brand} line?` : "Pick a brand first"}
            searchPlaceholder="Search assortments, or type a new one…"
            hint={form.brand ? undefined : "Choose a brand above and the usual four appear here."}
          />

          {/* Status decides what the rest of this section asks for. ISO takes
              four fields away, a pre-order swaps the expected date for a
              release month. */}
          <Field label="Status *" name="status" error={errorFor("status")}>
            <SegmentControl
              fill
              value={form.status}
              options={STATUS_OPTIONS.map((st) => ({ value: st, label: st }))}
              onChange={(v) => set("status", v)}
            />
          </Field>

          {!isIso && (
            <SegmentOrOther
              label="Seller *"
              name="seller"
              error={errorFor("seller")}
              value={form.seller}
              onChange={(v) => set("seller", v)}
              chips={sellerChips}
              // "No seller" always first in the list: a gift or a swap is a
              // real answer, and the field is required.
              options={[NO_SELLER, ...sellerOptions]}
              placeholder="Who sold it?"
              searchPlaceholder="Search sellers, or type a new one…"
            />
          )}

          {!isIso && (
            <Field label="Order date *" name="orderDate" error={errorFor("orderDate")}>
              <ClearableInput
                type="date"
                value={form.orderDate}
                onChange={(e) => set("orderDate", e.target.value)}
              />
            </Field>
          )}

          {/* Every price this brand and assortment has gone for, and a box for
              one it has not. Picking a price is picking what you paid too —
              they are the same number until you say otherwise. */}
          {/* The prices this brand and assortment have gone for, as a segment
              like everything else in this section. Four at most: a fifth label
              inside a third of the dialog is unreadable, and "Other" opens a
              box for a price nobody has recorded yet. */}
          <Field
            label={isIso ? "Retail price (INR)" : "Retail price * (INR)"}
            name="mrp"
            error={errorFor("mrp")}
          >
            {mrpSegments.length > 0 && (
              <SegmentControl
                fill
                value={mrpIsKnown ? String(form.mrp) : OTHER}
                options={[
                  ...mrpSegments.map((v) => ({ value: String(v), label: inrFull(v) })),
                  { value: OTHER, label: "Other" },
                ]}
                onChange={(v) => {
                  if (v === OTHER) {
                    setMrpTyped(true);
                    return;
                  }
                  setMrpTyped(false);
                  set("mrp", Number(v));
                  handleSpentChange(Number(v));
                }}
              />
            )}
            {(mrpSegments.length === 0 || !mrpIsKnown) && (
              <div className={mrpSegments.length > 0 ? "mt-2" : undefined}>
                <ClearableInput
                  type="number"
                  min="0"
                  step="any"
                  value={form.mrp}
                  onChange={(e) => {
                    const v = e.target.value === "" ? "" : Number(e.target.value);
                    set("mrp", v);
                    handleSpentChange(v);
                  }}
                  placeholder="e.g. 549"
                />
              </div>
            )}
            {mrpSegments.length === 0 && form.brand && form.assortment && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Nothing recorded for {form.brand} · {form.assortment} yet — this one sets the
                precedent.
              </p>
            )}
          </Field>

          {!isIso && (
            <Field
              label="Buying price * (INR)"
              name="spent"
              error={errorFor("spent")}
              info={SPENT_INFO}
            >
              <ClearableInput
                type="number"
                min="0"
                step="any"
                value={form.spent}
                onChange={(e) =>
                  handleSpentChange(e.target.value === "" ? "" : Number(e.target.value))
                }
                placeholder="e.g. 549"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Follows the retail price above until you change it.
              </p>
            </Field>
          )}

          {!isIso && (
            <Field label="Payment status *" name="payment" error={errorFor("payment")}>
              <SegmentControl
                fill
                value={form.payment}
                options={paymentSegments}
                onChange={handlePaymentChange}
              />
            </Field>
          )}
        </div>

        {isIso && (
          <p className="mt-3 border-l-2 border-primary/60 pl-3 text-[11px] text-muted-foreground">
            An ISO entry is a car you are looking for, so seller, order date, spent, payment and
            shipping do not apply — the two text ones are saved as NA rather than left blank. Its
            MRP is worth noting, but not owed.
          </p>
        )}

        {/* Paid only when there is something left to settle, and
                    Balance is worked out rather than asked for. */}
        {!isIso && form.payment !== "Paid" && (
          <div className="mt-3 border-l-2 border-amber-500/60 pl-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Shown because payment is not Paid
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Paid (INR)" info={PAID_INFO}>
                <ClearableInput
                  type="number"
                  min="0"
                  step="any"
                  value={form.paid}
                  onChange={(e) =>
                    handlePaidChange(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder="0"
                />
              </Field>
              <Field label="Balance (INR)">
                <div className="flex h-9 items-center rounded-md border border-dashed border-input px-3 text-sm font-semibold tabular-nums">
                  {inrFull(Number(form.balance) || 0)}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Spent {inrFull(Number(form.spent) || 0)} − paid {inrFull(Number(form.paid) || 0)}
                </p>
              </Field>
            </div>
          </div>
        )}

        {/* Nothing has shipped on a pre-order, so it has a release
                    month instead of a date, and no courier or tracking. */}
        {(stillComing || hasArrived) && (
          <div className="mt-3 border-l-2 border-sky-500/60 pl-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {isPreOrder
                ? "A pre-order has a release window, not a shipping date"
                : hasArrived
                  ? "It is here — expected / available date and delivery cost recorded"
                  : `Shown because the status is "${form.status}"`}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {hasArrived ? (
                <>
                  <Field label="Expected / available Date">
                    <ClearableInput
                      type="date"
                      value={form.expectedDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        set("expectedDate", val);
                      }}
                    />
                  </Field>
                  <Field label="Shipping Cost (INR)">
                    <ClearableInput
                      type="number"
                      min="0"
                      step="any"
                      value={form.shippingCost}
                      onChange={(e) =>
                        set("shippingCost", e.target.value === "" ? "" : Number(e.target.value))
                      }
                      placeholder="e.g. 50"
                    />
                  </Field>
                </>
              ) : isPreOrder ? (
                <>
                  <Field label="Expected month">
                    <Select
                      value={etaMonth}
                      onValueChange={(v) => setEta(v, etaYear || String(thisYear))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Month" />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTH_LABELS.map((m, i) => (
                          <SelectItem key={m} value={String(i)}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Expected year">
                    <Select value={etaYear} onValueChange={(v) => setEta(etaMonth || "0", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Year" />
                      </SelectTrigger>
                      <SelectContent>
                        {ETA_YEARS.map((y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  {form.expectedDate && (
                    <p className="self-end text-[11px] text-muted-foreground sm:col-span-2 lg:col-span-1">
                      Saved as{" "}
                      <span className="font-medium text-foreground">{form.expectedDate}</span> — the
                      1st, and the day you will be reminded.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <Field label="Expected / available Date">
                    <ClearableInput
                      type="date"
                      value={form.expectedDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        set("expectedDate", val);
                      }}
                    />
                  </Field>
                  {/* Ordered and On Hold are both waiting on somebody else to
                      send it: there is no courier yet, no consignment number
                      and no shipping bill, so the date it is due is the whole
                      of what can be said. The three fields appear the moment
                      the status becomes In Transit. */}
                  {showTransit && (
                    <>
                      <Field label="Delivery Partner">
                        <Combobox
                          clearable
                          value={form.deliveryPartner}
                          onChange={(v) => set("deliveryPartner", v)}
                          options={DELIVERY_PARTNER_NAMES}
                          placeholder="Courier"
                          searchPlaceholder="Search or type a courier…"
                          ariaLabel="Delivery partner"
                        />
                      </Field>
                      <Field label="Tracking ID">
                        <ClearableInput
                          className="font-mono"
                          value={form.trackingId}
                          onChange={(e) => set("trackingId", e.target.value)}
                          placeholder="Consignment / AWB number"
                        />
                      </Field>
                      {/* Shipping belongs with the shipment: you learn
                              what it cost from the same courier line that
                              gives you the tracking number. */}
                      <Field label="Shipping Cost (INR)">
                        <ClearableInput
                          type="number"
                          min="0"
                          step="any"
                          value={form.shippingCost}
                          onChange={(e) =>
                            set("shippingCost", e.target.value === "" ? "" : Number(e.target.value))
                          }
                          placeholder="e.g. 50"
                        />
                      </Field>
                      <TrackingLink
                        partner={form.deliveryPartner}
                        trackingId={form.trackingId}
                        className="sm:col-span-2 lg:col-span-3"
                      />
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </FormSection>

      <FormSection
        title="Condition"
        badge={conditionBadge}
        open={showCondition}
        onToggle={() => setShowCondition((v) => !v)}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Car condition">
            <SegmentControl
              fill
              value={form.carCondition}
              options={carConditionSegments}
              onChange={setCarCondition}
              clearable
            />
          </Field>
          <Field label="Card condition">
            <SegmentControl
              fill
              value={form.cardCondition}
              options={cardConditionSegments}
              onChange={(v) => set("cardCondition", v)}
              clearable
            />
          </Field>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Only meaningful once the car is in hand. Tap the chosen grade again to clear it.
        </p>
      </FormSection>

      <FormSection
        title="Photo & notes"
        badge={extrasBadge}
        open={showExtras}
        onToggle={() => setShowExtras((v) => !v)}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Which box this one came out of, not what the casting is
                      — so it stays on your car rather than the catalogue. */}
          <Field label="Case / Mix">
            <Combobox
              clearable
              value={form.caseNumber}
              onChange={(v) => set("caseNumber", v)}
              options={caseOptions}
              placeholder="e.g. 2026 K Case, 2026 Mix 3"
              searchPlaceholder="Search cases, or type a new one…"
              ariaLabel="Case or mix"
            />
          </Field>
          <Field label="Notes">
            <ClearableInput
              value={form.transitInfo}
              onChange={(e) => set("transitInfo", e.target.value)}
              placeholder="Anything worth remembering about this copy"
            />
          </Field>
          <div className="space-y-1.5">
            <Label htmlFor="car-favourite" className="text-xs text-muted-foreground">
              Favourite
            </Label>
            <div className="flex h-9 items-center gap-2.5 rounded-md border border-input bg-background px-3">
              <Switch
                id="car-favourite"
                checked={form.favourite}
                onCheckedChange={(v) => set("favourite", v)}
              />
              <Label
                htmlFor="car-favourite"
                className="cursor-pointer text-xs font-medium text-foreground"
              >
                Mark as favourite
              </Label>
            </div>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <Label className="text-xs text-muted-foreground">Photo</Label>
          {/* layout="split": on a desktop the frame is smaller and
                      the found photos fill the space to its right. */}
          <CarPhotoField
            value={form.imageUrl}
            onChange={setImage}
            suggestions={imageSearch}
            searchQuery={webSearchWords}
            layout="split"
          />
        </div>
      </FormSection>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Widths carry the `sm:` modifier deliberately — see DialogContent. Edit
          is the wider of the two: it puts the read-only rail beside the fields
          rather than under them, which is the whole point of the layout. */}
      <DialogContent
        hideDragHandle
        className={cn(
          // A column with one scrolling middle, so the steps stay at the top
          // and Cancel/Next stay at the bottom however long the form gets.
          // The dialog itself no longer scrolls; the part between them does.
          "flex flex-col overflow-hidden overscroll-contain touch-pan-y",
          "w-full max-w-full sm:max-w-3xl",
          mode === "add" ? "lg:max-w-5xl" : "lg:max-w-6xl",
          // Pinned near the top of the window rather than centred on it. A
          // centred dialog puts step one — a search box and two buttons — in
          // the middle of the screen, and the form appears to jump up the page
          // as it grows on step two.
          "sm:top-6 sm:translate-y-0 sm:max-h-[calc(100dvh-3rem)]",
          "max-sm:fixed max-sm:inset-0 max-sm:top-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-full max-sm:rounded-none max-sm:border-0 max-sm:p-3.5 max-sm:m-0",
        )}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{mode === "add" ? "Add a car" : "Update car"}</DialogTitle>
          {/* The search, Scan and Add in bulk used to sit here in one row of six
              small controls, with Export and the CSV template beside them. They
              are step one now — the search full width and focused, the other two
              as buttons you can hit on a phone. Export went back to the page
              toolbars, where the list it exports actually is. */}
          <DialogDescription>
            {mode === "add"
              ? "Find the car, then say what your copy cost."
              : "Status, logistics, payment and flags. What the car is stays as catalogued."}
          </DialogDescription>
        </DialogHeader>

        {/* The "Car Name:" banner that used to sit here is gone. It existed to
            preview a name assembled from fields as they were typed — but step
            one has nothing typed yet and read "Make Model", and step two prints
            the same name at the top of the summary card a few pixels below it.
            Edit mode had already dropped it for the same reason. */}

        {restored && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs">
            <span className="flex items-center gap-2 text-foreground">
              <RotateCcw className="size-3.5 shrink-0 text-primary" />
              Picked up where you left off — nothing you typed was lost.
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={discard}
            >
              Start fresh
            </Button>
          </div>
        )}

        {/* Adding marks the field itself; editing has no step fields to mark. */}
        {validationError && mode !== "add" && (
          <div className="flex shrink-0 items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{validationError.message}</span>
          </div>
        )}

        {/* ===================== MODE: ADD ===================== */}
        {mode === "add" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {/* Two steps, so the rail is two buttons rather than a strip of five. */}
            <div className="shrink-0 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {WIZARD_STEPS.map((step) => {
                  const StepIcon = step.icon;
                  const isActive = currentStep === step.id;
                  const isCompleted = currentStep > step.id;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => {
                        if (step.id < currentStep) {
                          setValidationError(null);
                          setCurrentStep(step.id);
                        }
                      }}
                      className={cn(
                        "flex min-w-0 items-center justify-center gap-2 rounded-lg border p-2 text-center transition-all",
                        isActive
                          ? "border-primary bg-primary/10 text-primary shadow-xs"
                          : isCompleted
                            ? "cursor-pointer border-border bg-muted/60 text-foreground hover:bg-muted"
                            : "cursor-not-allowed border-border/40 bg-muted/20 text-muted-foreground/60",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : isCompleted
                              ? "bg-emerald-500 text-white"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {isCompleted ? <Check className="size-3" /> : step.id}
                      </span>
                      <StepIcon className="hidden size-3.5 sm:inline" />
                      <span className="truncate text-xs font-medium">{step.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${(currentStep / LAST_STEP) * 100}%` }}
                />
              </div>
            </div>

            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="flex min-h-0 flex-1 flex-col gap-4"
            >
              {/* The only part that scrolls. `min-h-0` is what lets it: without
                  it a flex child refuses to shrink below its content and the
                  footer is pushed off the bottom of the dialog instead. */}
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-0.5">
                {/* ---------------- STEP 1: WHICH CAR ---------------- */}
                {currentStep === 1 && (
                  <div className="space-y-4">
                    {/* Above the search rather than below: by the time three fields
                      agree with something on the ISO list, the useful moment is
                      before the rest is typed out by hand. */}
                    {!isoDismissed && (
                      <IsoSuggestions
                        matches={isoMatches}
                        onUse={setIsoStatusCar}
                        onBulk={onSwitchToBulk ? sendIsoToBulk : undefined}
                        onDismiss={() => setIsoDismissed(true)}
                      />
                    )}

                    <div className="space-y-1.5">
                      <CollectionSearch
                        cars={cars}
                        onPick={pickFromCatalogue}
                        searchAll={!isGuest}
                        wide
                        autoFocus
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Pick a car and the fourteen fields that describe the casting fill themselves
                        in. Your collection first, then every collection.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setScanOpen(true)}
                        className="flex min-h-[4.5rem] flex-col items-start gap-1 rounded-xl border-[1.5px] border-border bg-background p-3 text-left transition-colors hover:border-primary"
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold">
                          <ScanLine className="size-4 text-primary" />
                          Scan a card
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Read make, model and series off the card
                        </span>
                      </button>
                      {onSwitchToBulk && (
                        <button
                          type="button"
                          // Wrapped, not passed directly: onSwitchToBulk takes seed
                          // cars, and a bare handler would hand it the click event
                          // as the batch to prefill.
                          onClick={() => onSwitchToBulk()}
                          className="flex min-h-[4.5rem] flex-col items-start gap-1 rounded-xl border-[1.5px] border-border bg-background p-3 text-left transition-colors hover:border-primary"
                        >
                          <span className="flex items-center gap-2 text-sm font-semibold">
                            <Layers className="size-4 text-primary" />
                            Add in bulk
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            Several at once, or a CSV
                          </span>
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={startByHand}
                      className="text-xs text-primary underline underline-offset-2"
                    >
                      Not in the catalogue? Enter it manually →
                    </button>
                  </div>
                )}

                {/* ---------------- STEP 2: YOUR COPY ---------------- */}
                {currentStep === 2 && copyFields}
              </div>

              {/* Cancel left, Next right, at the foot of the dialog at every
                  width — outside the scroller, so they are where you left them
                  however far down the form you are. */}
              <DialogFooter className="flex shrink-0 flex-row items-center justify-between border-t border-border/50 pt-3 sm:justify-between">
                <div>
                  {/* Cancel is the one gesture that means "throw this away", so
                      it is also the one that drops the draft. Closing by Escape,
                      the X, or a phone deciding to reload the tab all leave it. */}
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      clearDraft(draftKey);
                      onOpenChange(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  {currentStep > 1 && (
                    <Button type="button" variant="outline" onClick={handleBack}>
                      <ChevronLeft className="size-4 mr-1" /> Back
                    </Button>
                  )}
                  {/* The keys matter, and this is why.

                      Without them React sees one <button> in this slot across
                      both branches and keeps the same DOM node, swapping only
                      its `type` attribute. Clicking Next then ran handleNext,
                      React flushed the state update before the browser got round
                      to the click's default action, and the browser read
                      type="submit" off the element it had just changed — saving
                      the car on the way to a step nobody ever saw. Distinct keys
                      mean distinct nodes. */}
                  {currentStep < LAST_STEP ? (
                    <Button key="next" type="button" onClick={handleNext}>
                      Next <ChevronRight className="size-4 ml-1" />
                    </Button>
                  ) : (
                    <Button key="save" type="submit" className="bg-primary text-primary-foreground">
                      <Check className="size-4 mr-1" /> Add car
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </form>
          </div>
        ) : (
          /* ===================== MODE: EDIT ===================== */
          /* The same block adding a car uses for step two, with the casting
             locked. What differs is the footer: editing can delete. */
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col gap-4 overflow-x-hidden"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-0.5">
              {copyFields}
            </div>

            {/* Delete lives here now, at the far end of the footer from Save.
                It was a full-width button on the car's detail view, one tap from
                simply reading about a car; behind Edit it takes a deliberate
                trip, and it is still the only red thing on screen. */}
            <DialogFooter className="flex shrink-0 flex-row items-center justify-between gap-2 border-t border-border/60 pt-3 sm:justify-between w-full min-w-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                className="gap-1.5 text-rose-500 hover:bg-rose-500/10 hover:text-rose-400 shrink-0"
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    clearDraft(draftKey);
                    onOpenChange(false);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit">Update car</Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>

      {/* Deleting closes this dialog; anything showing the car behind it — the
          details drawer, a table row — drops it on the same commit, because the
          car is gone from the store rather than merely hidden. */}
      {mode === "edit" && initial && (
        <DeleteCarDialog
          car={initial}
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          onDeleted={() => {
            clearDraft(draftKey);
            onOpenChange(false);
          }}
        />
      )}

      {/* Stacked over the form, in both modes. Cancelling out of it leaves
          everything typed so far untouched. */}
      <CarScanDialog open={scanOpen} onOpenChange={setScanOpen} onApply={applyScan} />

      {/* Filing a car that goes inside the pack you are describing. Searching
          the catalogue is no help when the car in the box has never been
          entered, so this is the whole Add-a-car wizard over the top of this
          one; the casting it files is added to the list on save. */}
      {addingMember && (
        <CarFormDialog
          open
          mode="add"
          draftScope="pack-member"
          onOpenChange={(v) => {
            if (!v) setAddingMember(false);
          }}
          onSaved={(car) => {
            if (car.catalogId) {
              packTouched.current = true;
              setPackList((ids) => (ids.includes(car.catalogId!) ? ids : [...ids, car.catalogId!]));
            }
            setAddingMember(false);
          }}
        />
      )}

      {/* Stacked over the wizard rather than replacing it: cancelling out of a
          status change should leave the half-typed car exactly where it was. */}
      <StatusUpdateDialog
        car={isoStatusCar}
        onClose={() => setIsoStatusCar(null)}
        onDone={() => {
          // The entry has been dealt with, so the form that surfaced it has
          // nothing left to add.
          clearDraft(draftKey);
          setRestored(false);
          onOpenChange(false);
        }}
      />
    </Dialog>
  );
}

/** Defaults in their given order, then collected values not among them. */
const CARD_CONDITION_NOTES = describe(CARD_CONDITIONS);

/** Every field the wizard collected, grouped by the step that asked for it. */
/**
 * A car name that stops at the edge with an ellipsis instead of widening the
 * dialog. The full name shows on hover with a mouse, or on a tap on a phone.
 */
type FieldError = { field: keyof CarFormData; message: string };

function TruncatedName({ name, className = "" }: { name: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={name}
          onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
          className={`block min-w-0 truncate text-left ${className}`}
        >
          {name}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto max-w-[min(22rem,calc(100vw-2rem))] break-words px-3 py-2 text-xs font-medium"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {name}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Search for a car and copy its catalogue fields into the form.
 *
 * Your own collection first — instant, and the likeliest match — then cars
 * from every account, which come from the search_catalogue database function
 * and carry only what a car is, never anyone's price, seller or photos. Words
 * match in any order, so "skyline white premium" finds the one it means, and a
 * casting that appears in both lists is only suggested once.
 */
function CollectionSearch({
  cars,
  onPick,
  searchAll,
  wide = false,
  autoFocus = false,
}: {
  cars: Diecast[];
  onPick: (car: CatalogueCar) => void;
  /** False for guests: the demo searches its own sample cars only. */
  searchAll: boolean;
  /** Full width and a taller field: it is the whole of step one, not a control. */
  wide?: boolean;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const remote = useCatalogueSearch(query, searchAll);

  const local = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const seen = new Set<string>();
    const out: Diecast[] = [];
    for (const car of cars) {
      const hay = [
        car.name,
        car.make,
        car.model,
        car.variant,
        car.year,
        car.brand,
        car.assortment,
        car.series,
        car.subSeries,
        car.colour,
        car.carNumber,
      ]
        .join(" ")
        .toLowerCase();
      if (!words.every((w) => hay.includes(w))) continue;
      const key = catalogueKey(car);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(car);
      if (out.length >= 6) break;
    }
    return out;
  }, [cars, query]);

  const others = useMemo(() => {
    const mine = new Set(local.map(catalogueKey));
    return remote.cars.filter((c) => !mine.has(catalogueKey(c))).slice(0, 10);
  }, [local, remote.cars]);

  const first = local[0] ?? others[0];
  const open = focused && query.trim().length > 0;

  const pick = (car: CatalogueCar) => {
    onPick(car);
    setQuery("");
    setFocused(false);
  };

  const row = (car: CatalogueCar, key: string, hint?: string) => (
    <button
      key={key}
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => pick(car)}
      className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left hover:bg-muted"
    >
      <span className="flex w-full min-w-0 items-center gap-1.5 text-sm font-medium">
        <span className="truncate">{car.name || `${car.make} ${car.model}`}</span>
        <ChaseMark rarity={rarityOf(car)} className="size-3.5" />
        {hint && (
          <span className="ml-auto shrink-0 text-[10px] font-normal text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
      <span className="w-full truncate text-[11px] text-muted-foreground">
        {[
          car.brand,
          car.assortment,
          car.colour,
          car.series,
          car.carNumber ? `#${car.carNumber}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </button>
  );

  return (
    <div className={cn("relative w-full", !wide && "sm:w-64")}>
      <Search
        className={cn(
          "pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground",
          wide ? "left-3" : "left-2.5",
        )}
      />
      <Input
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        // Delayed so a tap on a result lands before the list disappears.
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (first) pick(first);
          }
          if (e.key === "Escape") setQuery("");
        }}
        placeholder={wide ? "Search catalogue" : "Search all cars to fill…"}
        aria-label="Search catalogue"
        className={cn(wide ? "h-11 pl-10 text-base" : "h-8 pl-8 text-sm")}
      />
      {open && (
        <div
          className={cn(
            "absolute inset-x-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-popover p-1 text-left shadow-lg",
            !wide && "sm:w-96",
          )}
        >
          {local.length > 0 && (
            <>
              <SearchGroupLabel>Your collection</SearchGroupLabel>
              {local.map((car) => row(car, `mine:${car.id}`))}
            </>
          )}
          {searchAll && others.length > 0 && (
            <>
              <SearchGroupLabel>All collections</SearchGroupLabel>
              {others.map((car) =>
                row(
                  car,
                  `all:${catalogueKey(car)}:${car.year}`,
                  (car.copies ?? 0) > 1 ? `${car.copies} owned` : undefined,
                ),
              )}
            </>
          )}
          {searchAll && remote.loading && (
            <p className="flex items-center justify-center gap-1.5 px-2 py-2 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Searching all collections…
            </p>
          )}
          {!remote.loading && local.length === 0 && others.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              No car matches that yet — type it in below.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SearchGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

/**

/**
 * Deleting a car is not undoable past a reload, so it takes a typed phrase
 * rather than one click on a confirm.
 *
 * This used to be two components: a soft AlertDialog here and a typed-phrase one
 * inside the details drawer, so how hard it was to delete a car depended on
 * which screen you did it from. The stricter one won.
 */
export function DeleteCarDialog({
  car,
  open,
  onOpenChange,
  onDeleted,
}: {
  car: Diecast | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Called after the car is gone — for a parent that should close with it. */
  onDeleted?: () => void;
}) {
  const { deleteCar } = useCarsActions();
  const [typed, setTyped] = useState("");

  useEffect(() => {
    setTyped("");
  }, [car?.id, open]);

  if (!car) return null;

  const phrase = `delete ${(car.make || car.name || "car").trim()}`.toLowerCase();
  const matches = typed.trim().toLowerCase() === phrase;
  const confirm = () => {
    if (!matches) return;
    deleteCar(car.id);
    onOpenChange(false);
    onDeleted?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="text-lg font-semibold">Delete this car?</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {car.name || `${car.make} ${car.model}`}
          </span>{" "}
          will be removed from your collection. Undo brings it back, until you reload.
        </DialogDescription>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Type <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">{phrase}</code> to
            confirm.
          </p>
          <Input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirm();
            }}
            placeholder={phrase}
            aria-label="Type the confirmation phrase"
          />
        </div>

        <DialogFooter className="pt-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!matches}
            onClick={confirm}
            className="gap-1.5 bg-rose-600 text-white hover:bg-rose-500"
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
