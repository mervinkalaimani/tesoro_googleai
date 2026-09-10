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
 * Models, keyed by the make that builds them (lowercased for lookup).
 *
 * Kept as a map rather than one flat list because a model only means anything
 * next to its make: offering a Skyline under Porsche is worse than offering
 * nothing. Each entry is deliberately short — a handful of the castings that
 * actually get collected, with the rest arriving from the collection itself.
 */
export const MODEL_SEED: Record<string, string[]> = {
  nissan: ["Skyline GT-R", "GT-R R35", "Silvia S15", "180SX", "Fairlady Z", "Datsun 240Z", "Sunny"],
  datsun: ["240Z", "510", "620 Pickup", "Bluebird"],
  toyota: ["Supra", "AE86", "Land Cruiser", "Celica", "MR2", "GR Yaris", "Hilux"],
  honda: ["Civic Type R", "NSX", "S2000", "Integra Type R", "CR-X", "City Turbo"],
  mazda: ["RX-7", "RX-3", "MX-5 Miata", "787B", "Cosmo Sport"],
  subaru: ["Impreza WRX STI", "BRZ", "Legacy", "22B STi"],
  mitsubishi: ["Lancer Evolution", "3000GT", "Pajero", "Starion"],
  suzuki: ["Jimny", "Swift Sport", "Cappuccino"],
  porsche: ["911 GT3 RS", "911 Carrera RS", "911 Turbo", "917", "959", "718 Cayman", "Taycan"],
  ferrari: ["F40", "F50", "LaFerrari", "Enzo", "250 GTO", "488 GTB", "SF90"],
  lamborghini: ["Countach", "Aventador", "Huracán", "Diablo", "Miura", "Urus"],
  mclaren: ["P1", "Senna", "720S", "F1", "MP4-12C"],
  bugatti: ["Chiron", "Veyron", "Divo", "Type 57"],
  koenigsegg: ["Jesko", "Agera RS", "Regera"],
  pagani: ["Zonda", "Huayra"],
  ford: ["Mustang", "GT40", "F-150", "Escort RS", "Bronco", "Sierra RS Cosworth", "Focus RS"],
  chevrolet: ["Corvette", "Camaro", "Bel Air", "Chevelle SS", "Impala", "Silverado"],
  dodge: ["Charger", "Challenger", "Viper", "Dart", "Ram 1500"],
  plymouth: ["Barracuda", "Road Runner", "GTX"],
  pontiac: ["Firebird Trans Am", "GTO", "Bonneville"],
  buick: ["Grand National", "Riviera"],
  cadillac: ["Escalade", "Eldorado", "CTS-V"],
  jeep: ["Wrangler", "Cherokee", "Gladiator"],
  bmw: ["M3", "M4", "M1", "2002 Turbo", "i8", "Z4"],
  "mercedes-benz": ["190E", "AMG GT", "300 SL", "G-Class", "SLS AMG"],
  audi: ["Quattro", "RS6 Avant", "R8", "TT"],
  volkswagen: ["Golf GTI", "Beetle", "T1 Bus", "Scirocco"],
  "aston martin": ["DB5", "Vantage", "Valkyrie", "DBS"],
  jaguar: ["E-Type", "XJ220", "F-Type", "D-Type"],
  "land rover": ["Defender", "Range Rover", "Discovery"],
  mini: ["Cooper S", "Countryman", "Classic Mini"],
  "alfa romeo": ["Giulia GTA", "4C", "Stelvio"],
  lancia: ["Delta Integrale", "Stratos", "037"],
  lotus: ["Esprit", "Elise", "Europa"],
  maserati: ["MC20", "GranTurismo", "Ghibli"],
  bentley: ["Continental GT", "Bentayga"],
  "rolls-royce": ["Phantom", "Wraith"],
  volvo: ["240 Wagon", "P1800", "850 Estate"],
  peugeot: ["205 GTI", "405", "908"],
  renault: ["5 Turbo", "Clio V6", "Alpine A110"],
  citroën: ["2CV", "DS", "SM"],
  lexus: ["LFA", "IS300", "RC F"],
  acura: ["NSX", "Integra Type R", "RSX"],
  infiniti: ["Q60", "G35"],
  hyundai: ["Ioniq 5 N", "Veloster N"],
  kia: ["Stinger", "Seltos"],
  tata: ["Nexon", "Safari", "Harrier", "Punch"],
  mahindra: ["Thar", "Scorpio", "XUV700", "Bolero"],
  "maruti suzuki": ["Swift", "Baleno", "Brezza", "Gypsy"],
  tesla: ["Model S", "Cybertruck", "Roadster"],
};

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

/**
 * Diecast fields the form offers a flat list of suggestions for. Model is absent
 * on purpose — its list depends on the make, so it has its own function.
 */
export type OptionField = "make" | "colour" | "type" | "brand" | "assortment" | "size";

const SEEDS: Record<OptionField, string[]> = {
  make: MAKE_SEED,
  colour: COLOUR_SEED,
  type: TYPE_SEED,
  brand: BRAND_SEED,
  assortment: ASSORTMENT_SEED,
  size: SIZE_SEED,
};

/**
 * Collected values (duplicates included — they are the ranking) merged with a
 * seed list, most-used first.
 *
 * Ordering by the person's own counts puts the four brands they actually buy
 * above the twenty-six they don't, which is what "popular" means for a list this
 * personal. Case-insensitive de-duplication keeps "Hot Wheels" and "hot wheels"
 * from both appearing; the collected spelling wins, since that is the one
 * already written to every row.
 */
function rank(collected: string[], seed: string[]): string[] {
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();

  for (const value of collected) {
    const raw = (value ?? "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!labels.has(key)) labels.set(key, raw);
  }

  const seedRank = new Map<string, number>();
  seed.forEach((value, index) => {
    const key = value.toLowerCase();
    if (!seedRank.has(key)) seedRank.set(key, index);
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

export function optionsFor(field: OptionField, cars: Diecast[]): string[] {
  return rank(
    cars.map((c) => c[field]),
    SEEDS[field],
  );
}

/**
 * Models for one make, and only that make.
 *
 * Both sources are narrowed: the collection is filtered to cars of that make,
 * and the seed is looked up by it. A make nobody has bought yet and that isn't
 * in the seed offers nothing, which is correct — an empty list says "type it"
 * far more clearly than a list of another manufacturer's cars.
 *
 * With no make chosen there is nothing to narrow by, so everything is offered.
 */
export function modelOptionsFor(cars: Diecast[], make: string): string[] {
  const wanted = make.trim().toLowerCase();

  if (!wanted) {
    return rank(
      cars.map((c) => c.model),
      Object.values(MODEL_SEED).flat(),
    );
  }

  const sameMake = cars.filter((c) => (c.make ?? "").trim().toLowerCase() === wanted);
  return rank(
    sameMake.map((c) => c.model),
    MODEL_SEED[wanted] ?? [],
  );
}
