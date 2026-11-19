import { useNavigate, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

import {
  Card,
  Confirm,
  ErrorNote,
  Field,
  inputCls,
  PageTitle,
  Pill,
  Price,
  Sel,
  itemLine,
} from "../components/bits";
import { rupees, toPaise } from "../format";
import { approved, itemById } from "../queries";
import type { Condition, Origin, Packaging } from "../types";
import type { CatalogCar } from "@/lib/catalog";
import { catalogIdFor } from "@/lib/car-id";
import { useCatalog } from "@/lib/catalog-store";
import { api, run, useMarket } from "../use-market";
import { SellerGate } from "./sell";

const CONDITIONS = ["New", "Opened", "Display"];
const PACKAGING = ["Sealed", "Box (minor wear)", "Box (damaged)", "Loose"];
const text = (p: number | null) => (p === null ? "" : String(p / 100));

/**
 * Make a car the catalogue doesn't have. It is a catalogue entry like any other:
 * other sellers can list it and it shows in the catalogue with its sellers.
 *
 * Demo mode (default) adds it to this browser's catalogue view only. Set
 * VITE_MARKET_WRITE_CATALOG=true and sign in to the tracker to file it in the
 * shared catalogue table instead.
 */
function MakeCar({ onDone }: { onDone: (id: string) => void }) {
  const { catalog, addCatalogCar } = useCatalog();
  const [f, setF] = useState({
    brand: "",
    make: "",
    model: "",
    size: "1:64",
    assortment: "",
    variant: "",
    colour: "",
    year: "",
    series: "",
    mrp: "",
  });
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  const live = import.meta.env.VITE_MARKET_WRITE_CATALOG === "true";

  const submit = async () => {
    setError("");
    const fields = {
      brand: f.brand.trim(),
      make: f.make.trim(),
      model: f.model.trim(),
      assortment: f.assortment.trim(),
      series: f.series.trim(),
      variant: f.variant.trim(),
      colour: f.colour.trim(),
      mrp: toPaise(f.mrp) === null ? 0 : (toPaise(f.mrp) as number) / 100,
    };
    if (!fields.brand || !fields.model || !fields.assortment)
      return setError("Brand, model and assortment are required.");
    if (!/^1:\d+$/.test(f.size.trim())) return setError("Scale looks like 1:64.");
    const car_id = catalogIdFor(fields);
    if (catalog.some((c) => c.car_id === car_id))
      return setError("That car is already in the catalogue. Search for it instead.");
    const now = new Date().toISOString();
    const car: CatalogCar = {
      car_id,
      brand: fields.brand,
      make: fields.make,
      model: fields.model,
      assortment: fields.assortment,
      series: fields.series,
      sub_series: "",
      car_number: "",
      mrp: fields.mrp,
      name: fields.variant ? `${fields.model} ${fields.variant}` : fields.model,
      variant: fields.variant,
      year: f.year.trim(),
      colour: fields.colour,
      size: f.size.trim(),
      image_url: null,
      created_at: now,
      updated_at: now,
    };
    if (live) {
      if (await addCatalogCar(car)) onDone(car.car_id);
      return;
    }
    const r = api.addCar(car);
    if (r.ok) {
      run(r, "Added to the catalogue");
      onDone(r.data.id);
    } else setError(r.error);
  };

  return (
    <Card className="space-y-3 bg-muted/30">
      <h3 className="font-medium">Add a car to the catalogue</h3>
      <p className="text-xs text-muted-foreground">
        {live
          ? "This files the car in the shared Viiv catalogue."
          : "Demo: the car is added to the catalogue in this browser only; nothing is written to the shared catalogue."}{" "}
        Duplicates are refused.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Brand">
          <input
            className={inputCls}
            value={f.brand}
            onChange={(e) => set("brand", e.target.value)}
          />
        </Field>
        <Field label="Make" hint="Nissan, Ford…">
          <input
            className={inputCls}
            value={f.make}
            onChange={(e) => set("make", e.target.value)}
          />
        </Field>
        <Field label="Model / name">
          <input
            className={inputCls}
            value={f.model}
            onChange={(e) => set("model", e.target.value)}
          />
        </Field>
        <Field label="Scale">
          <input
            className={inputCls}
            value={f.size}
            onChange={(e) => set("size", e.target.value)}
          />
        </Field>
        <Field label="Assortment">
          <input
            className={inputCls}
            value={f.assortment}
            onChange={(e) => set("assortment", e.target.value)}
            placeholder="Mainline, Premium…"
          />
        </Field>
        <Field label="Series">
          <input
            className={inputCls}
            value={f.series}
            onChange={(e) => set("series", e.target.value)}
          />
        </Field>
        <Field label="Variant">
          <input
            className={inputCls}
            value={f.variant}
            onChange={(e) => set("variant", e.target.value)}
          />
        </Field>
        <Field label="Colour">
          <input
            className={inputCls}
            value={f.colour}
            onChange={(e) => set("colour", e.target.value)}
          />
        </Field>
        <Field label="Year">
          <input
            className={inputCls}
            value={f.year}
            onChange={(e) => set("year", e.target.value)}
          />
        </Field>
        <Field label="MRP (₹)">
          <input
            inputMode="decimal"
            className={inputCls}
            value={f.mrp}
            onChange={(e) => set("mrp", e.target.value)}
          />
        </Field>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Button variant="outline" onClick={() => void submit()}>
        Add to catalogue
      </Button>
    </Card>
  );
}

export function ListingFormPage() {
  const { listingId } = useParams({ strict: false }) as { listingId: string };
  const { s } = useMarket();
  const navigate = useNavigate();
  const existing = listingId !== "new" ? s.listings.find((l) => l.id === listingId) : undefined;
  const [itemId, setItemId] = useState(existing?.itemId ?? "");
  const [q, setQ] = useState("");
  const [suggest, setSuggest] = useState(false);
  const [f, setF] = useState({
    title: existing?.title ?? "",
    description: existing?.description ?? "",
    condition: (existing?.condition ?? "New") as Condition,
    packaging: (existing?.packaging ?? "Sealed") as Packaging,
    conditionNotes: existing?.conditionNotes ?? "",
    quantity: String(existing?.quantity ?? 1),
    mrp: text(existing?.mrpPaise ?? null),
    price: text(existing?.pricePaise ?? null),
    shipping: existing ? text(existing.shippingPaise) : "69",
    later: existing ? existing.shippingPaise === null : false,
    dispatchDays: String(existing?.dispatchDays ?? 2),
    regions: existing?.regions ?? "Pan-India",
    returnPolicy:
      existing?.returnPolicy ??
      "Returns accepted within 3 days only if the item differs from the listing.",
    sku: existing?.sku ?? "",
    privateNotes: existing?.privateNotes ?? "",
    origin: (existing?.originOverride?.value ?? "") as Origin | "",
  });
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF({ ...f, [k]: v });
  const item = itemById(s, itemId);
  const matches = useMemo(() => {
    const t = q.toLowerCase().split(/\s+/).filter(Boolean);
    return t.length
      ? approved(s)
          .filter((i) =>
            t.every((x) =>
              `${i.name} ${i.brand} ${i.make} ${i.scale} ${i.assortment} ${i.colour} ${i.code}`
                .toLowerCase()
                .includes(x),
            ),
          )
          .slice(0, 8)
      : [];
  }, [q, s]);

  return (
    <SellerGate>
      {(_store, uid) => {
        if (listingId !== "new" && existing?.sellerId !== uid)
          return <ErrorNote>Listing not found.</ErrorNote>;
        const input = () => ({
          id: existing?.id,
          itemId,
          title: f.title,
          description: f.description,
          condition: f.condition,
          packaging: f.packaging,
          conditionNotes: f.conditionNotes,
          quantity: Number(f.quantity),
          mrpPaise: f.mrp.trim() ? toPaise(f.mrp) : null,
          pricePaise: toPaise(f.price) ?? 0,
          shippingPaise: f.later ? null : (toPaise(f.shipping) ?? 0),
          dispatchDays: Number(f.dispatchDays),
          regions: f.regions,
          returnPolicy: f.returnPolicy,
          sku: f.sku,
          privateNotes: f.privateNotes,
          originOverride: (f.origin || null) as Origin | null,
        });
        const save = (publish: boolean) => {
          const r = api.saveListing(input(), publish);
          if (r.ok) {
            run(r, publish ? "Published" : "Saved");
            void navigate({ to: "/market/sell/listings" });
          } else setError(r.error);
        };
        const reducing = !!existing && Number(f.quantity) < existing.quantity;
        const price = toPaise(f.price) ?? 0;
        return (
          <div className="mx-auto max-w-3xl space-y-4">
            <PageTitle
              title={existing ? "Edit listing" : "New listing"}
              sub={
                existing
                  ? `Status: ${existing.status.replace("_", " ")}`
                  : "Start from a catalogue car"
              }
            />

            <Card className="space-y-3">
              <h2 className="font-medium">1. Catalogue car</h2>
              {item ? (
                <div className="flex items-start justify-between gap-3 rounded-xl border border-border p-3 text-sm">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.brand} · {itemLine(item)} · {item.colour} · {item.origin} · {item.code}
                    </p>
                    {item.review === "pending" && <Pill tone="warn">Pending review</Pill>}
                  </div>
                  {!existing && (
                    <button
                      className="text-xs text-primary underline"
                      onClick={() => setItemId("")}
                    >
                      Change
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <input
                    aria-label="Search the catalogue"
                    className={inputCls}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search the catalogue by name, brand, scale, code…"
                  />
                  {matches.length > 0 && (
                    <ul className="divide-y divide-border rounded-xl border border-border">
                      {matches.map((i) => (
                        <li key={i.id}>
                          <button
                            className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                            onClick={() => setItemId(i.id)}
                          >
                            {i.name}{" "}
                            <span className="text-xs text-muted-foreground">
                              {itemLine(i)} · {i.colour} · {i.origin}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {q && !matches.length && (
                    <p className="text-sm text-muted-foreground">No catalogue match.</p>
                  )}
                  <button
                    className="text-sm text-primary underline"
                    onClick={() => setSuggest(!suggest)}
                  >
                    Can't find it? Add the car to the catalogue
                  </button>
                  {suggest && (
                    <MakeCar
                      onDone={(id) => {
                        setItemId(id);
                        setSuggest(false);
                      }}
                    />
                  )}
                </>
              )}
            </Card>

            <Card className="space-y-3">
              <h2 className="font-medium">2. Your offer</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Selling price (₹)">
                  <input
                    inputMode="decimal"
                    className={inputCls}
                    value={f.price}
                    onChange={(e) => set("price", e.target.value)}
                  />
                </Field>
                <Field label="MRP (₹, optional)" hint="Reference price on the pack. Not your cost.">
                  <input
                    inputMode="decimal"
                    className={inputCls}
                    value={f.mrp}
                    onChange={(e) => set("mrp", e.target.value)}
                  />
                </Field>
                <Field label="Quantity in stock">
                  <input
                    inputMode="numeric"
                    className={inputCls}
                    value={f.quantity}
                    onChange={(e) => set("quantity", e.target.value.replace(/\D/g, ""))}
                  />
                </Field>
                <Field label="Dispatch within (days)">
                  <input
                    inputMode="numeric"
                    className={inputCls}
                    value={f.dispatchDays}
                    onChange={(e) => set("dispatchDays", e.target.value.replace(/\D/g, ""))}
                  />
                </Field>
                <Field label="Shipping charge (₹)">
                  <input
                    inputMode="decimal"
                    disabled={f.later}
                    className={inputCls}
                    value={f.shipping}
                    onChange={(e) => set("shipping", e.target.value)}
                  />
                </Field>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={f.later}
                    onChange={(e) => set("later", e.target.checked)}
                  />{" "}
                  Calculate shipping later
                </label>
                <Field label="Ships to">
                  <input
                    className={inputCls}
                    value={f.regions}
                    onChange={(e) => set("regions", e.target.value)}
                  />
                </Field>
              </div>
            </Card>

            <Card className="space-y-3">
              <h2 className="font-medium">3. Condition (buyers see this before checkout)</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Car condition">
                  <Sel
                    label="Condition"
                    value={f.condition}
                    onChange={(v) => set("condition", v)}
                    options={CONDITIONS}
                  />
                </Field>
                <Field label="Packaging">
                  <Sel
                    label="Packaging"
                    value={f.packaging}
                    onChange={(v) => set("packaging", v)}
                    options={PACKAGING}
                  />
                </Field>
              </div>
              <Field
                label="Condition notes"
                hint={
                  f.packaging === "Sealed"
                    ? "Optional for sealed items."
                    : "Required: describe wear, creases, paint chips."
                }
              >
                <textarea
                  rows={2}
                  className={inputCls + " h-auto py-2"}
                  value={f.conditionNotes}
                  onChange={(e) => set("conditionNotes", e.target.value)}
                />
              </Field>
              <Field label="Description">
                <textarea
                  rows={3}
                  className={inputCls + " h-auto py-2"}
                  value={f.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </Field>
              <Field label="Return / cancellation policy">
                <textarea
                  rows={2}
                  className={inputCls + " h-auto py-2"}
                  value={f.returnPolicy}
                  onChange={(e) => set("returnPolicy", e.target.value)}
                />
              </Field>
              {item && (
                <Field
                  label={`Origin correction (catalogue says ${item.origin})`}
                  hint="Leave blank to use the catalogue. A different value is shown to buyers as unverified."
                >
                  <Sel
                    label="Origin override"
                    value={f.origin}
                    onChange={(v) => set("origin", v)}
                    options={["Indian", "Imported"]}
                    any="Use catalogue value"
                  />
                </Field>
              )}
            </Card>

            <Card className="space-y-3">
              <h2 className="font-medium">Private to you</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Your SKU">
                  <input
                    className={inputCls}
                    value={f.sku}
                    onChange={(e) => set("sku", e.target.value)}
                  />
                </Field>
                <Field label="Private notes">
                  <input
                    className={inputCls}
                    value={f.privateNotes}
                    onChange={(e) => set("privateNotes", e.target.value)}
                  />
                </Field>
              </div>
            </Card>

            {preview && item && (
              <Card className="space-y-1 border-primary/50">
                <p className="text-xs text-muted-foreground">
                  Preview: how buyers will see this offer
                </p>
                <p className="font-medium">{f.title || item.name}</p>
                <Price price={price} mrp={f.mrp.trim() ? toPaise(f.mrp) : null} />
                <div className="flex flex-wrap gap-1">
                  <Pill>{f.condition}</Pill>
                  <Pill>{f.packaging}</Pill>
                  <Pill tone="brand">Fixed price</Pill>
                </div>
                <p className="text-xs">{f.conditionNotes || "No condition notes."}</p>
                <p className="text-xs text-muted-foreground">
                  {f.later
                    ? "Shipping: calculated later"
                    : `+ ${rupees(toPaise(f.shipping) ?? 0)} shipping`}{" "}
                  · {f.quantity} available
                </p>
              </Card>
            )}

            <ErrorNote>{error}</ErrorNote>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!item} onClick={() => setPreview(!preview)}>
                {preview ? "Hide preview" : "Preview"}
              </Button>
              {reducing ? (
                <Confirm
                  trigger={(open) => (
                    <Button variant="outline" onClick={open}>
                      Save changes
                    </Button>
                  )}
                  title="Remove stock?"
                  body={`Stock goes from ${existing!.quantity} to ${f.quantity}. Orders already placed are not affected.`}
                  confirm="Remove stock"
                  danger
                  onConfirm={() => save(existing!.status === "active")}
                />
              ) : (
                <Button variant="outline" onClick={() => save(false)}>
                  {existing && existing.status !== "draft" ? "Save changes" : "Save draft"}
                </Button>
              )}
              {(!existing || existing.status === "draft") && (
                <Button onClick={() => save(true)}>Publish</Button>
              )}
            </div>
          </div>
        );
      }}
    </SellerGate>
  );
}
