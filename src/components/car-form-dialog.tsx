import { useEffect, useState } from "react";
import type { Diecast } from "@/lib/types";
import { useCarsActions, makeBlankCar } from "@/lib/cars-store";
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

const STATUS_OPTIONS = ["Available", "Pre Order", "Transit", "Waiting", "ISO", "On Hold"];

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
  const [form, setForm] = useState<Diecast>(makeBlankCar());

  useEffect(() => {
    if (open) setForm(initial ? { ...initial } : makeBlankCar());
  }, [open, initial]);

  const set = <K extends keyof Diecast>(k: K, v: Diecast[K]) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    // derive month label from date
    let month = form.month;
    if (form.date) {
      const d = new Date(form.date);
      if (!isNaN(d.getTime())) {
        month = d.toLocaleString("en-US", { month: "short", year: "numeric" });
      }
    }
    const payload: Diecast = { ...form, name, month, spent: Number(form.spent) || 0 };
    if (mode === "add") addCar(payload);
    else updateCar(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add a car" : "Edit car"}</DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Add a new diecast to your collection."
              : "Update this car's details."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name *" className="sm:col-span-2">
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label="Make">
            <Input value={form.make} onChange={(e) => set("make", e.target.value)} />
          </Field>
          <Field label="Model">
            <Input value={form.model} onChange={(e) => set("model", e.target.value)} />
          </Field>
          <Field label="Variant">
            <Input value={form.variant} onChange={(e) => set("variant", e.target.value)} />
          </Field>
          <Field label="Year">
            <Input
              value={form.year}
              onChange={(e) => set("year", e.target.value)}
              inputMode="numeric"
            />
          </Field>
          <Field label="Brand">
            <Input value={form.brand} onChange={(e) => set("brand", e.target.value)} />
          </Field>
          <Field label="Assortment">
            <Input value={form.assortment} onChange={(e) => set("assortment", e.target.value)} />
          </Field>
          <Field label="Series">
            <Input value={form.series} onChange={(e) => set("series", e.target.value)} />
          </Field>
          <Field label="Sub Series">
            <Input value={form.subSeries} onChange={(e) => set("subSeries", e.target.value)} />
          </Field>
          <Field label="Car #">
            <Input value={form.carNumber} onChange={(e) => set("carNumber", e.target.value)} />
          </Field>
          <Field label="Colour">
            <Input value={form.colour} onChange={(e) => set("colour", e.target.value)} />
          </Field>
          <Field label="Type">
            <Input value={form.type} onChange={(e) => set("type", e.target.value)} />
          </Field>
          <Field label="Size">
            <Input
              value={form.size}
              onChange={(e) => set("size", e.target.value)}
              placeholder="e.g. 1:64"
            />
          </Field>
          <Field label="Seller">
            <Input value={form.seller} onChange={(e) => set("seller", e.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={form.status || "Available"} onValueChange={(v) => set("status", v)}>
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
          <Field label="Spent (INR)">
            <Input
              type="number"
              min="0"
              step="1"
              value={form.spent}
              onChange={(e) => set("spent", Number(e.target.value))}
            />
          </Field>
          <Field label="Order / Added date">
            <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
          <div className="flex items-center gap-6 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.chase} onCheckedChange={(v) => set("chase", !!v)} />
              Chase
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.favourite} onCheckedChange={(v) => set("favourite", !!v)} />
              Favourite
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.official} onCheckedChange={(v) => set("official", !!v)} />
              Official
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.open} onCheckedChange={(v) => set("open", !!v)} />
              Opened
            </label>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{mode === "add" ? "Add car" : "Save changes"}</Button>
          </DialogFooter>
        </form>
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
            {car ? `“${car.name}” will be removed from your collection.` : ""} This affects only
            your local view — the original spreadsheet isn't touched.
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
