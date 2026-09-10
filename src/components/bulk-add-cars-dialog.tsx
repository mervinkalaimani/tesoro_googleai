import { useMemo, useState, type ReactNode } from "react";
import { Layers, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCarsActions, makeBlankCar } from "@/lib/cars-store";
import { buildCarName } from "@/lib/car-name";
import { deriveMonth } from "@/lib/date-utils";
import { inrFull } from "@/lib/format";
import type { Diecast } from "@/lib/types";

type FieldKey =
  | "make"
  | "model"
  | "variant"
  | "year"
  | "colour"
  | "type"
  | "brand"
  | "series"
  | "subSeries"
  | "assortment"
  | "size"
  | "seller"
  | "status"
  | "orderDate"
  | "cost"
  | "mrp";

type FieldDef = {
  key: FieldKey;
  label: string;
  kind: "text" | "number" | "date" | "status";
  placeholder?: string;
  /** Whether the field starts out shared across the whole batch. */
  sharedByDefault: boolean;
};

const STATUSES = ["Available", "Transit", "Pre Order", "Waiting", "ISO", "On Hold"];

/**
 * Every field a bulk row can carry. Which of them are shared across the batch
 * and which vary per car is the user's choice; these are just the defaults for
 * the common case of several different castings from one order.
 */
const FIELDS: FieldDef[] = [
  { key: "make", label: "Make", kind: "text", placeholder: "Toyota", sharedByDefault: false },
  { key: "model", label: "Model", kind: "text", placeholder: "Supra", sharedByDefault: false },
  { key: "variant", label: "Variant", kind: "text", sharedByDefault: false },
  { key: "year", label: "Year", kind: "text", placeholder: "1998", sharedByDefault: false },
  { key: "colour", label: "Colour", kind: "text", sharedByDefault: false },
  { key: "type", label: "Type", kind: "text", sharedByDefault: false },
  { key: "brand", label: "Brand", kind: "text", placeholder: "Hotwheels", sharedByDefault: true },
  { key: "series", label: "Series", kind: "text", sharedByDefault: true },
  { key: "subSeries", label: "Sub series", kind: "text", sharedByDefault: false },
  { key: "assortment", label: "Assortment", kind: "text", sharedByDefault: false },
  { key: "size", label: "Size", kind: "text", placeholder: "1:64", sharedByDefault: true },
  { key: "seller", label: "Seller", kind: "text", placeholder: "First Cry", sharedByDefault: true },
  { key: "status", label: "Status", kind: "status", sharedByDefault: true },
  { key: "orderDate", label: "Order date", kind: "date", sharedByDefault: true },
  { key: "cost", label: "Cost", kind: "number", placeholder: "199", sharedByDefault: true },
  { key: "mrp", label: "MRP", kind: "number", placeholder: "250", sharedByDefault: true },
];

type Values = Partial<Record<FieldKey, string>>;
type Row = Values & { key: string };

function blankRow(): Row {
  return { key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` };
}

const num = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function FieldInput({
  def,
  value,
  onChange,
  compact = false,
}: {
  def: FieldDef;
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  const cls = compact ? "h-8" : "";

  if (def.kind === "status") {
    return (
      <select
        value={value || "Available"}
        onChange={(e) => onChange(e.target.value)}
        aria-label={def.label}
        className={`w-full rounded-md border border-input bg-background px-2 text-sm ${
          compact ? "h-8" : "h-9"
        }`}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    );
  }

  return (
    <Input
      type={def.kind === "date" ? "date" : "text"}
      inputMode={def.kind === "number" ? "decimal" : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={def.placeholder}
      aria-label={def.label}
      className={cls}
    />
  );
}

export function BulkAddCarsDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: ReactNode;
  /** Omit both to let the dialog own its state via `trigger`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { addCar } = useCarsActions();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (v: boolean) => {
    if (!isControlled) setUncontrolledOpen(v);
    onOpenChange?.(v);
  };

  const [saving, setSaving] = useState(false);
  const [sharedKeys, setSharedKeys] = useState<Set<FieldKey>>(
    () => new Set(FIELDS.filter((f) => f.sharedByDefault).map((f) => f.key)),
  );
  const [shared, setShared] = useState<Values>({
    status: "Available",
    orderDate: new Date().toISOString().slice(0, 10),
    size: "1:64",
  });
  const [rows, setRows] = useState<Row[]>([blankRow(), blankRow(), blankRow()]);

  const sharedFields = useMemo(() => FIELDS.filter((f) => sharedKeys.has(f.key)), [sharedKeys]);
  const perCarFields = useMemo(() => FIELDS.filter((f) => !sharedKeys.has(f.key)), [sharedKeys]);

  const toggleShared = (key: FieldKey) =>
    setSharedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const setRow = (key: string, patch: Values) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /** Resolve a field for one row: shared value wins when the field is shared. */
  const valueOf = (row: Row, key: FieldKey) => (sharedKeys.has(key) ? shared[key] : row[key]) ?? "";

  // A row counts once it names a car, from wherever make/model come from.
  const filled = useMemo(
    () => rows.filter((r) => valueOf(r, "make").trim() || valueOf(r, "model").trim()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, shared, sharedKeys],
  );

  const total = useMemo(
    () => filled.reduce((s, r) => s + num(valueOf(r, "cost")), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filled, shared, sharedKeys],
  );

  const reset = () => {
    setRows([blankRow(), blankRow(), blankRow()]);
    setShared({
      status: "Available",
      orderDate: new Date().toISOString().slice(0, 10),
      size: "1:64",
    });
    setSharedKeys(new Set(FIELDS.filter((f) => f.sharedByDefault).map((f) => f.key)));
  };

  const save = async () => {
    if (filled.length === 0) {
      toast.error("Nothing to add", { description: "Give at least one row a make or model." });
      return;
    }

    setSaving(true);
    try {
      for (const r of filled) {
        const base = makeBlankCar();
        const cost = num(valueOf(r, "cost"));
        const mrp = num(valueOf(r, "mrp"));
        const status = valueOf(r, "status") || "Available";
        const orderDate = valueOf(r, "orderDate") || base.orderDate;
        const month = deriveMonth(orderDate);

        const car: Diecast = {
          ...base,
          make: valueOf(r, "make").trim(),
          model: valueOf(r, "model").trim(),
          variant: valueOf(r, "variant").trim(),
          year: valueOf(r, "year").trim(),
          colour: valueOf(r, "colour").trim(),
          type: valueOf(r, "type").trim(),
          brand: valueOf(r, "brand").trim(),
          series: valueOf(r, "series").trim(),
          subSeries: valueOf(r, "subSeries").trim(),
          assortment: valueOf(r, "assortment").trim(),
          size: valueOf(r, "size").trim() || base.size,
          seller: valueOf(r, "seller").trim(),
          status,
          spent: cost,
          mrp,
          paid: status === "Pre Order" ? 0 : cost,
          balance: status === "Pre Order" ? cost : 0,
          orderDate,
          orderMonth: month || base.orderMonth,
          date: status === "Available" ? orderDate : "",
          month: status === "Available" ? month || base.month : "",
        };
        car.name = buildCarName(car);
        // addCar derives the shipping ID from seller and dates.
        addCar(car);
      }

      toast.success(`Added ${filled.length} car${filled.length === 1 ? "" : "s"}`);
      reset();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
              <Layers className="size-4" />
            </div>
            <DialogTitle>Add cars in bulk</DialogTitle>
          </div>
          <DialogDescription>
            Pick which fields are the same for every car in this order. The rest become columns you
            fill in per car.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3 rounded-lg border border-border p-3">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
            Same for all — click a field to move it in or out
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {FIELDS.map((f) => {
              const on = sharedKeys.has(f.key);
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => toggleShared(f.key)}
                  aria-pressed={on}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    on
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {sharedFields.length > 0 && (
            <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-4">
              {sharedFields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`bulk-${f.key}`}>{f.label}</Label>
                  <FieldInput
                    def={f}
                    value={shared[f.key] ?? ""}
                    onChange={(v) => setShared((s) => ({ ...s, [f.key]: v }))}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {perCarFields.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Every field is shared. Move at least one out of “same for all” to list cars
            individually.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {perCarFields.map((f) => (
                    <th key={f.key} className="px-2 py-2 text-left font-medium">
                      {f.label}
                    </th>
                  ))}
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key} className="border-t border-border">
                    {perCarFields.map((f) => (
                      <td key={f.key} className="p-1">
                        <FieldInput
                          def={f}
                          compact
                          value={r[f.key] ?? ""}
                          onChange={(v) => setRow(r.key, { [f.key]: v })}
                        />
                      </td>
                    ))}
                    <td className="p-1 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Remove row ${i + 1}`}
                        disabled={rows.length === 1}
                        onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, blankRow()])}>
            <Plus className="size-4" />
            Add another
          </Button>
          <p className="text-sm text-muted-foreground">
            {filled.length} car{filled.length === 1 ? "" : "s"}
            {total > 0 ? ` · ${inrFull(total)} total` : ""}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || filled.length === 0}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Add {filled.length || ""} car{filled.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
