import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Compass,
  Copy,
  FileSpreadsheet,
  Heart,
  LayoutGrid,
  Loader2,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  ShoppingBag,
  Sparkles,
  Truck,
  Wallet,
} from "lucide-react";

import { CarFormDialog } from "@/components/car-form-dialog";
import { CatalogCarDetails, useCarDrawer } from "@/components/car-details-drawer";
import { CompactCarCard } from "@/components/compact-car-card";
import { UploadCarsDialog } from "@/components/upload-cars-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-store";
import { logoMap, useBrandLogos } from "@/lib/brand-logos";
import { BRAND_SEED, MAKE_SEED } from "@/lib/car-options";
import { catalogCarToCatalogueCar, catalogCarToDiecast, type CatalogCar } from "@/lib/catalog";
import { applyCatalogToCar } from "@/lib/catalog-sync";
import { useCatalog } from "@/lib/catalog-store";
import { useRecentPreorders, type CatalogueCar, type RecentPreorder } from "@/lib/catalogue-search";
import { makeBlankCar, useCars, useCarsActions } from "@/lib/cars-store";
import { daysAgo, parseDMY } from "@/lib/format";
import { isPackMember, packMemberIds } from "@/lib/pack";
import { isPreOrder } from "@/lib/status-order";
import { loadTaste, ownedCandidates, saveTaste, topValues, type Taste } from "@/lib/taste";
import type { Diecast } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "What VIIV does", icon: Sparkles },
  { label: "Your taste", icon: Heart },
  { label: "Your cars", icon: Plus },
  { label: "What's new", icon: ShoppingBag },
] as const;

const FEATURES = [
  {
    icon: ScanLine,
    title: "Scan to add a car",
    text: "Point the camera at the card. Make, model and series are read off it for you.",
  },
  {
    icon: FileSpreadsheet,
    title: "Bulk import",
    text: "Already keep a spreadsheet? Save it as CSV and bring the whole collection in at once.",
  },
  {
    icon: Truck,
    title: "Track shipments",
    text: "Every order in transit, who it is coming from, and when it should arrive.",
  },
  {
    icon: Wallet,
    title: "Track spending",
    text: "What you spend each month, against MRP, by seller and by brand.",
  },
  {
    icon: Copy,
    title: "Find duplicates",
    text: "See the castings you have bought twice before you buy a third.",
  },
  {
    icon: LayoutGrid,
    title: "See your collection",
    text: "Every car you own, in a grid, a list, or the shape of the card it came on.",
  },
] as const;

/** How many cars somebody is asked to find before the wizard moves on. */
const GOAL = 7;
/** Castings offered at a time. */
const SET_SIZE = 12;
/** Sets turned down with nothing picked before the wizard stops asking. */
const SETS_BEFORE_SORRY = 2;

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

/**
 * Brands as their marks, the way the catalogue's brand row shows them: white
 * circles, because a logo is drawn for paper. A brand with no mark uploaded yet
 * keeps its name inside the circle.
 */
function BrandLogos({
  options,
  picked,
  onToggle,
}: {
  options: string[];
  picked: string[];
  onToggle: (v: string) => void;
}) {
  const logos = logoMap(useBrandLogos());
  const on = new Set(picked.map((p) => p.toLowerCase()));
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((o) => {
        const active = on.has(o.toLowerCase());
        const src = logos.get(o.trim().toLowerCase());
        return (
          <button
            key={o}
            type="button"
            aria-pressed={active}
            aria-label={o}
            title={o}
            onClick={() => onToggle(o)}
            className={cn(
              "relative grid size-16 shrink-0 place-items-center rounded-full bg-white ring-offset-2 ring-offset-background transition-all",
              active ? "ring-2 ring-primary" : "opacity-80 hover:opacity-100",
            )}
          >
            {src ? (
              <img
                src={src}
                alt={o}
                loading="lazy"
                className="size-full rounded-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <span className="px-1 text-center text-[10px] font-semibold leading-tight text-neutral-700">
                {o}
              </span>
            )}
            {active && (
              <span className="absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" />
              </span>
            )}
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

/** A catalogue casting as a car in somebody's hand: In Hand, nothing paid or dated yet. */
function ownedFrom(c: CatalogCar): Diecast {
  const blank = makeBlankCar();
  return applyCatalogToCar(
    { ...blank, catalogId: c.car_id, orderDate: "", orderMonth: "", date: "", month: "" },
    c,
  ).car;
}

/**
 * What somebody sees on their first visit, and on any visit while they own no
 * cars: what the app does, what they collect, and then the cars they already
 * have — picked off sets of catalogue castings chosen from that taste, until
 * there are seven on the shelf.
 *
 * It does not unmount when the first car is saved. The home page latches it
 * open until `onDone`, because saving one car is the start of this and not the
 * end of it.
 */
export function WelcomeWizard({ onDone }: { onDone: () => void }) {
  const { profile, isGuest } = useAuth();
  const cars = useCars();
  const { bulkAddCars } = useCarsActions();
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
  const [scanOpen, setScanOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  // The picker: which set is showing, what has been ticked, and how many sets
  // in a row came back with nothing.
  const [setIndex, setSetIndex] = useState(0);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [misses, setMisses] = useState(0);
  const [saving, setSaving] = useState(false);
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
    // A new taste is a new list; start it from the top.
    setSetIndex(0);
    setMisses(0);
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

  // Owned is left out of the list on purpose only once it is saved, so a
  // ticked car does not jump out of the set it is being ticked in.
  const candidates = useMemo(
    () => ownedCandidates(castings, taste, owned),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed per taste, not per save
    [castings, taste],
  );
  const setCount = Math.max(1, Math.ceil(candidates.length / SET_SIZE));
  const shown = candidates.slice(setIndex * SET_SIZE, (setIndex + 1) * SET_SIZE);
  const total = cars.length + ticked.size;
  const reached = cars.length >= GOAL;
  const sorry = misses >= SETS_BEFORE_SORRY && cars.length === 0 && ticked.size === 0;

  const tick = (id: string) =>
    setTicked((t) => {
      const next = new Set(t);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const nextSet = () => {
    // "None of these" only counts when nothing in this set was ticked.
    const pickedHere = shown.some((c) => ticked.has(c.car_id));
    if (!pickedHere) setMisses((m) => m + 1);
    setSetIndex((i) => (i + 1) % setCount);
    top.current?.scrollIntoView({ block: "start" });
  };

  const saveTicked = () => {
    const rows = candidates.filter((c) => ticked.has(c.car_id)).map(ownedFrom);
    if (!rows.length) return;
    setSaving(true);
    try {
      const added = bulkAddCars(rows);
      if (added.length) {
        toast.success(`${added.length} car${added.length === 1 ? "" : "s"} added`);
        setTicked(new Set());
      }
    } finally {
      setSaving(false);
    }
  };

  const freshCastings = useMemo(
    () =>
      castings
        .filter((c) => c.created_at && !owned.has(c.car_id.trim().toUpperCase()))
        .sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""))
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
  const carsStep = 2;

  return (
    <div ref={top} className="mx-auto w-full max-w-4xl space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-display text-2xl font-semibold tracking-tight">
          {first ? `Welcome, ${first}` : "Welcome to VIIV"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A minute to get your collection on the shelf.
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
                aria-label={s.label}
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
                <span className="truncate font-medium max-sm:sr-only">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {step === 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card-elevated flex gap-3 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{f.title}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{f.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="card-elevated space-y-6 p-5">
          <section>
            <h2 className="text-display text-lg font-semibold">Favourite brands</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Pick as many as you like. The next step shows cars from them.
            </p>
            <BrandLogos options={brandOptions} picked={taste.brands} onToggle={toggle("brands")} />
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

      {step === carsStep && (
        <div className="space-y-4">
          {sorry ? (
            <div className="card-elevated p-5">
              <h2 className="text-display text-lg font-semibold">
                Sorry — we couldn&rsquo;t find a car you own
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                None of those sets had one of yours. Add your first car another way:
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <Button className="gap-2" onClick={() => setScanOpen(true)}>
                  <ScanLine className="size-4" />
                  Scan to add
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => setAddOpen(true)}>
                  <Plus className="size-4" />
                  Add a car manually
                </Button>
                <Button variant="outline" className="gap-2" asChild>
                  <Link to="/catalog">
                    <Compass className="size-4" />
                    Add from the catalogue
                  </Link>
                </Button>
              </div>
              <Button
                variant="link"
                className="mt-2 h-auto px-0 text-xs"
                onClick={() => setMisses(0)}
              >
                Show me more cars instead
              </Button>
            </div>
          ) : (
            <section className="card-elevated overflow-hidden">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border p-4">
                <div className="min-w-0">
                  <h2 className="text-display text-lg font-semibold">Which of these do you own?</h2>
                  <p className="text-xs text-muted-foreground">
                    Tap every one you have. Find {GOAL} to fill your first shelf.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-display text-lg font-semibold tabular-nums">
                    {Math.min(total, GOAL)}/{GOAL}
                  </div>
                  <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, (total / GOAL) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 p-2.5 sm:grid-cols-4 lg:grid-cols-6">
                {shown.map((c) => {
                  const on = ticked.has(c.car_id);
                  const have = owned.has(c.car_id.trim().toUpperCase());
                  return (
                    <div key={c.car_id} className="relative">
                      <CompactCarCard
                        car={catalogCarToDiecast(c)}
                        onOpen={() => !have && tick(c.car_id)}
                        hideStatus
                        className={cn(
                          "w-full transition-all",
                          (on || have) && "ring-2 ring-primary",
                          have && "opacity-60",
                        )}
                      />
                      {(on || have) && (
                        <span className="pointer-events-none absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground shadow">
                          <Check className="size-3.5" />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3">
                <Button variant="outline" className="gap-2" onClick={nextSet}>
                  <RefreshCw className="size-4" />
                  {shown.some((c) => ticked.has(c.car_id))
                    ? "Show another set"
                    : "None of these — show another set"}
                </Button>
                <Button
                  className="gap-2"
                  disabled={ticked.size === 0 || saving}
                  onClick={saveTicked}
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  {ticked.size
                    ? `Add ${ticked.size} car${ticked.size === 1 ? "" : "s"}`
                    : "Add to my collection"}
                </Button>
              </div>
            </section>
          )}

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

          {!sorry && (
            <p className="text-center text-xs text-muted-foreground">
              Can&rsquo;t see yours?{" "}
              <button type="button" className="underline" onClick={() => setScanOpen(true)}>
                Scan it
              </button>
              ,{" "}
              <button type="button" className="underline" onClick={() => setAddOpen(true)}>
                add it by hand
              </button>{" "}
              or{" "}
              <button type="button" className="underline" onClick={() => setUploadOpen(true)}>
                import a spreadsheet
              </button>
              .
            </p>
          )}
        </div>
      )}

      {step === 3 && (
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
        {step === carsStep && !reached && misses < SETS_BEFORE_SORRY ? (
          // Seven is the ask. Two sets in a row with nothing found and it stops
          // insisting: the way on is open, and the sorry card if there are none.
          <Button disabled className="gap-2">
            {GOAL - cars.length} more to go
          </Button>
        ) : step < STEPS.length - 1 ? (
          <Button className="gap-2" onClick={() => goTo(step + 1)}>
            {step === 0 ? "Get started" : "Continue"}
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
        open={scanOpen}
        onOpenChange={setScanOpen}
        mode="add"
        startWithScan
        draftScope="welcome-scan"
      />
      <CarFormDialog
        open={adding !== null}
        onOpenChange={(v) => !v && setAdding(null)}
        mode="add"
        prefill={adding?.prefill ?? null}
        prefillStatus={adding?.status ?? ""}
        draftScope="welcome"
      />
      <UploadCarsDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}
