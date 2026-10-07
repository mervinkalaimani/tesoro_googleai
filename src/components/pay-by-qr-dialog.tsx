import { useRef, useState } from "react";
import { Check, Clock, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { ACCEPT_ATTR, uploadPaymentQr } from "@/lib/car-photos";
import { usePaymentInfo } from "@/lib/payment-info";
import { useAuth } from "@/lib/auth-store";
import { inrFull } from "@/lib/format";
import { monthsFromTerm, type PaidPlan } from "@/lib/tiers";
import { pricesFor, usePlanPrices } from "@/lib/plan-prices";

/**
 * Pay this much, against this picture, and show us when you have.
 *
 * The amount is worked out from the plan and length they actually asked for,
 * not typed anywhere: somebody told the wrong figure pays the wrong figure,
 * and the one place that knows is the prices table.
 *
 * The receipt is the half that makes this work without a payment gateway. An
 * admin is granting the plan by hand either way; what they need is a picture
 * of the transfer beside the request, rather than a conversation about whether
 * it happened.
 */
export function PayByQrDialog({
  open,
  onOpenChange,
  plan,
  term,
  receiptUrl,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan: PaidPlan;
  /** The term as it was stored on the request. */
  term: string | null;
  /** A receipt already sent, if there is one. */
  receiptUrl: string | null;
  onUploaded: () => void;
}) {
  const info = usePaymentInfo();
  const prices = usePlanPrices();
  const { reloadProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const months = monthsFromTerm(term);
  const name = plan === "plus" ? "Plus" : "Pro";
  const row = pricesFor(prices, plan).find((r) => r.months === months);
  const amount = row?.price ?? 0;

  const send = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    const up = await uploadPaymentQr(file);
    if ("error" in up) {
      setBusy(false);
      toast.error("Could not upload that", { description: up.error });
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("tesoro_submit_receipt", { _url: up.url });
    setBusy(false);
    if (error) {
      toast.error("Could not send that receipt", { description: error.message });
      return;
    }
    await reloadProfile();
    onUploaded();
    toast.success("Receipt sent", {
      description: `Once it is checked, your ${name} plan will be switched on.`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full sm:max-w-md">
        <div className="text-center">
          <DialogTitle className="text-xl font-bold tracking-tight">
            Send {inrFull(amount)} on the QR
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            {name} · {months} month{months === 1 ? "" : "s"}
          </DialogDescription>
        </div>

        {info.url ? (
          <div className="mx-auto w-full max-w-xs overflow-hidden rounded-2xl border border-border bg-white p-3">
            {/* On white whatever the theme is: a QR inverted by a dark card is
                a QR a camera will not read. */}
            <img src={info.url} alt="Payment QR code" className="w-full object-contain" />
          </div>
        ) : (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-center text-[13px]">
            The payment details have not been set up yet. An admin will be in touch.
          </p>
        )}

        {info.note && <p className="text-center text-[13px] font-medium">{info.note}</p>}

        <p className="text-center text-[12px] text-muted-foreground">
          Pay the exact amount, then send the screenshot back here.
        </p>

        {receiptUrl ? (
          <div className="space-y-2 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3 text-center">
            <p className="flex items-center justify-center gap-1.5 text-[13px] font-semibold">
              <Clock className="size-4" />
              Receipt received
            </p>
            <p className="text-[12px] text-muted-foreground">
              Once verified, your {name} plan will be granted.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-[11px]"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              Send a different one
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            className="w-full gap-1.5 font-semibold"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}I
            have paid — upload the receipt
          </Button>
        )}

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          onChange={(e) => {
            void send(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
