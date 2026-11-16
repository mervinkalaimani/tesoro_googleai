import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authHeader } from "@/lib/api-auth";
import type { ScanResult } from "@/components/car-scan-dialog";

/** What a scan fills, plus the price (digits) and the arrival month (YYYY-MM-DD) a shop page states. */
export type LinkFields = ScanResult & { mrp?: string; expectedDate?: string };
export type LinkResult = { fields: LinkFields; imageUrl: string };

/**
 * A web link to a car, read into the same fields a scan fills, plus the page's
 * photo. Shared by every add-car form so they all behave alike.
 */
export function CarLinkField({
  onFound,
  className,
}: {
  onFound: (r: LinkResult) => void;
  className?: string;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/car-from-url", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<LinkResult> & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not read that link.");
      onFound({ fields: data.fields ?? {}, imageUrl: data.imageUrl ?? "" });
      setUrl("");
      toast.success("Filled from the link", { description: "Check the details before saving." });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <div className="relative min-w-0 flex-1">
        <Link2 className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void go();
            }
          }}
          placeholder="Paste a link to the car's web page"
          inputMode="url"
          className="pl-8"
        />
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => void go()}
        disabled={busy || !url.trim()}
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        Fetch
      </Button>
    </div>
  );
}
