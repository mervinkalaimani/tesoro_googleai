/**
 * What findDuplicates must and must not offer, as asserts.
 *
 * Run it:
 *   npx esbuild src/lib/duplicate.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=<tmp>/dup.mjs && node <tmp>/dup.mjs
 *
 * The rule under test: brand, make, model and car number, OR every one of
 * brand, make, model, assortment, series, sub-series and car number, OR — as a
 * guess rather than a warning — brand, make and series with the model free. Sharing a
 * make and a model is not a duplicate — that was the bug, and "Porsche 911"
 * returning six different castings is the case that proved it. Nor is sharing
 * only a number: Hot Wheels prints a position, so "3/5" is eight castings.
 */
import { findDuplicates, needsCarNumber, type DuplicateFields } from "@/lib/duplicate";
import type { CatalogCar } from "@/lib/catalog";

let checks = 0;
function ok(cond: boolean, what: string) {
  checks++;
  if (!cond) throw new Error(`FAILED: ${what}`);
}

const entry = (over: Partial<CatalogCar>): CatalogCar =>
  ({
    car_id: Math.random().toString(36).slice(2),
    brand: "Hotwheels",
    make: "Porsche",
    model: "911",
    variant: "",
    colour: "White",
    assortment: "Premium",
    series: "Car Culture",
    sub_series: "Circuit Legends",
    car_number: "",
    year: "2023",
    ...over,
  }) as CatalogCar;

const typed = (over: Partial<DuplicateFields>): DuplicateFields => ({
  brand: "Hotwheels",
  make: "Porsche",
  model: "911",
  assortment: "Premium",
  series: "Car Culture",
  subSeries: "Circuit Legends",
  carNumber: "",
  ...over,
});

// ------------------------------------------------ the six-Porsches complaint

ok(
  findDuplicates(typed({ assortment: "Mainline", series: "", subSeries: "" }), [entry({})])
    .length === 0,
  "same make and model but a different assortment is not offered",
);

ok(
  findDuplicates(typed({ series: "Fast & Furious" }), [entry({})]).length === 0,
  "a different series is not offered",
);

// A different sub-series is a different set, and rule 3 reads both halves of
// one. Circuit Legends and Le Mans are two Car Culture sets, not one.
ok(
  findDuplicates(typed({ subSeries: "LeMans Set" }), [entry({})]).length === 0,
  "a different sub-series inside the same series is not offered",
);

// Said once on either side, the set still speaks: a shared sub-series under a
// series nobody filed is the same set by the only name it has.
{
  const hits = findDuplicates(typed({ series: "" }), [entry({ series: "" })]);
  ok(
    hits.length === 1 && hits[0].level === "certain",
    "a blank series on both sides still matches",
  );
}
{
  const hits = findDuplicates(typed({ series: "", model: "Skyline GT-R" }), [
    entry({ series: "" }),
  ]);
  ok(hits.length === 1 && hits[0].level === "possible", "a shared sub-series alone is a guess");
}

// Silence on one side is not disagreement.
{
  const hits = findDuplicates(typed({ model: "Skyline GT-R" }), [entry({ sub_series: "" })]);
  ok(hits.length === 1 && hits[0].level === "possible", "a blank sub-series does not block it");
}

// Rule 3: brand, make and series, with the model free to differ. A glance, not
// a warning — which is why it never comes back as certain.
{
  const hits = findDuplicates(typed({ model: "Skyline GT-R" }), [entry({})]);
  ok(hits.length === 1 && hits[0].level === "possible", "same make and series is possible");
  ok(/Same make/.test(hits[0].because), "the reason says the make matched");
}

// Rule 3 needs a set on both sides. Nothing in common but a make is nothing.
ok(
  findDuplicates(typed({ model: "Skyline GT-R", series: "", subSeries: "" }), [
    entry({ series: "", sub_series: "" }),
  ]).length === 0,
  "a shared make with no set is not offered",
);

// Certain before possible, however the catalogue is ordered: the entry that
// really is this car must not sit under a series guess.
{
  const guess = entry({ car_id: "GUESS", model: "Skyline GT-R" });
  const real = entry({ car_id: "REAL" });
  const hits = findDuplicates(typed({}), [guess, real]);
  ok(hits.length === 2, "both the real match and the guess come back");
  ok(hits[0].car.car_id === "REAL" && hits[0].level === "certain", "the certain one is first");
}

// A different model is still never a duplicate. Inside the same series it now
// comes back as a guess — rule 3, asked for by the person who files these — and
// outside it as nothing at all, which is the "Porsche 911 returned six castings"
// case the rules were tightened for.
ok(
  findDuplicates(typed({}), [entry({ model: "718" })]).every((h) => h.level === "possible"),
  "a different model is never certain",
);
ok(
  findDuplicates(typed({}), [entry({ model: "718", series: "Boulevard" })]).length === 0,
  "a different model in a different series is not offered",
);

ok(
  findDuplicates(typed({}), [entry({ brand: "Majorette" })]).length === 0,
  "a different brand is never offered",
);

// A blank on one side against a value on the other is not the same casting --
// but it is not nothing either, now that the set is read as both of its names:
// these two agree about Circuit Legends and one of them simply never said which
// series that set belongs to.
{
  const hits = findDuplicates(typed({ series: "" }), [entry({ series: "Car Culture" })]);
  ok(hits.length === 1 && hits[0].level === "possible", "a blank series is a guess, never certain");
}

// ------------------------------------------------------------ what must match

ok(findDuplicates(typed({}), [entry({})]).length === 1, "every field agreeing is offered");

ok(
  findDuplicates(typed({ series: "", subSeries: "" }), [entry({ series: "", sub_series: "" })])
    .length === 1,
  "blank on both sides counts as agreement",
);

// Brand, make, model and number. The number carries the rest of the
// description — assortment, series, sub-series need not agree — but it does not
// carry the car.
const numbered = entry({
  brand: "Mini GT",
  make: "Nissan",
  model: "Skyline",
  assortment: "Box",
  series: "",
  sub_series: "",
  car_number: "1133",
});
const byNumber = findDuplicates(
  typed({ brand: "Mini GT", make: "Nissan", model: "Skyline", carNumber: "1133" }),
  [numbered],
);
ok(byNumber.length === 1, "brand, make, model and number agreeing is a duplicate");
ok(byNumber[0].because.includes("1133"), "and the reason says which number");

ok(
  findDuplicates(typed({ brand: "Mini GT", make: "Toyota", model: "Supra", carNumber: "1133" }), [
    numbered,
  ]).length === 0,
  "a shared number on a different casting is not offered",
);

ok(
  findDuplicates(typed({ brand: "Mini GT", carNumber: "1133" }), [
    entry({ brand: "Majorette", car_number: "1133" }),
  ]).length === 0,
  "the same number under another brand is not offered",
);

// ------------------------------------------------------------------- guards

ok(findDuplicates(typed({ make: "" }), [entry({})]).length === 0, "too little typed to judge yet");

const self = entry({});
ok(
  findDuplicates(typed({}), [self], { excludeCarId: self.car_id }).length === 0,
  "an entry does not duplicate itself while being edited",
);

ok(
  findDuplicates(typed({}), [entry({}), entry({}), entry({})], { limit: 2 }).length === 2,
  "the limit is respected",
);

// -------------------------------------------------- needsCarNumber untouched

ok(needsCarNumber("Mini GT") === true, "Mini GT still has to state its number");
ok(needsCarNumber("Hot Wheels") === false, "Hot Wheels prints a position, not a number");
ok(needsCarNumber("Matchbox") === false, "Matchbox prints a position, not a number");
ok(needsCarNumber("") === false, "no brand, nothing to require");

// ------------------------------------------------------- how close it is
//
// A field either side states is a field that counts. A field blank on both
// sides is not evidence of anything and is left out of the sum — so the score
// is out of what there was to compare, and a form that has not said what colour
// it is scores below one that has.

const full = typed({ carNumber: "" });
const twin = entry({ colour: "", year: "" });
ok(findDuplicates(full, [twin])[0].match === 100, "every stated field agreeing is 100%");

// The entry states a colour and a year the form has not: eight fields counted,
// six of them agreeing.
const vague = findDuplicates(full, [entry({})]);
ok(vague.length === 1, "fields the form has not filled in do not disqualify a match");
ok(vague[0].match === 75, `six of eight fields is 75%, got ${vague[0].match}`);

// Saying the colour, and saying the wrong one, is worse than not saying it.
const wrongColour = findDuplicates(typed({ colour: "Red" }), [entry({ colour: "White" })]);
ok(wrongColour.length === 1, "a colour that differs does not disqualify a match");
ok(wrongColour[0].match < 100, "and it costs the score");

// Closest first.
const ranked = findDuplicates(full, [entry({}), twin]);
ok(ranked[0].match === 100, "the closest match leads");

console.log(`duplicate.selfcheck: ${checks} checks passed`);
