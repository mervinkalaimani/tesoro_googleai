/**
 * One casting, readable by anyone.
 *
 * Everything else in this app is behind AuthGate, which is right for a
 * collection and wrong for a catalogue: 1,563 castings that nobody outside the
 * app can see are 1,563 pages that answer a question people are already typing
 * into a search box. This is that page — server-rendered, so the answer is in
 * the HTML rather than assembled after hydration, and linked to its siblings,
 * so the catalogue reads as a site rather than as orphans.
 *
 * The underscore keeps it out of `catalog.tsx`, which stays behind the gate and
 * is untouched.
 *
 * What it may say is decided in `src/lib/casting-page.ts` and, for anything
 * drawn from what people own, by `tesoro_casting_public_stats` in the database:
 * counts and a price band over at least three buyers, and never a name.
 */
import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import type { CatalogCar } from "@/lib/catalog";
import {
  castingDescription,
  castingName,
  castingTitle,
  isPublishablePhoto,
  ownersLine,
  typicalPrice,
  typicalPriceNote,
  type CastingStats,
} from "@/lib/casting-page";
import { carSubLine } from "@/lib/car-subline";
import { inrFull } from "@/lib/format";
import { RARITY_LABEL, rarityOf } from "@/lib/rarity";

type Sibling = Pick<CatalogCar, "car_id" | "name" | "make" | "model" | "variant" | "car_number">;

type LoaderData = {
  car: CatalogCar | null;
  stats: CastingStats | null;
  inSeries: Sibling[];
  inBrand: Sibling[];
};

const SIBLING_FIELDS = "car_id, name, make, model, variant, car_number";

export const Route = createFileRoute("/catalog_/$carId")({
  loader: async ({ params }): Promise<LoaderData> => {
    const id = decodeURIComponent(params.carId).trim().toUpperCase();
    const { data: car } = await supabase
      .from("tesoro_car_catalog")
      .select("*")
      .eq("car_id", id)
      .maybeSingle();

    // A casting that does not exist is not a page. Returning one with
    // `noindex` still answered 200, so every misspelt ID a crawler invented
    // was a real URL as far as it could tell.
    if (!car) throw notFound();

    // The stats come from a function rather than a table: tesoro_raw is nobody's
    // business but its owner's, and this returns only what cannot be traced back
    // to a person.
    const [stats, series, brand] = await Promise.all([
      // Cast because integrations/supabase/types.ts is generated and has not
      // been regenerated since the migration that added this function.
      (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown }>
      )("tesoro_casting_public_stats", { _car_id: car.car_id }),
      car.series
        ? supabase
            .from("tesoro_car_catalog")
            .select(SIBLING_FIELDS)
            .eq("brand", car.brand)
            .eq("series", car.series)
            .neq("car_id", car.car_id)
            .limit(12)
        : Promise.resolve({ data: [] }),
      supabase
        .from("tesoro_car_catalog")
        .select(SIBLING_FIELDS)
        .eq("brand", car.brand)
        .neq("car_id", car.car_id)
        .limit(12),
    ]);

    const row = Array.isArray(stats.data) ? stats.data[0] : stats.data;
    return {
      car: car as CatalogCar,
      stats: (row as CastingStats) ?? null,
      inSeries: (series.data ?? []) as Sibling[],
      inBrand: (brand.data ?? []) as Sibling[],
    };
  },

  // The CDN carries the crawl: a casting changes when somebody corrects it,
  // which is rarely, and an hour-old answer is the right trade for a page that
  // has to be fast the first time it is ever asked for.
  headers: () => ({
    "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
  }),

  head: ({ loaderData }) => {
    const car = loaderData?.car;
    if (!car) {
      return {
        meta: [{ title: "Casting not found | Tesoro" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = castingTitle(car);
    const description = castingDescription(car);
    const image = isPublishablePhoto(car.image_url) ? String(car.image_url) : undefined;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:type", content: "product" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        ...(image ? [{ property: "og:image", content: image }] : []),
        { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      // The ID is upper-cased before it is looked up, so /catalog/<lowercase>
      // and any query string a share adds are the same page as this one.
      // Relative, because the document's own origin is the right answer on
      // production and on a preview deployment alike.
      links: [{ rel: "canonical", href: `/catalog/${car.car_id}` }],
    };
  },

  component: CastingPage,
});

function Field({ label, value }: { label: string; value?: string | null }) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  return (
    <div className="border-b border-border/60 py-2">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{v}</dd>
    </div>
  );
}

function SiblingList({ title, cars }: { title: string; cars: Sibling[] }) {
  if (cars.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {cars.map((c) => (
          <li key={c.car_id}>
            <Link
              to="/catalog/$carId"
              params={{ carId: c.car_id }}
              className="inline-flex rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-foreground/30"
            >
              {castingName(c as CatalogCar)}
              {c.car_number ? (
                <span className="ml-1.5 text-muted-foreground">{c.car_number}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CastingPage() {
  const { car, stats, inSeries, inBrand } = Route.useLoaderData();

  if (!car) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-3 md:p-6">
        <h1 className="text-display text-xl font-semibold">No such casting</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing in the catalogue carries that ID. It may have been merged into another entry.
        </p>
      </div>
    );
  }

  const name = castingName(car);
  const photo = isPublishablePhoto(car.image_url) ? String(car.image_url) : "";
  // What it goes for, once enough people have bought one to say. Otherwise the
  // maker's list price, which belongs to the casting rather than to anybody.
  const typical = typicalPrice(stats);
  const typicalNote = typicalPriceNote(stats);
  const mrp = !typical && car.mrp > 0 ? inrFull(car.mrp) : "";
  const owners = ownersLine(stats);
  const rarity = rarityOf({ rarity: car.rarity } as never);

  // Read by search engines, not by people: the same facts the page shows, in
  // the shape they index. The offer is what the page prints and nothing more —
  // a range once two collectors have bought one, otherwise the list price.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    ...(car.brand ? { brand: { "@type": "Brand", name: car.brand } } : {}),
    ...(photo ? { image: photo } : {}),
    ...(car.car_number ? { sku: car.car_number } : {}),
    description: castingDescription(car),
    ...(typical && stats?.paid_min != null && stats.paid_max != null
      ? {
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "INR",
            lowPrice: stats.paid_min,
            highPrice: stats.paid_max,
            offerCount: stats.prices,
          },
        }
      : car.mrp > 0
        ? { offers: { "@type": "Offer", priceCurrency: "INR", price: car.mrp } }
        : {}),
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-3 md:p-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="grid gap-6 sm:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div>
          {photo ? (
            <figure>
              <img
                src={photo}
                alt={name}
                width={640}
                height={480}
                className="w-full rounded-xl border border-border bg-card object-contain"
              />
              {car.image_source_url ? (
                <figcaption className="mt-1.5 text-[11px] text-muted-foreground">
                  Photo from{" "}
                  <a
                    href={car.image_source_url}
                    rel="nofollow noopener noreferrer"
                    target="_blank"
                    className="underline underline-offset-2"
                  >
                    its wiki page
                  </a>
                  , CC BY-SA.
                </figcaption>
              ) : null}
            </figure>
          ) : (
            <div className="grid aspect-[4/3] w-full place-items-center rounded-xl border border-dashed border-border bg-card px-4 text-center text-xs text-muted-foreground">
              No photograph of this casting yet.
            </div>
          )}
        </div>

        <div className="min-w-0">
          <h1 className="text-display text-2xl font-semibold tracking-tight text-foreground">
            {name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {carSubLine({
              brand: car.brand,
              assortment: car.assortment,
              series: car.series,
              subSeries: car.sub_series,
              carNumber: car.car_number,
              caseNumber: "",
            } as never)}
          </p>

          {(owners || typical || mrp) && (
            <div className="mt-4 rounded-xl border border-border bg-card p-3">
              {/* One casting, one owner, is one receipt — so that is the MRP,
                  which belongs to the casting. Once a second collector has
                  bought one there is something to average, and the figure
                  becomes what it goes for rather than what it lists at. */}
              {typical || mrp ? (
                <>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {typical ? "Typically sold for" : "MRP"}
                  </p>
                  <p className="text-lg font-semibold text-foreground">{typical || mrp}</p>
                  {typical && typicalNote ? (
                    <p className="text-[11px] text-muted-foreground">{typicalNote}</p>
                  ) : null}
                </>
              ) : null}
              {owners ? (
                <p className={`text-sm text-foreground${typical || mrp ? " mt-2" : ""}`}>
                  {owners}
                </p>
              ) : null}
            </div>
          )}

          <dl className="mt-4">
            <Field label="Make" value={car.make} />
            <Field label="Model" value={car.model} />
            <Field label="Variant" value={car.variant} />
            <Field label="Year" value={car.year} />
            <Field label="Colour" value={car.colour} />
            <Field label="Type" value={car.type} />
            <Field label="Scale" value={car.size} />
            <Field label="Collector number" value={car.car_number} />
            <Field label="Rarity" value={rarity === "Normal" ? "" : RARITY_LABEL[rarity]} />
            <Field
              label="Pack"
              value={
                car.is_multipack ? `Multipack${car.pack_size ? ` of ${car.pack_size}` : ""}` : ""
              }
            />
            <Field label="Catalogue ID" value={car.car_id} />
          </dl>
        </div>
      </div>

      <SiblingList title={`More from ${car.series || car.type || car.brand}`} cars={inSeries} />
      <SiblingList title={`More ${car.brand}`} cars={inBrand} />
    </div>
  );
}
