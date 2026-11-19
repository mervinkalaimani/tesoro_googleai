import { Link, useParams } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useRef, useState } from "react";

import { useCars } from "@/lib/cars-store";
import { Button } from "@/components/ui/button";

import { AddressForm, BLANK_ADDRESS, type AddressDraft } from "../components/address";
import {
  Card,
  CarImage,
  Confirm,
  Empty,
  ErrorNote,
  Field,
  inputCls,
  PageTitle,
  Pill,
  Price,
  SignInNeeded,
} from "../components/bits";
import { SellerChip } from "../components/cards";
import { rupees } from "../format";
import { itemById, sellerOf } from "../queries";
import type { Order } from "../types";
import { useAddShopCars } from "../viiv-cars";
import { api, useMarket } from "../use-market";

export function CheckoutPage() {
  const { listingId } = useParams({ strict: false }) as { listingId: string };
  const { s, me } = useMarket();
  const key = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Math.random()),
  );
  const [qty, setQty] = useState(1);
  const [pick, setPick] = useState<string>("");
  const [draft, setDraft] = useState<AddressDraft>(BLANK_ADDRESS);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const addShopCars = useAddShopCars();
  const myCars = useCars();
  const [placed, setPlaced] = useState<Order | null>(null);

  if (placed) {
    return (
      <Card className="mx-auto max-w-lg text-center">
        <CheckCircle2 className="mx-auto size-10 text-emerald-500" aria-hidden />
        <h1 className="mt-2 text-xl font-semibold">Order placed</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Order {placed.id} · {rupees(placed.totalPaise)}. This is a demo checkout: nothing was
          charged.
        </p>
        <p className="mt-3 text-sm">
          Status: <Pill tone="warn">Processing</Pill> The seller has been notified. When they ship
          it, it shows as <b>In transit</b> with tracking.
        </p>
        <p className="mt-2 text-sm">Added to your cars as bought from VIIV Shop ✓</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button asChild>
            <Link to="/market/orders/$orderId" params={{ orderId: placed.id }}>
              View order
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/collection">My cars</Link>
          </Button>
        </div>
      </Card>
    );
  }

  const l = s.listings.find((x) => x.id === listingId);
  const item = l && itemById(s, l.itemId);
  if (!l || !item)
    return (
      <Empty
        title="Offer not found"
        action={
          <Button asChild>
            <Link to="/market/search">Browse cars</Link>
          </Button>
        }
      />
    );
  const seller = sellerOf(s, l.sellerId);
  if (!me) return <SignInNeeded what="buy this car" />;
  if (l.sellerId === me.id)
    return (
      <Empty
        title="This is your own listing"
        body="You can't buy from yourself."
        action={
          <Button asChild variant="outline">
            <Link to="/seller/listings">Your listings</Link>
          </Button>
        }
      />
    );
  if (l.status !== "active" || l.quantity < 1)
    return (
      <Empty
        title={l.quantity < 1 ? "Sold out" : "This offer is no longer available"}
        body="Someone may have bought the last one, or the seller paused it. Other sellers may still have this exact car."
        action={
          <Button asChild>
            <Link to="/market/item/$itemId" params={{ itemId: item.id }}>
              See other sellers
            </Link>
          </Button>
        }
      />
    );

  const saved = me.addresses;
  const sel = pick || saved[0]?.id || "new";
  const addr: AddressDraft | undefined = sel === "new" ? draft : saved.find((a) => a.id === sel);
  const items = l.pricePaise * qty;
  const ship = l.shippingPaise ?? 0;
  const max = Math.min(l.quantity, 10);

  const place = () => {
    setError("");
    if (!addr) return setError("Add a delivery address.");
    setBusy(true);
    const { name, phone, line1, city, state, pincode } = addr;
    const r = api.checkout({
      listingId: l.id,
      qty,
      address: { name, phone, line1, city, state, pincode },
      key: key.current,
    });
    setBusy(false);
    if (r.ok) {
      if (!key.current.startsWith("done:")) {
        addShopCars(r.data, item, s.sellers.find((x) => x.userId === l.sellerId)?.storeName ?? "");
        key.current = "done:" + key.current;
      }
      setPlaced(r.data);
    } else setError(r.error);
  };

  return (
    <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <PageTitle title="Checkout" />
        <Card>
          <div className="flex gap-3">
            <CarImage item={item} className="w-28 shrink-0 rounded-xl" />
            <div className="min-w-0 space-y-1">
              <Link
                to="/market/item/$itemId"
                params={{ itemId: item.id }}
                className="font-medium hover:underline"
              >
                {item.name}
              </Link>
              <p className="text-xs text-muted-foreground">
                {item.scale} · {item.assortment} · {item.origin}
              </p>
              <p className="text-sm">
                Sold by <SellerChip userId={l.sellerId} s={s} />
              </p>
              <div className="flex flex-wrap gap-1">
                <Pill>{l.condition}</Pill>
                <Pill>{l.packaging}</Pill>
              </div>
            </div>
          </div>
          <p className="mt-3 rounded-lg bg-muted/60 p-3 text-sm">
            <b>Condition disclosed by seller:</b>{" "}
            {l.conditionNotes || `${l.condition}, ${l.packaging.toLowerCase()}.`}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Returns: {l.returnPolicy || "Not specified by the seller."}
          </p>
        </Card>

        <Card>
          <Field label="Quantity">
            <select
              className={inputCls + " w-28"}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            >
              {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
        </Card>

        <Card>
          <h2 className="mb-3 font-medium">Delivery address</h2>
          {saved.length > 0 && (
            <div className="mb-3 space-y-2" role="radiogroup" aria-label="Saved addresses">
              {saved.map((a) => (
                <label
                  key={a.id}
                  className="flex cursor-pointer items-start gap-2 rounded-xl border border-border p-3 text-sm has-[:checked]:border-primary"
                >
                  <input
                    type="radio"
                    name="addr"
                    checked={sel === a.id}
                    onChange={() => setPick(a.id)}
                    className="mt-1"
                  />
                  <span>
                    {a.name} · {a.phone}
                    <br />
                    {a.line1}, {a.city}, {a.state} {a.pincode}
                  </span>
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border p-3 text-sm has-[:checked]:border-primary">
                <input
                  type="radio"
                  name="addr"
                  checked={sel === "new"}
                  onChange={() => setPick("new")}
                />{" "}
                Use a different address
              </label>
            </div>
          )}
          {sel === "new" && <AddressForm value={draft} onChange={setDraft} />}
        </Card>
      </div>

      <aside className="md:pt-12">
        <Card className="sticky top-24 space-y-2 text-sm">
          <h2 className="font-medium">Order summary</h2>
          <div className="flex justify-between">
            <span>Item × {qty}</span>
            <Price price={items} />
          </div>
          <div className="flex justify-between">
            <span>Shipping</span>
            <span>
              {l.shippingPaise === null
                ? "To be confirmed"
                : l.shippingPaise === 0
                  ? "Free"
                  : rupees(ship)}
            </span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <span>Total</span>
            <span>{rupees(items + ship)}</span>
          </div>
          {l.shippingPaise === null && (
            <p className="text-xs text-muted-foreground">
              {seller?.storeName} will confirm shipping before dispatch. It is not included above.
            </p>
          )}
          <ErrorNote>{error}</ErrorNote>
          {(() => {
            const have = myCars.filter((c) => c.catalogId === item.id).length;
            const btn = (go: () => void) => (
              <Button className="w-full" disabled={busy} onClick={go}>
                {busy ? "Placing order…" : "Place demo order"}
              </Button>
            );
            return have ? (
              <Confirm
                title="You already have this casting"
                body={
                  have === 1
                    ? "You already have this. Buy another?"
                    : `${have} pieces of ${item.name}${item.brand ? ` from ${item.brand}` : ""} are already in your collection. Buy another?`
                }
                confirm="Yes, buy it"
                onConfirm={place}
                trigger={btn}
              />
            ) : (
              btn(place)
            );
          })()}
          <p className="text-xs text-muted-foreground">
            Demo checkout: no real payment provider is connected, so nothing is charged. Production
            setup is in the README.
          </p>
        </Card>
      </aside>
    </div>
  );
}
