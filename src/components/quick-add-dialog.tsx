import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { CarThumb } from "@/components/car-thumb";
import { SegmentControl } from "@/components/segment-control";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { IosGroup, IosInput, IosPicker, IosRow } from "@/components/ios-field";
import { catalogCarToDiecast, type CatalogCar } from "@/lib/catalog";
import { makeBlankCar, useCars, useCarsActions } from "@/lib/cars-store";
import { carNumberOf } from "@/lib/car-subline";
import { deriveMonth } from "@/lib/date-utils";
import { inrPrice } from "@/lib/format";
import { STATUSES, isInHand, isOpenOrder, statusLabel } from "@/lib/status";

/** What you can be doing with a car you are adding. Wishlist has its own button. */
const STATUS_CHOICES = STATUSES.filter((s) => s !== "ISO").map((s) => ({
  value: s as string,
  label: statusLabel(s),
}));
const PAYMENT_CHOICES = ["Paid", "Partial", "Pending"].map((p) => ({ value: p, label: p }));

const today = () => new Date().toISOString().slice(0, 10);

/** The most common values of a list, most used first. */
function topValues<T extends string | number>(values: T[], max: number): T[] {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([v]) => v);
}

/**
 * Adding a car from the Catalogue, without the whole form.
 *
 * The catalogue already knows what the car *is* — brand, number, box, colour,
 * photo, retail price — so the only things left to ask are about this copy:
 * how it stands, what it cost, who from, when. None of them is required. Adding
 * a car you cannot yet say the price of, or who sold, is better than not adding
 * it, and every one of them can be filled in later from the car itself.
 *
 * The two that are usually the same as last time — the price and the seller —
 * come with one-tap choices drawn from what you have bought before. "More
 * fields" is the way into the full form, for the cases that want it.
 */
export function QuickAddDialog({
  entry: first,
  alternatives,
  preOrder,
  onClose,
  onMore,
}: {
  entry: CatalogCar | null;
  /** Every box this casting comes in, the one being added included. */
  alternatives: CatalogCar[];
  /** The catalogue lists it as not yet released. */
  preOrder: boolean;
  onClose: () => void;
  /** Hand the same casting to the full add form. */
  onMore: (entry: CatalogCar) => void;
}) {
  const { addCar } = useCarsActions();
  const cars = useCars();

  // Which box, when the casting comes in more than one (a Box and a Blister).
  const [pickedId, setPickedId] = useState("");
  const [status, setStatus] = useState("In Hand");
  const [spent, setSpent] = useState("");
  const [payment, setPayment] = useState("");
  const [advance, setAdvance] = useState("");
  const [seller, setSeller] = useState("");
  const [orderDate, setOrderDate] = useState("");
  // The expected day while it is on its way; the day it arrived once it is here.
  const [dayOn, setDayOn] = useState("");

  const boxes = alternatives.length > 1 ? alternatives : [];
  const entry = first
    ? (boxes.find((b) => b.car_id === pickedId) ??
      alternatives.find((b) => b.car_id === first.car_id) ??
      first)
    : null;
  const open = isOpenOrder(status);

  // A fresh start for each car, rather than the last one's answers.
  useEffect(() => {
    if (!first) return;
    setPickedId(first.car_id);
    setStatus(preOrder ? "PO" : "In Hand");
    setSpent("");
    setPayment("");
    setAdvance("");
    setSeller("");
    setOrderDate(today());
  }, [first, preOrder]);

  // The date field changes meaning with the status, and so does its default.
  useEffect(() => {
    setDayOn(isOpenOrder(status) ? (entry?.expected_date ?? "") : today());
  }, [status, entry?.car_id, entry?.expected_date]);

  // One-tap choices, from what you have bought before.
  const quickSellers = useMemo(
    () =>
      topValues(
        cars
          .map((c) => (c.seller || "").trim())
          .filter((s) => s && s.toUpperCase() !== "NA" && s !== "—"),
        4,
      ),
    [cars],
  );
  const quickCosts = useMemo(() => {
    const mrp = Math.round(Number(entry?.mrp) || 0);
    // What the same brand has cost you before, beside the retail price.
    const sameBrand = cars
      .filter((c) => c.brand === entry?.brand && (c.spent || 0) > 0)
      .map((c) => Math.round(c.spent || 0));
    const values = [...(mrp > 0 ? [mrp] : []), ...topValues(sameBrand, 4).filter((v) => v !== mrp)];
    return values.slice(0, 4).map((v) => ({
      value: String(v),
      label: v === mrp ? `MRP ₹${v.toLocaleString("en-IN")}` : `₹${v.toLocaleString("en-IN")}`,
    }));
  }, [cars, entry?.brand, entry?.mrp]);

  if (!first || !entry) return null;
  const car = catalogCarToDiecast(entry);

  const save = () => {
    const cost = Number(spent) || 0;
    // Paid is paid in full; a part payment is the advance; otherwise it is all owing.
    const paid = payment === "Paid" ? cost : payment === "Partial" ? Number(advance) || 0 : 0;
    const orderMonth = deriveMonth(orderDate);
    const arrived = isInHand(status);
    const date = arrived ? dayOn || orderDate : "";

    const saved = addCar({
      ...makeBlankCar(),
      ...car,
      // Numbered by the store, which can see the whole collection.
      id: "",
      catalogId: entry.car_id,
      spent: cost,
      mrp: Number(entry.mrp) || 0,
      status,
      payment,
      seller: seller.trim(),
      paid,
      balance: Math.max(0, cost - paid),
      orderDate,
      orderMonth,
      date,
      month: deriveMonth(date) || orderMonth,
      expectedDate: open ? dayOn : "",
    });
    // Null means the free limit refused it, and the toast has already said so.
    if (!saved) return;
    toast.success("Added to your collection", { description: car.name });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] gap-4 overflow-y-auto overflow-x-hidden sm:max-w-md [&>*]:min-w-0">
        <div className="flex items-center gap-3 pr-6">
          <CarThumb
            car={car}
            className="size-16 shrink-0 overflow-hidden rounded-[calc(1.5rem-0.625rem)]"
          />
          <div className="min-w-0">
            <DialogTitle className="truncate text-base">{car.name}</DialogTitle>
            <DialogDescription className="truncate">
              {[entry.brand, carNumberOf(car), entry.assortment].filter(Boolean).join(" · ") || "—"}
            </DialogDescription>
            {entry.mrp ? (
              <div className="text-xs text-muted-foreground">MRP {inrPrice(entry.mrp)}</div>
            ) : null}
          </div>
        </div>

        {/* The phone form, the way iOS Settings lays one out: the label on the left, the
            answer on the right, the choices in a pop-up menu. */}
        <div className="min-w-0 space-y-2.5">
          <IosGroup>
            {boxes.length > 0 && (
              <IosRow label="Which one">
                <IosPicker
                  label="Which one"
                  value={entry.car_id}
                  onChange={setPickedId}
                  options={boxes.map((b) => ({
                    value: b.car_id,
                    label: (b.assortment || "").trim() || b.car_id,
                  }))}
                />
              </IosRow>
            )}
            <IosRow label="Status">
              <IosPicker
                label="Status"
                value={status}
                onChange={setStatus}
                options={STATUS_CHOICES}
              />
            </IosRow>
            <IosRow label="What it cost">
              <IosInput
                label="What it cost"
                inputMode="decimal"
                placeholder={entry.mrp ? `₹ ${entry.mrp}` : "₹"}
                value={spent}
                onChange={(v) => setSpent(v.replace(/[^0-9.]/g, ""))}
              />
            </IosRow>
            <IosRow label="Order date">
              <IosInput label="Order date" type="date" value={orderDate} onChange={setOrderDate} />
            </IosRow>
            <IosRow label={open ? "Expected on" : "Arrived on"}>
              <IosInput
                label={open ? "Expected on" : "Arrived on"}
                type="date"
                value={dayOn}
                onChange={setDayOn}
              />
            </IosRow>
            <IosRow label="Seller">
              <IosPicker
                label="Seller"
                value={seller}
                onChange={setSeller}
                options={quickSellers.map((s) => ({ value: s, label: s }))}
                placeholder="Who you bought it from"
                allowNew
                clearable
              />
            </IosRow>
            <IosRow label="Payment">
              <IosPicker
                label="Payment"
                value={payment}
                onChange={(v) => {
                  setPayment(v);
                  if (v !== "Partial") setAdvance("");
                }}
                options={PAYMENT_CHOICES}
                placeholder="Not said"
                clearable
              />
            </IosRow>
            {payment === "Partial" && (
              <IosRow label="Advance paid">
                <IosInput
                  label="Advance paid"
                  inputMode="decimal"
                  placeholder="₹ paid so far"
                  value={advance}
                  onChange={(v) => setAdvance(v.replace(/[^0-9.]/g, ""))}
                />
              </IosRow>
            )}
          </IosGroup>

          {quickCosts.length > 0 && (
            <SegmentControl
              row
              clearable
              value={quickCosts.some((q) => q.value === spent) ? spent : ""}
              onChange={setSpent}
              options={quickCosts}
            />
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Everything here is optional — fill in what you know, and the rest can wait.
        </p>

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            className="px-2 text-muted-foreground"
            onClick={() => onMore(entry)}
          >
            More fields
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={save}>
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
