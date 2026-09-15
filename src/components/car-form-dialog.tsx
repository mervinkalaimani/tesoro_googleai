import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCarImageCandidates } from "@/lib/car-image-search";
import { catalogueKey, useCatalogueSearch, type CatalogueCar } from "@/lib/catalogue-search";
import { useAuth } from "@/lib/auth-store";
import { RARITIES, RARITY_LABEL, rarityOf, type Rarity } from "@/lib/rarity";
import { CAR_CONDITIONS, CARD_CONDITIONS, describe } from "@/lib/condition";
import { formatDayMonthYear } from "@/lib/format";
import { ChaseMark } from "@/components/car-marks";
import { StarRating } from "@/components/star-rating";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Diecast } from "@/lib/types";
import { useCarsActions, useCars } from "@/lib/cars-store";
import { buildCarName } from "@/lib/car-name";
import { modelOptionsFor, optionsFor, variantOptionsFor } from "@/lib/car-options";
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
import { generateCatalogCarId, isPlaceholderId } from "@/lib/car-id";
import { useCatalog } from "@/lib/catalog-store";
import { CarPhotoField } from "@/components/car-photo-field";
import { CarScanDialog, type ScanResult } from "@/components/car-scan-dialog";
import { DataActions } from "@/components/data-actions";
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
  Sparkles,
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

const STATUS_OPTIONS = [
  "Available",
  "Out for Delivery",
  "Transit",
  "Delayed",
  "Pre Order",
  "Waiting",
  "ISO",
  "On Hold",
];
const PAYMENT_OPTIONS = ["Paid", "Partial", "Pending"];

const SPENT_INFO = "The total amount you've spent to purchase the car.";
const PAID_INFO = "The amount you've paid till now.";

/** Statuses that mean the car is in hand, and so has a real arrival date. */
const ARRIVED_STATUSES = new Set(["available", "wrong item"]);

/**
 * Statuses that mean it is definitely still coming. Any received date one of
 * these is carrying describes a delivery that has not happened, so it is
 * dropped rather than kept — the estimate lives in the expected date now.
 */
const NOT_RECEIVED_STATUSES = new Set([
  "waiting",
  "pre order",
  "preorder",
  "delayed",
  "transit",
  "out for delivery",
]);

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
}

/**
 * Picked from the seller list when a car had no seller — a gift, a swap, a find.
 * Saved as a blank seller: a car with "No seller" in the column would give
 * every such car one shared, meaningless order and shipping ID.
 */
const NO_SELLER = "No seller";

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
    brand: "",
    assortment: "",
    size: "1:64",
    spent: "",
    mrp: "",
    shippingCost: "",
    payment: "Paid",
    seller: "",
    // Most cars are catalogued the day they are ordered, long before they
    // arrive; "Available" as the default was wrong more often than right.
    status: "Waiting",
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
    status: initial.status || "Available",
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
        (initial.status === "Available" ? initial.date : "") ||
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
  };
}

/** Both sides always carry the same keys, so one pass over them is enough. */
function sameForm(a: CarFormData, b: CarFormData): boolean {
  return (Object.keys(a) as (keyof CarFormData)[]).every((k) => a[k] === b[k]);
}

type CarDraft = { form: CarFormData; step: number };

const WIZARD_STEPS = [
  { id: 1, label: "Car Details", title: "Car Details", icon: Car },
  { id: 2, label: "Cost", title: "Cost", icon: IndianRupee },
  { id: 3, label: "Transit", title: "Transit", icon: Calendar },
  { id: 4, label: "Image", title: "Image", icon: Sparkles },
  { id: 5, label: "Summary", title: "Summary", icon: ClipboardCheck },
];
const LAST_STEP = WIZARD_STEPS.length;

export function CarFormDialog({
  open,
  onOpenChange,
  initial,
  mode,
  onSwitchToBulk,
  onSwitchToUpload,
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
  /** Add mode only: hands off to the CSV upload dialog. */
  onSwitchToUpload?: () => void;
}) {
  const { addCar, updateCar } = useCarsActions();
  const cars = useCars();
  const { isGuest } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState<CarFormData>(getBlankForm());
  // A broken image is the photo field's business now — it shows the failure in
  // the frame where the picture would have been.
  // Per-car: dismissing is "not this one", not "never show me these".
  const [isoDismissed, setIsoDismissed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  /** True when this session's form came back from storage rather than blank. */
  const [restored, setRestored] = useState(false);
  /** Set once the draft for this open has been read, so the save can begin. */
  const [draftReady, setDraftReady] = useState(false);
  /** Edit mode only: the delete confirmation raised from the footer. */
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** The card scanner, raised from the catalogue fields it fills in. */
  const [scanOpen, setScanOpen] = useState(false);

  const draftKey = mode === "add" ? CAR_DRAFT_KEY : carEditDraftKey(initial?.id ?? "");

  // Rebuilt per open rather than held in state: it is what "unchanged" means
  // for this dialog, and both the restore and the save below compare against it.
  const baseline = useMemo(
    () => (initial ? formFromCar(initial) : getBlankForm()),
    // A blank form stamps today's date, so it must not be rebuilt on every
    // render — only when the dialog opens or the car being edited changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initial, open],
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
    const draft = readDraft<CarDraft>(draftKey);
    if (draft?.form) {
      // Spread over the baseline so a draft written before a field existed
      // still restores, rather than arriving with the field undefined.
      setForm({ ...baseline, ...draft.form });
      setCurrentStep(mode === "add" ? Math.min(LAST_STEP, Math.max(1, draft.step || 1)) : 1);
      setRestored(true);
    } else {
      setForm(baseline);
      setCurrentStep(1);
      setRestored(false);
    }
    setDraftReady(true);
  }, [open, baseline, draftKey, mode]);

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
  };

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
  };

  /**
   * A car already in the collection, picked from the search at the top: its
   * catalogue fields copied in, so a second copy of a casting — or the same
   * casting in another colour — starts from what is known. What this purchase
   * cost, who sold it and when are this car's own, so they are left alone.
   */
  const applyExisting = (car: CatalogueCar) => {
    setForm((f) => ({
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
      size: car.size || f.size,
      rarity: rarityOf(car),
      mrp: car.mrp ? car.mrp : f.mrp,
      imageUrl: f.imageUrl || car.imageUrl || "",
    }));
    setValidationError(null);
    toast.success("Filled from your collection", {
      description: car.name || `${car.make} ${car.model}`.trim(),
    });
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
  const colourOptions = useMemo(() => optionsFor("colour", cars), [cars]);
  const typeOptions = useMemo(() => optionsFor("type", cars), [cars]);
  const brandOptions = useMemo(() => optionsFor("brand", cars), [cars]);
  const assortmentOptions = useMemo(() => optionsFor("assortment", cars), [cars]);
  const sizeOptions = useMemo(() => optionsFor("size", cars), [cars]);
  const seriesOptions = useMemo(() => optionsFor("series", cars), [cars]);
  const subSeriesOptions = useMemo(() => optionsFor("subSeries", cars), [cars]);
  // Sellers are never seeded — the list is only ever the ones this collection
  // has actually bought from.
  const sellerOptions = useMemo(
    () => optionsFor("seller", cars).filter((s) => s.toLowerCase() !== NO_SELLER.toLowerCase()),
    [cars],
  );
  // Condition grades: the defaults first in their own order (best to worst),
  // then anything this collection has typed that is not one of them.
  const carConditionOptions = useMemo(
    () =>
      withDefaults(
        CAR_CONDITIONS.map((c) => c.value),
        cars.map((c) => c.carCondition),
      ),
    [cars],
  );
  const cardConditionOptions = useMemo(
    () =>
      withDefaults(
        CARD_CONDITIONS.map((c) => c.value),
        cars.map((c) => c.cardCondition),
      ),
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

  const { catalog } = useCatalog();

  const derivedCatalogCarId = useMemo(() => {
    return generateCatalogCarId({
      brand: form.brand,
      make: form.make,
      model: form.model,
      assortment: form.assortment,
      series: form.series,
      subSeries: form.subSeries,
      carNumber: form.carNumber,
      mrp: form.mrp,
    });
  }, [
    form.brand,
    form.make,
    form.model,
    form.assortment,
    form.series,
    form.subSeries,
    form.carNumber,
    form.mrp,
  ]);

  const existingCatalogMatch = useMemo(() => {
    if (!form.make.trim() && !form.model.trim()) return null;
    return (
      catalog.find((c) => c.car_id.toUpperCase() === derivedCatalogCarId.toUpperCase()) || null
    );
  }, [catalog, derivedCatalogCarId, form.make, form.model]);

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
      buildCarName({
        make: form.make,
        model: form.model,
        variant: form.variant,
        year: form.year,
        type: form.type,
        series: form.series,
      }) || `${form.make || "Make"} ${form.model || "Model"}`.trim()
    );
  }, [form.make, form.model, form.variant, form.year, form.type, form.series]);

  // Validation per step
  const validateStep = (step: number): string | null => {
    if (step === 1) {
      if (!form.make.trim()) return "Make is required.";
      if (!form.model.trim()) return "Model is required.";
      if (!form.type.trim()) return "Type is required.";
      if (!form.brand.trim()) return "Brand is required.";
      if (!form.assortment.trim()) return "Assortment is required.";
      if (!form.status.trim()) return "Status is required.";
    } else if (step === 2) {
      if (form.spent === "" || form.spent === null) return "Spent amount is required.";
      if (form.mrp === "" || form.mrp === null) return "MRP amount is required.";
      if (!form.payment.trim()) return "Payment status is required.";
      if (!form.seller.trim())
        return `Seller is required — pick "${NO_SELLER}" if there wasn't one.`;
    } else if (step === 3) {
      if (!form.orderDate.trim()) return "Order Date is required.";
    }
    return null;
  };

  const handleNext = () => {
    const error = validateStep(currentStep);
    if (error) {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Nothing submits a half-walked wizard. The footer's last button is the only
    // way to catalogue a car, and it only exists on the summary — so a submit
    // arriving from anywhere else (a stray Enter, a browser autofill) is not an
    // intent to save, it is an accident to swallow.
    if (mode === "add" && currentStep < LAST_STEP) return;
    setValidationError(null);

    // Validate all steps if submitting
    for (let s = 1; s <= 3; s++) {
      const err = validateStep(s);
      if (err) {
        setValidationError(`Step ${s}: ${err}`);
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
    const payment = form.payment.trim();
    const seller = form.seller.trim() === NO_SELLER ? "" : form.seller.trim();
    const status = form.status.trim();
    const orderDate = form.orderDate.trim();

    const spent = Number(form.spent) || 0;
    const mrp = Number(form.mrp) || 0;
    const shippingCost = form.shippingCost === "" ? 0 : Number(form.shippingCost) || 0;
    const paid = form.paid === "" ? (payment === "Paid" ? spent : 0) : Number(form.paid) || 0;
    // Automated balance guarantee
    const balance = Math.max(0, spent - paid);

    const name =
      buildCarName({
        make,
        model,
        variant: form.variant,
        year: form.year,
        type,
        series: form.series,
      }) || `${make} ${model}`.trim();

    const orderMonth = deriveMonth(orderDate);
    // `date` is the day the car *arrived*, and now that expectedDate has a
    // column of its own it stops standing in for it. A pre-order given an
    // arrival date reads as delivered to everything downstream: the shipping ID
    // stops being numbered /PO/, and the month charts count it as bought.
    const arrived = ARRIVED_STATUSES.has(status.toLowerCase());
    const date = arrived
      ? form.expectedDate.trim() || initial?.date?.trim() || orderDate
      : NOT_RECEIVED_STATUSES.has(status.toLowerCase())
        ? ""
        : initial?.date?.trim() || "";
    const month = deriveMonth(date) || orderMonth;

    const carId =
      initial?.id && !isPlaceholderId(initial.id)
        ? initial.id
        : derivedCatalogCarId ||
          `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

    const payload: Diecast = {
      id: carId,
      sno: initial?.sno,
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
      shippingId: initial?.shippingId || "",
      // Both IDs are derived on save; an edit carries the existing one
      // forward so an unrelated change does not look like a renumber.
      orderId: initial?.orderId || "",
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

    if (mode === "add") {
      addCar(payload);
    } else {
      updateCar(payload);
    }

    // The car is saved; the draft has nothing left to protect.
    clearDraft(draftKey);
    setRestored(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Widths carry the `sm:` modifier deliberately — see DialogContent. Edit
          is the wider of the two: it puts the read-only rail beside the fields
          rather than under them, which is the whole point of the layout. */}
      <DialogContent
        hideDragHandle
        className={cn(
          "overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y",
          "w-full max-w-full sm:max-w-3xl",
          mode === "add" ? "lg:max-w-5xl" : "lg:max-w-6xl",
          "max-sm:fixed max-sm:inset-0 max-sm:top-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-full max-sm:rounded-none max-sm:border-0 max-sm:p-3.5 max-sm:m-0",
        )}
      >
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add a car" : "Edit car"}</DialogTitle>
          {mode === "add" && (
            // Search first: the fastest way to add a car is one you already
            // have. Then the other ways in, and getting cars out last.
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1 sm:justify-start">
              <CollectionSearch cars={cars} onPick={applyExisting} searchAll={!isGuest} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setScanOpen(true)}
              >
                <ScanLine className="size-4" />
                {/* Short labels on a phone keep all five on one row. */}
                <span className="sm:hidden">Scan</span>
                <span className="hidden sm:inline">Scan the card</span>
              </Button>
              {onSwitchToBulk && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  // Wrapped, not passed directly: onSwitchToBulk takes seed
                  // cars, and a bare handler would hand it the click event as
                  // the batch to prefill.
                  onClick={() => onSwitchToBulk()}
                >
                  <Layers className="size-4" />
                  <span className="sm:hidden">Bulk</span>
                  <span className="hidden sm:inline">Add in bulk</span>
                </Button>
              )}
              {onSwitchToUpload && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={onSwitchToUpload}
                >
                  <Upload className="size-4" />
                  <span className="sm:hidden">CSV</span>
                  <span className="hidden sm:inline">Upload CSV</span>
                </Button>
              )}
              <span aria-hidden className="h-5 w-px bg-border" />
              <DataActions iconOnly />
            </div>
          )}
          <DialogDescription>
            {mode === "add"
              ? "Five short steps to catalogue a new diecast into your collection."
              : "Status, logistics, payment and flags. What the car is stays as catalogued."}
          </DialogDescription>
        </DialogHeader>

        {/* Live auto-generated car title preview banner.
            Add only: the name is assembled from fields as they are typed, so
            there is something to preview. In edit mode none of those fields can
            change, which made this a banner restating a name that was already
            the dialog's subject — and a row of height the form could not spare. */}
        {mode === "add" && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/40 px-3.5 py-2 text-xs">
            <div className="min-w-0">
              <span className="font-medium text-muted-foreground">Car Name: </span>
              <span className="truncate font-semibold text-foreground">
                {previewName || "Enter make and model"}
              </span>
            </div>
          </div>
        )}

        {restored && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs">
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

        {validationError && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* ===================== MODE: ADD (WIZARD NAVIGATION) ===================== */}
        {mode === "add" ? (
          <div className="space-y-4">
            {/* Wizard Stepper Bar */}
            <div className="space-y-2">
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                {WIZARD_STEPS.map((step) => {
                  const StepIcon = step.icon;
                  const isActive = currentStep === step.id;
                  const isCompleted = currentStep > step.id;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => {
                        // Allow clicking to go back to visited steps
                        if (step.id < currentStep) {
                          setValidationError(null);
                          setCurrentStep(step.id);
                        }
                      }}
                      className={`flex min-w-0 flex-col items-center gap-1.5 rounded-lg border p-1.5 text-center transition-all sm:p-2 ${
                        isActive
                          ? "border-primary bg-primary/10 text-primary shadow-xs"
                          : isCompleted
                            ? "border-border bg-muted/60 text-foreground hover:bg-muted cursor-pointer"
                            : "border-border/40 bg-muted/20 text-muted-foreground/60 cursor-not-allowed"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : isCompleted
                                ? "bg-emerald-500 text-white"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {isCompleted ? <Check className="size-3" /> : step.id}
                        </div>
                        <StepIcon className="size-3.5 hidden sm:inline" />
                      </div>
                      <span className="w-full truncate text-[10px] font-medium sm:text-[11px]">
                        {step.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Progress bar */}
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${(currentStep / LAST_STEP) * 100}%` }}
                />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* STEP 1: VEHICLE INFORMATION */}
              {currentStep === 1 && (
                <div className="space-y-3">
                  <div className="border-b border-border/50 pb-1">
                    <h4 className="text-sm font-semibold text-foreground">Step 1: Car Details</h4>
                    <p className="text-xs text-muted-foreground">
                      What the car is — or search your collection above to fill this in.
                    </p>
                  </div>

                  {/* Above the fields rather than below: by the time three of
                      them agree with something on the ISO list, the useful
                      moment is before the rest is typed out by hand. */}
                  {!isoDismissed && (
                    <IsoSuggestions
                      matches={isoMatches}
                      onUse={setIsoStatusCar}
                      onBulk={onSwitchToBulk ? sendIsoToBulk : undefined}
                      onDismiss={() => setIsoDismissed(true)}
                    />
                  )}

                  {(form.make.trim() || form.model.trim()) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/40 px-3 py-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Catalog Car ID:
                        </span>
                        <span className="font-mono text-xs font-bold text-foreground truncate">
                          {derivedCatalogCarId}
                        </span>
                      </div>
                      {existingCatalogMatch ? (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          Reusing Catalog ID (No duplicate in DB)
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">8-Field Unique ID</span>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Make *">
                      <Combobox
                        clearable
                        value={form.make}
                        onChange={(v) => set("make", v)}
                        options={makeOptions}
                        placeholder="e.g. Porsche, Nissan, Ford"
                        searchPlaceholder="Search makes, or type a new one…"
                      />
                    </Field>

                    <Field label="Model *">
                      <Combobox
                        clearable
                        value={form.model}
                        onChange={(v) => set("model", v)}
                        options={modelOptions}
                        // The base name only. The trim goes in Variant next to
                        // it, so "Skyline" here and "GT-R R34" there.
                        placeholder="e.g. Skyline, Supra, 911"
                        searchPlaceholder="Search models, or type a new one…"
                      />
                    </Field>

                    <Field label="Variant">
                      <Combobox
                        clearable
                        value={form.variant}
                        onChange={(v) => set("variant", v)}
                        options={variantOptions}
                        placeholder="e.g. R34, KH, Custom"
                        searchPlaceholder="Search variants, or type a new one…"
                      />
                    </Field>

                    <Field label="Year">
                      <ClearableInput
                        value={form.year}
                        onChange={(e) => set("year", e.target.value)}
                        placeholder="e.g. 2024 or '71"
                        inputMode="numeric"
                      />
                    </Field>

                    <Field label="Status *">
                      <Select value={form.status} onValueChange={(v) => set("status", v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="Colour">
                      <Combobox
                        clearable
                        value={form.colour}
                        onChange={(v) => set("colour", v)}
                        options={colourOptions}
                        placeholder="e.g. Spectraflame Red, Blue, White"
                        searchPlaceholder="Search colours, or type a new one…"
                      />
                    </Field>

                    <Field label="Type *">
                      <Combobox
                        clearable
                        value={form.type}
                        onChange={(v) => set("type", v)}
                        options={typeOptions}
                        placeholder="e.g. Race Car, Classic Car, Supercar"
                        searchPlaceholder="Search types, or type a new one…"
                      />
                    </Field>

                    <Field label="Brand *">
                      <Combobox
                        clearable
                        value={form.brand}
                        onChange={(v) => set("brand", v)}
                        options={brandOptions}
                        placeholder="e.g. Hot Wheels, Mini GT, Matchbox"
                        searchPlaceholder="Search brands, or type a new one…"
                      />
                    </Field>

                    <Field label="Assortment *">
                      <Combobox
                        clearable
                        value={form.assortment}
                        onChange={(v) => set("assortment", v)}
                        options={assortmentOptions}
                        placeholder="e.g. Mainline, Premium, Boulevard"
                        searchPlaceholder="Search assortments, or type a new one…"
                      />
                    </Field>

                    <Field label="Series">
                      <Combobox
                        clearable
                        value={form.series}
                        onChange={(v) => set("series", v)}
                        options={seriesOptions}
                        placeholder="e.g. Circuit Legends, HW Exotics"
                        searchPlaceholder="Search series, or type a new one…"
                      />
                    </Field>

                    <Field label="Sub Series">
                      <Combobox
                        clearable
                        value={form.subSeries}
                        onChange={(v) => set("subSeries", v)}
                        options={subSeriesOptions}
                        placeholder="e.g. Factory Fresh, Then and Now"
                        searchPlaceholder="Search sub series, or type a new one…"
                      />
                    </Field>

                    <Field label="Car Number">
                      <ClearableInput
                        value={form.carNumber}
                        onChange={(e) => set("carNumber", e.target.value)}
                        placeholder="e.g. 3/5 or 142/250"
                      />
                    </Field>

                    <Field label="Size (default 1:64)">
                      <Combobox
                        clearable
                        value={form.size}
                        onChange={(v) => set("size", v)}
                        options={sizeOptions}
                        placeholder="1:64"
                        searchPlaceholder="Search scales, or type a new one…"
                      />
                    </Field>

                    <Field label="Rarity">
                      <Select value={form.rarity} onValueChange={(v) => set("rarity", v as Rarity)}>
                        <SelectTrigger className="bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RARITIES.map((r) => (
                            <SelectItem key={r} value={r}>
                              <span className="flex items-center gap-2">
                                {r === "Normal" ? (
                                  <span className="size-4" />
                                ) : (
                                  <ChaseMark rarity={r} className="size-4" />
                                )}
                                {RARITY_LABEL[r]}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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

                    <Field label="Notes" className="sm:col-span-2 lg:col-span-3">
                      <ClearableInput
                        value={form.transitInfo}
                        onChange={(e) => set("transitInfo", e.target.value)}
                        placeholder="e.g. release month, anything worth remembering"
                      />
                    </Field>
                  </div>
                </div>
              )}

              {/* STEP 2: COST */}
              {currentStep === 2 && (
                <div className="space-y-3">
                  <div className="border-b border-border/50 pb-1">
                    <h4 className="text-sm font-semibold text-foreground">Step 2: Cost</h4>
                    <p className="text-xs text-muted-foreground">
                      Enter cost details. Balance is automated based on amount paid.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Spent * (INR)" info={SPENT_INFO}>
                      <ClearableInput
                        type="number"
                        min="0"
                        step="any"
                        value={form.spent}
                        onChange={(e) =>
                          handleSpentChange(e.target.value === "" ? "" : Number(e.target.value))
                        }
                        placeholder="e.g. 549"
                        required
                        autoFocus
                      />
                    </Field>

                    <Field label="MRP * (INR)">
                      <ClearableInput
                        type="number"
                        min="0"
                        step="any"
                        value={form.mrp}
                        onChange={(e) =>
                          set("mrp", e.target.value === "" ? "" : Number(e.target.value))
                        }
                        placeholder="e.g. 549"
                        required
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

                    <Field label="Payment *">
                      <Select value={form.payment} onValueChange={handlePaymentChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select payment status" />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_OPTIONS.map((p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="Seller *">
                      <Combobox
                        clearable
                        value={form.seller}
                        onChange={(v) => set("seller", v)}
                        // "No seller" always first: a gift or a swap is a real
                        // answer, and the field is required.
                        options={[NO_SELLER, ...sellerOptions]}
                        placeholder="Who sold it?"
                        searchPlaceholder="Search sellers, or type a new one…"
                        ariaLabel="Seller"
                      />
                    </Field>

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

                    <Field label="Balance (INR) [Automated]">
                      <div className="relative">
                        <ClearableInput
                          type="number"
                          readOnly
                          value={form.balance}
                          className="bg-muted/60 font-semibold text-foreground cursor-not-allowed"
                        />
                        <span className="absolute right-2.5 top-2.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          Automated
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Spent (₹{Number(form.spent) || 0}) − Paid (₹{Number(form.paid) || 0}) = ₹
                        {Number(form.balance) || 0}
                      </p>
                    </Field>
                  </div>
                </div>
              )}

              {/* STEP 3: TRANSIT */}
              {currentStep === 3 && (
                <div className="space-y-3">
                  <div className="border-b border-border/50 pb-1">
                    <h4 className="text-sm font-semibold text-foreground">Step 3: Transit</h4>
                    <p className="text-xs text-muted-foreground">
                      Keep track of order milestones, shipping transit info, and item condition.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Order Date *">
                      <ClearableInput
                        type="date"
                        value={form.orderDate}
                        onChange={(e) => set("orderDate", e.target.value)}
                        required
                        autoFocus
                      />
                    </Field>

                    <Field label="Expected / available Date">
                      <ClearableInput
                        type="date"
                        value={form.expectedDate}
                        onChange={(e) => {
                          const val = e.target.value;
                          set("expectedDate", val);
                          if (form.status === "Delayed" && val) {
                            set("status", "Waiting");
                          }
                        }}
                      />
                    </Field>

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

                    <ConditionFields
                      form={form}
                      set={set}
                      carConditionOptions={carConditionOptions}
                      cardConditionOptions={cardConditionOptions}
                    />

                    <TrackingLink
                      partner={form.deliveryPartner}
                      trackingId={form.trackingId}
                      className="sm:col-span-2 lg:col-span-3"
                    />
                  </div>
                </div>
              )}

              {/* STEP 4: IMAGE */}
              {currentStep === 4 && (
                <div className="space-y-4">
                  <div className="border-b border-border/50 pb-1">
                    <h4 className="text-sm font-semibold text-foreground">Step 4: Image</h4>
                    <p className="text-xs text-muted-foreground">A photo of the car.</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Photo</Label>
                    {/* layout="split": on a desktop the frame is smaller and the
                        found photos fill the space to its right, rather than a
                        strip underneath that scrolls sideways. */}
                    <CarPhotoField
                      value={form.imageUrl}
                      onChange={setImage}
                      suggestions={imageSearch}
                      layout="split"
                    />
                  </div>
                </div>
              )}

              {/* STEP 5: SUMMARY */}
              {currentStep === 5 && (
                <div className="space-y-3">
                  <div className="border-b border-border/50 pb-1">
                    <h4 className="text-sm font-semibold text-foreground">Step 5: Summary</h4>
                    <p className="text-xs text-muted-foreground">
                      Everything you entered. Tap a step above to change anything.
                    </p>
                  </div>
                  <WizardSummary form={form} name={previewName} onJump={setCurrentStep} />
                </div>
              )}

              {/* Wizard Footer Controls */}
              <DialogFooter className="pt-3 flex items-center justify-between sm:justify-between border-t border-border/50">
                <div>
                  {/* Cancel is the one gesture that means "throw this away", so
                      it is also the one that drops the draft. Closing by
                      Escape, the X, or a phone deciding to reload the tab all
                      leave it in place. */}
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
                      its `type` attribute. Clicking Next on step 3 then ran
                      handleNext, React flushed the state update before the
                      browser got round to the click's default action, and the
                      browser read type="submit" off the element it had just
                      changed — saving the car and closing the dialog on the way
                      to a step nobody ever saw. Distinct keys mean distinct
                      nodes, so the button that was clicked is still the button
                      whose default action runs. */}
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
          /* ===================== MODE: EDIT (FROZEN SAVED FIELDS, ENABLED NECESSARY FIELDS) ===================== */
          <form
            onSubmit={handleSubmit}
            className="space-y-4 w-full min-w-0 max-w-full overflow-x-hidden"
          >
            {/* Three columns on a desktop: what you came here to change takes
                two of them, the saved record sits in the third.

                The amber "Editing Mode: saved specifications are frozen" banner
                that used to head this form is gone. It explained the read-only
                fields from the opposite end of a dialog you had to scroll to
                reach them in — and now that they sit in their own labelled rail,
                being locked is something you can see rather than be warned
                about. */}
            <div className="grid gap-4 lg:grid-cols-3 w-full min-w-0 max-w-full">
              <div className="space-y-3 lg:col-span-2 w-full min-w-0 max-w-full">
                {/* SECTION 1: ACTIVE / EDITABLE LOGISTICS & STATUS */}
                <section className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                    Status & Logistics
                  </h3>
                  <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                    <Field label="Status *">
                      <Select value={form.status} onValueChange={(v) => set("status", v)}>
                        <SelectTrigger className="bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="Expected / available Date">
                      <ClearableInput
                        type="date"
                        className="bg-background"
                        value={form.expectedDate}
                        onChange={(e) => {
                          const val = e.target.value;
                          set("expectedDate", val);
                          if ((form.status === "Delayed" || initial?.status === "Delayed") && val) {
                            set("status", "Waiting");
                          }
                        }}
                      />
                    </Field>

                    <Field label="Delivery Partner">
                      <Combobox
                        clearable
                        value={form.deliveryPartner}
                        onChange={(v) => set("deliveryPartner", v)}
                        options={DELIVERY_PARTNER_NAMES}
                        placeholder="Courier"
                        searchPlaceholder="Search or type a courier…"
                        ariaLabel="Delivery partner"
                        className="bg-background"
                      />
                    </Field>

                    <Field label="Tracking ID">
                      <ClearableInput
                        className="bg-background font-mono"
                        value={form.trackingId}
                        onChange={(e) => set("trackingId", e.target.value)}
                        placeholder="Consignment / AWB number"
                      />
                    </Field>

                    <ConditionFields
                      form={form}
                      set={set}
                      carConditionOptions={carConditionOptions}
                      cardConditionOptions={cardConditionOptions}
                    />

                    <Field label="Notes" className="sm:col-span-2">
                      <ClearableInput
                        className="bg-background"
                        value={form.transitInfo}
                        onChange={(e) => set("transitInfo", e.target.value)}
                        placeholder="Release month, courier updates, dispatch notes..."
                      />
                    </Field>

                    <TrackingLink
                      partner={form.deliveryPartner}
                      trackingId={form.trackingId}
                      className="sm:col-span-2"
                    />
                  </div>
                </section>

                {/* SECTION 2: ACTIVE / EDITABLE FINANCIALS & PAYMENT PROGRESS */}
                <section className="space-y-2 rounded-lg border border-border/80 bg-muted/30 p-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Payment & Expenditure
                  </h3>
                  <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3">
                    <Field label="Spent (INR)" info={SPENT_INFO}>
                      <ClearableInput
                        type="number"
                        min="0"
                        step="any"
                        className="bg-background"
                        value={form.spent}
                        onChange={(e) =>
                          handleSpentChange(e.target.value === "" ? "" : Number(e.target.value))
                        }
                        placeholder="e.g. 549"
                      />
                    </Field>

                    <Field label="Shipping Cost (INR)">
                      <ClearableInput
                        type="number"
                        min="0"
                        step="any"
                        className="bg-background"
                        value={form.shippingCost}
                        onChange={(e) =>
                          set("shippingCost", e.target.value === "" ? "" : Number(e.target.value))
                        }
                        placeholder="e.g. 50"
                      />
                    </Field>

                    <Field label="Payment Status *">
                      <Select value={form.payment} onValueChange={handlePaymentChange}>
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Select payment status" />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_OPTIONS.map((p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="Paid Amount (INR)" info={PAID_INFO}>
                      <ClearableInput
                        type="number"
                        min="0"
                        step="any"
                        className="bg-background"
                        value={form.paid}
                        onChange={(e) =>
                          handlePaidChange(e.target.value === "" ? "" : Number(e.target.value))
                        }
                        placeholder="0"
                      />
                    </Field>

                    {/* The sentence spelling out "Spent − Paid = Balance" that
                        used to sit under this is what the chip in the field
                        already says, in a row of its own. */}
                    <Field label="Balance (INR)" className="sm:col-span-2">
                      <div className="relative">
                        <ClearableInput
                          type="number"
                          readOnly
                          value={form.balance}
                          className="cursor-not-allowed bg-muted/70 font-semibold text-foreground"
                        />
                        <span className="absolute right-2.5 top-2.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          Automated: Spent − Paid
                        </span>
                      </div>
                    </Field>
                  </div>
                </section>

                {/* SECTION 3: IMAGE */}
                <section className="space-y-3 rounded-lg border border-border/80 bg-muted/30 p-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Image
                  </h3>

                  <CarPhotoField
                    value={form.imageUrl}
                    onChange={setImage}
                    suggestions={imageSearch}
                  />
                </section>
              </div>

              {/* SECTION 4: WHAT THE CAR IS
                  A rail rather than a fourth band across the bottom — these are
                  the values you check against while editing, so they belong
                  beside the fields rather than below them.

                  They used to be locked, on the theory that catalogue history
                  should not move. In practice a mis-typed make or a missing
                  series could only be corrected by deleting the car and adding
                  it again, which loses far more history than the typo ever
                  did. They are ordinary fields now; the name is rebuilt from
                  them on save, and changing the seller or the order date
                  renumbers the shipping ID the same as it would anywhere else. */}
              <aside className="space-y-2 self-start rounded-lg border border-border/60 bg-muted/20 p-3 w-full min-w-0 max-w-full overflow-hidden">
                <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-1.5">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Car className="size-3.5" />
                    <span>Vehicle &amp; purchase</span>
                  </h3>
                  {/* The same scanner as the wizard. A car catalogued in a hurry
                      and corrected later is the common case for these fields,
                      and re-photographing the card beats retyping it. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 gap-1.5 px-2 text-[11px]"
                    onClick={() => setScanOpen(true)}
                  >
                    <ScanLine className="size-3.5" />
                    Scan
                  </Button>
                </div>
                {/* Label beside the field rather than above it: fifteen stacked
                    label-and-input pairs is twice the height of the column next
                    to it, and this is a rail. */}
                <div className="grid grid-cols-1 gap-1.5 pt-1 sm:grid-cols-2 lg:grid-cols-1 w-full min-w-0 max-w-full">
                  <RailField label="Make">
                    <Combobox
                      clearable
                      value={form.make}
                      onChange={(v) => set("make", v)}
                      options={makeOptions}
                      placeholder="Make"
                      searchPlaceholder="Search makes…"
                      ariaLabel="Make"
                      className="h-8 bg-background"
                    />
                  </RailField>
                  <RailField label="Model">
                    <Combobox
                      clearable
                      value={form.model}
                      onChange={(v) => set("model", v)}
                      options={modelOptions}
                      placeholder="Model"
                      searchPlaceholder="Search models…"
                      ariaLabel="Model"
                      className="h-8 bg-background"
                    />
                  </RailField>
                  <RailField label="Variant">
                    <Combobox
                      clearable
                      value={form.variant}
                      onChange={(v) => set("variant", v)}
                      options={variantOptions}
                      placeholder="Variant"
                      searchPlaceholder="Search variants…"
                      ariaLabel="Variant"
                      className="h-8 bg-background"
                    />
                  </RailField>
                  <RailField label="Year">
                    <ClearableInput
                      className="h-8 bg-background"
                      value={form.year}
                      onChange={(e) => set("year", e.target.value)}
                      inputMode="numeric"
                      aria-label="Year"
                    />
                  </RailField>
                  <RailField label="Colour">
                    <Combobox
                      clearable
                      value={form.colour}
                      onChange={(v) => set("colour", v)}
                      options={colourOptions}
                      placeholder="Colour"
                      searchPlaceholder="Search colours…"
                      ariaLabel="Colour"
                      className="h-8 bg-background"
                    />
                  </RailField>
                  <RailField label="Type">
                    <Combobox
                      clearable
                      value={form.type}
                      onChange={(v) => set("type", v)}
                      options={typeOptions}
                      placeholder="Type"
                      searchPlaceholder="Search types…"
                      ariaLabel="Vehicle type"
                      className="h-8 bg-background"
                    />
                  </RailField>
                  <RailField label="Brand">
                    <Combobox
                      clearable
                      value={form.brand}
                      onChange={(v) => set("brand", v)}
                      options={brandOptions}
                      placeholder="Brand"
                      searchPlaceholder="Search brands…"
                      ariaLabel="Brand"
                      className="h-8 bg-background"
                    />
                  </RailField>
                  <RailField label="Assortment">
                    <Combobox
                      clearable
                      value={form.assortment}
                      onChange={(v) => set("assortment", v)}
                      options={assortmentOptions}
                      placeholder="Assortment"
                      searchPlaceholder="Search assortments…"
                      ariaLabel="Assortment"
                      className="h-8 bg-background"
                    />
                  </RailField>
                  <RailField label="Series">
                    <Combobox
                      clearable
                      value={form.series}
                      onChange={(v) => set("series", v)}
                      options={seriesOptions}
                      placeholder="Series"
                      searchPlaceholder="Search series…"
                      ariaLabel="Series"
                      className="h-8 bg-background"
                    />
                  </RailField>
                  <RailField label="Sub series">
                    <Combobox
                      clearable
                      value={form.subSeries}
                      onChange={(v) => set("subSeries", v)}
                      options={subSeriesOptions}
                      placeholder="Sub series"
                      searchPlaceholder="Search sub series…"
                      ariaLabel="Sub series"
                      className="h-8 bg-background"
                    />
                  </RailField>
                  <RailField label="Car number">
                    <ClearableInput
                      className="h-8 bg-background"
                      value={form.carNumber}
                      onChange={(e) => set("carNumber", e.target.value)}
                      placeholder="126/250"
                      aria-label="Car number"
                    />
                  </RailField>
                  <RailField label="Scale">
                    <Combobox
                      clearable
                      value={form.size}
                      onChange={(v) => set("size", v)}
                      options={sizeOptions}
                      placeholder="1:64"
                      searchPlaceholder="Search scales…"
                      ariaLabel="Scale"
                      className="h-8 bg-background"
                    />
                  </RailField>
                  <RailField label="Order date">
                    <ClearableInput
                      type="date"
                      className="h-8 bg-background"
                      value={form.orderDate}
                      onChange={(e) => set("orderDate", e.target.value)}
                      aria-label="Order date"
                    />
                  </RailField>
                  <RailField label="MRP">
                    <ClearableInput
                      type="number"
                      min="0"
                      step="any"
                      className="h-8 bg-background"
                      value={form.mrp}
                      onChange={(e) =>
                        set("mrp", e.target.value === "" ? "" : Number(e.target.value))
                      }
                      aria-label="Retail price"
                    />
                  </RailField>
                  <RailField label="Seller">
                    <Combobox
                      clearable
                      value={form.seller}
                      onChange={(v) => set("seller", v)}
                      options={sellerOptions}
                      placeholder="Seller"
                      searchPlaceholder="Search sellers…"
                      ariaLabel="Seller"
                      className="h-8 bg-background"
                    />
                  </RailField>
                  <RailField label="Rarity">
                    <Select value={form.rarity} onValueChange={(v) => set("rarity", v as Rarity)}>
                      <SelectTrigger className="h-8 bg-background text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RARITIES.map((r) => (
                          <SelectItem key={r} value={r}>
                            <span className="flex items-center gap-2 text-xs">
                              {r === "Normal" ? (
                                <span className="size-3.5" />
                              ) : (
                                <ChaseMark rarity={r} className="size-3.5" />
                              )}
                              {RARITY_LABEL[r]}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </RailField>
                  <div className="flex h-8 items-center justify-between rounded border border-border/60 bg-background px-2.5">
                    <Label
                      htmlFor="edit-rail-favourite"
                      className="cursor-pointer text-xs font-medium text-foreground"
                    >
                      Favourite
                    </Label>
                    <Switch
                      id="edit-rail-favourite"
                      checked={form.favourite}
                      onCheckedChange={(v) => set("favourite", v)}
                    />
                  </div>
                </div>
              </aside>
            </div>

            {/* Delete lives here now, at the far end of the footer from Save.
                It was a full-width button on the car's detail view, one tap from
                simply reading about a car; behind Edit it takes a deliberate
                trip, and it is still the only red thing on screen. */}
            <DialogFooter className="flex flex-row items-center justify-between gap-2 border-t border-border/60 pt-3 sm:justify-between w-full min-w-0">
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
                <Button type="submit">Save changes</Button>
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
function withDefaults(defaults: string[], collected: (string | undefined)[]): string[] {
  const seen = new Set(defaults.map((d) => d.toLowerCase()));
  const extra: string[] = [];
  for (const raw of collected) {
    const v = (raw || "").trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    extra.push(v);
  }
  return [...defaults, ...extra.sort((a, b) => a.localeCompare(b))];
}

const CAR_CONDITION_NOTES = describe(CAR_CONDITIONS);
const CARD_CONDITION_NOTES = describe(CARD_CONDITIONS);

/**
 * Condition of the car and card packaging.
 */
function ConditionFields({
  form,
  set,
  carConditionOptions,
  cardConditionOptions,
}: {
  form: CarFormData;
  set: <K extends keyof CarFormData>(k: K, v: CarFormData[K]) => void;
  carConditionOptions: string[];
  cardConditionOptions: string[];
}) {
  return (
    <>
      <Field label="Car condition">
        <Combobox
          clearable
          value={form.carCondition}
          onChange={(v) => set("carCondition", v)}
          options={carConditionOptions}
          descriptions={CAR_CONDITION_NOTES}
          placeholder="e.g. Mint"
          searchPlaceholder="Search grades, or type one…"
          ariaLabel="Car condition"
          className="bg-background"
        />
      </Field>

      <Field label="Card condition">
        <Combobox
          clearable
          value={form.cardCondition}
          onChange={(v) => set("cardCondition", v)}
          options={cardConditionOptions}
          descriptions={CARD_CONDITION_NOTES}
          placeholder="e.g. Mint Card"
          searchPlaceholder="Search grades, or type one…"
          ariaLabel="Card condition"
          className="bg-background"
        />
      </Field>
    </>
  );
}

/** Every field the wizard collected, grouped by the step that asked for it. */
function WizardSummary({
  form,
  name,
  onJump,
}: {
  form: CarFormData;
  name: string;
  onJump: (step: number) => void;
}) {
  const money = (v: number | "") => (v === "" ? "" : `₹${Number(v).toLocaleString("en-IN")}`);
  const groups: { step: number; title: string; rows: [string, string][] }[] = [
    {
      step: 1,
      title: "Car Details",
      rows: [
        ["Make", form.make],
        ["Model", form.model],
        ["Variant", form.variant],
        ["Year", form.year],
        ["Status", form.status],
        ["Colour", form.colour],
        ["Type", form.type],
        ["Brand", form.brand],
        ["Assortment", form.assortment],
        ["Series", form.series],
        ["Sub series", form.subSeries],
        ["Car number", form.carNumber],
        ["Size", form.size],
        ["Rarity", form.rarity],
        ["Favourite", form.favourite ? "Yes" : ""],
        ["Notes", form.transitInfo],
      ],
    },
    {
      step: 2,
      title: "Cost",
      rows: [
        ["Spent", money(form.spent)],
        ["MRP", money(form.mrp)],
        ["Shipping cost", money(form.shippingCost)],
        ["Payment", form.payment],
        ["Seller", form.seller],
        ["Paid", money(form.paid)],
        ["Balance", money(form.balance)],
      ],
    },
    {
      step: 3,
      title: "Transit",
      rows: [
        ["Order date", formatDayMonthYear(form.orderDate) || form.orderDate],
        ["Expected date", formatDayMonthYear(form.expectedDate) || form.expectedDate],
        ["Delivery partner", form.deliveryPartner],
        ["Tracking ID", form.trackingId],
        ["Car condition", form.carCondition],
        ["Card condition", form.cardCondition],
      ],
    },
    {
      step: 4,
      title: "Image",
      rows: [["Image", form.imageUrl ? "Provided" : "None"]],
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/30 p-3">
        {form.imageUrl ? (
          <img
            src={form.imageUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="size-16 shrink-0 rounded-md bg-muted object-contain"
          />
        ) : (
          <div className="grid size-16 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <Car className="size-6" />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-base font-semibold">{name}</span>
            <ChaseMark rarity={form.rarity} className="size-4" />
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {[form.brand, form.assortment, form.carNumber].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {groups.map((g) => (
          <section key={g.step} className="rounded-lg border border-border/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {g.title}
              </h5>
              <button
                type="button"
                onClick={() => onJump(g.step)}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Edit
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {g.rows
                .filter(([, v]) => v !== "" && v !== undefined)
                .map(([label, v]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-[10px] text-muted-foreground">{label}</dt>
                    <dd className="truncate font-medium" title={v}>
                      {v}
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
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
}: {
  cars: Diecast[];
  onPick: (car: CatalogueCar) => void;
  /** False for guests: the demo searches its own sample cars only. */
  searchAll: boolean;
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
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
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
        placeholder="Search all cars to fill…"
        aria-label="Search cars to fill in the form"
        className="h-8 pl-8 text-sm"
      />
      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-popover p-1 text-left shadow-lg sm:w-96">
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
 * An <Input> with an × at its end once it holds something.
 *
 * Clearing goes through the element's own value setter and a real input event,
 * so each field's existing onChange runs exactly as if the text had been
 * deleted by hand — Spent still recalculates the balance, a number still
 * becomes "". Read-only fields (the automated balance) get no ×.
 */
function ClearableInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  const ref = useRef<HTMLInputElement>(null);
  const hasValue = props.value !== undefined && props.value !== null && props.value !== "";
  const showClear = hasValue && !props.readOnly && !props.disabled;

  const clear = () => {
    const el = ref.current;
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
  };

  return (
    <div className="relative w-full min-w-0">
      <Input
        {...props}
        ref={ref}
        className={cn("min-w-0 w-full", showClear && "pr-8", className)}
      />
      {showClear && (
        <button
          type="button"
          onClick={clear}
          aria-label={`Clear ${props["aria-label"] || props.placeholder || "field"}`}
          className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
  info,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  /** A sentence explaining the field, behind an ⓘ beside its label. */
  info?: string;
}) {
  return (
    <div className={cn("space-y-1.5 w-full min-w-0", className)}>
      <div className="flex items-center gap-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {info && <InfoTip label={label} text={info} />}
      </div>
      {children}
    </div>
  );
}

/**
 * A popover rather than a tooltip: a tooltip needs a hover, and on a phone
 * there is none — the ⓘ would be decoration.
 */
function InfoTip({ label, text }: { label: string; text: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`About ${label}`}
          className="grid size-4 place-items-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-60 p-2.5 text-xs leading-relaxed">
        {text}
      </PopoverContent>
    </Popover>
  );
}

/**
 * One field in the right-hand rail: label on the left, control on the right.
 *
 * Stacked label-above-input would make this column twice the height of the one
 * beside it for the same fifteen values, and a rail that is twice as tall as the
 * form is not a rail.
 */
function RailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 w-full min-w-0 max-w-full">
      <span className="w-20 shrink-0 text-[11px] text-muted-foreground truncate">{label}</span>
      <span className="min-w-0 flex-1 overflow-hidden">{children}</span>
    </label>
  );
}

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
