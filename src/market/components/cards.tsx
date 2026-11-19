import { Link } from "@tanstack/react-router";
import { Gavel, Heart, Ticket } from "lucide-react";

import { cn } from "@/lib/utils";

import { currentBid, minNextBid, participants } from "../db";
import { rupees, timeLeft } from "../format";
import { itemById, sellerOf, type Hit } from "../queries";
import type { MarketEvent, State } from "../types";
import { api, run, useMarket, useMounted, useNow } from "../use-market";
import { CarImage, itemLine, Pill, Price, VerifyPill } from "./bits";

export function SaveButton({ itemId, className }: { itemId: string; className?: string }) {
  const { me } = useMarket();
  const on = !!me?.saved.includes(itemId);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Remove from saved" : "Save car"}
      onClick={(e) => {
        e.preventDefault();
        run(api.toggleSaved(itemId));
      }}
      className={cn(
        "grid size-9 place-items-center rounded-full bg-background/80 backdrop-blur hover:bg-background",
        className,
      )}
    >
      <Heart className={cn("size-4", on && "fill-primary text-primary")} />
    </button>
  );
}

export function ItemCard({ hit }: { hit: Hit }) {
  const { item, offers, events, from } = hit;
  const best = offers[0];
  return (
    <Link
      to="/market/item/$itemId"
      params={{ itemId: item.id }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative">
        <CarImage item={item} className="transition group-hover:scale-[1.02]" />
        <SaveButton itemId={item.id} className="absolute right-2 top-2" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex flex-wrap gap-1">
          <Pill tone={item.origin === "Indian" ? "warn" : "muted"}>{item.origin}</Pill>
          {best && <Pill>{best.condition}</Pill>}
          {events.map((e) => (
            <Pill key={e.id} tone="brand">
              {e.type === "auction" ? "Auction" : "Raffle"}
            </Pill>
          ))}
        </div>
        <p className="line-clamp-2 text-sm font-medium leading-snug">{item.name}</p>
        <p className="line-clamp-1 text-xs text-muted-foreground">
          {item.make || item.brand} · {itemLine(item)}
        </p>
        <div className="mt-auto flex items-end justify-between pt-1">
          {from !== null ? (
            <div>
              <span className="text-[11px] text-muted-foreground">
                {offers.length > 1 ? "From" : "Price"}
              </span>
              <div>
                <Price price={from} mrp={best?.mrpPaise} />
              </div>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No active offers</span>
          )}
          {offers.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {offers.length} seller{offers.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function EventCard({ e, s }: { e: MarketEvent; s: State }) {
  const now = useNow(30_000);
  const mounted = useMounted();
  const item = itemById(s, e.itemId)!;
  const seller = sellerOf(s, e.sellerId);
  const Icon = e.type === "auction" ? Gavel : Ticket;
  return (
    <Link
      to="/market/event/$eventId"
      params={{ eventId: e.id }}
      className="flex gap-3 rounded-2xl border border-border bg-card p-3 hover:border-foreground/30"
    >
      <CarImage item={item} className="w-28 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1">
          <Pill tone="brand">
            <Icon className="size-3" aria-hidden /> {e.type === "auction" ? "Auction" : "Raffle"}
          </Pill>
          <Pill tone={e.status === "live" ? "good" : "muted"}>{e.status}</Pill>
        </div>
        <p className="line-clamp-2 text-sm font-medium">{e.title}</p>
        <p className="text-xs text-muted-foreground">
          {seller?.storeName} · {participants(e)} taking part
        </p>
        <p className="text-sm">
          {e.type === "auction" ? (
            e.bids.length ? (
              <>
                High bid <b>{rupees(currentBid(e))}</b>
              </>
            ) : (
              <>
                Starts at <b>{rupees(minNextBid(e))}</b>
              </>
            )
          ) : (
            <>Free entry</>
          )}
          {e.status === "live" && mounted && (
            <span className="ml-2 text-xs text-muted-foreground">
              ends in {timeLeft(e.endsAt, now)}
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}

export function SellerChip({ userId, s }: { userId: string; s: State }) {
  const sp = sellerOf(s, userId);
  if (!sp) return <span>Unknown seller</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Link
        to="/market/store/$sellerId"
        params={{ sellerId: userId }}
        className="font-medium hover:underline"
      >
        {sp.storeName}
      </Link>
      <VerifyPill v={sp.verification} />
      <span className="text-xs text-muted-foreground">
        {sp.rating ? `★ ${sp.rating.toFixed(1)} (${sp.ratingCount})` : "No ratings yet"}
      </span>
    </span>
  );
}
