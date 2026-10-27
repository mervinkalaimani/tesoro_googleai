import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Compass,
  Heart,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Table2,
} from "lucide-react";

import { BulkAddCarsDialog } from "@/components/bulk-add-cars-dialog";
import { CarFormDialog } from "@/components/car-form-dialog";
import { CatalogCarDetails, useCarDrawer } from "@/components/car-details-drawer";
import { CompactCarCard } from "@/components/compact-car-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-store";
import { BRAND_SEED, MAKE_SEED } from "@/lib/car-options";
import { catalogCarToCatalogueCar, catalogCarToDiecast, type CatalogCar } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-store";
import { useRecentPreorders, type CatalogueCar, type RecentPreorder } from "@/lib/catalogue-search";
import { makeBlankCar, useCars } from "@/lib/cars-store";
import { daysAgo, parseDMY } from "@/lib/format";
import { isPackMember, packMemberIds } from "@/lib/pack";
import { isPreOrder } from "@/lib/status-order";
import {
  loadTaste,
  matchesTaste,
  newestFirst,
  saveTaste,
  topValues,
  type Taste,
} from "@/lib/taste";
import type { Diecast } from "@/lib/types";

const STEPS = [
  { label: "Your taste", icon: Heart },
  { label: "Your cars", icon: Plus },
  { label: "What's new", icon: Sparkles },
] as const;

/** A thing to look at in the details panel, and whether it is a pre-order. */
type Viewing = { car: Diecast; catalogCar?: CatalogCar; preOrder: boolean };
/** A casting to start the add form from, and the status it should open on. */
type Adding = { prefill: CatalogueCar; status: string };

const chip = (on: boolean) =>
  `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
    on
      ? "border-primary bg-primary/10 font-medium text-primary"
      : "border-border bg-card text-foreground/80 hover:border-primary/40"
  }`;

function Chips({
  options,
  picked,
  onToggle,
}: {
  options: string[];
  picked: string[];
  onToggle: (v: string) => void;
}) {
  const on = new Set(picked.map((p) => p.toLowerCase()));
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = on.has(o.toLowerCase());
        return (
          <button
            key={o}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(o)}
            className={chip(active)}
          >
            {active && <Check className="size-3.5" />}
            {o}
          </button>
        );
      })}
    </div>
  );
}

function Shelf({
  title,
  hint,
  icon,
  children,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card-elevated flex min-w-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="min-w-0">
          <h2 className="text-display text-lg font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        {icon}
      </div>
      <div className="flex snap-x scroll-px-2.5 items-stretch gap-2.5 overflow-x-auto p-2.5">
        {children}
      </div>
    </section>
  );
}

/**
 * What somebody sees on their first visit, and on any visit while they own no
 * cars: a short walk from an empty account to a populated one.
 *
 * Three steps — what they collect, the cars they already have, and what other
 * people are adding — and only the cars matter. Everything else can be skipped,
 * and a car needs nothing but which one it is: no seller, no order date, no
 * delivery date.
 *
 * It does not unmount when the first car is saved. The home page latches it
 * open until `onDone`, because saving one car is the start of this and not the
 * end of it.
 */
export function WelcomeWizard({ onDone }: { onDone: () => void }) {
  const { profile, isGuest } = useAuth();
  const cars = useCars();
  const { open: openDrawer } = useCarDrawer();
  const { catalog, packMembers, findMatchingInCatalog } = useCatalog();

  const who = profile?.sno ?? "me";
  const first = (profile?.first_name || "").trim().split(/\s+/)[0];

  const [step, setStep] = useState(0);
  const [taste, setTaste] = useState<Taste>({ brands: [], makes: [] });
  const [makeQuery, setMakeQuery] = useState("");
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [adding, setAdding] = useState<Adding | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  // Read after mount: the server render has no localStorage.
  useEffect(() => {
    setTaste(loadTaste(who));
  }, [who]);

  const toggle = (kind: keyof Taste) => (v: string) => {
    setTaste((t) => {
      const has = t[kind].some((x) => x.toLowerCase() === v.toLowerCase());
      const next = {
        ...t,
        [kind]: has ? t[kind].filter((x) => x.toLowerCase() !== v.toLowerCase()) : [...t[kind], v],
      };
      saveTaste(who, next);
      return next;
    });
  };

  const goTo = useCallback((n: number) => {
    setStep(n);
    top.current?.scrollIntoView({ block: "start" });
  }, []);

  // Cars that only come inside a box are not castings to suggest on their own.
  const memberIds = useMemo(() => packMemberIds(packMembers), [packMembers]);
  const castings = useMemo(
    () => catalog.filter((c) => c.car_id && !isPackMember(catalogCarToDiecast(c), memberIds)),
    [catalog, memberIds],
  );

  const brandOptions = useMemo(() => {
    const seen = topValues(
      castings.map((c) => c.brand),
      18,
    );
    // The catalogue may be thin on a new deployment; the seed list is not.
    const fill = topValues([...BRAND_SEED], 18);
    return [...new Set([...taste.brands, ...seen, ...fill])].slice(0, 22);
  }, [castings, taste.brands]);

  const makeOptions = useMemo(() => {
    const brands = new Set(taste.brands.map((b) => b.toLowerCase()));
    const inBrands = brands.size
      ? castings.filter((c) => brands.has((c.brand || "").trim().toLowerCase()))
      : castings;
    const q = makeQuery.trim().toLowerCase();
    if (q) {
      const all = topValues([...castings.map((c) => c.make), ...MAKE_SEED], 400);
      return all.filter((m) => m.toLowerCase().includes(q)).slice(0, 30);
    }
    const common = topValues(
      inBrands.map((c) => c.make),
      24,
    );
    const fill = common.length < 12 ? topValues([...MAKE_SEED], 24) : [];
    return [...new Set([...taste.makes, ...common, ...fill])].slice(0, 30);
  }, [castings, taste.brands, taste.makes, makeQuery]);

  const owned = useMemo(
    () => new Set(cars.map((c) => (c.catalogId || "").trim().toUpperCase()).filter(Boolean)),
    [cars],
  );

  const hasTaste = taste.brands.length + taste.makes.length > 0;
  const picks = useMemo(
    () =>
      hasTaste
        ? newestFirst(castings)
            .filter((c) => matchesTaste(c, taste) && !owned.has(c.car_id.trim().toUpperCase()))
            .slice(0, 14)
        : [],
    [castings, taste, hasTaste, owned],
  );

  const freshCastings = useMemo(
    () =>
      newestFirst(castings.filter((c) => c.created_at))
        .filter((c) => !owned.has(c.car_id.trim().toUpperCase()))
        .slice(0, 16),
    [castings, owned],
  );

  const { cars: shared, loading: preordersLoading } = useRecentPreorders(!isGuest);
  const preorders = useMemo(() => {
    const mine = new Set(cars.filter((c) => isPreOrder(c.status)).map((c) => c.catalogId));
    return shared.filter((p) => !p.catalogId || !mine.has(p.catalogId)).slice(0, 16);
  }, [shared, cars]);

  const viewCatalogue = (c: CatalogCar, preOrder = false) =>
    setViewing({ car: catalogCarToDiecast(c), catalogCar: c, preOrder });

  const viewPreorder = (p: RecentPreorder) => {
    const cat = findMatchingInCatalog({
      brand: p.brand,
      make: p.make,
      model: p.model,
      assortment: p.assortment,
      series: p.series,
      subSeries: p.subSeries,
      carNumber: p.carNumber,
      mrp: p.mrp,
      variant: p.variant,
      colour: p.colour,
    });
    const id = cat?.car_id || p.catalogId || `preorder-${p.make}-${p.model}-${p.colour}`;
    setViewing({
      car: { ...makeBlankCar(), ...p, id, catalogId: id, spent: p.mrp } as unknown as Diecast,
      catalogCar: cat,
      preOrder: true,
    });
  };

  const startAdd = (pick: CatalogCar | undefined, status: string) => {
    const from = pick ?? viewing?.catalogCar;
    const prefill = from
      ? catalogCarToCatalogueCar(from)
      : (viewing?.car as unknown as CatalogueCar | undefined);
    setViewing(null);
    if (prefill) setAdding({ prefill, status });
  };

  const empty = cars.length === 0;

  return (
    <div ref={top} className="mx-auto w-full max-w-4xl space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-display text-2xl font-semibold tracking-tight">
          {first ? `Welcome, ${first}` : "Welcome to VIIV"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Three quick steps to get your collection on the shelf. Only the cars matter — skip the
          rest whenever you like.
        </p>
      </div>

      <ol className="flex items-center gap-2" aria-label="Setup steps">
        {STEPS.map((s, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li key={s.label} className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-current={current ? "step" : undefined}
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  current
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                    current || done ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className="truncate font-medium">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {step === 0 && (
        <div className="card-elevated space-y-6 p-5">
          <section>
            <h2 className="text-display text-lg font-semibold">Favourite brands</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Pick as many as you like. We'll use them to suggest cars you may already own.
            </p>
            <Chips options={brandOptions} picked={taste.brands} onToggle={toggle("brands")} />
          </section>

          <section>
            <h2 className="text-display text-lg font-semibold">Favourite makes</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              {taste.brands.length > 0
                ? "The makes these brands produce most. Search for any other."
                : "Porsche, Nissan, Ford… Search for any other."}
            </p>
            <div className="relative mb-3 max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={makeQuery}
                onChange={(e) => setMakeQuery(e.target.value)}
                placeholder="Search makes"
                className="pl-8"
                aria-label="Search makes"
              />
            </div>
            {makeOptions.length > 0 ? (
              <Chips options={makeOptions} picked={taste.makes} onToggle={toggle("makes")} />
            ) : (
              <p className="text-sm text-muted-foreground">No make matches “{makeQuery}”.</p>
            )}
          </section>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="card-elevated p-5">
            <h2 className="text-display text-lg font-semibold">Add the cars you own</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Search the catalogue, pick the car, and you're done — it fills in the rest. Seller,
              order date and delivery date are all optional; add them whenever you know them.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button className="gap-2" onClick={() => setAddOpen(true)}>
                <Plus className="size-4" />
                Add a car
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => setBulkOpen(true)}>
                <Table2 className="size-4" />
                Add several at once
              </Button>
              <Button variant="ghost" className="gap-2" asChild>
                <Link to="/catalog">
                  <Compass className="size-4" />
                  Explore catalogue
                </Link>
              </Button>
            </div>
          </div>

          {cars.length > 0 && (
            <Shelf
              title="On your shelf"
              hint={`${cars.length} car${cars.length === 1 ? "" : "s"} added so far`}
              icon={<Check className="size-4 text-emerald-500" />}
            >
              {cars.map((c, i) => (
                <CompactCarCard
                  key={c.id + i}
                  car={c}
                  onOpen={() => openDrawer(c)}
                  hideStatus
                  className="w-36 shrink-0 snap-start sm:w-40"
                />
              ))}
            </Shelf>
          )}

          {picks.length > 0 && (
            <Shelf
              title="Do you own any of these?"
              hint="From the brands and makes you picked — tap one to add it"
              icon={<Heart className="size-4 text-accent" />}
            >
              {picks.map((c) => (
                <CompactCarCard
                  key={c.car_id}
                  car={catalogCarToDiecast(c)}
                  onOpen={() => viewCatalogue(c)}
                  hideStatus
                  className="w-36 shrink-0 snap-start sm:w-40"
                />
              ))}
            </Shelf>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <Shelf
            title="New Pre Orders"
            hint="The newest castings other collectors have pre-ordered"
            icon={<ShoppingBag className="size-4 text-accent" />}
          >
            {preordersLoading ? (
              <p className="p-3 text-sm text-muted-foreground">Loading…</p>
            ) : preorders.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                Nothing new has been pre-ordered this week.
              </p>
            ) : (
              preorders.map((p, i) => {
                const added = parseDMY(p.lastOrdered);
                return (
                  <CompactCarCard
                    key={`${p.make}-${p.model}-${p.colour}-${i}`}
                    car={{ ...makeBlankCar(), ...p, spent: p.mrp } as unknown as Diecast}
                    onOpen={() => viewPreorder(p)}
                    caption={added ? daysAgo(added) : undefined}
                    hideStatus
                    className="w-36 shrink-0 snap-start sm:w-40"
                  />
                );
              })
            )}
          </Shelf>

          <Shelf
            title="Added to the catalogue"
            hint="The latest castings anyone has filed"
            icon={<Sparkles className="size-4 text-accent" />}
          >
            {freshCastings.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Nothing new in the catalogue yet.</p>
            ) : (
              freshCastings.map((c) => (
                <CompactCarCard
                  key={c.car_id}
                  car={catalogCarToDiecast(c)}
                  onOpen={() => viewCatalogue(c, c.release_status === "Pre Order")}
                  caption={c.created_at ? daysAgo(new Date(c.created_at)) : undefined}
                  hideStatus
                  className="w-36 shrink-0 snap-start sm:w-40"
                />
              ))
            )}
          </Shelf>

          <div className="card-elevated flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <h2 className="text-display text-lg font-semibold">Want to look around?</h2>
              <p className="text-sm text-muted-foreground">
                The catalogue lists every casting — find one, and add it from there.
              </p>
            </div>
            <Button asChild className="gap-2">
              <Link to="/catalog">
                <Compass className="size-4" />
                Explore catalogue
              </Link>
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        {step > 0 ? (
          <Button variant="ghost" className="gap-2" onClick={() => goTo(step - 1)}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        ) : (
          <Button variant="ghost" onClick={onDone}>
            Skip setup
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button
            variant={step === 1 && empty ? "outline" : "default"}
            className="gap-2"
            onClick={() => goTo(step + 1)}
          >
            {step === 1 && empty ? "Skip for now" : "Continue"}
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button className="gap-2" onClick={onDone}>
            {empty ? "Go to dashboard" : "Finish"}
            <ArrowRight className="size-4" />
          </Button>
        )}
      </div>

      <CatalogCarDetails
        car={viewing?.car ?? null}
        catalogCar={viewing?.catalogCar}
        preOrder={viewing?.preOrder ?? false}
        owned={Boolean(viewing?.catalogCar && owned.has(viewing.catalogCar.car_id.toUpperCase()))}
        onClose={() => setViewing(null)}
        onAdd={(pick) => startAdd(pick, viewing?.preOrder ? "PO" : "In Hand")}
      />
      <CarFormDialog open={addOpen} onOpenChange={setAddOpen} mode="add" />
      <CarFormDialog
        open={adding !== null}
        onOpenChange={(v) => !v && setAdding(null)}
        mode="add"
        prefill={adding?.prefill ?? null}
        prefillStatus={adding?.status ?? ""}
        draftScope="welcome"
      />
      <BulkAddCarsDialog open={bulkOpen} onOpenChange={setBulkOpen} />
    </div>
  );
}
