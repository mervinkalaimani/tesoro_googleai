import type { Diecast } from "@/lib/types";

/**
 * Demo collection for Guest Mode.
 *
 * Guest Mode never reads or writes Supabase, so the cars it shows have to be
 * bundled with the app. A fresh set of 25 is drawn from this pool on every
 * visit, covering every status the app knows about, so the dashboard, orders,
 * pre-orders and duplicates pages all have something to render.
 *
 * Everything here is invented. It is not a sample of anyone's real collection,
 * and it ships in a public repository, so keep it that way.
 */

type Template = {
  make: string;
  model: string;
  variant?: string;
  year: string;
  brand: string;
  series: string;
  subSeries?: string;
  type: string;
  colour: string;
  size: string;
  /** Indicative retail price in INR; the generator jitters what was paid. */
  mrp: number;
};

const POOL: Template[] = [
  // Hot Wheels mainline
  {
    make: "Nissan",
    model: "Skyline GT-R",
    variant: "R34",
    year: "1999",
    brand: "Hot Wheels",
    series: "J-Imports",
    subSeries: "2024 Mix 1",
    type: "Sports",
    colour: "Bayside Blue",
    size: "1:64",
    mrp: 199,
  },
  {
    make: "Toyota",
    model: "Supra",
    variant: "MK IV",
    year: "1995",
    brand: "Hot Wheels",
    series: "J-Imports",
    subSeries: "2024 Mix 2",
    type: "Sports",
    colour: "White",
    size: "1:64",
    mrp: 199,
  },
  {
    make: "Honda",
    model: "Civic",
    variant: "EG6",
    year: "1992",
    brand: "Hot Wheels",
    series: "J-Imports",
    subSeries: "2023 Mix 4",
    type: "Hatchback",
    colour: "Red",
    size: "1:64",
    mrp: 199,
  },
  {
    make: "Mazda",
    model: "RX-7",
    variant: "FD",
    year: "1995",
    brand: "Hot Wheels",
    series: "Then and Now",
    subSeries: "2024 Mix 3",
    type: "Sports",
    colour: "Yellow",
    size: "1:64",
    mrp: 199,
  },
  {
    make: "Subaru",
    model: "Impreza",
    variant: "22B STi",
    year: "1998",
    brand: "Hot Wheels",
    series: "Rally Champs",
    subSeries: "2023 Mix 2",
    type: "Rally",
    colour: "Sonic Blue",
    size: "1:64",
    mrp: 199,
  },
  {
    make: "Ford",
    model: "Mustang",
    variant: "Boss 302",
    year: "1969",
    brand: "Hot Wheels",
    series: "Muscle Mania",
    subSeries: "2024 Mix 1",
    type: "Muscle",
    colour: "Grabber Green",
    size: "1:64",
    mrp: 199,
  },
  {
    make: "Chevrolet",
    model: "Camaro",
    variant: "SS",
    year: "1969",
    brand: "Hot Wheels",
    series: "Muscle Mania",
    subSeries: "2024 Mix 2",
    type: "Muscle",
    colour: "Hugger Orange",
    size: "1:64",
    mrp: 199,
  },
  {
    make: "Dodge",
    model: "Charger",
    variant: "R/T",
    year: "1969",
    brand: "Hot Wheels",
    series: "Fast & Furious",
    subSeries: "2024 Mix 3",
    type: "Muscle",
    colour: "Matte Black",
    size: "1:64",
    mrp: 249,
  },
  {
    make: "Plymouth",
    model: "Barracuda",
    variant: "HEMI",
    year: "1971",
    brand: "Hot Wheels",
    series: "Muscle Mania",
    subSeries: "2023 Mix 5",
    type: "Muscle",
    colour: "Plum Crazy",
    size: "1:64",
    mrp: 199,
  },
  {
    make: "Volkswagen",
    model: "Golf",
    variant: "MK2",
    year: "1988",
    brand: "Hot Wheels",
    series: "Speed Blur",
    subSeries: "2024 Mix 4",
    type: "Hatchback",
    colour: "Silver",
    size: "1:64",
    mrp: 199,
  },

  // Hot Wheels premium
  {
    make: "Porsche",
    model: "911",
    variant: "Carrera RS 2.7",
    year: "1973",
    brand: "Hot Wheels",
    series: "Car Culture",
    subSeries: "Deutschland Design",
    type: "Sports",
    colour: "Grand Prix White",
    size: "1:64",
    mrp: 549,
  },
  {
    make: "BMW",
    model: "M3",
    variant: "E30",
    year: "1990",
    brand: "Hot Wheels",
    series: "Car Culture",
    subSeries: "Race Day",
    type: "Sports",
    colour: "Alpine White",
    size: "1:64",
    mrp: 549,
  },
  {
    make: "Lancia",
    model: "Delta",
    variant: "Integrale",
    year: "1992",
    brand: "Hot Wheels",
    series: "Car Culture",
    subSeries: "Rally Legends",
    type: "Rally",
    colour: "Martini Livery",
    size: "1:64",
    mrp: 599,
  },
  {
    make: "Nissan",
    model: "Fairlady Z",
    variant: "S30",
    year: "1972",
    brand: "Hot Wheels",
    series: "Car Culture",
    subSeries: "Modern Classics",
    type: "Sports",
    colour: "Orange",
    size: "1:64",
    mrp: 549,
  },
  {
    make: "Alfa Romeo",
    model: "Giulia",
    variant: "Sprint GTA",
    year: "1965",
    brand: "Hot Wheels",
    series: "Car Culture",
    subSeries: "Canyon Warriors",
    type: "Sports",
    colour: "Rosso",
    size: "1:64",
    mrp: 599,
  },
  {
    make: "Audi",
    model: "Quattro",
    variant: "Sport",
    year: "1984",
    brand: "Hot Wheels",
    series: "Car Culture",
    subSeries: "Rally Legends",
    type: "Rally",
    colour: "White",
    size: "1:64",
    mrp: 599,
  },

  // Matchbox
  {
    make: "Land Rover",
    model: "Defender 90",
    year: "1997",
    brand: "Matchbox",
    series: "MBX Off-Road",
    subSeries: "2024 Mix 2",
    type: "SUV",
    colour: "Sand",
    size: "1:64",
    mrp: 149,
  },
  {
    make: "Toyota",
    model: "Land Cruiser",
    variant: "FJ80",
    year: "1993",
    brand: "Matchbox",
    series: "MBX Wilderness",
    subSeries: "2024 Mix 1",
    type: "SUV",
    colour: "Beige",
    size: "1:64",
    mrp: 149,
  },
  {
    make: "Jeep",
    model: "Wrangler",
    variant: "Rubicon",
    year: "2021",
    brand: "Matchbox",
    series: "MBX Off-Road",
    subSeries: "2023 Mix 3",
    type: "SUV",
    colour: "Olive",
    size: "1:64",
    mrp: 149,
  },
  {
    make: "Volvo",
    model: "P1800",
    year: "1965",
    brand: "Matchbox",
    series: "MBX Highway",
    subSeries: "2024 Mix 4",
    type: "Sports",
    colour: "Cream",
    size: "1:64",
    mrp: 149,
  },
  {
    make: "Mercedes-Benz",
    model: "G-Class",
    variant: "G550",
    year: "2019",
    brand: "Matchbox",
    series: "MBX Wilderness",
    subSeries: "2023 Mix 1",
    type: "SUV",
    colour: "Matte Grey",
    size: "1:64",
    mrp: 149,
  },

  // Mini GT / Tarmac / Pop Culture
  {
    make: "Nissan",
    model: "GT-R",
    variant: "Nismo",
    year: "2020",
    brand: "Mini GT",
    series: "Premium",
    subSeries: "Street",
    type: "Sports",
    colour: "Gunmetal",
    size: "1:64",
    mrp: 899,
  },
  {
    make: "Lamborghini",
    model: "Huracan",
    variant: "STO",
    year: "2022",
    brand: "Mini GT",
    series: "Premium",
    subSeries: "Supercar",
    type: "Supercar",
    colour: "Verde",
    size: "1:64",
    mrp: 999,
  },
  {
    make: "Pagani",
    model: "Utopia",
    year: "2023",
    brand: "Mini GT",
    series: "Premium",
    subSeries: "Supercar",
    type: "Supercar",
    colour: "Blu",
    size: "1:64",
    mrp: 1099,
  },
  {
    make: "Honda",
    model: "NSX",
    variant: "Type-R",
    year: "1997",
    brand: "Tarmac Works",
    series: "Global64",
    subSeries: "Road",
    type: "Sports",
    colour: "Championship White",
    size: "1:64",
    mrp: 1299,
  },
  {
    make: "Ford",
    model: "GT40",
    variant: "MK II",
    year: "1966",
    brand: "Tarmac Works",
    series: "Global64",
    subSeries: "Racing",
    type: "Race Car",
    colour: "Gulf Livery",
    size: "1:64",
    mrp: 1399,
  },
  {
    make: "Disney",
    model: "Lightning McQueen",
    year: "2006",
    brand: "Hot Wheels",
    series: "Character Cars",
    subSeries: "Cars",
    type: "Race Car",
    colour: "Red",
    size: "1:55",
    mrp: 399,
  },
  {
    make: "DC",
    model: "Batmobile",
    variant: "1989",
    year: "1989",
    brand: "Hot Wheels",
    series: "Character Cars",
    subSeries: "Batman",
    type: "Fantasy",
    colour: "Gloss Black",
    size: "1:64",
    mrp: 449,
  },
  {
    make: "Maruti Suzuki",
    model: "Jimny",
    year: "2023",
    brand: "Centy Toys",
    series: "India Series",
    subSeries: "Road",
    type: "SUV",
    colour: "Kinetic Yellow",
    size: "1:64",
    mrp: 150,
  },
  {
    make: "Tata",
    model: "Nexon",
    variant: "EV",
    year: "2023",
    brand: "Centy Toys",
    series: "India Series",
    subSeries: "Road",
    type: "SUV",
    colour: "Teal",
    size: "1:64",
    mrp: 150,
  },
];

const SELLERS = [
  "First Cry",
  "Shlok Agarwal",
  "Jeen Saharan",
  "Hobby Cart",
  "Amazon",
  "Flipkart",
  "The Diecast Store",
];

/** The courier and its consignment number are their own fields now, so these
 *  are notes rather than "Blue Dart [77164849123]" crammed into one string. */
const TRANSIT_NOTES = [
  "Dispatched from the seller",
  "Out of the sorting hub",
  "Held at customs",
  "Reattempt scheduled",
  "Clubbed with an earlier order",
];

const GUEST_COURIERS = ["Blue Dart", "Delhivery", "DTDC", "India Post", "Ekart", "XpressBees"];

/**
 * Every status the app recognises, written out rather than derived from
 * STATUS_ORDER: that array groups aliases together ("available" and "wrong
 * item" share a rank, as do "pre order"/"preorder"), so taking one label per
 * group silently dropped "wrong item" from the demo.
 */
const ALL_STATUSES = [
  "Available",
  "Wrong Item",
  "Out for Delivery",
  "Transit",
  "Waiting",
  "Pre Order",
  "Delayed",
  "On Hold",
  "Lost",
  "ISO",
] as const;

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)] as T;
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthLabel(d: Date): string {
  return d.toLocaleString("en-US", { month: "short", year: "numeric" });
}

const GUEST_COUNT = 25;

/**
 * Builds a fresh demo collection. Every status appears at least once, the rest
 * of the slots are filled at random, and prices, dates and flags are jittered
 * so two visits don't look identical.
 */
export function makeGuestCars(rand: () => number = Math.random): Diecast[] {
  const templates = shuffle(POOL, rand).slice(0, GUEST_COUNT);

  // Statuses first so all ten are guaranteed, then random for the remainder.
  const statuses = [
    ...ALL_STATUSES,
    ...Array.from({ length: Math.max(0, GUEST_COUNT - ALL_STATUSES.length) }, () =>
      // Weighted towards Available so the collection reads like a real one.
      rand() < 0.55 ? "Available" : pick(ALL_STATUSES, rand),
    ),
  ].slice(0, GUEST_COUNT);

  const today = new Date();
  const shipCounters = new Map<string, number>();

  return templates.map((t, i) => {
    const status = statuses[i] as string;
    const lower = status.toLowerCase();
    const arrived = lower === "available" || lower === "wrong item";
    const isPreOrder = lower === "pre order";
    const isIso = lower === "iso";
    const moving = lower === "transit" || lower === "out for delivery";

    const daysAgo = Math.floor(rand() * 240) + 5;
    const orderDate = new Date(today);
    orderDate.setDate(orderDate.getDate() - daysAgo);

    // Delivered a week or so after ordering; anything still moving is dated ahead.
    const eventDate = new Date(orderDate);
    eventDate.setDate(eventDate.getDate() + (arrived ? Math.floor(rand() * 12) + 3 : daysAgo + 6));

    // A pre-order is a release date, not a delivery estimate: it sits months
    // out. Roughly one in five is placed inside the next ten days so the
    // dashboard's launch notice is something a guest can actually see.
    const releaseDate = new Date(today);
    releaseDate.setDate(
      releaseDate.getDate() +
        (rand() < 0.2 ? Math.floor(rand() * 11) : 40 + Math.floor(rand() * 300)),
    );

    // Paid anywhere from a hefty discount to a mild premium over retail.
    const factor = 0.8 + rand() * 1.1;
    const spent = isIso ? 0 : Math.round((t.mrp * factor) / 5) * 5;
    const paid = isPreOrder ? Math.round(spent * (rand() < 0.5 ? 0.3 : 0.5)) : isIso ? 0 : spent;
    const balance = Math.max(0, spent - paid);

    const seller = isIso ? "" : pick(SELLERS, rand);
    let shippingId = "";
    if (seller && !isIso) {
      const prefix = seller
        .replace(/[^A-Za-z]/g, "")
        .slice(0, 4)
        .toUpperCase();
      const key = `${prefix}${isPreOrder ? "/PO" : ""}`;
      const n = (shipCounters.get(key) ?? 0) + 1;
      shipCounters.set(key, n);
      shippingId = `${key}/${String(n).padStart(2, "0")}`;
    }

    return {
      id: `guest-${String(i + 1).padStart(3, "0")}`,
      sno: i + 1,
      name: [t.year, t.make, t.model, t.variant].filter(Boolean).join(" "),
      make: t.make,
      model: t.model,
      variant: t.variant ?? "",
      year: t.year,
      series: t.series,
      subSeries: t.subSeries ?? "",
      carNumber: "",
      colour: t.colour,
      type: t.type,
      brand: t.brand,
      assortment: t.mrp >= 500 ? "Premium" : "Mainline",
      size: t.size,
      spent,
      mrp: t.mrp,
      shippingCost: rand() < 0.3 ? 50 : 0,
      seller,
      status,
      payment: balance > 0 ? "Partial" : isIso ? "" : "Paid",
      paid,
      // Only a car in hand has an arrival date. Giving one to a pre-order made
      // it read as delivered everywhere downstream.
      date: arrived ? iso(eventDate) : "",
      month: arrived ? monthLabel(eventDate) : monthLabel(orderDate),
      orderDate: isIso ? "" : iso(orderDate),
      orderMonth: isIso ? "" : monthLabel(orderDate),
      expectedDate: arrived || isIso ? "" : iso(isPreOrder ? releaseDate : eventDate),
      transitInfo:
        lower === "transit" || lower === "out for delivery" ? pick(TRANSIT_NOTES, rand) : "",
      shippingId,
      deliveryPartner: moving ? pick(GUEST_COURIERS, rand) : "",
      trackingId: moving ? `${Math.floor(rand() * 9e11 + 1e11)}` : "",
      balance,
      chase: rand() < 0.15,
      favourite: rand() < 0.25,
      official: true,
      open: rand() < 0.35,
      imageUrl: "",
    } satisfies Diecast;
  });
}
