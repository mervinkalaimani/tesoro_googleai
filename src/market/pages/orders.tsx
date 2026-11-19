import { Link, useParams } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

import { Card, Confirm, Empty, OrderPill, PageTitle, SignInNeeded } from "../components/bits";
import { SellerChip } from "../components/cards";
import { dateOnly, dateTime, ORDER_LABEL, rupees } from "../format";
import { itemById, sellerOf } from "../queries";
import type { Order, State } from "../types";
import { api, run, useMarket, useMounted } from "../use-market";

export function Timeline({ o }: { o: Order }) {
  const mounted = useMounted();
  return (
    <ol className="space-y-3 border-l border-border pl-4" aria-label="Status history">
      {[...o.history].reverse().map((h, i) => (
        <li key={i} className="relative text-sm">
          <span
            className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-primary"
            aria-hidden
          />
          <p className="font-medium">{ORDER_LABEL[h.status]}</p>
          <p className="text-muted-foreground">{h.note}</p>
          {mounted && <p className="text-xs text-muted-foreground">{dateTime(h.at)}</p>}
        </li>
      ))}
    </ol>
  );
}

export function TrackingBlock({ o }: { o: Order }) {
  if (o.status !== "shipped" && o.status !== "delivered") return null;
  return (
    <div className="rounded-xl bg-muted/60 p-3 text-sm">
      <p className="font-medium">
        {o.status === "shipped" ? "In transit" : "Delivered"} via {o.carrier}
      </p>
      <p>
        Tracking number: <span className="font-mono">{o.trackingNumber}</span>
      </p>
      {o.trackingUrl && (
        <a
          href={o.trackingUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary underline"
        >
          Track on the carrier site ↗
        </a>
      )}
      {o.dispatchDate && (
        <p className="text-muted-foreground">
          Dispatched {dateOnly(Date.parse(o.dispatchDate))}
          {o.eta ? ` · ${o.eta}` : ""}
        </p>
      )}
    </div>
  );
}

export function OrderSummary({ o, s }: { o: Order; s: State }) {
  return (
    <ul className="space-y-1 text-sm">
      {o.lines.map((l, i) => {
        const item = itemById(s, l.itemId);
        return (
          <li key={i} className="flex justify-between gap-3">
            <span>
              {l.qty} × {item?.name ?? l.title}{" "}
              <span className="text-muted-foreground">({item?.scale})</span>
            </span>
            <span className="tabular-nums">{rupees(l.unitPaise * l.qty)}</span>
          </li>
        );
      })}
      <li className="flex justify-between text-muted-foreground">
        <span>Shipping</span>
        <span>{o.shippingPending ? "To be confirmed" : rupees(o.shippingPaise)}</span>
      </li>
      <li className="flex justify-between border-t border-border pt-1 font-semibold">
        <span>Total (demo payment)</span>
        <span>{rupees(o.totalPaise)}</span>
      </li>
    </ul>
  );
}

export function OrdersPage() {
  const { s, me } = useMarket();
  const mounted = useMounted();
  if (!me) return <SignInNeeded what="see your orders" />;
  const mine = s.orders
    .filter((o) => o.buyerId === me.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div>
      <PageTitle title="My orders" sub="Things you bought" />
      {!mine.length ? (
        <Empty
          title="No orders yet"
          action={
            <Button asChild>
              <Link to="/market/search">Browse cars</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {mine.map((o) => (
            <li key={o.id}>
              <Link to="/market/orders/$orderId" params={{ orderId: o.id }} className="block">
                <Card className="hover:border-foreground/30">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {o.lines.map((l) => `${l.qty} × ${itemById(s, l.itemId)?.name}`).join(", ")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Order {o.id} · {sellerOf(s, o.sellerId)?.storeName} ·{" "}
                        {mounted ? dateOnly(o.createdAt) : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <OrderPill status={o.status} />
                      <p className="mt-1 text-sm font-medium">{rupees(o.totalPaise)}</p>
                    </div>
                  </div>
                  {o.status === "shipped" && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {o.carrier} · {o.trackingNumber}
                    </p>
                  )}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OrderPage() {
  const { orderId } = useParams({ strict: false }) as { orderId: string };
  const { s, me } = useMarket();
  if (!me) return <SignInNeeded what="see this order" />;
  const o = s.orders.find((x) => x.id === orderId && x.buyerId === me.id);
  if (!o)
    return (
      <Empty
        title="Order not found"
        body="It doesn't exist, or it isn't yours."
        action={
          <Button asChild variant="outline">
            <Link to="/market/orders">My orders</Link>
          </Button>
        }
      />
    );
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageTitle title={`Order ${o.id}`} actions={<OrderPill status={o.status} />} />
      <Card className="space-y-3">
        <p className="text-sm">
          Sold by <SellerChip userId={o.sellerId} s={s} />
        </p>
        <OrderSummary o={o} s={s} />
        <p className="text-xs text-muted-foreground">
          Payment was simulated in this demo; nothing was charged.
        </p>
      </Card>
      <TrackingBlock o={o} />
      {o.status === "processing" && (
        <p className="rounded-xl bg-muted/60 p-3 text-sm">
          The seller hasn't shipped this yet. You'll see <b>In transit</b> and tracking here as soon
          as they do.
        </p>
      )}
      <Card>
        <h2 className="mb-1 font-medium">Delivering to</h2>
        <p className="text-sm">
          {o.address.name} · {o.address.phone}
          <br />
          {o.address.line1}, {o.address.city}, {o.address.state} {o.address.pincode}
        </p>
      </Card>
      <Card>
        <h2 className="mb-3 font-medium">Progress</h2>
        <Timeline o={o} />
      </Card>
      <div className="flex flex-wrap gap-2">
        {o.status === "shipped" && (
          <Confirm
            trigger={(open) => <Button onClick={open}>I received it</Button>}
            title="Confirm delivery?"
            body="Only confirm once the car is in your hands."
            confirm="Yes, delivered"
            onConfirm={() => run(api.markDelivered(o.id), "Marked delivered")}
          />
        )}
        {o.status === "processing" && (
          <Confirm
            trigger={(open) => (
              <Button variant="outline" onClick={open}>
                Cancel order
              </Button>
            )}
            title="Cancel this order?"
            body="The car goes back to the seller's stock and is removed from your collection. It's allowed only until the seller ships."
            confirm="Cancel order"
            danger
            onConfirm={() => run(api.cancelOrder(o.id, "Cancelled by buyer"), "Order cancelled")}
          />
        )}
        <Button asChild variant="ghost">
          <Link to="/market/orders">All orders</Link>
        </Button>
      </div>
    </div>
  );
}
