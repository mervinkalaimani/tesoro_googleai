import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";

import { IosGroup, IosInput, IosPicker, IosRow, IosTextArea } from "@/components/ios-field";
import { Button } from "@/components/ui/button";

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
  Sel,
  itemLine,
} from "../components/bits";
import { EventCard, SellerChip } from "../components/cards";
import { currentBid, minNextBid, participants } from "../db";
import { dateTime, rupees, timeLeft, toPaise } from "../format";
import { approved, itemById, liveEvents } from "../queries";
import type { Condition, EventType, MarketEvent, Packaging } from "../types";
import { api, run, useMarket, useMounted, useNow } from "../use-market";
import { PhotoEditor, PhotoGallery } from "../components/photos";
import { BundleEditor } from "./listing-form";
import { SellerGate } from "./sell";

export function EventsPage() {
  const { s } = useMarket();
  const live = liveEvents(s);
  const done = s.events
    .filter((e) => e.status === "closed")
    .sort((a, b) => b.endsAt - a.endsAt)
    .slice(0, 6);
  return (
    <div>
      <PageTitle
        title="Auctions & raffles"
        sub="Highest bid wins an auction; a raffle is a free-entry random draw. They're separate on purpose."
      />
      {live.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {live.map((e) => (
            <EventCard key={e.id} e={e} s={s} />
          ))}
        </div>
      ) : (
        <Empty title="Nothing live right now" body="Sellers publish auctions and raffles here." />
      )}
      {done.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-lg font-semibold">Recently closed</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {done.map((e) => (
              <EventCard key={e.id} e={e} s={s} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function EventPage() {
  const { eventId } = useParams({ strict: false }) as { eventId: string };
  const { s, me } = useMarket();
  const now = useNow(1000);
  const mounted = useMounted();
  const [bid, setBid] = useState("");
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const navigate = useNavigate();
  const e = s.events.find((x) => x.id === eventId);
  const item = e && itemById(s, e.itemId);
  if (!e || !item || (e.status === "draft" && e.sellerId !== me?.id))
    return (
      <Empty
        title="Event not found"
        action={
          <Button asChild>
            <Link to="/market/events">All events</Link>
          </Button>
        }
      />
    );

  const isSeller = me?.id === e.sellerId;
  const open = e.status === "live" && (now === 0 || now < e.endsAt);
  // Bidders are shown as numbers, not names: enough to follow the contest, no one is exposed.
  const alias = (uid: string) =>
    uid === me?.id
      ? "You"
      : `Bidder ${[...new Set([...e.bids.map((b) => b.userId), ...e.entries.map((x) => x.userId)])].indexOf(uid) + 1}`;
  const mine = e.entries.filter((x) => x.userId === me?.id).length;
  const hasPeople = e.bids.length > 0 || e.entries.length > 0;
  const holdsTop = e.bids.at(-1)?.userId === me?.id;
  const min = minNextBid(e);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageTitle
        title={e.title}
        actions={
          <>
            <Pill tone="brand">{e.type === "auction" ? "Auction" : "Raffle"}</Pill>
            <Pill tone={e.status === "live" ? "good" : e.status === "cancelled" ? "bad" : "muted"}>
              {e.status}
            </Pill>
          </>
        }
      />
      <PhotoGallery
        targetId={e.id}
        photos={e.photos ?? []}
        sellerId={e.sellerId}
        fallback={<CarImage item={item} />}
      />
      <Card className="space-y-2 text-sm">
        {e.bundle ? (
          <div>
            <p>Combo box · {e.bundle.reduce((n, b) => n + b.qty, 0)} cars</p>
            <ul className="text-xs text-muted-foreground">
              {e.bundle.map((b) => (
                <li key={b.itemId}>
                  {b.qty} × {itemById(s, b.itemId)?.name ?? "Car"}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p>
            Car:{" "}
            <Link
              className="font-medium hover:underline"
              to="/market/item/$itemId"
              params={{ itemId: item.id }}
            >
              {item.name}
            </Link>{" "}
            <span className="text-muted-foreground">({itemLine(item)})</span>
          </p>
        )}
        <p>
          Seller: <SellerChip userId={e.sellerId} s={s} />
        </p>
        <p>
          Condition: {e.condition}, {e.packaging}
        </p>
        <p>
          Closes: {mounted ? dateTime(e.endsAt) : ""}{" "}
          {open && mounted && <b>({timeLeft(e.endsAt, now)} left)</b>}
        </p>
        <p>{participants(e)} taking part</p>
      </Card>

      {(e.status === "closed" || e.status === "cancelled") && (
        <Card className="space-y-1 border-primary/50">
          <h2 className="font-medium">
            {e.status === "cancelled"
              ? "Cancelled"
              : e.winnerId
                ? e.winnerId === me?.id
                  ? "You won 🎉"
                  : `Winner: ${alias(e.winnerId)}`
                : "Closed without a winner"}
          </h2>
          <p className="text-sm">{e.resultNote}</p>
          {e.draw && (
            <p className="text-xs text-muted-foreground">
              Draw record: seed <span className="font-mono">{e.draw.seed}</span> → position{" "}
              {e.draw.index + 1} of {e.draw.entryCount}. Reproducible, but this demo draw is not an
              audited lottery.
            </p>
          )}
        </Card>
      )}

      {e.type === "auction" ? (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">
                {e.bids.length ? "Current high bid" : "Starting bid"}
              </p>
              <p className="text-3xl font-semibold tabular-nums">
                {rupees(e.bids.length ? currentBid(e) : e.startsPaise)}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Min next bid <b>{rupees(min)}</b>
              {e.reservePaise !== null && (
                <> · {currentBid(e) >= e.reservePaise ? "reserve met" : "reserve not met"}</>
              )}
            </p>
          </div>
          {open &&
            !isSeller &&
            (me ? (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  const r = api.placeBid(e.id, toPaise(bid) ?? NaN);
                  if (r.ok) {
                    run(r, "Bid placed");
                    setBid("");
                    setError("");
                  } else setError(r.error);
                }}
              >
                <Field label="Your bid (₹)" className="w-40">
                  <input
                    inputMode="decimal"
                    className={inputCls}
                    value={bid}
                    onChange={(x) => setBid(x.target.value)}
                    placeholder={String(min / 100)}
                  />
                </Field>
                <Button type="submit" disabled={holdsTop}>
                  {holdsTop ? "You hold the top bid" : "Place bid"}
                </Button>
              </form>
            ) : (
              <Button asChild>
                <Link to="/login">Sign in to bid</Link>
              </Button>
            ))}
          {isSeller && open && (
            <p className="text-sm text-muted-foreground">You can't bid on your own auction.</p>
          )}
          <ErrorNote>{error}</ErrorNote>
          <p className="text-xs text-muted-foreground">
            Demo: bids are simulated commitments. No payment is taken and no real winner is charged.
          </p>
          <div>
            <h3 className="mb-1 text-sm font-medium">Bid history</h3>
            {!e.bids.length ? (
              <p className="text-sm text-muted-foreground">No bids yet.</p>
            ) : (
              <ol className="divide-y divide-border text-sm">
                {[...e.bids].reverse().map((b) => (
                  <li key={b.id} className="flex justify-between py-1.5">
                    <span>{alias(b.userId)}</span>
                    <span className="tabular-nums">{rupees(b.amountPaise)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Card>
      ) : (
        <Card className="space-y-3">
          <p className="text-sm">
            {e.entries.length} entr{e.entries.length === 1 ? "y" : "ies"} · up to{" "}
            {e.maxEntriesPerUser} per person · free
          </p>
          {open &&
            !isSeller &&
            (me ? (
              <Button
                disabled={mine >= e.maxEntriesPerUser}
                onClick={() => {
                  const r = api.enterRaffle(e.id);
                  if (r.ok) {
                    run(r, "You're in the draw");
                    setError("");
                  } else setError(r.error);
                }}
              >
                {mine >= e.maxEntriesPerUser ? "You're in the draw ✓" : "Enter the draw"}
              </Button>
            ) : (
              <Button asChild>
                <Link to="/login">Sign in to enter</Link>
              </Button>
            ))}
          {isSeller && open && (
            <p className="text-sm text-muted-foreground">Sellers can't enter their own raffle.</p>
          )}
          <ErrorNote>{error}</ErrorNote>
        </Card>
      )}

      <Card>
        <h2 className="mb-1 font-medium">Rules</h2>
        <p className="whitespace-pre-line text-sm">{e.rules}</p>
        {e.type === "auction" && e.extendMinutes > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Anti-sniping: a bid in the last {e.extendMinutes} min extends the close by{" "}
            {e.extendMinutes} min.
          </p>
        )}
      </Card>

      {isSeller && (
        <Card className="space-y-3">
          <h2 className="font-medium">Seller controls</h2>
          <div className="flex flex-wrap gap-2">
            {(e.status === "draft" || e.status === "paused") && (
              <Button onClick={() => run(api.setEventStatus(e.id, "live"), "Event is live")}>
                {e.status === "draft" ? "Publish" : "Resume"}
              </Button>
            )}
            {e.status === "live" && (
              <Button
                variant="outline"
                onClick={() => run(api.setEventStatus(e.id, "paused"), "Paused")}
              >
                Pause
              </Button>
            )}
            {e.status === "live" && (
              <Confirm
                trigger={(o) => (
                  <Button variant="outline" onClick={o}>
                    Close now
                  </Button>
                )}
                title="Close this event now?"
                body={
                  e.type === "auction"
                    ? "The current top bid wins if the reserve is met."
                    : "A winner is drawn immediately from current entries."
                }
                confirm="Close and pick winner"
                onConfirm={() => run(api.closeEventNow(e.id), "Closed")}
              />
            )}
            {["draft", "paused"].includes(e.status) && !hasPeople && (
              <Button variant="outline" asChild>
                <Link to="/seller/event/$eventId" params={{ eventId: e.id }}>
                  Edit
                </Link>
              </Button>
            )}
            {(e.status === "cancelled" || e.status === "closed") && (
              <Button
                variant="outline"
                onClick={() => {
                  const r = api.restartEvent(e.id);
                  if (r.ok) {
                    run(r, "Draft copy created");
                    void navigate({
                      to: "/seller/event/$eventId",
                      params: { eventId: r.data.id },
                    });
                  }
                }}
              >
                Restart as new draft
              </Button>
            )}
          </div>
          {hasPeople && ["live", "paused"].includes(e.status) && (
            <p className="text-xs text-muted-foreground">
              Terms are locked because people have taken part. To change them, cancel and restart a
              copy.
            </p>
          )}
          {["draft", "live", "paused"].includes(e.status) && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Reason to cancel" className="min-w-52 flex-1">
                <input
                  className={inputCls}
                  value={reason}
                  onChange={(x) => setReason(x.target.value)}
                />
              </Field>
              <Confirm
                trigger={(o) => (
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (reason.trim().length < 3) setError("Say why you are cancelling.");
                      else o();
                    }}
                  >
                    Cancel event
                  </Button>
                )}
                title="Cancel this event?"
                body="Participants are notified with your reason. This can't be undone; you can restart a copy."
                confirm="Cancel event"
                danger
                onConfirm={() => run(api.cancelEvent(e.id, reason), "Cancelled")}
              />
            </div>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Audit history</summary>
            <ul className="mt-2 space-y-1 text-xs">
              {e.audit.map((a, i) => (
                <li key={i}>
                  {mounted ? dateTime(a.at) : ""} ·{" "}
                  {a.by === "system" ? "System" : a.by === me?.id ? "You" : "Seller"}: {a.note}
                </li>
              ))}
            </ul>
          </details>
        </Card>
      )}
    </div>
  );
}

export function SellEventsPage() {
  const { s } = useMarket();
  return (
    <SellerGate>
      {(_st, uid) => {
        const mine = s.events
          .filter((e) => e.sellerId === uid)
          .sort((a, b) => b.createdAt - a.createdAt);
        return (
          <div>
            <PageTitle
              title="Auctions & raffles"
              actions={
                <Button asChild>
                  <Link to="/seller/event/$eventId" params={{ eventId: "new" }}>
                    New event
                  </Link>
                </Button>
              }
            />
            {!mine.length ? (
              <Empty
                title="No events yet"
                body="Run an auction (highest bid wins) or a raffle (free-entry draw) for a catalogue car."
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {mine.map((e) => (
                  <EventCard key={e.id} e={e} s={s} />
                ))}
              </div>
            )}
          </div>
        );
      }}
    </SellerGate>
  );
}

const localInput = (ms: number) =>
  new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export function EventFormPage() {
  const { eventId } = useParams({ strict: false }) as { eventId: string };
  const { s } = useMarket();
  const navigate = useNavigate();
  const existing = eventId !== "new" ? s.events.find((e) => e.id === eventId) : undefined;
  const [q, setQ] = useState("");
  const [bundle, setBundle] = useState<{ itemId: string; qty: number }[]>(
    existing?.bundle ?? (existing ? [{ itemId: existing.itemId, qty: 1 }] : []),
  );
  const [photos, setPhotos] = useState<string[]>(existing?.photos ?? []);
  const total = bundle.reduce((n, b) => n + b.qty, 0);
  const itemId = bundle[0]?.itemId ?? "";
  const [type, setType] = useState<EventType>(existing?.type ?? "auction");
  const [f, setF] = useState(() => ({
    title: existing?.title ?? "",
    rules: existing?.rules ?? "",
    condition: (existing?.condition ?? "New") as Condition,
    packaging: (existing?.packaging ?? "Sealed") as Packaging,
    start: existing ? String(existing.startsPaise / 100) : "500",
    inc: existing ? String(existing.minIncrementPaise / 100) : "50",
    reserve: existing?.reservePaise ? String(existing.reservePaise / 100) : "",
    extend: String(existing?.extendMinutes ?? 2),
    max: String(existing?.maxEntriesPerUser ?? 1),
    ends: localInput(existing?.endsAt ?? Date.now() + 3 * 86_400_000),
  }));
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  const template =
    type === "auction"
      ? "Highest bid at close wins. Each bid must beat the current bid by the minimum raise. If the reserve is not met there is no winner. If the winner does not pay within 48 hours the seller may offer the car to the next highest bidder."
      : "Free entry, one per account. One winner is drawn at random when the raffle closes and the draw is recorded on this page. The seller contacts the winner to arrange shipping.";

  return (
    <SellerGate>
      {(_st, uid) => {
        if (existing && existing.sellerId !== uid) return <ErrorNote>Event not found.</ErrorNote>;
        const submit = (publish: boolean) => {
          const r = api.saveEvent({
            id: existing?.id,
            type,
            itemId,
            bundle: total > 1 ? bundle : undefined,
            title: f.title,
            rules: f.rules,
            condition: f.condition,
            packaging: f.packaging,
            startsPaise: toPaise(f.start) ?? 0,
            minIncrementPaise: toPaise(f.inc) ?? 0,
            reservePaise: f.reserve.trim() ? toPaise(f.reserve) : null,
            endsAt: new Date(f.ends).getTime(),
            extendMinutes: Number(f.extend) || 0,
            maxEntriesPerUser: Number(f.max) || 1,
          });
          if (!r.ok) return setError(r.error);
          if (publish && r.data.status !== "live") {
            const p = api.setEventStatus(r.data.id, "live");
            if (!p.ok) return setError(p.error);
          }
          if (!existing && photos.length) api.setPhotos(r.data.id, photos);
          run(r, publish ? "Event is live" : "Draft saved");
          void navigate({ to: "/market/event/$eventId", params: { eventId: r.data.id } });
        };
        return (
          <div className="mx-auto max-w-2xl space-y-4">
            <PageTitle
              title={existing ? "Edit event" : "New event"}
              sub="Auction: highest bid wins. Raffle: free-entry random draw."
            />
            <section className="space-y-2">
              <h2 className="px-1 text-sm font-medium text-muted-foreground">
                {total > 1 ? `Cars in the box (${total})` : "Car, or add more for a combo box"}
              </h2>
              <BundleEditor bundle={bundle} setBundle={setBundle} />
            </section>

            <PhotoEditor
              value={photos}
              onChange={setPhotos}
              targetId={existing?.id}
              locked={!!existing && existing.status !== "draft"}
            />

            <section className="space-y-2">
              <h2 className="px-1 text-sm font-medium text-muted-foreground">Event</h2>
              <IosGroup>
                <IosRow label="Type">
                  <IosPicker
                    label="Type"
                    value={type}
                    onChange={(v) => !existing && setType(v as EventType)}
                    options={[
                      { value: "auction", label: "Auction" },
                      { value: "raffle", label: "Raffle" },
                    ]}
                  />
                </IosRow>
                <IosRow label="Title">
                  <IosInput label="Title" value={f.title} onChange={(v) => set("title", v)} />
                </IosRow>
                <IosRow label="Condition">
                  <IosPicker
                    label="Condition"
                    value={f.condition}
                    onChange={(v) => set("condition", v)}
                    options={["New", "Opened", "Display"].map((v) => ({ value: v, label: v }))}
                  />
                </IosRow>
                <IosRow label="Packaging">
                  <IosPicker
                    label="Packaging"
                    value={f.packaging}
                    onChange={(v) => set("packaging", v)}
                    options={["Sealed", "Box (minor wear)", "Box (damaged)", "Loose"].map((v) => ({
                      value: v,
                      label: v,
                    }))}
                  />
                </IosRow>
                <IosRow label="Closes at">
                  <input
                    type="datetime-local"
                    aria-label="Closes at"
                    value={f.ends}
                    onChange={(e) => set("ends", e.target.value)}
                    style={{ textAlign: "right" }}
                    className="min-h-11 w-full bg-transparent text-right text-[15px] outline-none"
                  />
                </IosRow>
              </IosGroup>
            </section>

            <section className="space-y-2">
              <h2 className="px-1 text-sm font-medium text-muted-foreground">
                {type === "auction" ? "Bidding" : "Entries"}
              </h2>
              <IosGroup>
                {type === "raffle" && (
                  <IosRow label="Entries per person (1-5)">
                    <IosInput
                      label="Entries per person"
                      inputMode="decimal"
                      value={f.max}
                      onChange={(v) => set("max", v.replace(/\D/g, ""))}
                    />
                  </IosRow>
                )}
                {type === "auction" && (
                  <>
                    <IosRow label="Starting bid (₹)">
                      <IosInput
                        label="Starting bid"
                        inputMode="decimal"
                        value={f.start}
                        onChange={(v) => set("start", v)}
                      />
                    </IosRow>
                    <IosRow label="Minimum raise (₹)">
                      <IosInput
                        label="Minimum raise"
                        inputMode="decimal"
                        value={f.inc}
                        onChange={(v) => set("inc", v)}
                      />
                    </IosRow>
                    <IosRow label="Reserve (₹, optional)">
                      <IosInput
                        label="Reserve"
                        inputMode="decimal"
                        placeholder="Below this, nobody wins"
                        value={f.reserve}
                        onChange={(v) => set("reserve", v)}
                      />
                    </IosRow>
                    <IosRow label="Late-bid extension (min)">
                      <IosInput
                        label="Late-bid extension"
                        inputMode="decimal"
                        value={f.extend}
                        onChange={(v) => set("extend", v.replace(/\D/g, ""))}
                      />
                    </IosRow>
                  </>
                )}
                <IosTextArea
                  label="Rules shown to participants"
                  rows={5}
                  placeholder="How the winner is picked, and what happens if they don't pay"
                  value={f.rules}
                  onChange={(v) => set("rules", v)}
                />
              </IosGroup>
              {!f.rules && (
                <button
                  className="px-1 text-xs text-primary underline"
                  onClick={() => set("rules", template)}
                >
                  Use the standard {type} rules
                </button>
              )}
            </section>
            <p className="px-1 text-xs text-muted-foreground">
              Demo: no money moves for bids or entries. Real-money auctions or raffles need a
              compliant payment provider and a legal review for your jurisdiction before they go
              live.
            </p>
            <ErrorNote>{error}</ErrorNote>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => submit(false)}>
                Save draft
              </Button>
              <Button onClick={() => submit(true)}>Publish</Button>
            </div>
          </div>
        );
      }}
    </SellerGate>
  );
}

export type { MarketEvent };
