import { Link, useParams } from "@tanstack/react-router";

import { useCars } from "@/lib/cars-store";
import { Button } from "@/components/ui/button";

import { Card, CarImage, Empty, Pill, Price, itemLine } from "../components/bits";
import { EventCard, SaveButton, SellerChip } from "../components/cards";
import { rupees } from "../format";
import { itemById, itemEvents, itemOffers, sellerOf } from "../queries";
import { useMarket } from "../use-market";

export function ItemPage() {
  const { itemId } = useParams({ strict: false }) as { itemId: string };
  const { s, me } = useMarket();
  const myCars = useCars();
  const item = itemById(s, itemId);
  if (!item || item.review !== "approved")
    return (
      <Empty
        title="Car not found"
        body="It may have been removed from the catalogue."
        action={
          <Button asChild>
            <Link to="/market/search">Browse cars</Link>
          </Button>
        }
      />
    );

  const offers = itemOffers(s, item.id);
  const events = itemEvents(s, item.id);
  const owned = myCars.filter((c) => c.catalogId === item.id).length;
  const specs: Array<[string, string]> = [
    ["Catalogue code", item.code],
    ["Make", item.make],
    ["Model", item.model],
    ["Series", item.series],
    ["Year", item.year],
    ["Manufacturer", item.manufacturer],
    ["Catalogue MRP", item.mrpPaise ? rupees(item.mrpPaise) : ""],
  ];

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap gap-1.5">
          <Pill tone={item.origin === "Indian" ? "warn" : "muted"}>{item.origin}</Pill>
          <Pill>{item.scale}</Pill>
          {owned > 0 && <Pill tone="good">You own {owned}</Pill>}
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{item.name}</h1>
        <p className="text-sm text-muted-foreground">
          {item.brand} · {itemLine(item)} · {item.colour}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-border">
            <CarImage item={item} />
            <SaveButton itemId={item.id} className="absolute right-3 top-3" />
          </div>
          {events.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold">Live events for this car</h2>
              {events.map((e) => (
                <EventCard key={e.id} e={e} s={s} />
              ))}
            </div>
          )}

          <Card>
            <h2 className="mb-2 text-sm font-semibold">Catalogue details</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {specs
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Origin comes from the catalogue entry, not from where the seller lives. Pictures are
              placeholders until the catalogue provides them.
            </p>
          </Card>
        </div>

        <div className="space-y-4">
          <section aria-labelledby="offers">
            <h2 id="offers" className="mb-2 text-lg font-semibold">
              {offers.length
                ? `${offers.length} seller${offers.length > 1 ? "s" : ""} selling this exact car`
                : "Sellers"}
            </h2>
            {!offers.length ? (
              <Empty
                title="No active offers right now"
                body="Save the car to find it again, or look at similar cars."
                action={
                  <Button asChild variant="outline">
                    <Link to="/market/search" search={{ brand: item.brand, scale: item.scale }}>
                      More {item.brand} {item.scale}
                    </Link>
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-3">
                {offers.map((l, i) => {
                  const sp = sellerOf(s, l.sellerId);
                  const mine = me?.id === l.sellerId;
                  const saving =
                    l.mrpPaise && l.mrpPaise > l.pricePaise ? l.mrpPaise - l.pricePaise : 0;
                  return (
                    <li key={l.id}>
                      <Card className={i === 0 ? "border-primary/50" : ""}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <SellerChip userId={l.sellerId} s={s} />
                            <p className="text-xs text-muted-foreground">
                              {sp?.location} · dispatches in {l.dispatchDays || "<1"} day
                              {l.dispatchDays === 1 ? "" : "s"}
                            </p>
                            <div className="flex flex-wrap gap-1 pt-1">
                              <Pill>{l.condition}</Pill>
                              <Pill>{l.packaging}</Pill>
                              <Pill tone="brand">Fixed price</Pill>
                              {!!l.photos?.length && <Pill>{l.photos.length} seller photos</Pill>}
                              {i === 0 && offers.length > 1 && (
                                <Pill tone="good">Lowest price</Pill>
                              )}
                              {l.originOverride && (
                                <Pill tone="warn">
                                  Seller says {l.originOverride.value} (unverified)
                                </Pill>
                              )}
                            </div>
                            {l.conditionNotes && (
                              <p className="pt-1 text-xs">
                                <b>Condition:</b> {l.conditionNotes}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <Price price={l.pricePaise} mrp={l.mrpPaise} big />
                            {saving > 0 && (
                              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                You save {rupees(saving)}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {l.shippingPaise === null
                                ? "Shipping: calculated later"
                                : l.shippingPaise === 0
                                  ? "Free shipping"
                                  : `+ ${rupees(l.shippingPaise)} shipping`}
                            </p>
                            <p
                              className={
                                "text-xs " +
                                (l.quantity <= 2
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-muted-foreground")
                              }
                            >
                              {l.quantity <= 2
                                ? `Only ${l.quantity} left`
                                : `${l.quantity} available`}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex justify-end">
                          {mine ? (
                            <Pill>Your listing</Pill>
                          ) : (
                            <Button asChild>
                              <Link to="/market/buy/$listingId" params={{ listingId: l.id }}>
                                Buy from {sp?.storeName ?? "seller"}
                              </Link>
                            </Button>
                          )}
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
