import { useNavigate, useSearch } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

import { Empty, Field, inputCls, PageTitle, Sel } from "../components/bits";
import { ItemCard } from "../components/cards";
import { facets, NO_FILTERS, search, type Filters, type Sort } from "../queries";
import { useMarket } from "../use-market";

const PAGE = 12;
const SORTS: Array<[Sort, string]> = [
  ["relevance", "Relevance"],
  ["newest", "Newest"],
  ["price_asc", "Price: low to high"],
  ["price_desc", "Price: high to low"],
  ["ending", "Ending soon"],
];

export type SearchParams = Partial<Filters> & { sort?: Sort };
export const validateSearch = (raw: Record<string, unknown>): SearchParams => {
  const out: Record<string, string> = {};
  for (const k of [...Object.keys(NO_FILTERS), "sort"])
    if (typeof raw[k] === "string" && raw[k]) out[k] = raw[k] as string;
  return out as SearchParams;
};

export function SearchPage() {
  const params = useSearch({ strict: false }) as SearchParams;
  const navigate = useNavigate();
  const { s } = useMarket();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const f: Filters = { ...NO_FILTERS, ...params };
  const sort: Sort = params.sort ?? (f.q ? "relevance" : "newest");
  const hits = useMemo(() => search(s, f, sort), [s, JSON.stringify(f), sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const fx = facets(s);
  const set = (patch: Partial<Filters> & { sort?: Sort }) => {
    setShown(PAGE);
    void navigate({
      to: "/market/search",
      search: ((p: SearchParams) => ({ ...p, ...patch })) as never,
      replace: true,
    });
  };
  const active = (Object.keys(NO_FILTERS) as Array<keyof Filters>).filter((k) => k !== "q" && f[k]);

  const filters = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
      <Field label="Scale">
        <Sel
          label="Scale"
          value={f.scale}
          onChange={(v) => set({ scale: v })}
          options={fx.scale}
          any="Any scale"
        />
      </Field>
      <Field label="Brand / make">
        <Sel
          label="Brand"
          value={f.brand}
          onChange={(v) => set({ brand: v })}
          options={fx.brand}
          any="Any brand"
        />
      </Field>
      <Field label="Series">
        <Sel
          label="Series"
          value={f.series}
          onChange={(v) => set({ series: v })}
          options={fx.series}
          any="Any series"
        />
      </Field>
      <Field label="Assortment">
        <Sel
          label="Assortment"
          value={f.assortment}
          onChange={(v) => set({ assortment: v })}
          options={fx.assortment}
          any="Any assortment"
        />
      </Field>
      <Field label="Country of origin">
        <Sel
          label="Origin"
          value={f.origin}
          onChange={(v) => set({ origin: v })}
          options={["Indian", "Imported"]}
          any="Indian or imported"
        />
      </Field>
      <Field label="Condition">
        <Sel
          label="Condition"
          value={f.condition}
          onChange={(v) => set({ condition: v })}
          options={["New", "Opened", "Display"]}
          any="Any condition"
        />
      </Field>
      <Field label="Seller location">
        <Sel
          label="Location"
          value={f.location}
          onChange={(v) => set({ location: v })}
          options={fx.location}
          any="Anywhere"
        />
      </Field>
      <Field label="Availability">
        <Sel
          label="Availability"
          value={f.stock}
          onChange={(v) => set({ stock: v })}
          options={["in"]}
          any="Show all cars"
        />
      </Field>
      <Field label="Sale type">
        <select
          aria-label="Sale type"
          value={f.sale}
          onChange={(e) => set({ sale: e.target.value })}
          className={inputCls}
        >
          <option value="">Any</option>
          <option value="fixed">Fixed price</option>
          <option value="auction">Auction</option>
          <option value="raffle">Raffle</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Min ₹">
          <input
            inputMode="numeric"
            className={inputCls}
            value={f.min}
            onChange={(e) => set({ min: e.target.value.replace(/\D/g, "") })}
          />
        </Field>
        <Field label="Max ₹">
          <input
            inputMode="numeric"
            className={inputCls}
            value={f.max}
            onChange={(e) => set({ max: e.target.value.replace(/\D/g, "") })}
          />
        </Field>
      </div>
      {active.length > 0 && (
        <Button
          variant="outline"
          onClick={() =>
            void navigate({ to: "/market/search", search: { q: f.q } as never, replace: true })
          }
        >
          Clear filters
        </Button>
      )}
    </div>
  );

  return (
    <div>
      <PageTitle
        title={f.q ? `Results for “${f.q}”` : "Browse cars"}
        sub={`${hits.length} catalogue car${hits.length === 1 ? "" : "s"}`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          aria-label="Search"
          type="search"
          value={f.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Make, model, scale, series, assortment, variant, seller"
          className={inputCls + " sm:max-w-md"}
        />
        <select
          aria-label="Sort"
          value={sort}
          onChange={(e) => set({ sort: e.target.value as Sort })}
          className={inputCls + " w-auto"}
        >
          {SORTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          className="lg:hidden"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          <SlidersHorizontal /> Filters{active.length ? ` (${active.length})` : ""}
        </Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className={open ? "block" : "hidden lg:block"} aria-label="Filters">
          {filters}
        </aside>
        <div>
          {hits.length === 0 ? (
            <Empty
              title="No cars match"
              body={
                f.q || active.length
                  ? "Try fewer filters, a shorter search, or check the spelling of the make."
                  : "The catalogue is empty."
              }
              action={
                <Button
                  variant="outline"
                  onClick={() => void navigate({ to: "/market/search", search: {} as never })}
                >
                  Reset search
                </Button>
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {hits.slice(0, shown).map((h) => (
                  <ItemCard key={h.item.id} hit={h} />
                ))}
              </div>
              {shown < hits.length && (
                <div className="mt-5 flex justify-center">
                  <Button variant="outline" onClick={() => setShown(shown + PAGE)}>
                    Show more ({hits.length - shown} left)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
