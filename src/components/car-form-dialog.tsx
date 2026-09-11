import { useEffect, useState, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
} from "lucide-react";

const STATUS_OPTIONS = ["Available", "Pre Order", "Transit", "Waiting", "ISO", "On Hold"];
const PAYMENT_OPTIONS = ["Paid", "Partial", "Pending"];

/** Statuses that mean the car is in hand, and so has a real arrival date. */
const ARRIVED_STATUSES = new Set(["available", "wrong item"]);

/**
 * Statuses that mean it is definitely still coming. Any received date one of
 * these is carrying describes a delivery that has not happened, so it is
 * dropped rather than kept — the estimate lives in the expected date now.
 */
const NOT_RECEIVED_STATUSES = new Set(["waiting", "pre order", "preorder", "delayed"]);

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
  chase: boolean;
  favourite: boolean;
  open: boolean;
  imageUrl: string;
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
    brand: "",
    assortment: "",
    size: "1:64",
    spent: "",
    mrp: "",
    shippingCost: "",
    payment: "Paid",
    seller: "",
    status: "Available",
    paid: "",
    balance: 0,
    transitInfo: "",
    deliveryPartner: "",
    trackingId: "",
    orderDate: today,
    expectedDate: "",
    official: false,
    chase: false,
    favourite: false,
    open: false,
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
    chase: Boolean(initial.chase),
    favourite: Boolean(initial.favourite),
    open: Boolean(initial.open),
    imageUrl: initial.imageUrl || "",
  };
}

/** Both sides always carry the same keys, so one pass over them is enough. */
function sameForm(a: CarFormData, b: CarFormData): boolean {
  return (Object.keys(a) as (keyof CarFormData)[]).every((k) => a[k] === b[k]);
}

type CarDraft = { form: CarFormData; step: number };

const WIZARD_STEPS = [
  { id: 1, label: "Vehicle", title: "Vehicle Information", icon: Car },
  { id: 2, label: "Financials", title: "Financials & Status", icon: IndianRupee },
  { id: 3, label: "Logistics", title: "Dates & Logistics", icon: Calendar },
  { id: 4, label: "Flags & Image", title: "Flags & Image", icon: Sparkles },
];

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
      setCurrentStep(mode === "add" ? Math.min(4, Math.max(1, draft.step || 1)) : 1);
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
  const sellerOptions = useMemo(() => optionsFor("seller", cars), [cars]);

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
      if (!form.colour.trim()) return "Colour is required.";
      if (!form.type.trim()) return "Type is required.";
      if (!form.brand.trim()) return "Brand is required.";
      if (!form.assortment.trim()) return "Assortment is required.";
    } else if (step === 2) {
      if (form.spent === "" || form.spent === null) return "Spent amount is required.";
      if (form.mrp === "" || form.mrp === null) return "MRP amount is required.";
      if (!form.payment.trim()) return "Payment status is required.";
      if (!form.seller.trim()) return "Seller is required.";
      if (!form.status.trim()) return "Status is required.";
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
    setCurrentStep((s) => Math.min(4, s + 1));
  };

  const handleBack = () => {
    setValidationError(null);
    setCurrentStep((s) => Math.max(1, s - 1));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Nothing submits a half-walked wizard. The footer's last button is the only
    // way to catalogue a car, and it only exists on step 4 — so a submit arriving
    // from anywhere else (a stray Enter, a browser autofill) is not an intent to
    // save, it is an accident to swallow.
    if (mode === "add" && currentStep < 4) return;
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
    const seller = form.seller.trim();
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
      initial?.id || `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

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
      orderDate,
      orderMonth,
      expectedDate: form.expectedDate.trim(),
      date,
      month,
      official: form.official,
      chase: form.chase,
      favourite: form.favourite,
      open: form.open,
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
        className={`max-h-[90vh] overflow-y-auto sm:max-w-3xl ${
          mode === "add" ? "lg:max-w-5xl" : "lg:max-w-6xl"
        }`}
      >
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <DialogTitle>{mode === "add" ? "Add a car" : "Edit car"}</DialogTitle>
            {mode === "add" && (
              <div className="flex flex-wrap items-center gap-2">
                {/* Export and the CSV template, from the sidebar's Data section.
                    Every other way cars come in or go out is already on this
                    row. */}
                <DataActions />
                {onSwitchToBulk && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    // Wrapped, not passed directly: onSwitchToBulk now takes
                    // seed cars, and a bare handler would hand it the click
                    // event as the batch to prefill.
                    onClick={() => onSwitchToBulk()}
                  >
                    <Layers className="size-4" />
                    Add in bulk
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
                    Upload CSV
                  </Button>
                )}
              </div>
            )}
          </div>
          <DialogDescription>
            {mode === "add"
              ? "Follow the wizard steps below to catalog a new diecast into your collection. Adding several at once? Use bulk or a CSV upload."
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
              <span className="font-medium text-muted-foreground">Vehicle: </span>
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
              <div className="grid grid-cols-4 gap-2">
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
                      className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition-all ${
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
                      <span className="text-[11px] font-medium truncate w-full">{step.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Progress bar */}
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${(currentStep / 4) * 100}%` }}
                />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* STEP 1: VEHICLE INFORMATION */}
              {currentStep === 1 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border/50 pb-1">
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-foreground">
                        Step 1: Vehicle Information
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Specify the make, model, colour, and manufacturing classification.
                      </p>
                    </div>
                    {/* Twelve fields of small print, most of it printed on the
                        card in your other hand. Photograph it instead. It sits
                        on this step because this step is the part that is
                        printed — what it cost and who sold it are not on any
                        card. */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5"
                      onClick={() => setScanOpen(true)}
                    >
                      <ScanLine className="size-4" />
                      Scan the card
                    </Button>
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

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Make *">
                      <Combobox
                        value={form.make}
                        onChange={(v) => set("make", v)}
                        options={makeOptions}
                        placeholder="e.g. Porsche, Nissan, Ford"
                        searchPlaceholder="Search makes, or type a new one⬦"
                      />
                    </Field>

                    <Field label="Model *">
                      <Combobox
                        value={form.model}
                        onChange={(v) => set("model", v)}
                        options={modelOptions}
                        // The base name only. The trim goes in Variant next to
                        // it, so "Skyline" here and "GT-R R34" there.
                        placeholder="e.g. Skyline, Supra, 911"
                        searchPlaceholder="Search models, or type a new one⬦"
                      />
                    </Field>

                    <Field label="Variant">
                      <Combobox
                        value={form.variant}
                        onChange={(v) => set("variant", v)}
                        options={variantOptions}
                        placeholder="e.g. R34, KH, Custom"
                        searchPlaceholder="Search variants, or type a new one⬦"
                      />
                    </Field>

                    <Field label="Year">
                      <Input
                        value={form.year}
                        onChange={(e) => set("year", e.target.value)}
                        placeholder="e.g. 2024 or '71"
                        inputMode="numeric"
                      />
                    </Field>

                    <Field label="Colour *">
                      <Combobox
                        value={form.colour}
                        onChange={(v) => set("colour", v)}
                        options={colourOptions}
                        placeholder="e.g. Spectraflame Red, Blue, White"
                        searchPlaceholder="Search colours, or type a new one⬦"
                      />
                    </Field>

                    <Field label="Type *">
                      <Combobox
                        value={form.type}
                        onChange={(v) => set("type", v)}
                        options={typeOptions}
                        placeholder="e.g. Race Car, Classic Car, Supercar"
                        searchPlaceholder="Search types, or type a new one⬦"
                      />
                    </Field>

                    <Field label="Brand *">
                      <Combobox
                        value={form.brand}
                        onChange={(v) => set("brand", v)}
                        options={brandOptions}
                        placeholder="e.g. Hot Wheels, Mini GT, Matchbox"
                        searchPlaceholder="Search brands, or type a new one⬦"
                      />
                    </Field>

                    <Field label="Assortment *">
                      <Combobox
                        value={form.assortment}
                        onChange={(v) => set("assortment", v)}
                        options={assortmentOptions}
                        placeholder="e.g. Mainline, Premium, Boulevard"
                        searchPlaceholder="Search assortments, or type a new one⬦"
                      />
                    </Field>

                    <Field label="Series">
                      <Combobox
                        value={form.series}
                        onChange={(v) => set("series", v)}
                        options={seriesOptions}
                        placeholder="e.g. Circuit Legends, HW Exotics"
                        searchPlaceholder="Search series, or type a new one⬦"
                      />
                    </Field>

                    <Field label="Sub Series">
                      <Combobox
                        value={form.subSeries}
                        onChange={(v) => set("subSeries", v)}
                        options={subSeriesOptions}
                        placeholder="e.g. Factory Fresh, Then and Now"
                        searchPlaceholder="Search sub series, or type a new one⬦"
                      />
                    </Field>

                    <Field label="Car Number">
                      <Input
                        value={form.carNumber}
                        onChange={(e) => set("carNumber", e.target.value)}
                        placeholder="e.g. 3/5 or 142/250"
                      />
                    </Field>

                    <Field label="Size (default 1:64)">
                      <Combobox
                        value={form.size}
                        onChange={(v) => set("size", v)}
                        options={sizeOptions}
                        placeholder="1:64"
                        searchPlaceholder="Search scales, or type a new one⬦"
                      />
                    </Field>
                  </div>
                </div>
              )}

              {/* STEP 2: FINANCIALS & STATUS */}
              {currentStep === 2 && (
                <div className="space-y-3">
                  <div className="border-b border-border/50 pb-1">
                    <h4 className="text-sm font-semibold text-foreground">
                      Step 2: Financials & Status
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Enter cost details. Balance is automated based on amount paid.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Spent * (INR)">
                      <Input
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
                      <Input
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
                      <Input
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
                      <Input
                        value={form.seller}
                        onChange={(e) => set("seller", e.target.value)}
                        placeholder="e.g. Amazon, Hamleys, Local Store"
                        required
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

                    <Field label="Paid (INR)">
                      <Input
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
                        <Input
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

              {/* STEP 3: DATES & LOGISTICS */}
              {currentStep === 3 && (
                <div className="space-y-3">
                  <div className="border-b border-border/50 pb-1">
                    <h4 className="text-sm font-semibold text-foreground">
                      Step 3: Dates & Logistics
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Keep track of order milestones and shipping transit info.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Order Date *">
                      <Input
                        type="date"
                        value={form.orderDate}
                        onChange={(e) => set("orderDate", e.target.value)}
                        required
                        autoFocus
                      />
                    </Field>

                    <Field label="Expected / available Date">
                      <Input
                        type="date"
                        value={form.expectedDate}
                        onChange={(e) => set("expectedDate", e.target.value)}
                      />
                    </Field>

                    <Field label="Delivery Partner">
                      <Combobox
                        value={form.deliveryPartner}
                        onChange={(v) => set("deliveryPartner", v)}
                        options={DELIVERY_PARTNER_NAMES}
                        placeholder="Courier"
                        searchPlaceholder="Search or type a courier⬦"
                        ariaLabel="Delivery partner"
                      />
                    </Field>

                    <Field label="Tracking ID">
                      <Input
                        className="font-mono"
                        value={form.trackingId}
                        onChange={(e) => set("trackingId", e.target.value)}
                        placeholder="Consignment / AWB number"
                      />
                    </Field>

                    <Field label="Transit Info / ETA" className="sm:col-span-2 lg:col-span-3">
                      <Input
                        value={form.transitInfo}
                        onChange={(e) => set("transitInfo", e.target.value)}
                        placeholder="e.g. release month, dispatch notes"
                      />
                    </Field>

                    <TrackingLink
                      partner={form.deliveryPartner}
                      trackingId={form.trackingId}
                      className="sm:col-span-2 lg:col-span-3"
                    />
                  </div>
                </div>
              )}

              {/* STEP 4: FLAGS & MEDIA */}
              {currentStep === 4 && (
                <div className="space-y-4">
                  <div className="border-b border-border/50 pb-1">
                    <h4 className="text-sm font-semibold text-foreground">Step 4: Flags & Media</h4>
                    <p className="text-xs text-muted-foreground">
                      Add collection tags, set an image URL, and review before cataloging.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Collection Flags</Label>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-lg border border-border/60 bg-muted/20 p-3">
                      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                        <Checkbox
                          checked={form.official}
                          onCheckedChange={(v) => set("official", !!v)}
                        />
                        Official?
                      </label>
                      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                        <Checkbox checked={form.chase} onCheckedChange={(v) => set("chase", !!v)} />
                        Chase?
                      </label>
                      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                        <Checkbox
                          checked={form.favourite}
                          onCheckedChange={(v) => set("favourite", !!v)}
                        />
                        Favourite?
                      </label>
                      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                        <Checkbox checked={form.open} onCheckedChange={(v) => set("open", !!v)} />
                        Open?
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Photo</Label>
                    <div className="max-w-md">
                      <CarPhotoField
                        value={form.imageUrl}
                        onChange={(url) => set("imageUrl", url)}
                      />
                    </div>
                  </div>

                  {/* Summary preview box */}
                  <div className="rounded-lg border border-border/70 bg-muted/30 p-3 space-y-1.5 text-xs">
                    <div className="font-semibold text-foreground flex items-center justify-between">
                      <span>Ready to add to collection</span>
                      <span className="text-[11px] font-normal text-muted-foreground">
                        Status: <strong className="text-foreground">{form.status}</strong>
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {[form.brand, form.assortment, form.type].filter(Boolean).join(" · ")}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-muted-foreground">
                      <span>
                        Spent: <strong className="text-foreground">₹{form.spent || 0}</strong>
                      </span>
                      <span>
                        Paid: <strong className="text-foreground">₹{form.paid || 0}</strong>
                      </span>
                      <span>
                        Balance: <strong className="text-foreground">₹{form.balance || 0}</strong>
                      </span>
                      <span>
                        Seller: <strong className="text-foreground">{form.seller}</strong>
                      </span>
                    </div>
                  </div>
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
                  {currentStep < 4 ? (
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
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Three columns on a desktop: what you came here to change takes
                two of them, the saved record sits in the third.

                The amber "Editing Mode: saved specifications are frozen" banner
                that used to head this form is gone. It explained the read-only
                fields from the opposite end of a dialog you had to scroll to
                reach them in — and now that they sit in their own labelled rail,
                being locked is something you can see rather than be warned
                about. */}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-3 lg:col-span-2">
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
                      <Input
                        type="date"
                        className="bg-background"
                        value={form.expectedDate}
                        onChange={(e) => set("expectedDate", e.target.value)}
                      />
                    </Field>

                    <Field label="Delivery Partner">
                      <Combobox
                        value={form.deliveryPartner}
                        onChange={(v) => set("deliveryPartner", v)}
                        options={DELIVERY_PARTNER_NAMES}
                        placeholder="Courier"
                        searchPlaceholder="Search or type a courier⬦"
                        ariaLabel="Delivery partner"
                        className="bg-background"
                      />
                    </Field>

                    <Field label="Tracking ID">
                      <Input
                        className="bg-background font-mono"
                        value={form.trackingId}
                        onChange={(e) => set("trackingId", e.target.value)}
                        placeholder="Consignment / AWB number"
                      />
                    </Field>

                    <Field label="Transit Info / ETA" className="sm:col-span-2">
                      <Input
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
                    <Field label="Spent (INR)">
                      <Input
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
                      <Input
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

                    <Field label="Paid Amount (INR)">
                      <Input
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
                        <Input
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

                {/* SECTION 3: ACTIVE / EDITABLE FLAGS & IMAGE */}
                <section className="space-y-3 rounded-lg border border-border/80 bg-muted/30 p-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Flags & Image
                  </h3>
                  <div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-4">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <Checkbox
                        checked={form.official}
                        onCheckedChange={(v) => set("official", !!v)}
                      />
                      Official?
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <Checkbox checked={form.chase} onCheckedChange={(v) => set("chase", !!v)} />
                      Chase?
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <Checkbox
                        checked={form.favourite}
                        onCheckedChange={(v) => set("favourite", !!v)}
                      />
                      Favourite?
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <Checkbox checked={form.open} onCheckedChange={(v) => set("open", !!v)} />
                      Open?
                    </label>
                  </div>

                  <CarPhotoField value={form.imageUrl} onChange={(url) => set("imageUrl", url)} />
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
              <aside className="space-y-2 self-start rounded-lg border border-border/60 bg-muted/20 p-3">
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
                <div className="grid grid-cols-1 gap-1.5 pt-1 sm:grid-cols-2 lg:grid-cols-1">
                  <RailField label="Make">
                    <Combobox
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
                    <Input
                      className="h-8 bg-background"
                      value={form.year}
                      onChange={(e) => set("year", e.target.value)}
                      inputMode="numeric"
                      aria-label="Year"
                    />
                  </RailField>
                  <RailField label="Colour">
                    <Combobox
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
                    <Input
                      className="h-8 bg-background"
                      value={form.carNumber}
                      onChange={(e) => set("carNumber", e.target.value)}
                      placeholder="126/250"
                      aria-label="Car number"
                    />
                  </RailField>
                  <RailField label="Scale">
                    <Combobox
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
                    <Input
                      type="date"
                      className="h-8 bg-background"
                      value={form.orderDate}
                      onChange={(e) => set("orderDate", e.target.value)}
                      aria-label="Order date"
                    />
                  </RailField>
                  <RailField label="MRP">
                    <Input
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
                      value={form.seller}
                      onChange={(v) => set("seller", v)}
                      options={sellerOptions}
                      placeholder="Seller"
                      searchPlaceholder="Search sellers…"
                      ariaLabel="Seller"
                      className="h-8 bg-background"
                    />
                  </RailField>
                </div>
              </aside>
            </div>

            {/* Delete lives here now, at the far end of the footer from Save.
                It was a full-width button on the car's detail view, one tap from
                simply reading about a car; behind Edit it takes a deliberate
                trip, and it is still the only red thing on screen. */}
            <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-border/60 pt-3 sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                className="gap-1.5 text-rose-500 hover:bg-rose-500/10 hover:text-rose-400"
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
              <div className="flex items-center gap-2">
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

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
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
    <label className="flex items-center gap-2">
      <span className="w-[5.5rem] shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
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
