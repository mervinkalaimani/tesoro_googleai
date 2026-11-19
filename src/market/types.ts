import type { CatalogCar } from "@/lib/catalog";

/** Viiv Market: shared types. Money is always integer paise (INR). */

export type Origin = "Indian" | "Imported";
export type Condition = "New" | "Opened" | "Display";
export type Packaging = "Sealed" | "Box (minor wear)" | "Box (damaged)" | "Loose";
export type ListingStatus = "draft" | "active" | "paused" | "sold_out";
export type OrderStatus = "processing" | "shipped" | "delivered" | "cancelled";
export type Verification = "Unverified" | "Pending" | "Verified";
export type EventType = "auction" | "raffle";
export type EventStatus = "draft" | "live" | "paused" | "closed" | "cancelled";

export type CatalogueItem = {
  id: string;
  /** Source catalogue code (the Viiv catalogue id), kept for repeatable imports. */
  code: string;
  name: string;
  brand: string;
  make: string;
  model: string;
  scale: string;
  series: string;
  assortment: string;
  variant: string;
  colour: string;
  year: string;
  manufacturer: string;
  origin: Origin;
  aliases: string[];
  /** Catalogue MRP in paise, 0 when unknown. */
  mrpPaise: number;
  imageUrl: string | null;
  imageAttribution?: string;
  source: "viiv-catalogue" | "market-created";
  /** Suggestions stay pending: they can be drafted against but not published. */
  review: "approved" | "pending";
  suggestedBy?: string;
  createdAt: number;
};

export type Address = {
  id: string;
  name: string;
  phone: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  createdAt: number;
  demo?: boolean;
  /** Which hat the person is wearing; the identity is the same either way. */
  sellerMode: boolean;
  addresses: Address[];
  saved: string[];
  notify: { orders: boolean; events: boolean };
};

export type SellerProfile = {
  userId: string;
  storeName: string;
  location: string;
  bio: string;
  contact: "in-app" | "email" | "phone";
  payoutNote: string;
  verification: Verification;
  /** Seeded demo figures; real ratings need real reviews. */
  rating: number | null;
  ratingCount: number;
  demo?: boolean;
};

export type Listing = {
  id: string;
  sellerId: string;
  itemId: string;
  title: string;
  description: string;
  condition: Condition;
  packaging: Packaging;
  conditionNotes: string;
  quantity: number;
  sold: number;
  mrpPaise: number | null;
  pricePaise: number;
  /** null = "calculated later". */
  shippingPaise: number | null;
  dispatchDays: number;
  regions: string;
  returnPolicy: string;
  status: ListingStatus;
  /** Private to the seller. */
  sku: string;
  privateNotes: string;
  originOverride?: { value: Origin; status: "pending" };
  /** A combo: one box of several catalogue cars sold together. `itemId` is its first car. */
  bundle?: { itemId: string; qty: number }[];
  createdAt: number;
  updatedAt: number;
  demo?: boolean;
};

export type HistoryEntry = { at: number; status: OrderStatus; note: string; by: string };

export type OrderLine = {
  listingId: string;
  itemId: string;
  title: string;
  qty: number;
  unitPaise: number;
  mrpPaise: number | null;
};

export type Order = {
  id: string;
  buyerId: string;
  sellerId: string;
  lines: OrderLine[];
  itemsPaise: number;
  shippingPaise: number;
  shippingPending: boolean;
  totalPaise: number;
  address: Address;
  status: OrderStatus;
  /** "demo" = simulated payment; nothing was charged. */
  payment: "demo";
  idempotencyKey: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string;
  dispatchDate: string;
  eta: string;
  history: HistoryEntry[];
  createdAt: number;
  demo?: boolean;
};

export type Bid = { id: string; userId: string; amountPaise: number; at: number };
export type RaffleEntry = { id: string; userId: string; at: number };

export type MarketEvent = {
  id: string;
  sellerId: string;
  type: EventType;
  itemId: string;
  title: string;
  condition: Condition;
  packaging: Packaging;
  rules: string;
  startsPaise: number;
  minIncrementPaise: number;
  reservePaise: number | null;
  /** A bid in the last N minutes pushes the close out by N minutes. */
  extendMinutes: number;
  maxEntriesPerUser: number;
  endsAt: number;
  status: EventStatus;
  bids: Bid[];
  entries: RaffleEntry[];
  winnerId: string | null;
  resultNote: string;
  /** Raffle draw record, so the pick can be re-derived. */
  draw?: { seed: string; entryCount: number; index: number };
  audit: { at: number; by: string; note: string }[];
  createdAt: number;
  demo?: boolean;
};

export type Notification = {
  id: string;
  userId: string;
  text: string;
  at: number;
  read: boolean;
  href?: string;
};

export type State = {
  v: 1;
  /** Demo content has been generated for the current catalogue. */
  seeded: boolean;
  /** Cars made in the market (demo mode). They join the catalogue view. */
  createdCars: CatalogCar[];
  seq: number;
  session: string | null;
  users: User[];
  sellers: SellerProfile[];
  items: CatalogueItem[];
  listings: Listing[];
  orders: Order[];
  events: MarketEvent[];
  notifications: Notification[];
};

export type R<T = void> = { ok: true; data: T } | { ok: false; error: string };
