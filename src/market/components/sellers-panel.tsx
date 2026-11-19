/** Sellers of one catalogue car, with Buy now. Used by the catalogue pages. */
import { Link } from "@tanstack/react-router";
import { Store } from "lucide-react";

import { Button } from "@/components/ui/button";

import { rupees } from "../format";
import { itemOffers, sellerOf } from "../queries";
import { useMarket, useMarketCatalogue } from "../use-market";
import { Pill, Price, VerifyPill } from "./bits";

/** The live offers for a catalogue car_id. Seeds the demo market the first time it runs. */
export function useCarOffers(carId: string) {
  useMarketCatalogue();
  const { s } = useMarket();
  return { s, offers: carId ? itemOffers(s, carId) : [] };
}

export function SellersList({ carId, compact }: { carId: string; compact?: boolean }) {
  const { s, offers } = useCarOffers(carId);
  if (!offers.length)
    return <p className="text-sm text-muted-foreground">Nobody is selling this car right now.</p>;
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {offers.map((l, i) => {
          const sp = sellerOf(s, l.sellerId);
          return (
            <li key={l.id} className="rounded-xl border border-border bg-card p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-medium">
                    {sp?.storeName ?? "Seller"} {sp && <VerifyPill v={sp.verification} />}
                  </p>
                  <p className="text-xs text-muted-foreground">{sp?.location}</p>
                  <div className="flex flex-wrap gap-1">
                    <Pill>{l.condition}</Pill>
                    <Pill>{l.packaging}</Pill>
                    {i === 0 && offers.length > 1 && <Pill tone="good">Lowest</Pill>}
                  </div>
                </div>
                <div className="text-right">
                  <Price price={l.pricePaise} mrp={l.mrpPaise} />
                  <p className="text-[11px] text-muted-foreground">
                    {l.shippingPaise === null
                      ? "Shipping later"
                      : l.shippingPaise === 0
                        ? "Free shipping"
                        : `+ ${rupees(l.shippingPaise)} shipping`}
                  </p>
                </div>
              </div>
              <Button asChild size="sm" className={compact ? "mt-2 w-full" : "mt-3 w-full"}>
                <Link to="/market/buy/$listingId" params={{ listingId: l.id }}>
                  Buy now
                </Link>
              </Button>
            </li>
          );
        })}
      </ul>
      <Link
        to="/market/item/$itemId"
        params={{ itemId: carId }}
        className="block text-center text-xs text-primary hover:underline"
      >
        Compare all sellers in Viiv Market
      </Link>
    </div>
  );
}

/** A heading + list, for pages with room for a column. */
export function SellersPanel({ carId }: { carId: string }) {
  const { offers } = useCarOffers(carId);
  if (!offers.length) return null;
  return (
    <section aria-label="Sellers" className="rounded-2xl border border-border bg-card/50 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Store className="size-4" aria-hidden /> For sale · {offers.length} seller
        {offers.length > 1 ? "s" : ""}
      </h2>
      <SellersList carId={carId} />
    </section>
  );
}
