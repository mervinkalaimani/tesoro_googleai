import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

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
  SignInNeeded,
  Sel,
  itemLine,
} from "../components/bits";
import { dateOnly } from "../format";
import { approved, itemById, sellerOf } from "../queries";
import type { Condition } from "../types";
import { api, run, useMarket, useMounted } from "../use-market";

function AddManual() {
  const { s } = useMarket();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("1");
  const [condition, setCondition] = useState<Condition>("Opened");
  const [from, setFrom] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const matches = useMemo(() => {
    const t = q.toLowerCase().split(/\s+/).filter(Boolean);
    return t.length
      ? approved(s)
          .filter((i) =>
            t.every((x) =>
              `${i.name} ${i.brand} ${i.make} ${i.scale} ${i.assortment} ${i.colour}`
                .toLowerCase()
                .includes(x),
            ),
          )
          .slice(0, 6)
      : [];
  }, [q, s]);
  if (!open)
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Add a car I got elsewhere
      </Button>
    );
  return (
    <Card className="mb-4 space-y-3">
      <h2 className="font-medium">Add a car you got elsewhere</h2>
      <p className="text-xs text-muted-foreground">
        This is a manual entry, kept separate from cars bought here. It has no order.
      </p>
      <Field label="Find the catalogue car">
        <input
          className={inputCls}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setItemId("");
          }}
          placeholder="e.g. Skyline 1:64"
        />
      </Field>
      {!itemId && matches.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {matches.map((i) => (
            <li key={i.id}>
              <button
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  setItemId(i.id);
                  setQ(i.name);
                }}
              >
                {i.name}{" "}
                <span className="text-xs text-muted-foreground">
                  {itemLine(i)} · {i.colour}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {itemId && <p className="text-sm text-emerald-600 dark:text-emerald-400">Selected ✓</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Quantity">
          <input
            inputMode="numeric"
            className={inputCls}
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <Field label="Condition">
          <Sel
            label="Condition"
            value={condition}
            onChange={(v) => setCondition(v as Condition)}
            options={["New", "Opened", "Display"]}
          />
        </Field>
        <Field label="Got it from">
          <input
            className={inputCls}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="Meet-up, gift…"
          />
        </Field>
      </div>
      <Field label="Notes (optional)">
        <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex gap-2">
        <Button
          onClick={() => {
            const r = api.addManual({
              itemId,
              qty: Number(qty),
              condition,
              notes,
              acquiredAt: Date.now(),
              from,
            });
            if (r.ok) {
              run(r, "Added to your collection");
              setOpen(false);
              setQ("");
              setItemId("");
              setError("");
            } else setError(r.error);
          }}
        >
          Add to collection
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

export function CollectionPage() {
  const { s, me } = useMarket();
  const mounted = useMounted();
  if (!me) return <SignInNeeded what="see your collection" />;
  const mine = s.collection
    .filter((c) => c.userId === me.id)
    .sort((a, b) => b.acquiredAt - a.acquiredAt);
  const total = mine.reduce((n, c) => n + c.qty, 0);

  return (
    <div>
      <PageTitle
        title="My collection"
        sub={`${total} car${total === 1 ? "" : "s"} · ${mine.length} different`}
        actions={<AddManual />}
      />
      {!mine.length ? (
        <Empty
          title="Your shelf is empty"
          body="Cars you buy here are added automatically. Got some elsewhere? Add them by hand."
          action={
            <Button asChild>
              <Link to="/market/search">Browse cars</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {mine.map((c) => {
            const item = itemById(s, c.itemId);
            if (!item) return null;
            return (
              <li key={c.id}>
                <Card className="flex gap-3">
                  <CarImage item={item} className="w-28 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-1 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to="/market/item/$itemId"
                        params={{ itemId: item.id }}
                        className="font-medium hover:underline"
                      >
                        {item.name}
                      </Link>
                      <Pill tone="brand">× {c.qty}</Pill>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {itemLine(item)} · {c.condition}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Acquired {mounted ? dateOnly(c.acquiredAt) : ""}
                    </p>
                    <ul className="text-xs">
                      {c.sources.map((src, i) => (
                        <li key={i}>
                          {src.kind === "order" ? (
                            <>
                              Bought{src.qty > 1 ? ` ${src.qty}` : ""} from{" "}
                              {sellerOf(s, src.sellerId!)?.storeName ?? "seller"} ·{" "}
                              <Link
                                className="text-primary hover:underline"
                                to="/market/orders/$orderId"
                                params={{ orderId: src.orderId! }}
                              >
                                order {src.orderId}
                              </Link>
                            </>
                          ) : (
                            <>Added manually{src.from ? ` (${src.from})` : ""}</>
                          )}
                        </li>
                      ))}
                    </ul>
                    {c.notes && <p className="text-xs italic">“{c.notes}”</p>}
                    <div className="flex gap-3 pt-1">
                      <button
                        className="text-xs text-primary hover:underline"
                        onClick={() => {
                          const n = window.prompt("Notes for this car", c.notes);
                          if (n !== null)
                            run(
                              api.updateCollection(c.id, { notes: n, condition: c.condition }),
                              "Notes saved",
                            );
                        }}
                      >
                        Edit notes
                      </button>
                      <Confirm
                        trigger={(open) => (
                          <button
                            className="text-xs text-red-600 hover:underline dark:text-red-400"
                            onClick={open}
                          >
                            Remove
                          </button>
                        )}
                        title="Remove from collection?"
                        body={`This removes all ${c.qty} of ${item.name} from your collection. Any orders stay in your order history.`}
                        confirm="Remove"
                        danger
                        onConfirm={() => run(api.removeCollection(c.id), "Removed")}
                      />
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
