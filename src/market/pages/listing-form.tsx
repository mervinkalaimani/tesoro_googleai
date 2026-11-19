import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Boxes, Gavel, Minus, Package, Plus, ScanLine, Search, X } from "lucide-react";

import { CarLinkField } from "@/components/car-link-field";
import { CarScanDialog, type ScanResult } from "@/components/car-scan-dialog";
import { IosGroup, IosInput, IosPicker, IosRow, IosTextArea } from "@/components/ios-field";
import { PageHeading } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { catalogIdFor } from "@/lib/car-id";
import type { CatalogCar } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-store";

import { CarImage, Card, Confirm, ErrorNote, Pill, Price, itemLine } from "../components/bits";
import { rupees, toPaise } from "../format";
import { approved, itemById } from "../queries";
import type { CatalogueItem, Condition, Origin, Packaging } from "../types";
import { api, run, useMarket } from "../use-market";
import { SellerGate } from "./sell";

const CONDITIONS = ["New", "Opened", "Display"].map((v) => ({ value: v, label: v }));
const PACKAGING = ["Sealed", "Box (minor wear)", "Box (damaged)", "Loose"].map((v) => ({
  value: v,
  label: v,
}));
const text = (p: number | null) => (p === null ? "" : String(p / 100));
const digits = (v: string) => v.replace(/\D/g, "");

/**
 * Make a car the catalogue doesn't have. It is a catalogue entry like any other:
 * other sellers can list it and it shows in the catalogue with its sellers.
 * Fill it by hand, from a web link, or with VIIV scan.
 *
 * Demo mode (default) adds it to this browser's catalogue view only. Set
 * VITE_MARKET_WRITE_CATALOG=true and sign in to the tracker to file it in the
 * shared catalogue table instead.
 */
function MakeCar({ onDone }: { onDone: (id: string) => void }) {
  const { catalog, addCatalogCar } = useCatalog();
  const [scanOpen, setScanOpen] = useState(false);
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
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const live = import.meta.env.VITE_MARKET_WRITE_CATALOG === "true";
  const fill = (r: ScanResult & { mrp?: string }) =>
    setF((p) => ({
      ...p,
      ...Object.fromEntries(
        (["brand", "make", "model", "assortment", "series", "variant", "colour", "year"] as const)
          .filter((k) => r[k])
          .map((k) => [k, r[k]]),
      ),
      ...(r.size ? { size: r.size } : {}),
      ...(r.mrp ? { mrp: r.mrp } : {}),
    }));

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

  const row = (label: string, k: keyof typeof f, placeholder = "", numeric = false) => (
    <IosRow label={label}>
      <IosInput
        label={label}
        placeholder={placeholder}
        inputMode={numeric ? "decimal" : undefined}
        value={f[k]}
        onChange={set(k)}
      />
    </IosRow>
  );

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">Add a new car to the catalogue</h3>
          <p className="text-xs text-muted-foreground">
            {live
              ? "Files the car in the shared Viiv catalogue."
              : "Demo: added to the catalogue in this browser only."}{" "}
            Duplicates are refused.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setScanOpen(true)}>
          <ScanLine /> VIIV scan
        </Button>
      </div>
      <CarLinkField onFound={({ fields }) => fill(fields)} />
      <IosGroup>
        {row("Brand", "brand")}
        {row("Make", "make", "Nissan, Ford…")}
        {row("Model", "model")}
        {row("Scale", "size", "1:64")}
        {row("Assortment", "assortment", "Mainline, Premium…")}
        {row("Series", "series")}
        {row("Variant", "variant")}
        {row("Colour", "colour")}
        {row("Year", "year")}
        {row("MRP (₹)", "mrp", "", true)}
      </IosGroup>
      <ErrorNote>{error}</ErrorNote>
      <Button type="button" onClick={() => void submit()}>
        Add to catalogue
      </Button>
      <CarScanDialog open={scanOpen} onOpenChange={setScanOpen} onApply={fill} />
    </Card>
  );
}

/** Search the Viiv catalogue and pick a car, or make a new one. */
export function CarPicker({ onPick }: { onPick: (id: string) => void }) {
  const { s } = useMarket();
  const [q, setQ] = useState("");
  const [make, setMake] = useState(false);
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
    <div className="space-y-2">
      <IosGroup>
        <label className="flex min-h-11 items-center gap-2 px-3.5">
          <Search className="size-4 text-muted-foreground" />
          <input
            aria-label="Search the catalogue"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the catalogue by name, brand, scale, code…"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
          />
        </label>
        {matches.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => onPick(i.id)}
            className="flex w-full items-center gap-3 px-3.5 py-2 text-left hover:bg-muted/50"
          >
            <CarImage item={i} className="w-14 shrink-0 rounded-lg" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{i.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {itemLine(i)} · {i.colour}
              </span>
            </span>
            <Plus className="size-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
        {q && !matches.length && (
          <p className="px-3.5 py-3 text-sm text-muted-foreground">No catalogue match.</p>
        )}
      </IosGroup>
      <button
        type="button"
        className="px-1 text-sm text-primary hover:underline"
        onClick={() => setMake(!make)}
      >
        Can't find it? Add a new car
      </button>
      {make && (
        <MakeCar
          onDone={(id) => {
            onPick(id);
            setMake(false);
          }}
        />
      )}
    </div>
  );
}

const MODES = [
  {
    mode: "single",
    title: "Single car",
    body: "One casting from the catalogue at a fixed price.",
    icon: Package,
  },
  {
    mode: "combo",
    title: "Combo box",
    body: "A box of several cars sold together. Pick from the catalogue or add new ones.",
    icon: Boxes,
  },
] as const;

function ModeChooser() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {MODES.map((m) => (
        <Link
          key={m.mode}
          to="/seller/listing/$listingId"
          params={{ listingId: "new" }}
          search={{ mode: m.mode } as never}
          className="card-elevated group flex flex-col gap-2 p-5 transition-colors hover:border-primary/40"
        >
          <m.icon className="size-6 text-primary" />
          <h2 className="font-semibold">{m.title}</h2>
          <p className="text-sm text-muted-foreground">{m.body}</p>
        </Link>
      ))}
      <Link
        to="/seller/event/$eventId"
        params={{ eventId: "new" }}
        className="card-elevated group flex flex-col gap-2 p-5 transition-colors hover:border-primary/40"
      >
        <Gavel className="size-6 text-primary" />
        <h2 className="font-semibold">Auction or raffle</h2>
        <p className="text-sm text-muted-foreground">
          Let buyers bid for a car, or run a free raffle for it.
        </p>
      </Link>
    </div>
  );
}

export function ListingFormPage() {
  const { listingId } = useParams({ strict: false }) as { listingId: string };
  const search = useSearch({ strict: false }) as { mode?: string; car?: string };
  const { s } = useMarket();
  const navigate = useNavigate();
  const existing = listingId !== "new" ? s.listings.find((l) => l.id === listingId) : undefined;
  const mode: "single" | "combo" | "" = existing
    ? existing.bundle
      ? "combo"
      : "single"
    : search.mode === "combo"
      ? "combo"
      : search.mode === "single" || search.car
        ? "single"
        : "";
  const [itemId, setItemId] = useState(existing?.itemId ?? search.car ?? "");
  const [bundle, setBundle] = useState<{ itemId: string; qty: number }[]>(
    existing?.bundle ?? (mode === "combo" && search.car ? [{ itemId: search.car, qty: 1 }] : []),
  );
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
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const item = itemById(s, mode === "combo" ? (bundle[0]?.itemId ?? "") : itemId);
  const cars = bundle.flatMap((b) => {
    const i = itemById(s, b.itemId);
    return i ? [{ i, b }] : [];
  });
  const total = bundle.reduce((t, b) => t + b.qty, 0);
  const addToBundle = (id: string) =>
    setBundle((p) =>
      p.some((b) => b.itemId === id)
        ? p.map((b) => (b.itemId === id ? { ...b, qty: b.qty + 1 } : b))
        : [...p, { itemId: id, qty: 1 }],
    );

  return (
    <SellerGate>
      {(_store, uid) => {
        if (listingId !== "new" && existing?.sellerId !== uid)
          return <ErrorNote>Listing not found.</ErrorNote>;
        if (!mode)
          return (
            <div className="space-y-3">
              <PageHeading title="New listing" subtitle="How do you want to sell?" />
              <ModeChooser />
            </div>
          );
        const input = () => ({
          id: existing?.id,
          itemId: item?.id ?? "",
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
          originOverride: mode === "single" ? ((f.origin || null) as Origin | null) : null,
          bundle: mode === "combo" ? bundle : undefined,
        });
        const save = (publish: boolean) => {
          const r = api.saveListing(input(), publish);
          if (r.ok) {
            run(r, publish ? "Published" : "Saved");
            void navigate({ to: "/seller/listings" });
          } else setError(r.error);
        };
        const reducing = !!existing && Number(f.quantity) < existing.quantity;
        const price = toPaise(f.price) ?? 0;
        const canPreview = mode === "combo" ? total > 1 : !!item;
        return (
          <div className="mx-auto max-w-3xl space-y-4">
            <PageHeading
              title={
                existing
                  ? mode === "combo"
                    ? "Edit combo"
                    : "Edit listing"
                  : mode === "combo"
                    ? "New combo box"
                    : "New listing"
              }
              subtitle={
                existing
                  ? `Status: ${existing.status.replace("_", " ")}`
                  : mode === "combo"
                    ? "Several cars sold together"
                    : "Start from a catalogue car"
              }
            />

            {mode === "single" ? (
              <section className="space-y-2">
                <h2 className="px-1 text-sm font-medium text-muted-foreground">Catalogue car</h2>
                {item ? (
                  <Card className="flex items-center gap-3">
                    <CarImage item={item} className="w-20 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.brand} · {itemLine(item)} · {item.colour} · {item.origin}
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
                  </Card>
                ) : (
                  <CarPicker onPick={setItemId} />
                )}
              </section>
            ) : (
              <section className="space-y-2">
                <h2 className="px-1 text-sm font-medium text-muted-foreground">
                  Cars in the box ({total})
                </h2>
                {cars.length > 0 && (
                  <IosGroup>
                    {cars.map(({ i, b }) => (
                      <div key={i.id} className="flex items-center gap-3 px-3.5 py-2">
                        <CarImage item={i} className="w-14 shrink-0 rounded-lg" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{i.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {itemLine(i)} · {i.colour}
                          </span>
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={`Fewer ${i.name}`}
                            disabled={b.qty < 2}
                            onClick={() =>
                              setBundle((p) =>
                                p.map((x) => (x.itemId === i.id ? { ...x, qty: x.qty - 1 } : x)),
                              )
                            }
                          >
                            <Minus />
                          </Button>
                          <span className="w-5 text-center text-sm tabular-nums">{b.qty}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={`More ${i.name}`}
                            onClick={() => addToBundle(i.id)}
                          >
                            <Plus />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground"
                            aria-label={`Remove ${i.name}`}
                            onClick={() => setBundle((p) => p.filter((x) => x.itemId !== i.id))}
                          >
                            <X />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </IosGroup>
                )}
                <CarPicker onPick={addToBundle} />
              </section>
            )}

            {mode === "combo" && (
              <IosGroup>
                <IosRow label="Combo name">
                  <IosInput
                    label="Combo name"
                    placeholder="e.g. JDM legends box"
                    value={f.title}
                    onChange={set("title")}
                  />
                </IosRow>
              </IosGroup>
            )}

            <section className="space-y-2">
              <h2 className="px-1 text-sm font-medium text-muted-foreground">Your offer</h2>
              <IosGroup>
                <IosRow label={mode === "combo" ? "Price for the box (₹)" : "Selling price (₹)"}>
                  <IosInput
                    label="Selling price"
                    inputMode="decimal"
                    placeholder="0"
                    value={f.price}
                    onChange={set("price")}
                  />
                </IosRow>
                <IosRow label="MRP (₹, optional)">
                  <IosInput
                    label="MRP"
                    inputMode="decimal"
                    placeholder="Reference price"
                    value={f.mrp}
                    onChange={set("mrp")}
                  />
                </IosRow>
                <IosRow label={mode === "combo" ? "Boxes in stock" : "Quantity in stock"}>
                  <IosInput
                    label="Quantity in stock"
                    inputMode="decimal"
                    value={f.quantity}
                    onChange={(v) => set("quantity")(digits(v))}
                  />
                </IosRow>
                <IosRow label="Dispatch within (days)">
                  <IosInput
                    label="Dispatch days"
                    inputMode="decimal"
                    value={f.dispatchDays}
                    onChange={(v) => set("dispatchDays")(digits(v))}
                  />
                </IosRow>
                <IosRow label="Shipping charge (₹)">
                  <IosInput
                    label="Shipping charge"
                    inputMode="decimal"
                    readOnly={f.later}
                    placeholder={f.later ? "Later" : "0"}
                    value={f.later ? "" : f.shipping}
                    onChange={set("shipping")}
                  />
                </IosRow>
                <IosRow label="Calculate shipping later">
                  <Switch
                    checked={f.later}
                    onCheckedChange={(v) => setF((p) => ({ ...p, later: v }))}
                  />
                </IosRow>
                <IosRow label="Ships to">
                  <IosInput label="Ships to" value={f.regions} onChange={set("regions")} />
                </IosRow>
              </IosGroup>
            </section>

            <section className="space-y-2">
              <h2 className="px-1 text-sm font-medium text-muted-foreground">
                Condition (buyers see this before checkout)
              </h2>
              <IosGroup>
                <IosRow label="Condition">
                  <IosPicker
                    label="Condition"
                    value={f.condition}
                    onChange={set("condition")}
                    options={CONDITIONS}
                  />
                </IosRow>
                <IosRow label="Packaging">
                  <IosPicker
                    label="Packaging"
                    value={f.packaging}
                    onChange={set("packaging")}
                    options={PACKAGING}
                  />
                </IosRow>
                {mode === "single" && item && (
                  <IosRow label={`Origin (catalogue: ${item.origin})`}>
                    <IosPicker
                      label="Origin override"
                      placeholder="Use catalogue"
                      clearable
                      value={f.origin}
                      onChange={set("origin")}
                      options={["Indian", "Imported"].map((v) => ({ value: v, label: v }))}
                    />
                  </IosRow>
                )}
                <IosTextArea
                  label="Condition notes"
                  placeholder={
                    f.packaging === "Sealed"
                      ? "Optional for sealed items"
                      : "Required: wear, creases, paint chips"
                  }
                  value={f.conditionNotes}
                  onChange={set("conditionNotes")}
                />
                <IosTextArea
                  label="Description"
                  rows={3}
                  value={f.description}
                  onChange={set("description")}
                />
                <IosTextArea
                  label="Return / cancellation policy"
                  value={f.returnPolicy}
                  onChange={set("returnPolicy")}
                />
              </IosGroup>
            </section>

            <section className="space-y-2">
              <h2 className="px-1 text-sm font-medium text-muted-foreground">Private to you</h2>
              <IosGroup>
                <IosRow label="Your SKU">
                  <IosInput label="Your SKU" value={f.sku} onChange={set("sku")} />
                </IosRow>
                <IosRow label="Private notes">
                  <IosInput
                    label="Private notes"
                    value={f.privateNotes}
                    onChange={set("privateNotes")}
                  />
                </IosRow>
              </IosGroup>
            </section>

            {preview && canPreview && (
              <Card className="space-y-1 border-primary/50">
                <p className="text-xs text-muted-foreground">
                  Preview: how buyers will see this offer
                </p>
                <p className="font-medium">{f.title || item?.name}</p>
                {mode === "combo" && (
                  <p className="text-xs text-muted-foreground">
                    {cars.map(({ i, b }) => `${b.qty} × ${i.name}`).join(", ")}
                  </p>
                )}
                <Price price={price} mrp={f.mrp.trim() ? toPaise(f.mrp) : null} />
                <div className="flex flex-wrap gap-1">
                  <Pill>{f.condition}</Pill>
                  <Pill>{f.packaging}</Pill>
                  <Pill tone="brand">
                    {mode === "combo" ? `Combo · ${total} cars` : "Fixed price"}
                  </Pill>
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
              <Button variant="outline" disabled={!canPreview} onClick={() => setPreview(!preview)}>
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

export type { CatalogueItem };
