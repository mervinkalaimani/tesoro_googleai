import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";

import { Empty, Pill, VerifyPill } from "../components/bits";
import { EventCard, ItemCard } from "../components/cards";
import { liveEvents, NO_FILTERS, search, sellerOf } from "../queries";
import { useMarket } from "../use-market";

function Row({ title, to, children }: { title: string; to?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {to && (
          <Link to={to} className="text-sm text-primary hover:underline">
            See all
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function HomePage() {
  const { s, me } = useMarket();
  const hits = useMemo(() => search(s, NO_FILTERS, "relevance"), [s]);
  const featured = hits.filter((h) => h.offers.length > 1).slice(0, 4);
  const recent = useMemo(
    () => search(s, { ...NO_FILTERS, stock: "in" }, "newest").slice(0, 8),
    [s],
  );
  const castings = useMemo(
    () => hits.filter((h) => h.offers.length && h.item.imageUrl).slice(0, 8),
    [hits],
  );
  const events = liveEvents(s).slice(0, 4);
  const sellers = [...s.sellers].sort(
    (a, b) => Number(b.verification === "Verified") - Number(a.verification === "Verified"),
  );

  if (!s.items.length)
    return (
      <Empty
        title="Loading the Viiv catalogue…"
        body="Cars and sellers appear as soon as it arrives."
      />
    );

  return (
    <div>
      <section className="rounded-3xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-6 md:p-10">
        <Pill tone="brand">Collectible model cars</Pill>
        <h1 className="mt-3 max-w-xl text-3xl font-bold tracking-tight md:text-4xl">
          Find the exact casting. Pick the seller you trust.
        </h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Every offer is tied to one catalogue car, so a 1:64 Premium and a 1:64 Mainline are never
          mixed up. Buy it and it's added to your Viiv cars.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link to="/market/search">Browse all cars</Link>
          </Button>
          {!me?.sellerMode && (
            <Button asChild size="lg" variant="outline">
              <Link to="/market/sell/setup">Become a seller</Link>
            </Button>
          )}
        </div>
      </section>
      <Row title="Featured sellers">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          {sellers.map((sp) => (
            <Link
              key={sp.userId}
              to="/market/store/$sellerId"
              params={{ sellerId: sp.userId }}
              className="rounded-2xl border border-border bg-card p-4 hover:border-foreground/30"
            >
              <p className="font-medium">{sp.storeName}</p>
              <p className="text-xs text-muted-foreground">{sp.location}</p>
              <div className="mt-2">
                <VerifyPill v={sp.verification} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {s.listings.filter((l) => l.sellerId === sp.userId && l.status === "active").length}{" "}
                active listings
              </p>
            </Link>
          ))}
        </div>
      </Row>

      {castings.length > 0 && (
        <Row title="Featured castings" to="/market/search">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {castings.map((h) => (
              <ItemCard key={h.item.id} hit={h} />
            ))}
          </div>
        </Row>
      )}

      {events.length > 0 && (
        <Row title="Auctions & raffles closing soon" to="/market/events">
          <div className="grid gap-3 md:grid-cols-2">
            {events.map((e) => (
              <EventCard key={e.id} e={e} s={s} />
            ))}
          </div>
        </Row>
      )}

      <Row title="Compare sellers" to="/market/search">
        {featured.length ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {featured.map((h) => (
              <ItemCard key={h.item.id} hit={h} />
            ))}
          </div>
        ) : (
          <Empty title="No cars with several sellers yet" />
        )}
      </Row>

      <Row title="Recently listed" to="/market/search">
        {recent.length ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {recent.map((h) => (
              <ItemCard key={h.item.id} hit={h} />
            ))}
          </div>
        ) : (
          <Empty
            title="Nothing listed yet"
            body="Sellers will appear here as soon as they publish."
          />
        )}
      </Row>

      <p className="text-xs text-muted-foreground">
        {sellerOf(s, "u_garage64") ? "Seeded demo data. " : ""}Catalogue entries come from the Viiv
        catalogue; pictures are placeholders until it ships images.
      </p>
    </div>
  );
}
