import { Link, useSearch } from "@tanstack/react-router";
import { Boxes, Search, Tag } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { IosGroup, IosPicker } from "@/components/ios-field";
import { PageHeading } from "@/components/page-header";
import { Button } from "@/components/ui/button";

import { CarImage, Empty, Pill, itemLine } from "../components/bits";
import { approved, facets } from "../queries";
import { useMarket } from "../use-market";
import { SellerGate } from "./sell";

const PAGE = 48;

/** The Viiv catalogue, for sellers: pick any existing car to sell, or to put in a combo. */
export function SellerCataloguePage() {
  const { s } = useMarket();
  const urlQ = useSearch({ strict: false }) as { q?: string };
  const [q, setQ] = useState(urlQ.q ?? "");
  useEffect(() => setQ(urlQ.q ?? ""), [urlQ.q]);
  const [brand, setBrand] = useState("");
  const [scale, setScale] = useState("");
  const [shown, setShown] = useState(PAGE);
  const dq = useDeferredValue(q);
  const f = useMemo(() => facets(s), [s]);
  const list = useMemo(() => {
    const t = dq.toLowerCase().split(/\s+/).filter(Boolean);
    return approved(s).filter(
      (i) =>
        (!brand || i.brand === brand) &&
        (!scale || i.scale === scale) &&
        t.every((x) =>
          `${i.name} ${i.brand} ${i.make} ${i.assortment} ${i.series} ${i.colour} ${i.code}`
            .toLowerCase()
            .includes(x),
        ),
    );
  }, [s, dq, brand, scale]);
  const mine = (id: string, uid: string) =>
    s.listings.some((l) => l.sellerId === uid && l.itemId === id && !l.bundle);

  return (
    <SellerGate>
      {(_store, uid) => (
        <div className="space-y-3">
          <PageHeading
            title="Catalogue"
            subtitle={`${list.length.toLocaleString()} cars · pick one to sell or add to a combo`}
          >
            <Button asChild size="sm" variant="outline">
              <Link
                to="/seller/listing/$listingId"
                params={{ listingId: "new" }}
                search={{ mode: "combo" }}
              >
                <Boxes /> New combo
              </Link>
            </Button>
          </PageHeading>
          <IosGroup>
            <label className="flex min-h-11 items-center gap-2 px-3.5">
              <Search className="size-4 text-muted-foreground" />
              <input
                aria-label="Search the catalogue"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setShown(PAGE);
                }}
                placeholder="Search name, brand, series, colour, code…"
                className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
              />
            </label>
            <div className="flex min-h-11 items-center justify-between gap-4 px-3.5">
              <span className="text-[15px]">Brand</span>
              <div className="w-48">
                <IosPicker
                  label="Brand"
                  placeholder="All"
                  clearable
                  value={brand}
                  onChange={(v) => {
                    setBrand(v);
                    setShown(PAGE);
                  }}
                  options={f.brand.map((v) => ({ value: v, label: v }))}
                />
              </div>
            </div>
            <div className="flex min-h-11 items-center justify-between gap-4 px-3.5">
              <span className="text-[15px]">Scale</span>
              <div className="w-48">
                <IosPicker
                  label="Scale"
                  placeholder="All"
                  clearable
                  value={scale}
                  onChange={(v) => {
                    setScale(v);
                    setShown(PAGE);
                  }}
                  options={f.scale.map((v) => ({ value: v, label: v }))}
                />
              </div>
            </div>
          </IosGroup>
          {list.length === 0 ? (
            <Empty title="No catalogue car matches" body="Try fewer words, or add a new car." />
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
              {list.slice(0, shown).map((i) => (
                <div key={i.id} className="card-elevated flex flex-col overflow-hidden">
                  <CarImage item={i} className="rounded-none" />
                  <div className="flex flex-1 flex-col gap-1.5 p-3">
                    {mine(i.id, uid) && <Pill tone="good">You sell this</Pill>}
                    <p className="line-clamp-2 text-sm font-medium leading-snug">{i.name}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {i.brand} · {itemLine(i)}
                    </p>
                    <div className="mt-auto flex gap-1.5 pt-1">
                      <Button asChild size="sm" className="flex-1">
                        <Link
                          to="/seller/listing/$listingId"
                          params={{ listingId: "new" }}
                          search={{ mode: "single", car: i.id }}
                        >
                          <Tag /> Sell
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline" aria-label="Add to a combo">
                        <Link
                          to="/seller/listing/$listingId"
                          params={{ listingId: "new" }}
                          search={{ mode: "combo", car: i.id }}
                        >
                          <Boxes />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {list.length > shown && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>
                Show more
              </Button>
            </div>
          )}
        </div>
      )}
    </SellerGate>
  );
}
