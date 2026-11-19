/**
 * Demo seed. Every record carries `demo: true`.
 *
 * The cars are the Viiv catalogue's own (passed in), so a seeded listing points
 * at a real catalogue id. Which cars get sellers is decided by a hash of the id,
 * not by chance: the same catalogue gives the same market.
 */
import type {
  CatalogueItem,
  Listing,
  MarketEvent,
  Order,
  SellerProfile,
  State,
  User,
} from "./types";

const DAY = 86_400_000;
const HOUR = 3_600_000;
export const DEMO_BUYER = "u_aarav";

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const USERS: Array<[string, string, string]> = [
  [DEMO_BUYER, "Aarav Mehta", "aarav@demo.viiv.test"],
  ["u_garage64", "Rohan Shah", "garage64@demo.viiv.test"],
  ["u_dukaan", "Neha Kapoor", "dukaan@demo.viiv.test"],
  ["u_pitlane", "Karthik Rao", "pitlane@demo.viiv.test"],
  ["u_revkart", "Sana Iqbal", "revkart@demo.viiv.test"],
];

const SELLERS: Array<Omit<SellerProfile, "contact" | "payoutNote" | "demo">> = [
  {
    userId: "u_garage64",
    storeName: "Garage 64",
    location: "Mumbai, MH",
    bio: "Mainline to premium, sealed and carded. Ships in 1-2 days.",
    verification: "Verified",
    rating: 4.8,
    ratingCount: 212,
  },
  {
    userId: "u_dukaan",
    storeName: "Diecast Dukaan",
    location: "New Delhi, DL",
    bio: "Imports and Indian customs. Raffles on the first of the month.",
    verification: "Verified",
    rating: 4.6,
    ratingCount: 148,
  },
  {
    userId: "u_pitlane",
    storeName: "Pit Lane Models",
    location: "Bengaluru, KA",
    bio: "Premium 1:64 and a few 1:43. Verification in progress.",
    verification: "Pending",
    rating: 4.4,
    ratingCount: 37,
  },
  {
    userId: "u_revkart",
    storeName: "Rev Kart",
    location: "Chennai, TN",
    bio: "New seller clearing a duplicates shelf.",
    verification: "Unverified",
    rating: null,
    ratingCount: 0,
  },
];

const CONDITIONS: Array<[Listing["condition"], Listing["packaging"]]> = [
  ["New", "Sealed"],
  ["New", "Box (minor wear)"],
  ["Opened", "Loose"],
  ["Display", "Box (minor wear)"],
];

export function seedState(now: number, items: CatalogueItem[]): State {
  const base = Math.floor(now / DAY) * DAY;
  // Cars with a catalogue price get sellers, about one in ten; sorted so the pick
  // does not depend on the order the catalogue happened to load in.
  const sellable = items
    .filter((i) => i.mrpPaise > 0)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .filter((i) => hash(i.id) % 10 === 0);
  const users: User[] = USERS.map(([id, name, email]) => ({
    id,
    name,
    email,
    createdAt: base - 90 * DAY,
    demo: true,
    sellerMode: id !== DEMO_BUYER,
    addresses:
      id === DEMO_BUYER
        ? [
            {
              id: "a_1",
              name,
              phone: "9876543210",
              line1: "14, Lake View Road",
              city: "Pune",
              state: "Maharashtra",
              pincode: "411001",
            },
          ]
        : [],
    saved: [],
    notify: { orders: true, events: true },
  }));
  const sellers: SellerProfile[] = SELLERS.map((s) => ({
    ...s,
    contact: "in-app",
    payoutNote: "Demo: payouts are not connected.",
    demo: true,
  }));

  // Listings: the first three catalogue cars are offered by all four sellers so
  // the compare-sellers view has something to compare; the rest by one or two.
  const listings: Listing[] = [];
  sellable.forEach((it, i) => {
    const count = i < 3 ? 4 : 1 + (hash(it.id) % 2);
    for (let k = 0; k < count; k++) {
      const seller = SELLERS[(i + k) % SELLERS.length];
      const h = hash(it.id + seller.userId);
      const [condition, packaging] = CONDITIONS[(h >>> 3) % (i < 3 ? 4 : 2)];
      const factor = 0.9 + (h % 40) / 100; // 0.90 - 1.29 of catalogue MRP
      const mrp = it.mrpPaise;
      const price = Math.max(100, Math.round((mrp * factor) / 100) * 100);
      listings.push({
        id: `l_${listings.length + 1}`,
        sellerId: seller.userId,
        itemId: it.id,
        title: "",
        description: `${it.name}, ${it.brand} ${it.assortment} ${it.scale}. ${packaging} - see condition notes.`,
        condition,
        packaging,
        conditionNotes:
          packaging === "Sealed"
            ? "Card flat, bubble clear."
            : packaging === "Loose"
              ? "Loose car, light play wear, no box."
              : "Light shelf wear on the card.",
        quantity: 1 + (h % 5),
        sold: 0,
        mrpPaise: mrp || null,
        pricePaise: price,
        shippingPaise: h % 5 === 0 ? null : [4900, 6900, 9900][h % 3],
        dispatchDays: 1 + (h % 3),
        regions: "Pan-India",
        returnPolicy: "Returns accepted within 3 days only if the item differs from the listing.",
        status: "active",
        sku: "",
        privateNotes: "",
        createdAt: base - (1 + (h % 20)) * DAY,
        updatedAt: base - (h % 5) * DAY,
        demo: true,
      });
    }
  });

  const pick = (n: number) => sellable[n % sellable.length];
  const listingFor = (itemId: string, sellerId: string) =>
    listings.find((l) => l.itemId === itemId && l.sellerId === sellerId)!;
  const mkOrder = (
    id: string,
    buyerId: string,
    l: Listing,
    status: Order["status"],
    daysAgo: number,
    ship?: Partial<Order>,
  ): Order => {
    const at = base - daysAgo * DAY;
    const address = users.find((u) => u.id === buyerId)?.addresses[0] ?? {
      id: "a_x",
      name: "Neha Kapoor",
      phone: "9811111111",
      line1: "22 Hauz Khas",
      city: "New Delhi",
      state: "Delhi",
      pincode: "110016",
    };
    const shipping = l.shippingPaise ?? 0;
    const history: Order["history"] = [
      { at, status: "processing", note: "Order placed (demo payment)", by: buyerId },
    ];
    if (status === "shipped" || status === "delivered")
      history.push({
        at: at + DAY,
        status: "shipped",
        note: `Shipped via ${ship?.carrier}`,
        by: l.sellerId,
      });
    if (status === "delivered")
      history.push({ at: at + 4 * DAY, status: "delivered", note: "Delivered", by: buyerId });
    return {
      id,
      buyerId,
      sellerId: l.sellerId,
      lines: [
        {
          listingId: l.id,
          itemId: l.itemId,
          title: l.title,
          qty: 1,
          unitPaise: l.pricePaise,
          mrpPaise: l.mrpPaise,
        },
      ],
      itemsPaise: l.pricePaise,
      shippingPaise: shipping,
      shippingPending: l.shippingPaise === null,
      totalPaise: l.pricePaise + shipping,
      address,
      status,
      payment: "demo",
      idempotencyKey: `seed-${id}`,
      carrier: "",
      trackingNumber: "",
      trackingUrl: "",
      dispatchDate: "",
      eta: "",
      history,
      createdAt: at,
      demo: true,
      ...ship,
    };
  };
  const lA = listingFor(pick(0).id, "u_garage64");
  const lB = listingFor(pick(1).id, "u_dukaan");
  const lC = listingFor(pick(0).id, "u_pitlane");
  const orders: Order[] = [
    mkOrder("o_1", DEMO_BUYER, lA, "shipped", 3, {
      carrier: "Delhivery",
      trackingNumber: "DLV0098123457",
      trackingUrl: "https://www.delhivery.com/track/package/DLV0098123457",
      dispatchDate: new Date(base - 2 * DAY).toISOString().slice(0, 10),
      eta: "Expected in 2-3 days",
    }),
    mkOrder("o_2", DEMO_BUYER, lB, "delivered", 14, {
      carrier: "India Post",
      trackingNumber: "EE123456789IN",
      trackingUrl: "",
      dispatchDate: new Date(base - 13 * DAY).toISOString().slice(0, 10),
    }),
    mkOrder("o_3", "u_dukaan", lA, "processing", 0),
    mkOrder("o_4", "u_pitlane", lC, "processing", 0),
  ];
  // Seeded orders count as sold; the shelf is restocked so the demo stays buyable.
  for (const o of orders) listings.find((x) => x.id === o.lines[0].listingId)!.sold += 1;

  const auctionItem = pick(2);
  const raffleItem = pick(5);
  const events: MarketEvent[] = [
    {
      id: "e_1",
      sellerId: "u_garage64",
      type: "auction",
      itemId: auctionItem.id,
      title: `${auctionItem.name} - sealed auction`,
      condition: "New",
      packaging: "Sealed",
      rules:
        "Highest bid at close wins. Minimum raise applies to every bid. A bid in the last 2 minutes extends the close by 2 minutes. If the reserve is not met there is no winner. If the winner does not pay within 48 hours the seller may offer it to the next highest bidder. Demo: bids are simulated and no money moves.",
      startsPaise: 50000,
      minIncrementPaise: 5000,
      reservePaise: 70000,
      extendMinutes: 2,
      maxEntriesPerUser: 1,
      endsAt: base + 60 * HOUR,
      status: "live",
      bids: [
        { id: "b_1", userId: "u_dukaan", amountPaise: 55000, at: base + 2 * HOUR },
        { id: "b_2", userId: "u_pitlane", amountPaise: 62000, at: base + 5 * HOUR },
      ],
      entries: [],
      winnerId: null,
      resultNote: "",
      audit: [{ at: base - DAY, by: "u_garage64", note: "Published" }],
      createdAt: base - DAY,
      demo: true,
    },
    {
      id: "e_2",
      sellerId: "u_dukaan",
      type: "raffle",
      itemId: raffleItem.id,
      title: `${raffleItem.name} - free-entry raffle`,
      condition: "New",
      packaging: "Sealed",
      rules:
        "Free entry, one per account, signed-in collectors only (sellers cannot enter their own raffle). One winner is drawn when the raffle closes: the draw seed, entry count and picked position are recorded on this page. Demo: this is a reproducible draw, not an audited lottery; no money is involved.",
      startsPaise: 0,
      minIncrementPaise: 0,
      reservePaise: null,
      extendMinutes: 0,
      maxEntriesPerUser: 1,
      endsAt: base + 96 * HOUR,
      status: "live",
      bids: [],
      entries: [
        { id: "r_1", userId: "u_garage64", at: base + HOUR },
        { id: "r_2", userId: "u_pitlane", at: base + 3 * HOUR },
      ],
      winnerId: null,
      resultNote: "",
      audit: [{ at: base - DAY, by: "u_dukaan", note: "Published" }],
      createdAt: base - DAY,
      demo: true,
    },
  ];

  return {
    v: 1,
    seeded: true,
    createdCars: [],
    seq: 100,
    session: null,
    users,
    sellers,
    items,
    listings,
    orders,
    events,
    photoRequests: [],
    notifications: [
      {
        id: "n_1",
        userId: DEMO_BUYER,
        text: "Your order o_1 is In transit with Delhivery.",
        at: base - 2 * DAY,
        read: false,
        href: "/market/orders/o_1",
      },
    ],
  };
}
