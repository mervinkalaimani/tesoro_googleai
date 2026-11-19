import { Link, useParams } from "@tanstack/react-router";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";

import { Card, Empty, PageTitle, VerifyPill } from "../components/bits";
import { EventCard, ItemCard } from "../components/cards";
import { itemById, itemEvents, itemOffers, sellerOf, type Hit } from "../queries";
import { useMarket } from "../use-market";

export function StorePage() {
  const { sellerId } = useParams({ strict: false }) as { sellerId: string };
  const { s } = useMarket();
  const sp = sellerOf(s, sellerId);
  const hits = useMemo<Hit[]>(() => {
    const ids = [
      ...new Set(
        s.listings
          .filter((l) => l.sellerId === sellerId && l.status === "active" && l.quantity > 0)
          .map((l) => l.itemId),
      ),
    ];
    return ids.flatMap((id) => {
      const item = itemById(s, id);
      const offers = itemOffers(s, id).filter((l) => l.sellerId === sellerId);
      return item && item.review === "approved"
        ? [
            {
              item,
              offers,
              events: itemEvents(s, id),
              from: offers[0]?.pricePaise ?? null,
              score: 0,
            },
          ]
        : [];
    });
  }, [s, sellerId]);
  if (!sp)
    return (
      <Empty
        title="Store not found"
        action={
          <Button asChild>
            <Link to="/market">Home</Link>
          </Button>
        }
      />
    );
  const events = s.events.filter((e) => e.sellerId === sellerId && e.status === "live");

  return (
    <div>
      <Card className="mb-6">
        <PageTitle title={sp.storeName} sub={sp.location} />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <VerifyPill v={sp.verification} />
          <span className="text-muted-foreground">
            {sp.rating
              ? `★ ${sp.rating.toFixed(1)} from ${sp.ratingCount} reviews (demo figures)`
              : "No reviews yet"}
          </span>
        </div>
        {sp.bio && <p className="mt-3 max-w-2xl text-sm">{sp.bio}</p>}
        {sp.verification !== "Verified" && (
          <p className="mt-2 text-xs text-muted-foreground">
            This store has not been verified. Read each listing's condition notes before buying.
          </p>
        )}
      </Card>
      {events.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Active events</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {events.map((e) => (
              <EventCard key={e.id} e={e} s={s} />
            ))}
          </div>
        </section>
      )}
      <h2 className="mb-2 text-lg font-semibold">Listings</h2>
      {hits.length ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {hits.map((h) => (
            <ItemCard key={h.item.id} hit={h} />
          ))}
        </div>
      ) : (
        <Empty title="No active listings" body="This seller has nothing for sale right now." />
      )}
    </div>
  );
}
