import { readFileSync, writeFileSync } from "node:fs";

const SRC = process.argv[2];
const OUT = process.argv[3];

const cars = JSON.parse(readFileSync(SRC, "utf8"));

const clean = (v) =>
  String(v ?? "")
    .trim()
    .replace(/\s+/g, " ");

/** Count values case-insensitively, keeping the most common spelling. */
function tally(values) {
  const m = new Map();
  for (const raw of values) {
    const v = clean(raw);
    if (!v) continue;
    const k = v.toLowerCase();
    const hit = m.get(k);
    if (hit) {
      hit.n += 1;
      hit.spellings.set(v, (hit.spellings.get(v) ?? 0) + 1);
    } else {
      m.set(k, { n: 1, spellings: new Map([[v, 1]]) });
    }
  }
  return m;
}

function ranked(values, { min = 1, limit = Infinity } = {}) {
  const m = tally(values);
  return [...m.values()]
    .filter((e) => e.n >= min)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .map((e) => [...e.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0]);
}

const makes = ranked(cars.map((c) => c.make));

const modelsByMake = {};
const variantsByModel = {};

for (const make of makes) {
  const key = make.toLowerCase();
  const mine = cars.filter((c) => clean(c.make).toLowerCase() === key);
  // A model that just restates the make ("Nissan" under Nissan) is noise.
  const models = ranked(mine.map((c) => c.model)).filter((m) => m.toLowerCase() !== key);
  if (models.length) modelsByMake[key] = models;

  for (const model of models) {
    const mk = model.toLowerCase();
    const rows = mine.filter((c) => clean(c.model).toLowerCase() === mk);
    const variants = ranked(rows.map((c) => c.variant));
    if (variants.length) variantsByModel[`${key}|${mk}`] = variants;
  }
}

const lists = {
  MAKES: makes,
  COLOURS: ranked(cars.map((c) => c.colour)),
  TYPES: ranked(cars.map((c) => c.type)),
  BRANDS: ranked(cars.map((c) => c.brand)),
  ASSORTMENTS: ranked(cars.map((c) => c.assortment)),
  SIZES: ranked(cars.map((c) => c.size)),
  SERIES: ranked(cars.map((c) => c.series)),
  SUB_SERIES: ranked(cars.map((c) => c.subSeries)),
};

const j = (v) => JSON.stringify(v);

const out = `// GENERATED FILE — do not edit by hand.
// Rebuilt with: node scripts/gen-taxonomy.mjs
//
// The vocabulary of an established collection, so a brand-new account is not
// asked to invent one. Every list is ordered by how often the value actually
// occurs, which is what makes the first few options in a dropdown the useful
// ones. Models are the base name only — "Skyline", not "Nissan Skyline" and not
// "Skyline GT-R" — because the trim belongs in the variant, and a model list
// that repeats the make you just chose wastes the whole dropdown.
//
// Keys are lowercased for lookup; the values keep their display spelling.

${Object.entries(lists)
  .map(([name, v]) => `export const ${name}: string[] = ${j(v)};`)
  .join("\n\n")}

/** make (lowercased) -> its models, most common first. */
export const MODELS_BY_MAKE: Record<string, string[]> = ${j(modelsByMake)};

/** "make|model" (both lowercased) -> its variants, most common first. */
export const VARIANTS_BY_MODEL: Record<string, string[]> = ${j(variantsByModel)};
`;

writeFileSync(OUT, out, "utf8");

console.log("makes", makes.length);
console.log(
  "models",
  Object.values(modelsByMake).reduce((s, a) => s + a.length, 0),
);
console.log("variant groups", Object.keys(variantsByModel).length);
console.log(
  "variants",
  Object.values(variantsByModel).reduce((s, a) => s + a.length, 0),
);
console.log("bytes", Buffer.byteLength(out));
console.log("nissan models", (modelsByMake["nissan"] ?? []).slice(0, 10).join(", "));
console.log(
  "nissan|skyline variants",
  (variantsByModel["nissan|skyline"] ?? []).slice(0, 10).join(", "),
);
