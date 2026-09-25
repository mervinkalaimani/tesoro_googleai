import { useMemo, useState } from "react";

import { Combobox } from "@/components/ui/combobox";
import { SegmentControl } from "@/components/segment-control";
import { Field, ClearableInput } from "@/components/form-parts";
import {
  assortmentOptionsFor,
  modelOptionsFor,
  optionsFor,
  variantOptionsFor,
  yearOptionsFor,
} from "@/lib/car-options";
import { RARITIES, type Rarity } from "@/lib/rarity";
import { needsCarNumber } from "@/lib/duplicate";
import type { Diecast } from "@/lib/types";

/**
 * What a casting *is* — the thirteen fields shared by every copy of it.
 *
 * One component for all three forms that edit them: adding a car, editing a car,
 * and adding or editing a catalogue entry. They were three separate grids with
 * three spellings of the same labels, and only one of them had learned that an
 * assortment belongs to its brand or that a year is a list.
 *
 * Nothing here is about a purchase. What a copy cost, who sold it, what box it
 * came out of and what condition it is in belong to the row that owns it, never
 * to the casting — which is the rule the catalogue form already followed and the
 * car form now follows too.
 *
 * The order is how a car is read off the back of its card: the name first (make,
 * model, variant), then what it looks like (year, colour, type), then who made
 * it and how special it is (brand, assortment, rarity), then where it sat in the
 * release (series, sub series, car number), and the scale last.
 */
export type CatalogueValues = {
  make: string;
  model: string;
  variant: string;
  year: string;
  colour: string;
  type: string;
  brand: string;
  assortment: string;
  series: string;
  subSeries: string;
  carNumber: string;
  size: string;
  rarity: Rarity;
};

export const BLANK_CATALOGUE_VALUES: CatalogueValues = {
  make: "",
  model: "",
  variant: "",
  year: "",
  colour: "",
  type: "",
  brand: "",
  assortment: "",
  series: "",
  subSeries: "",
  carNumber: "",
  size: "1:64",
  rarity: "Normal",
};

export function CatalogueFields({
  values,
  onChange,
  cars,
  errorFor,
  disabled = false,
  allowCarNumberEdit = true,
  /**
   * Fields the caller handles itself. The catalogue form keeps rarity beside
   * release status at the top of its own dialog, for instance.
   */
  omit = [],
  chain = false,
}: {
  values: CatalogueValues;
  onChange: <K extends keyof CatalogueValues>(key: K, value: CatalogueValues[K]) => void;
  /** The collection the suggestion lists are ranked from. */
  cars: Diecast[];
  errorFor?: (key: keyof CatalogueValues) => string | undefined;
  /** Edit mode for an owned car: what the casting is stays as catalogued. */
  disabled?: boolean;
  /** When true, carNumber remains editable even if casting fields are disabled. */
  allowCarNumberEdit?: boolean;
  omit?: (keyof CatalogueValues)[];
  /** Adding by hand: opening one field opens the next. */
  chain?: boolean;
}) {
  const err = (k: keyof CatalogueValues) => errorFor?.(k);

  /**
   * Answering one identity field opens the next: make, then model, then
   * variant, then year. Entering a car by hand is four questions in a fixed
   * order and this walks them, instead of making you find and tap each box.
   *
   * It only ever opens a field that is EMPTY. Going back to correct the make
   * on a form you have already filled in should not reopen three lists behind
   * you, and a variant you deliberately left blank stays blank.
   */
  const [chainAt, setChainAt] = useState({ model: 0, variant: 0, year: 0 });
  const advance = (to: "model" | "variant" | "year") => {
    if (!chain) return;
    if ((values[to] || "").trim()) return;
    setChainAt((p) => ({ ...p, [to]: p[to] + 1 }));
  };
  const skip = (k: keyof CatalogueValues) => omit.includes(k);
  // Hot Wheels and Matchbox print a position in a series, not a number that
  // belongs to the casting, so they are the two brands that cannot be asked.
  const carNumberRequired = needsCarNumber(values.brand);

  const makeOptions = useMemo(() => optionsFor("make", cars), [cars]);
  const modelOptions = useMemo(() => modelOptionsFor(cars, values.make), [cars, values.make]);
  // One level below the model: "R34" only means something once you know it is a
  // Skyline.
  const variantOptions = useMemo(
    () => variantOptionsFor(cars, values.make, values.model),
    [cars, values.make, values.model],
  );
  const yearOptions = useMemo(() => yearOptionsFor(cars), [cars]);
  const colourOptions = useMemo(() => optionsFor("colour", cars), [cars]);
  const typeOptions = useMemo(() => optionsFor("type", cars), [cars]);
  const brandOptions = useMemo(() => optionsFor("brand", cars), [cars]);
  // An assortment belongs to its brand the way a model belongs to its make:
  // "Qube Carz" is Mini GT's, and offering it under Matchbox helped nobody.
  const assortmentOptions = useMemo(
    () => assortmentOptionsFor(cars, values.brand),
    [cars, values.brand],
  );
  const sizeOptions = useMemo(() => optionsFor("size", cars), [cars]);
  const seriesOptions = useMemo(() => optionsFor("series", cars), [cars]);
  const subSeriesOptions = useMemo(() => optionsFor("subSeries", cars), [cars]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {!skip("make") && (
        <Field label="Make *" name="make" error={err("make")}>
          <Combobox
            clearable
            disabled={disabled}
            value={values.make}
            onChange={(v) => {
              onChange("make", v);
              if (v) advance("model");
            }}
            options={makeOptions}
            placeholder="e.g. Porsche, Nissan, Ford"
            searchPlaceholder="Search makes, or type a new one…"
            ariaLabel="Make"
          />
        </Field>
      )}

      {!skip("model") && (
        <Field label="Model *" name="model" error={err("model")}>
          <Combobox
            clearable
            disabled={disabled}
            value={values.model}
            openSignal={chainAt.model}
            onChange={(v) => {
              onChange("model", v);
              if (v) advance("variant");
            }}
            options={modelOptions}
            // The base name only. The trim goes in Variant next to it, so
            // "Skyline" here and "GT-R R34" there.
            placeholder="e.g. Skyline, Supra, 911"
            searchPlaceholder="Search models, or type a new one…"
            ariaLabel="Model"
          />
        </Field>
      )}

      {!skip("variant") && (
        <Field label="Variant">
          <Combobox
            clearable
            disabled={disabled}
            value={values.variant}
            openSignal={chainAt.variant}
            onChange={(v) => {
              onChange("variant", v);
              if (v) advance("year");
            }}
            options={variantOptions}
            placeholder="e.g. R34, KH, Custom"
            searchPlaceholder="Search variants, or type a new one…"
            ariaLabel="Variant"
          />
        </Field>
      )}

      {/* A list, not a free box: the years already in the collection, newest
          first, and still typeable for anything odd. */}
      {!skip("year") && (
        <Field label="Year">
          <Combobox
            clearable
            disabled={disabled}
            value={values.year}
            openSignal={chainAt.year}
            onChange={(v) => onChange("year", v)}
            options={yearOptions}
            placeholder="e.g. 2024 or '71"
            searchPlaceholder="Search years, or type one…"
            ariaLabel="Year"
          />
        </Field>
      )}

      {!skip("series") && (
        <Field label="Series">
          <Combobox
            clearable
            disabled={disabled}
            value={values.series}
            onChange={(v) => onChange("series", v)}
            options={seriesOptions}
            placeholder="e.g. Circuit Legends, HW Exotics"
            searchPlaceholder="Search series, or type a new one…"
            ariaLabel="Series"
          />
        </Field>
      )}

      {!skip("subSeries") && (
        <Field label="Sub Series">
          <Combobox
            clearable
            disabled={disabled}
            value={values.subSeries}
            onChange={(v) => onChange("subSeries", v)}
            options={subSeriesOptions}
            placeholder="e.g. Factory Fresh, Then and Now"
            searchPlaceholder="Search sub series, or type a new one…"
            ariaLabel="Sub series"
          />
        </Field>
      )}

      {!skip("brand") && (
        <Field label="Brand *" name="brand" error={err("brand")}>
          <Combobox
            clearable
            disabled={disabled}
            value={values.brand}
            onChange={(v) => onChange("brand", v)}
            options={brandOptions}
            placeholder="e.g. Hot Wheels, Mini GT, Matchbox"
            searchPlaceholder="Search brands, or type a new one…"
            ariaLabel="Brand"
          />
        </Field>
      )}

      {/* An assortment belongs to its brand the way a model belongs to its
          make. The add-a-car form omits this field and asks for it under
          Seller & payment instead, where it decides the retail prices offered;
          the catalogue form, which describes the casting itself, keeps it. */}
      {!skip("assortment") && (
        <Field label="Assortment *" name="assortment" error={err("assortment")}>
          <Combobox
            clearable
            disabled={disabled}
            value={values.assortment}
            onChange={(v) => onChange("assortment", v)}
            options={assortmentOptions}
            placeholder="e.g. Mainline, Premium, Boulevard"
            searchPlaceholder="Search assortments, or type a new one…"
            ariaLabel="Assortment"
          />
        </Field>
      )}

      {/* The catalogue's, shared by every owner of the casting. The box a
          particular copy came out of is Case / Mix, and lives on the car. */}
      {!skip("carNumber") && (
        <Field
          label={carNumberRequired ? "Car Number *" : "Car Number"}
          name="carNumber"
          error={err("carNumber")}
          info={
            carNumberRequired
              ? "The collector number printed on the box — Mini GT 1133, Kaido House KHMG217. It is what tells two near-identical castings apart, so this brand asks for it."
              : undefined
          }
        >
          <ClearableInput
            disabled={disabled && !allowCarNumberEdit}
            value={values.carNumber}
            onChange={(e) => onChange("carNumber", e.target.value)}
            placeholder={carNumberRequired ? "e.g. 1133 or KHMG217" : "e.g. 3/5 or 142/250"}
            aria-label="Car number"
          />
        </Field>
      )}

      {!skip("colour") && (
        <Field label="Colour" name="colour" error={err("colour")}>
          <Combobox
            clearable
            disabled={disabled}
            value={values.colour}
            onChange={(v) => onChange("colour", v)}
            options={colourOptions}
            placeholder="e.g. Spectraflame Red, Blue, White"
            searchPlaceholder="Search colours, or type a new one…"
            ariaLabel="Colour"
          />
        </Field>
      )}

      {!skip("type") && (
        <Field label="Type *" name="type" error={err("type")}>
          <Combobox
            clearable
            disabled={disabled}
            value={values.type}
            onChange={(v) => onChange("type", v)}
            options={typeOptions}
            placeholder="e.g. Race Car, Classic Car, Supercar"
            searchPlaceholder="Search types, or type a new one…"
            ariaLabel="Type"
          />
        </Field>
      )}

      {!skip("size") && (
        <Field label="Scale size (default 1:64)">
          <Combobox
            clearable
            disabled={disabled}
            value={values.size}
            onChange={(v) => onChange("size", v)}
            options={sizeOptions}
            placeholder="1:64"
            searchPlaceholder="Search scales, or type a new one…"
            ariaLabel="Size"
          />
        </Field>
      )}

      {/* Four options, and nearly every car is the first of them — so a row of
          buttons rather than a dropdown: Normal is already chosen, and a rare
          pull is one tap instead of two. The full names sit behind the ⓘ; on the
          buttons they would truncate to nothing. */}
      {!skip("rarity") && (
        <Field
          label="Rarity"
          info="TH is a Treasure Hunt and STH a Super Treasure Hunt, both Hot Wheels'. Chase is every other brand's limited run. Normal is a regular car."
        >
          <SegmentControl<Rarity>
            fill
            disabled={disabled}
            value={values.rarity || "Normal"}
            onChange={(v) => onChange("rarity", v)}
            options={RARITIES.map((r) => ({ value: r, label: r }))}
          />
        </Field>
      )}
    </div>
  );
}
