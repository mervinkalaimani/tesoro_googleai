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
import { createFileRoute, Link } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import type { CatalogCar } from "@/lib/catalog";
import {
  castingDescription,
  castingName,
  castingTitle,
  isPublishablePhoto,
  ownersLine,
  priceBand,
  type CastingStats,
} from "@/lib/casting-page";
import { carSubLine } from "@/lib/car-subline";
import { RARITY_LABEL, rarityOf } from "@/lib/rarity";
import { HomeScreenMark } from "@/components/brand-mark";

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

    if (!car) return { car: null, stats: null, inSeries: [], inBrand: [] };

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
      <Shell>
        <h1 className="text-display text-xl font-semibold">No such casting</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing in the catalogue carries that ID. It may have been merged into another entry.
        </p>
      </Shell>
    );
  }

  const name = castingName(car);
  const photo = isPublishablePhoto(car.image_url) ? String(car.image_url) : "";
  const band = priceBand(stats);
  const owners = ownersLine(stats);
  const rarity = rarityOf({ rarity: car.rarity } as never);

  // Read by search engines, not by people: the same facts the page shows,
  // in the shape they index. `offers` only exists when the band does, because
  // the band is the only price this page is allowed to quote.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    ...(car.brand ? { brand: { "@type": "Brand", name: car.brand } } : {}),
    ...(photo ? { image: photo } : {}),
    ...(car.car_number ? { sku: car.car_number } : {}),
    description: castingDescription(car),
    ...(stats?.paid_min && stats.paid_max && stats.paid_min !== stats.paid_max
      ? {
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "INR",
            lowPrice: stats.paid_min,
            highPrice: stats.paid_max,
            offerCount: stats.prices,
          },
        }
      : {}),
  };

  return (
    <Shell>
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

          {(owners || band) && (
            <div className="mt-4 rounded-xl border border-border bg-card p-3">
              {owners ? <p className="text-sm text-foreground">{owners}</p> : null}
              {band ? (
                <p className="mt-1 text-sm text-foreground">
                  <span className="text-muted-foreground">Paid here: </span>
                  {band}
                </p>
              ) : null}
              {!band && owners ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Prices appear once three collectors have bought one.
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

      <SiblingList
        title={`More from ${car.series || car.assortment || car.brand}`}
        cars={inSeries}
      />
      <SiblingList title={`More ${car.brand}`} cars={inBrand} />
    </Shell>
  );
}

/**
 * The public chrome: the mark, and one way in. Deliberately not `AppShell` —
 * a visitor who has never signed in has no collection for a sidebar to be
 * about, and the only thing this page wants from them is curiosity.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <HomeScreenMark className="size-7" />
            <span className="text-display text-sm font-semibold tracking-tight">Tesoro</span>
          </Link>
          <Link
            to="/login"
            className="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-foreground/30"
          >
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-4xl px-4 pb-10 text-[11px] text-muted-foreground">
        Tesoro is a collection tracker. Catalogue entries are contributed by its collectors.
      </footer>
    </div>
  );
}
