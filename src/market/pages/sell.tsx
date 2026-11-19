import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Card,
  Confirm,
  Empty,
  ErrorNote,
  Field,
  inputCls,
  OrderPill,
  PageTitle,
  Pill,
  Price,
  Sel,
  SignInNeeded,
  VerifyPill,
} from "../components/bits";
import { Timeline, TrackingBlock } from "./orders";
import { dateOnly, rupees } from "../format";
import { itemById } from "../queries";
import type { Listing, Order, SellerProfile } from "../types";
import { api, run, useMarket, useMounted } from "../use-market";

/** Everything under /market/sell needs a signed-in user with a seller profile. */
export function SellerGate({
  children,
}: {
  children: (store: SellerProfile, userId: string) => ReactNode;
}) {
  const { s, me } = useMarket();
  if (!me) return <SignInNeeded what="sell" />;
  const store = s.sellers.find((x) => x.userId === me.id);
  if (!store)
    return (
      <Empty
        title="Set up your store first"
        body="One account, two hats: add a store profile and the seller tools appear."
        action={
          <Button asChild>
            <Link to="/market/sell/setup">Become a seller</Link>
          </Button>
        }
      />
    );
  return <>{children(store, me.id)}</>;
}

export function SetupPage() {
  const { s, me } = useMarket();
  const navigate = useNavigate();
  const existing = me && s.sellers.find((x) => x.userId === me.id);
  const [f, setF] = useState({
    storeName: existing?.storeName ?? "",
    location: existing?.location ?? "",
    bio: existing?.bio ?? "",
    contact: existing?.contact ?? "in-app",
    payoutNote: existing?.payoutNote ?? "",
  });
  const [error, setError] = useState("");
  if (!me) return <SignInNeeded what="become a seller" />;
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  return (
    <div className="mx-auto max-w-xl">
      <PageTitle
        title={existing ? "Edit your store" : "Become a seller"}
        sub="Same account. Your cars and orders stay exactly as they are."
      />
      <Card>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const r = existing ? api.updateSeller(f) : api.becomeSeller(f as never);
            if (r.ok) {
              run(r, existing ? "Store saved" : "You're a seller");
              void navigate({ to: "/market/sell" });
            } else setError(r.error);
          }}
        >
          <Field label="Store name">
            <input
              className={inputCls}
              value={f.storeName}
              onChange={(e) => set("storeName", e.target.value)}
            />
          </Field>
          <Field
            label="Location"
            hint="City, state. Shown to buyers; it is not treated as the car's country of origin."
          >
            <input
              className={inputCls}
              value={f.location}
              onChange={(e) => set("location", e.target.value)}
            />
          </Field>
          <Field label="About your store">
            <textarea
              rows={3}
              className={inputCls + " h-auto py-2"}
              value={f.bio}
              onChange={(e) => set("bio", e.target.value)}
            />
          </Field>
          <Field label="Contact preference">
            <Sel
              label="Contact"
              value={f.contact}
              onChange={(v) => set("contact", v)}
              options={["in-app", "email", "phone"]}
            />
          </Field>
          <Field
            label="Payout details"
            hint="Placeholder only. No payout provider is connected in the demo."
          >
            <input
              className={inputCls}
              value={f.payoutNote}
              onChange={(e) => set("payoutNote", e.target.value)}
              placeholder="e.g. UPI id (not used)"
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            New stores start <b>Unverified</b>. Verification is a separate review that does not
            happen automatically.
          </p>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit">{existing ? "Save store" : "Create my store"}</Button>
        </form>
      </Card>
    </div>
  );
}

export function DashboardPage() {
  const { s } = useMarket();
  return (
    <SellerGate>
      {(store, uid) => {
        const listings = s.listings.filter((l) => l.sellerId === uid);
        const orders = s.orders.filter((o) => o.sellerId === uid);
        const events = s.events.filter((e) => e.sellerId === uid);
        const cards: Array<[string, number, string]> = [
          [
            "Active listings",
            listings.filter((l) => l.status === "active").length,
            "/market/sell/listings",
          ],
          [
            "Awaiting fulfilment",
            orders.filter((o) => o.status === "processing").length,
            "/market/sell/orders",
          ],
          [
            "In transit",
            orders.filter((o) => o.status === "shipped").length,
            "/market/sell/orders",
          ],
          ["Live events", events.filter((e) => e.status === "live").length, "/market/sell/events"],
        ];
        const low = listings.filter((l) => l.status === "active" && l.quantity <= 1);
        return (
          <div>
            <PageTitle
              title={store.storeName}
              sub={store.location}
              actions={
                <>
                  <VerifyPill v={store.verification} />
                  <Button asChild size="sm">
                    <Link to="/market/sell/listing/$listingId" params={{ listingId: "new" }}>
                      New listing
                    </Link>
                  </Button>
                </>
              }
            />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {cards.map(([label, n, to]) => (
                <Link key={label} to={to}>
                  <Card className="hover:border-foreground/30">
                    <p className="text-3xl font-semibold tabular-nums">{n}</p>
                    <p className="text-sm text-muted-foreground">{label}</p>
                  </Card>
                </Link>
              ))}
            </div>
            {orders.some((o) => o.status === "processing") && (
              <p className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                {orders.filter((o) => o.status === "processing").length} order(s) are waiting for
                you to ship.{" "}
                <Link className="underline" to="/market/sell/orders">
                  Open the queue
                </Link>
              </p>
            )}
            {low.length > 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                Low stock: {low.map((l) => itemById(s, l.itemId)?.name).join(", ")}
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/market/sell/events">Auctions & raffles</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/market/store/$sellerId" params={{ sellerId: uid }}>
                  View public store
                </Link>
              </Button>
            </div>
          </div>
        );
      }}
    </SellerGate>
  );
}

const STATUS_TONE = { draft: "muted", active: "good", paused: "warn", sold_out: "bad" } as const;

export function ListingsPage() {
  const { s } = useMarket();
  const [tab, setTab] = useState<"all" | Listing["status"]>("all");
  return (
    <SellerGate>
      {(_store, uid) => {
        const all = s.listings.filter((l) => l.sellerId === uid);
        const rows = all
          .filter((l) => tab === "all" || l.status === tab)
          .sort((a, b) => b.updatedAt - a.updatedAt);
        return (
          <div>
            <PageTitle
              title="Listings"
              sub="Your offers on catalogue cars"
              actions={
                <Button asChild>
                  <Link to="/market/sell/listing/$listingId" params={{ listingId: "new" }}>
                    New listing
                  </Link>
                </Button>
              }
            />
            <div
              className="mb-3 flex flex-wrap gap-1.5"
              role="tablist"
              aria-label="Filter by status"
            >
              {(["all", "active", "draft", "paused", "sold_out"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={
                    "rounded-full border px-3 py-1 text-sm " +
                    (tab === t
                      ? "border-primary bg-primary/15"
                      : "border-border text-muted-foreground")
                  }
                >
                  {t === "all" ? "All" : t.replace("_", " ")} (
                  {t === "all" ? all.length : all.filter((l) => l.status === t).length})
                </button>
              ))}
            </div>
            {!rows.length ? (
              <Empty
                title="Nothing here"
                body="Pick a catalogue car and set your price, stock and condition."
                action={
                  <Button asChild>
                    <Link to="/market/sell/listing/$listingId" params={{ listingId: "new" }}>
                      Create a listing
                    </Link>
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-2">
                {rows.map((l) => {
                  const item = itemById(s, l.itemId);
                  return (
                    <li key={l.id}>
                      <Card className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{l.title || item?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item?.scale} · {item?.assortment} · {l.condition}, {l.packaging}
                            {l.sku ? ` · SKU ${l.sku}` : ""}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Pill tone={STATUS_TONE[l.status]}>{l.status.replace("_", " ")}</Pill>
                            <Pill>{l.quantity} in stock</Pill>
                            <Pill>{l.sold} sold</Pill>
                            {item?.review === "pending" && (
                              <Pill tone="warn">Catalogue entry pending review</Pill>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Price price={l.pricePaise} mrp={l.mrpPaise} />
                          <Button asChild size="sm" variant="outline">
                            <Link to="/market/sell/listing/$listingId" params={{ listingId: l.id }}>
                              Edit
                            </Link>
                          </Button>
                          {l.status === "active" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => run(api.setListingStatus(l.id, "paused"), "Paused")}
                            >
                              Pause
                            </Button>
                          )}
                          {l.status === "paused" && (
                            <Button
                              size="sm"
                              onClick={() =>
                                run(api.setListingStatus(l.id, "active"), "Live again")
                              }
                            >
                              Resume
                            </Button>
                          )}
                          {l.status === "draft" && (
                            <Confirm
                              trigger={(open) => (
                                <Button size="sm" variant="ghost" onClick={open}>
                                  Delete
                                </Button>
                              )}
                              title="Delete this draft?"
                              body="The draft is removed permanently. Live listings can't be deleted, only paused."
                              confirm="Delete draft"
                              danger
                              onConfirm={() => run(api.deleteListing(l.id), "Draft deleted")}
                            />
                          )}
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      }}
    </SellerGate>
  );
}

const CARRIERS = [
  "Delhivery",
  "India Post",
  "DTDC",
  "Blue Dart",
  "Ecom Express",
  "Xpressbees",
  "Other",
];

function ShipDialog({ o, open, onClose }: { o: Order; open: boolean; onClose: () => void }) {
  const [f, setF] = useState(() => ({
    carrier: o.carrier || "Delhivery",
    trackingNumber: o.trackingNumber,
    trackingUrl: o.trackingUrl,
    dispatchDate: o.dispatchDate || new Date().toISOString().slice(0, 10),
    eta: o.eta,
  }));
  const [review, setReview] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  const editing = o.status === "shipped";
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setReview(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit tracking" : "Mark as shipped"} · {o.id}
          </DialogTitle>
          <DialogDescription>
            {o.address.name}, {o.address.city} {o.address.pincode}
          </DialogDescription>
        </DialogHeader>
        {!review ? (
          <div className="space-y-3">
            <Field label="Carrier">
              <Sel
                label="Carrier"
                value={CARRIERS.includes(f.carrier) ? f.carrier : "Other"}
                onChange={(v) => set("carrier", v === "Other" ? "" : v)}
                options={CARRIERS}
              />
            </Field>
            {!CARRIERS.slice(0, -1).includes(f.carrier) && (
              <Field label="Carrier name">
                <input
                  className={inputCls}
                  value={f.carrier}
                  onChange={(e) => set("carrier", e.target.value)}
                />
              </Field>
            )}
            <Field label="Tracking number">
              <input
                className={inputCls}
                value={f.trackingNumber}
                onChange={(e) => set("trackingNumber", e.target.value)}
              />
            </Field>
            <Field label="Tracking link (optional)">
              <input
                type="url"
                className={inputCls}
                value={f.trackingUrl}
                onChange={(e) => set("trackingUrl", e.target.value)}
                placeholder="https://…"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dispatch date">
                <input
                  type="date"
                  className={inputCls}
                  value={f.dispatchDate}
                  onChange={(e) => set("dispatchDate", e.target.value)}
                />
              </Field>
              <Field label="Delivery estimate">
                <input
                  className={inputCls}
                  value={f.eta}
                  onChange={(e) => set("eta", e.target.value)}
                  placeholder="2-3 days"
                />
              </Field>
            </div>
            <ErrorNote>{error}</ErrorNote>
            <Button
              className="w-full"
              onClick={() => {
                if (!f.carrier.trim() || !f.trackingNumber.trim())
                  return setError("Carrier and tracking number are required.");
                setError("");
                setReview(true);
              }}
            >
              Review
            </Button>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p>
              {editing ? (
                "The buyer will see the updated tracking."
              ) : (
                <>
                  This tells the buyer their order is <b>In transit</b>. It can't be moved back to
                  Processing.
                </>
              )}
            </p>
            <p className="rounded-lg bg-muted/60 p-3">
              {f.carrier} · <span className="font-mono">{f.trackingNumber}</span>
              <br />
              Dispatched {f.dispatchDate}
              {f.eta ? ` · ${f.eta}` : ""}
            </p>
            <ErrorNote>{error}</ErrorNote>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setReview(false)}>
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  const r = api.markShipped(o.id, f);
                  if (r.ok) {
                    run(r, editing ? "Tracking updated" : "Marked as shipped");
                    onClose();
                  } else {
                    setError(r.error);
                    setReview(false);
                  }
                }}
              >
                {editing ? "Save tracking" : "Confirm: mark as shipped"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SellOrdersPage() {
  const { s } = useMarket();
  const mounted = useMounted();
  const [tab, setTab] = useState<Order["status"]>("processing");
  const [shipping, setShipping] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <SellerGate>
      {(_store, uid) => {
        const all = s.orders
          .filter((o) => o.sellerId === uid)
          .sort((a, b) => b.createdAt - a.createdAt);
        const rows = all.filter((o) => o.status === tab);
        const labels = {
          processing: "To ship",
          shipped: "In transit",
          delivered: "Delivered",
          cancelled: "Cancelled",
        } as const;
        return (
          <div>
            <PageTitle title="Orders to fulfil" sub="Orders placed with your store" />
            <div className="mb-3 flex flex-wrap gap-1.5" role="tablist">
              {(Object.keys(labels) as Order["status"][]).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={
                    "rounded-full border px-3 py-1 text-sm " +
                    (tab === t
                      ? "border-primary bg-primary/15"
                      : "border-border text-muted-foreground")
                  }
                >
                  {labels[t]} ({all.filter((o) => o.status === t).length})
                </button>
              ))}
            </div>
            {!rows.length ? (
              <Empty title={`No ${labels[tab].toLowerCase()} orders`} />
            ) : (
              <ul className="space-y-3">
                {rows.map((o) => (
                  <li key={o.id}>
                    <Card className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">
                            Order {o.id} ·{" "}
                            {o.lines
                              .map((l) => `${l.qty} × ${itemById(s, l.itemId)?.name}`)
                              .join(", ")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {mounted ? dateOnly(o.createdAt) : ""} · {rupees(o.totalPaise)} (demo
                            payment, already settled with the buyer; you can't change it)
                          </p>
                        </div>
                        <OrderPill status={o.status} />
                      </div>
                      <p className="text-sm">
                        Ship to: {o.address.name}, {o.address.phone}
                        <br />
                        {o.address.line1}, {o.address.city}, {o.address.state} {o.address.pincode}
                      </p>
                      {o.shippingPending && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          Shipping was "calculated later" for this listing; confirm it with the
                          buyer.
                        </p>
                      )}
                      <TrackingBlock o={o} />
                      <div className="flex flex-wrap gap-2">
                        {o.status === "processing" && (
                          <Button onClick={() => setShipping(o.id)}>Mark as shipped</Button>
                        )}
                        {o.status === "shipped" && (
                          <Button variant="outline" onClick={() => setShipping(o.id)}>
                            Edit tracking
                          </Button>
                        )}
                        {o.status === "processing" && (
                          <Confirm
                            trigger={(op) => (
                              <Button variant="ghost" onClick={op}>
                                Cancel order
                              </Button>
                            )}
                            title="Cancel this order?"
                            body="Stock goes back on your listing and the car is removed from the buyer's cars. The buyer is notified."
                            confirm="Cancel order"
                            danger
                            onConfirm={() =>
                              run(api.cancelOrder(o.id, "Cancelled by seller"), "Order cancelled")
                            }
                          />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setOpen(open === o.id ? null : o.id)}
                        >
                          {open === o.id ? "Hide history" : "Status history"}
                        </Button>
                      </div>
                      {open === o.id && <Timeline o={o} />}
                      {shipping === o.id && (
                        <ShipDialog o={o} open onClose={() => setShipping(null)} />
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      }}
    </SellerGate>
  );
}
