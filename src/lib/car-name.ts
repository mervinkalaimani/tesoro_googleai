/**
 * Derive the display name for a car from its attributes.
 * Mirrors the sheet formula:
 *  IFS(OR(make="Pop Culture", type="Transporter", make="Fantasy",
 *         make="Monster Truck", make="Batmobile", series="Batmobile"), model,
 *      year<>"", "'" & RIGHT(year,2) & " " & make & " " & model & " " & variant,
 *      TRUE, make & " " & model & " " & variant)
 */
export function buildCarName(r: {
  make?: string;
  model?: string;
  variant?: string;
  year?: string;
  type?: string;
  series?: string;
}): string {
  const norm = (s?: string) => (s ?? "").trim();
  const make = norm(r.make);
  const model = norm(r.model);
  const variant = norm(r.variant);
  const year = norm(r.year);
  const type = norm(r.type);
  const series = norm(r.series);

  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const modelOnly =
    eq(make, "Pop Culture") ||
    eq(type, "Transporter") ||
    eq(make, "Fantasy") ||
    eq(make, "Monster Truck") ||
    eq(make, "Batmobile") ||
    eq(series, "Batmobile");

  if (modelOnly) return model;

  const parts = [make, model, variant].filter(Boolean).join(" ");
  if (year) return `'${year.slice(-2)} ${parts}`.trim();
  return parts;
}
