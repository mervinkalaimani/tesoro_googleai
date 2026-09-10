import { useEffect, useState } from "react";
import { IndianRupee, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCarsActions } from "@/lib/cars-store";
import { inrFull } from "@/lib/format";
import type { Diecast } from "@/lib/types";

const num = (v: string) => {
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Records a payment against a pre-order. The entered amount is *added* to what
 * has already been paid, and the balance is recomputed from cost minus paid.
 */
export function PayBalanceDialog({ car, onClose }: { car: Diecast | null; onClose: () => void }) {
  const { updateCar } = useCarsActions();
  const [mode, setMode] = useState<"full" | "custom">("full");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const cost = car?.spent ?? 0;
  const alreadyPaid = car?.paid ?? 0;
  const due = Math.max(cost - alreadyPaid, 0);

  useEffect(() => {
    setMode("full");
    setAmount("");
  }, [car?.id]);

  if (!car) return null;

  const entered = mode === "full" ? due : num(amount);
  // Never let a payment push paid past the cost.
  const applied = Math.min(Math.max(entered, 0), due);
  const newPaid = alreadyPaid + applied;
  const newBalance = Math.max(cost - newPaid, 0);
  const valid = applied > 0;

  const save = async () => {
    setSaving(true);
    try {
      updateCar({
        ...car,
        paid: newPaid,
        balance: newBalance,
        payment: newBalance === 0 ? "Paid" : car.payment || "Partial",
      });
      toast.success(`Recorded ${inrFull(applied)}`, {
        description:
          newBalance === 0 ? "Balance fully settled." : `${inrFull(newBalance)} still outstanding.`,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={Boolean(car)}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pay balance</DialogTitle>
          <DialogDescription className="truncate">
            {car.name || `${car.make} ${car.model}`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/30 p-3 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Cost</div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums">{inrFull(cost)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Paid so far
            </div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-500">
              {inrFull(alreadyPaid)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Balance
            </div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums text-amber-500">
              {inrFull(due)}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setMode("full")}
            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${
              mode === "full" ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"
            }`}
          >
            <span className="text-sm font-medium">Pay the full balance</span>
            <span className="text-sm font-semibold tabular-nums">{inrFull(due)}</span>
          </button>

          <button
            type="button"
            onClick={() => setMode("custom")}
            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${
              mode === "custom" ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"
            }`}
          >
            <span className="text-sm font-medium">Pay a part of it</span>
            <span className="text-xs text-muted-foreground">Enter an amount</span>
          </button>

          {mode === "custom" && (
            <div className="space-y-1.5 pl-1 pt-1">
              <Label htmlFor="pay-amount">Amount to add</Label>
              <div className="relative">
                <IndianRupee className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="pay-amount"
                  autoFocus
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="pl-7"
                />
              </div>
              {num(amount) > due && (
                <p className="text-xs text-amber-500">
                  Capped at the outstanding balance of {inrFull(due)}.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">New paid total</span>
            <span className="font-semibold tabular-nums text-emerald-500">{inrFull(newPaid)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-muted-foreground">Remaining balance</span>
            <span
              className={`font-semibold tabular-nums ${
                newBalance === 0 ? "text-emerald-500" : "text-amber-500"
              }`}
            >
              {inrFull(newBalance)}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!valid || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
