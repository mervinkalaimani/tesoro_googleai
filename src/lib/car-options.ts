import type { Diecast } from "@/lib/types";

/**
 * Suggestions for the catalogue fields on the add-car form.
 *
 * Two sources, deliberately: a seed list so a brand-new collection still offers
 * something to pick, and the collection itself so the list grows into whatever
 * this person actually buys. Nothing here restricts what can be saved — the
 * combobox accepts anything typed, and next time round it comes back as an
 * option because it is now in the collection.
 */

export const MAKE_SEED = [
  "Porsche",
  "Nissan",
  "Toyota",
  "Honda",
  "Ford",
  "Chevrolet",
  "Mazda",
  "Subaru",
  "Mitsubishi",
  "BMW",
  "Mercedes-Benz",
  "Audi",
  "Volkswagen",
  "Ferrari",
  "Lamborghini",
  "McLaren",
  "Aston Martin",
  "Bugatti",
  "Koenigsegg",
  "Jaguar",
  "Land Rover",
  "Mini",
  "Alfa Romeo",
  "Lancia",
  "Lotus",
  "Dodge",
  "Jeep",
  "Cadillac",
  "Pontiac",
  "Plymouth",
  "Buick",
  "Datsun",
  "Lexus",
  "Acura",
  "Infiniti",
  "Suzuki",
  "Hyundai",
  "Kia",
  "Tata",
  "Mahindra",
  "Maruti Suzuki",
  "Volvo",
  "Peugeot",
  "Renault",
  "Citroën",
  "Bentley",
  "Rolls-Royce",
  "Maserati",
  "Pagani",
  "Tesla",
];

/**
 * Castings that turn up across most brands. Short on purpose: model is the field
 * that varies most, so it is meant to fill out from the collection rather than
 * from a list nobody maintains.
 */
export const MODEL_SEED = [
  "Skyline GT-R",
  "Silvia S15",
  "180SX",
  "GT-R R35",
  "911 GT3 RS",
  "911 Carrera RS",
  "917",
  "Supra",
  "AE86",
  "Civic Type R",
  "NSX",
  "RX-7",
  "Miata MX-5",
  "WRX STI",
  "Lancer Evolution",
  "Mustang",
  "F-150",
  "GT40",
  "Camaro",
  "Corvette",
  "Bel Air",
  "Charger",
  "Challenger",
  "M3",
  "M4",
  "F40",
  "F50",
  "LaFerrari",
  "Countach",
  "Aventador",
  "Huracán",
  "P1",
  "Senna",
  "Chiron",
  "Defender",
  "Land Cruiser",
];

export const COLOUR_SEED = [
  "Black",
  "White",
  "Silver",
  "Grey",
  "Red",
  "Blue",
  "Green",
  "Yellow",
  "Orange",
  "Purple",
  "Pink",
  "Brown",
  "Gold",
  "Bronze",
  "Beige",
  "Teal",
  "Turquoise",
  "Maroon",
  "Navy Blue",
  "Sky Blue",
  "Lime Green",
  "Matte Black",
  "Gloss Black",
  "Pearl White",
  "Gunmetal",
  "Chrome",
  "Zamac",
  "Spectraflame Red",
  "Spectraflame Blue",
  "Shark Blue",
  "Nardo Grey",
  "Racing Green",
  "Multicolour",
];

export const TYPE_SEED = [
  "Classic Car",
  "Race Car",
  "Sports Car",
  "Supercar",
  "Hypercar",
  "Muscle Car",
  "JDM",
  "Rally Car",
  "Drift Car",
  "Hot Rod",
  "Sedan",
  "Hatchback",
  "Coupe",
  "Convertible",
  "SUV",
  "Pickup Truck",
  "Truck",
  "Van",
  "Bus",
  "Off Road",
  "Concept Car",
  "Movie Car",
  "Batmobile",
  "Bike",
  "Fantasy",
];

export const BRAND_SEED = [
  "Hot Wheels",
  "Matchbox",
  "Mini GT",
  "Kaido House",
  "Inno64",
  "Pop Race",
  "Tarmac Works",
  "Tomica",
  "Tomica Premium",
  "Majorette",
  "Greenlight",
  "M2 Machines",
  "Auto World",
  "Johnny Lightning",
  "Jada Toys",
  "Bburago",
  "Maisto",
  "Welly",
  "Schuco",
  "Norev",
  "Ixo",
  "Spark",
  "AUTOart",
  "Kyosho",
  "Solido",
  "Para64",
  "Time Micro",
  "Micro Turbo",
  "MiniAuto",
  "Centauria",
];

export const ASSORTMENT_SEED = [
  "Mainline",
  "Premium",
  "Boulevard",
  "Car Culture",
  "Fast & Furious",
  "Pop Culture",
  "Team Transport",
  "Silver Series",
  "Collector Edition",
  "Red Line Club",
  "Super Treasure Hunt",
  "Treasure Hunt",
  "Monster Trucks",
  "Track Stars",
  "Exclusive",
  "Limited Edition",
  "Deluxe",
  "Vintage",
  "Box",
];

export const SIZE_SEED = ["1:64", "1:43", "1:32", "1:24", "1:18", "1:12", "1:87", "1:76"];

/** Diecast fields the form offers suggestions for. */
export type OptionField = "make" | "model" | "colour" | "type" | "brand" | "assortment" | "size";

const SEEDS: Record<OptionField, string[]> = {
  make: MAKE_SEED,
  model: MODEL_SEED,
  colour: COLOUR_SEED,
  type: TYPE_SEED,
  brand: BRAND_SEED,
  assortment: ASSORTMENT_SEED,
  size: SIZE_SEED,
};

/**
 * Seed values plus everything the collection already uses, most-used first.
 *
 * Ordering by the person's own counts puts the four brands they actually buy
 * above the twenty-six they don't, which is what "popular" means for a list this
 * personal. Case-insensitive de-duplication keeps "Hot Wheels" and "hot wheels"
 * from both appearing; the collection's spelling wins, since that is the one
 * already written to every row.
 */
export function optionsFor(field: OptionField, cars: Diecast[]): string[] {
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();

  for (const car of cars) {
    const raw = (car[field] ?? "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!labels.has(key)) labels.set(key, raw);
  }

  const seedRank = new Map<string, number>();
  SEEDS[field].forEach((value, index) => {
    const key = value.toLowerCase();
    seedRank.set(key, index);
    if (!labels.has(key)) labels.set(key, value);
  });

  return [...labels.keys()]
    .sort((a, b) => {
      const byCount = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
      if (byCount) return byCount;
      const rankA = seedRank.get(a) ?? Number.MAX_SAFE_INTEGER;
      const rankB = seedRank.get(b) ?? Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      return (labels.get(a) as string).localeCompare(labels.get(b) as string);
    })
    .map((key) => labels.get(key) as string);
}

/**
 * Models narrowed to the chosen make. A Skyline under "Porsche" helps nobody, so
 * the collection's own pairings do the filtering — but only when they turn up
 * something, otherwise the field would go blank for the first car of a new make.
 */
export function modelOptionsFor(cars: Diecast[], make: string): string[] {
  const wanted = make.trim().toLowerCase();
  if (wanted) {
    const sameMake = cars.filter((c) => (c.make ?? "").trim().toLowerCase() === wanted);
    if (sameMake.length) {
      const scoped = optionsFor("model", sameMake);
      // optionsFor folds the seed in; drop anything this make has never worn.
      const owned = new Set(sameMake.map((c) => (c.model ?? "").trim().toLowerCase()));
      const filtered = scoped.filter((m) => owned.has(m.toLowerCase()));
      if (filtered.length) return filtered;
    }
  }
  return optionsFor("model", cars);
}
