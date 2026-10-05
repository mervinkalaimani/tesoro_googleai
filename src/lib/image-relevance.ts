/**
 * Whether a search result is about the car that was asked for.
 *
 * An image search is not a database: asked for "Land Rover Defender Hot Wheels
 * 10/10 Mainline" it will answer with photographs of farmland, because "Land"
 * is a word and "10/10" is not a search term. Those came back, were scored on
 * the word they shared, and filled the strip under the form.
 *
 * So a result earns its place by naming the car. The model is the test — it is
 * the word that is this casting and not another one. The make is only the
 * fallback, and there every word has to be there: "Land" on its own is how the
 * farms got in, while "Land Rover" together is a car.
 */
export function mentionsCar(title: string, car: { make?: string; model?: string }): boolean {
  const model = words(car.model);
  const make = words(car.make);
  if (!model.length && !make.length) return true;
  const have = new Set(words(title));
  // Any word of the model: "911 GT3" is still a 911 when the listing drops the
  // trim. Every word of the make, for the reason above.
  return model.length ? model.some((w) => have.has(w)) : make.every((w) => have.has(w));
}

const words = (s: string | undefined) =>
  (s ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);
