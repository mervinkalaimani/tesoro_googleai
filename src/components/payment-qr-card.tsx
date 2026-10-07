import { useEffect, useRef, useState } from "react";
import { Loader2, QrCode, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ACCEPT_ATTR, uploadPaymentQr } from "@/lib/car-photos";
import {
  fetchPaymentInfo,
  forgetPaymentInfo,
  savePaymentInfo,
  type PaymentInfo,
} from "@/lib/payment-info";

/**
 * The picture people pay against, set once by the owner.
 *
 * It is not sent anywhere when it is uploaded — it sits here until an admin
 * hands it to somebody who has asked for a plan. One picture, one place, and
 * the deciding of who sees it happens on the request rather than here.
 */
export function PaymentQrCard() {
  const [info, setInfo] = useState<PaymentInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetchPaymentInfo().then((v) => {
      setInfo(v);
      setNote(v.note);
    });
  }, []);

  const write = async (next: PaymentInfo) => {
    setBusy(true);
    const { error } = await savePaymentInfo(next);
    setBusy(false);
    if (error) {
      toast.error("Could not save that", { description: error });
      return false;
    }
    forgetPaymentInfo();
    setInfo(next);
    return true;
  };

  const take = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    const out = await uploadPaymentQr(file);
    setBusy(false);
    if ("error" in out) {
      toast.error("Could not upload that", { description: out.error });
      return;
    }
    if (await write({ url: out.url, note })) {
      toast.success("Payment QR saved", {
        description: "It goes out when you send payment details on a request.",
      });
    }
  };

  if (!info) {
    return (
      <section className="card-elevated flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Reading the payment details…
      </section>
    );
  }

  return (
    <section className="card-elevated space-y-3 p-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Payment QR
        </h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          What somebody scans to pay you. Nobody sees it until you send payment details on their
          request.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="grid size-32 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted/20">
          {info.url ? (
            <img src={info.url} alt="Payment QR" className="size-full object-contain" />
          ) : (
            <QrCode className="size-8 text-muted-foreground/50" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              {info.url ? "Replace" : "Upload a QR"}
            </Button>
            {info.url && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-rose-500 hover:bg-rose-500/10 hover:text-rose-400"
                disabled={busy}
                onClick={() => void write({ url: "", note })}
              >
                <Trash2 className="size-3.5" />
                Remove
              </Button>
            )}
          </div>

          {/* A QR says where the money goes and nothing about who it is. The
              line under it is for the name somebody checks against. */}
          <Input
            value={note}
            placeholder="A line under it — the account name, a UPI handle"
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              if (note !== info.note) void write({ url: info.url, note });
            }}
            className="h-8 text-xs"
          />

          <p className="text-[11px] text-muted-foreground">
            JPG, PNG or WebP. Kept at a size a phone camera can still read.
          </p>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </section>
  );
}
