import { useEffect, useState, useMemo } from "react";
import type { Diecast } from "@/lib/types";
import { useCarsActions } from "@/lib/cars-store";
import { buildCarName } from "@/lib/car-name";
import { setCachedCarImage } from "@/lib/car-image";
import { toDateInputValue, deriveMonth } from "@/lib/date-utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
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
  ImageIcon,
  AlertCircle,
  Car,
  IndianRupee,
  Calendar,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Check,
  Lock,
  Info,
} from "lucide-react";

const STATUS_OPTIONS = ["Available", "Pre Order", "Transit", "Waiting", "ISO", "On Hold"];
const PAYMENT_OPTIONS = ["Paid", "Partial", "Pending"];

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
    orderDate: today,
    expectedDate: "",
    official: false,
    chase: false,
    favourite: false,
    open: false,
    imageUrl: "",
  };
}

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
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Diecast | null;
  mode: "add" | "edit";
}) {
  const { addCar, updateCar } = useCarsActions();
  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState<CarFormData>(getBlankForm());
  const [imgError, setImgError] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValidationError(null);
    setImgError(false);
    setCurrentStep(1);
    if (initial) {
      setForm({
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
        orderDate:
          toDateInputValue(initial.orderDate || initial.date) ||
          new Date().toISOString().slice(0, 10),
        expectedDate: toDateInputValue(
          initial.expectedDate || (initial.status === "Available" ? initial.date : ""),
        ),
        official: Boolean(initial.official),
        chase: Boolean(initial.chase),
        favourite: Boolean(initial.favourite),
        open: Boolean(initial.open),
        imageUrl: initial.imageUrl || "",
      });
    } else {
      setForm(getBlankForm());
    }
  }, [open, initial]);

  const set = <K extends keyof CarFormData>(k: K, v: CarFormData[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
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
    const date = form.expectedDate.trim() || orderDate;
    const month = deriveMonth(date);

    const carId =
      initial?.id || `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

    const payload: Diecast = {
      id: carId,
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

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add a car" : "Edit car"}</DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Follow the wizard steps below to catalog a new diecast into your collection."
              : "Update ongoing logistics, status, payment progress, flags, and image. Saved vehicle cataloging fields are frozen to preserve integrity."}
          </DialogDescription>
        </DialogHeader>

        {/* Live auto-generated car title preview banner */}
        <div className="rounded-lg border border-border/70 bg-muted/40 px-3.5 py-2 text-xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="font-medium text-muted-foreground">Vehicle: </span>
            <span className="font-semibold text-foreground truncate">
              {previewName || "Enter make and model"}
            </span>
          </div>
          {mode === "edit" && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
              <Lock className="size-3" /> Identity Frozen
            </span>
          )}
        </div>

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
                  <div className="border-b border-border/50 pb-1">
                    <h4 className="text-sm font-semibold text-foreground">
                      Step 1: Vehicle Information
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Specify the make, model, colour, and manufacturing classification.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Make *">
                      <Input
                        value={form.make}
                        onChange={(e) => set("make", e.target.value)}
                        placeholder="e.g. Porsche, Nissan, Ford"
                        required
                        autoFocus
                      />
                    </Field>

                    <Field label="Model *">
                      <Input
                        value={form.model}
                        onChange={(e) => set("model", e.target.value)}
                        placeholder="e.g. 911 GT3 RS, Skyline GT-R"
                        required
                      />
                    </Field>

                    <Field label="Variant">
                      <Input
                        value={form.variant}
                        onChange={(e) => set("variant", e.target.value)}
                        placeholder="e.g. R34, KH, Custom"
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
                      <Input
                        value={form.colour}
                        onChange={(e) => set("colour", e.target.value)}
                        placeholder="e.g. Spectraflame Red, Blue, White"
                        required
                      />
                    </Field>

                    <Field label="Type *">
                      <Input
                        value={form.type}
                        onChange={(e) => set("type", e.target.value)}
                        placeholder="e.g. Race Car, Classic Car, Supercar"
                        list="wizard-car-type-options"
                        required
                      />
                      <datalist id="wizard-car-type-options">
                        <option value="Classic Car" />
                        <option value="Race Car" />
                        <option value="Sports Car" />
                        <option value="Supercar" />
                        <option value="Hypercar" />
                        <option value="Muscle Car" />
                        <option value="Sedan" />
                        <option value="SUV" />
                        <option value="Truck" />
                        <option value="Van" />
                        <option value="Batmobile" />
                      </datalist>
                    </Field>

                    <Field label="Brand *">
                      <Input
                        value={form.brand}
                        onChange={(e) => set("brand", e.target.value)}
                        placeholder="e.g. Hot Wheels, Mini GT, Matchbox"
                        list="wizard-car-brand-options"
                        required
                      />
                      <datalist id="wizard-car-brand-options">
                        <option value="Hot Wheels" />
                        <option value="Matchbox" />
                        <option value="Mini GT" />
                        <option value="Kaido House" />
                        <option value="Inno64" />
                        <option value="Pop Race" />
                        <option value="Tarmac Works" />
                        <option value="Tomica" />
                        <option value="Majorette" />
                        <option value="Greenlight" />
                      </datalist>
                    </Field>

                    <Field label="Assortment *">
                      <Input
                        value={form.assortment}
                        onChange={(e) => set("assortment", e.target.value)}
                        placeholder="e.g. Mainline, Premium, Boulevard"
                        list="wizard-car-assortment-options"
                        required
                      />
                      <datalist id="wizard-car-assortment-options">
                        <option value="Mainline" />
                        <option value="Premium" />
                        <option value="Boulevard" />
                        <option value="Car Culture" />
                        <option value="Fast & Furious" />
                        <option value="Pop Culture" />
                        <option value="Team Transport" />
                        <option value="Silver Series" />
                        <option value="Collector Edition" />
                      </datalist>
                    </Field>

                    <Field label="Series">
                      <Input
                        value={form.series}
                        onChange={(e) => set("series", e.target.value)}
                        placeholder="e.g. Circuit Legends, HW Exotics"
                      />
                    </Field>

                    <Field label="Sub Series">
                      <Input
                        value={form.subSeries}
                        onChange={(e) => set("subSeries", e.target.value)}
                        placeholder="e.g. Factory Fresh, Then and Now"
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
                      <Input
                        value={form.size}
                        onChange={(e) => set("size", e.target.value)}
                        placeholder="1:64"
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
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

                    <Field label="Transit Info / ETA" className="sm:col-span-2">
                      <Input
                        value={form.transitInfo}
                        onChange={(e) => set("transitInfo", e.target.value)}
                        placeholder="e.g. Tracking number, dispatch notes, courier info"
                      />
                    </Field>
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
                    <Field label="Image URL">
                      <Input
                        type="url"
                        value={form.imageUrl}
                        onChange={(e) => {
                          set("imageUrl", e.target.value);
                          setImgError(false);
                        }}
                        placeholder="https://... (Direct image link)"
                      />
                    </Field>

                    {form.imageUrl.trim() && (
                      <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-2.5">
                        <div className="relative size-14 shrink-0 overflow-hidden rounded border border-border bg-background">
                          {!imgError ? (
                            <img
                              src={form.imageUrl}
                              alt="Preview"
                              className="size-full object-contain"
                              onError={() => setImgError(true)}
                            />
                          ) : (
                            <div className="flex size-full items-center justify-center text-muted-foreground">
                              <ImageIcon className="size-5" />
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {!imgError ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              ✓ Image preview loaded successfully
                            </span>
                          ) : (
                            <span className="text-destructive font-medium">
                              ⚠ Could not load image from this URL.
                            </span>
                          )}
                        </div>
                      </div>
                    )}
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
                  <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  {currentStep > 1 && (
                    <Button type="button" variant="outline" onClick={handleBack}>
                      <ChevronLeft className="size-4 mr-1" /> Back
                    </Button>
                  )}
                  {currentStep < 4 ? (
                    <Button type="button" onClick={handleNext}>
                      Next <ChevronRight className="size-4 ml-1" />
                    </Button>
                  ) : (
                    <Button type="submit" className="bg-primary text-primary-foreground">
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
            {/* Frozen fields informational callout */}
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
              <Lock className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-300">
                  Editing Mode: Saved specifications are frozen
                </p>
                <p className="text-amber-700/90 dark:text-amber-300/80 mt-0.5">
                  Core vehicle identity (Make, Model, Brand, Year, Type, Order Date, MRP, Seller) is
                  locked to preserve catalog history. You can update ongoing logistics, status,
                  payment progress (with automated balance), flags, and image.
                </p>
              </div>
            </div>

            {/* SECTION 1: ACTIVE / EDITABLE LOGISTICS & STATUS */}
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3.5">
              <div className="text-xs font-bold uppercase tracking-wider text-primary flex items-center justify-between">
                <span>Active Status & Logistics (Editable)</span>
                <span className="text-[10px] font-normal text-muted-foreground">Enabled</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1">
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

                <Field label="Transit Info / ETA" className="sm:col-span-2">
                  <Input
                    className="bg-background"
                    value={form.transitInfo}
                    onChange={(e) => set("transitInfo", e.target.value)}
                    placeholder="Tracking number, courier updates, dispatch ETA..."
                  />
                </Field>
              </div>
            </div>

            {/* SECTION 2: ACTIVE / EDITABLE FINANCIALS & PAYMENT PROGRESS */}
            <div className="space-y-2 rounded-lg border border-border/80 bg-muted/30 p-3.5">
              <div className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center justify-between">
                <span>Payment & Expenditure (Editable)</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  Automated Balance
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1">
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

                <Field label="Balance (INR) [Automated]" className="sm:col-span-2">
                  <div className="relative">
                    <Input
                      type="number"
                      readOnly
                      value={form.balance}
                      className="bg-muted/70 font-semibold text-foreground cursor-not-allowed"
                    />
                    <span className="absolute right-2.5 top-2.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      Automated: Spent − Paid
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Spent (₹{Number(form.spent) || 0}) − Paid (₹{Number(form.paid) || 0}) = Balance
                    (₹{Number(form.balance) || 0})
                  </p>
                </Field>
              </div>
            </div>

            {/* SECTION 3: ACTIVE / EDITABLE FLAGS & IMAGE */}
            <div className="space-y-3 rounded-lg border border-border/80 bg-muted/30 p-3.5">
              <div className="text-xs font-bold uppercase tracking-wider text-foreground">
                Flags & Image (Editable)
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-1">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <Checkbox checked={form.official} onCheckedChange={(v) => set("official", !!v)} />
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

              <Field label="Image URL">
                <Input
                  type="url"
                  className="bg-background"
                  value={form.imageUrl}
                  onChange={(e) => {
                    set("imageUrl", e.target.value);
                    setImgError(false);
                  }}
                  placeholder="https://... (Direct image link)"
                />
              </Field>

              {form.imageUrl.trim() && (
                <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background p-2.5">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded border border-border bg-muted/20">
                    {!imgError ? (
                      <img
                        src={form.imageUrl}
                        alt="Preview"
                        className="size-full object-contain"
                        onError={() => setImgError(true)}
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <ImageIcon className="size-5" />
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {!imgError ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        ✓ Image preview loaded
                      </span>
                    ) : (
                      <span className="text-destructive font-medium">
                        ⚠ Could not load image from this URL.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 4: FROZEN / SAVED VEHICLE INFORMATION */}
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3.5 opacity-85">
              <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Lock className="size-3.5" />
                  <span>Frozen Saved Details (Read-only)</span>
                </div>
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  Locked
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 pt-1 text-xs">
                <FrozenItem label="Make" value={form.make} />
                <FrozenItem label="Model" value={form.model} />
                <FrozenItem label="Variant" value={form.variant} />
                <FrozenItem label="Year" value={form.year} />
                <FrozenItem label="Colour" value={form.colour} />
                <FrozenItem label="Type" value={form.type} />
                <FrozenItem label="Brand" value={form.brand} />
                <FrozenItem label="Assortment" value={form.assortment} />
                <FrozenItem label="Series" value={form.series} />
                <FrozenItem label="Sub Series" value={form.subSeries} />
                <FrozenItem label="Car Number" value={form.carNumber} />
                <FrozenItem label="Scale / Size" value={form.size} />
                <FrozenItem label="Order Date" value={form.orderDate} />
                <FrozenItem label="MRP" value={form.mrp ? `₹${form.mrp}` : ""} />
                <FrozenItem label="Seller" value={form.seller} />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">Save changes</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
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

function FrozenItem({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="rounded border border-border/40 bg-muted/40 p-2">
      <div className="text-[10px] text-muted-foreground flex items-center justify-between">
        <span>{label}</span>
        <Lock className="size-2.5 opacity-50" />
      </div>
      <div className="font-medium text-foreground truncate mt-0.5">{value || "—"}</div>
    </div>
  );
}

export function DeleteCarDialog({
  car,
  open,
  onOpenChange,
}: {
  car: Diecast | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { deleteCar } = useCarsActions();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this car?</AlertDialogTitle>
          <AlertDialogDescription>
            {car ? `“${car.name}” will be removed from your collection.` : ""} This affects your
            view and your Supabase database.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (car) deleteCar(car.id);
              onOpenChange(false);
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
