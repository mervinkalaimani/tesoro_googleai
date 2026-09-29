/**
 * The shop behind the name.
 *
 * Five fields, and the fifth decides what the other pages call this seller: a
 * shop has a name over the door and a person behind the counter, and which one
 * you think of it by is not something the app can work out.
 *
 * The name on the cars is never touched from here. Renaming a seller across
 * 1,682 rows is a different job with different consequences; this only records
 * what is known about the shop that name refers to.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { SegmentControl } from "@/components/segment-control";
import { CarPhotoField } from "@/components/car-photo-field";
import { saveSellerDetails, type SellerDetails } from "@/lib/seller-details";

export function SellerEditDialog({
  open,
  onOpenChange,
  seller,
  details,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The name as the cars carry it. */
  seller: string;
  details?: SellerDetails | null;
}) {
  const [store, setStore] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [location, setLocation] = useState("");
  const [image, setImage] = useState("");
  const [prefer, setPrefer] = useState<"owner" | "store">("owner");
  const [busy, setBusy] = useState(false);

  // Filled when the dialog opens, not while it is being typed in.
  useEffect(() => {
    if (!open) return;
    setStore(details?.store_name || "");
    setPhone(details?.phone || "");
    setWhatsapp(details?.whatsapp || "");
    setLocation(details?.location || "");
    setImage(details?.image_url || "");
    setPrefer(details?.prefer === "store" ? "store" : "owner");
  }, [open, details]);

  const save = async () => {
    setBusy(true);
    const res = await saveSellerDetails(seller, {
      store_name: store,
      phone,
      whatsapp,
      location,
      image_url: image,
      prefer,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error("Could not save that", { description: res.error });
      return;
    }
    toast.success(`${seller} saved`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{seller}</DialogTitle>
          <DialogDescription>
            Where to find them again. The name on your cars stays as it is.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            {/* The same field a car uses, so a shop sign can be uploaded or
                pointed at, and neither is a second way of doing it. */}
            <Label>Picture</Label>
            <CarPhotoField value={image} onChange={setImage} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="seller-store">Store name</Label>
            <Input
              id="seller-store"
              value={store}
              onChange={(e) => setStore(e.target.value)}
              placeholder="Crossword Bookstores"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="seller-phone">Phone number</Label>
              <Input
                id="seller-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seller-whatsapp">WhatsApp</Label>
              <Input
                id="seller-whatsapp"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="wa.me link or number"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="seller-location">Location</Label>
            <Input
              id="seller-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Express Avenue, Chennai"
            />
          </div>

          {/* Only a shop with a name over the door has two names to choose
              between. Amazon is Amazon. */}
          {store.trim() && (
            <div className="space-y-2">
              <Label>Goes by</Label>
              <SegmentControl
                fill
                value={prefer}
                onChange={(v) => setPrefer(v as "owner" | "store")}
                options={[
                  { value: "owner", label: seller || "Owner name" },
                  { value: "store", label: store.trim() },
                ]}
              />
              <p className="text-xs text-muted-foreground">Which name the Sellers page shows.</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void save()} className="gap-1.5">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
