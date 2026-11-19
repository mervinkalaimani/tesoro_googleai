/**
 * Viiv Market data layer: the "server" of the demo.
 *
 * Every rule that matters lives here and not in a component: who may do what,
 * stock, idempotent checkout, bid order, deadlines, event draws. The UI only
 * calls these functions and shows the result, so a hidden button is never the
 * thing standing between a user and somebody else's order.
 *
 * Persistence is localStorage and every write is one synchronous
 * read-modify-write on a fresh copy of the stored state, which is atomic within
 * and across tabs. ponytail: swap `tx` for Postgres transactions (stock
 * decrement and collection upsert in one RPC) when this gets a real backend;
 * the function signatures are the API.
 */
import type { CatalogCar } from "@/lib/catalog";

import { fromCatalogCar } from "./catalogue";
import { hash, seedState } from "./seed";
import { rupees } from "./format";
import type {
  Address,
  CatalogueItem,
  Condition,
  EventType,
  Listing,
  MarketEvent,
  Notification,
  Order,
  Origin,
  Packaging,
  R,
  SellerProfile,
  State,
  User,
} from "./types";

const KEY = "viiv.market.v2";
const MIN = 60_000;

const ok = <T>(data: T): R<T> => ({ ok: true, data });
const fail = (error: string): R<never> => ({ ok: false, error });

/* ---------------------------------------------------------------- store */

/**
 * The catalogue is not the market's data: it is the Viiv catalogue, handed in
 * with `setCatalogue`. It is never persisted here, only the demo content built
 * on top of it (listings, orders, events) and cars made in the market.
 */
let catalogue: CatalogueItem[] = [];
const emptyState = (): State => ({
  v: 1,
  seeded: false,
  createdCars: [],
  seq: 100,
  session: null,
  users: [],
  sellers: [],
  items: [],
  listings: [],
  orders: [],
  events: [],
  notifications: [],
});
const serverState = emptyState();
let state: State = serverState;
let loaded = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function read(): State | null {
  try {
    const t = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    const s = t ? (JSON.parse(t) as State) : null;
    return s && s.v === 1 ? { ...s, items: catalogue } : null;
  } catch {
    return null;
  }
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  const s = read();
  if (s) state = s;
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    const next = read();
    if (next) {
      state = next;
      emit();
    }
  });
}

export const getState = (): State => (ensureLoaded(), state);
export const getServerState = (): State => serverState;
export function subscribe(f: () => void) {
  subs.add(f);
  return () => void subs.delete(f);
}

function commit(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...next, items: [] }));
  } catch {
    /* private mode / quota: the session still works in memory */
  }
  emit();
}

/**
 * Hand the market the Viiv catalogue. The first time it has enough cars, demo
 * sellers, listings, orders and events are generated on top of it.
 */
export function setCatalogue(items: CatalogueItem[]) {
  ensureLoaded();
  catalogue = items;
  if (!state.seeded && items.length >= 30) {
    const created = state.createdCars;
    commit({ ...seedState(Date.now(), items), createdCars: created });
    return;
  }
  state = { ...state, items };
  emit();
}

/** Reset the demo to its seeded state (also signs out). */
export function resetDemo() {
  const me = state.users.find((u) => u.id === state.session);
  const fresh = seedState(Date.now(), catalogue);
  // Keep the signed-in Viiv account: the reset wipes what it made, not who it is.
  if (me) fresh.users.push({ ...me, sellerMode: false, saved: [] });
  fresh.session = me?.id ?? null;
  commit(fresh);
}

function tx<T>(
  fn: (s: State, now: number, me: User | null) => R<T>,
  opts?: { offlineOk?: boolean },
): R<T> {
  if (!opts?.offlineOk && typeof navigator !== "undefined" && navigator.onLine === false)
    return fail("You're offline. Nothing was changed. Reconnect and try again.");
  ensureLoaded();
  const fresh = read() ?? state;
  const draft = structuredClone(fresh);
  const now = Date.now();
  settleEvents(draft, now);
  const me = draft.users.find((u) => u.id === draft.session) ?? null;
  const r = fn(draft, now, me);
  if (r.ok) commit(draft);
  return r;
}

/** Close any event whose deadline has passed. Cheap no-op when none is due. */
export function settleDue(): void {
  const s = getState();
  const now = Date.now();
  if (s.events.some((e) => e.status === "live" && now >= e.endsAt))
    tx((d) => ok(d), { offlineOk: true });
}

/* -------------------------------------------------------------- helpers */

const id = (s: State, p: string) => `${p}_${++s.seq}`;
const user = (s: State, uid: string) => s.users.find((u) => u.id === uid);
const needMe = (me: User | null) => (me ? null : fail("Sign in to do that."));

function ping(
  s: State,
  userId: string,
  kind: "orders" | "events" | null,
  text: string,
  href?: string,
) {
  const u = user(s, userId);
  if (!u || (kind && !u.notify[kind])) return;
  s.notifications.unshift({
    id: id(s, "n"),
    userId,
    text,
    at: Date.now(),
    read: false,
    href,
  } as Notification);
}

const addrOk = (a: Omit<Address, "id">) =>
  a.name.trim() &&
  /^\d{10}$/.test(a.phone) &&
  a.line1.trim() &&
  a.city.trim() &&
  a.state.trim() &&
  /^\d{6}$/.test(a.pincode);

export function currentBid(e: MarketEvent): number {
  return e.bids.length ? e.bids[e.bids.length - 1].amountPaise : 0;
}
export const minNextBid = (e: MarketEvent) =>
  e.bids.length ? currentBid(e) + e.minIncrementPaise : e.startsPaise;
export const available = (l: Listing) => l.quantity;
export const participants = (e: MarketEvent) =>
  new Set([...e.bids.map((b) => b.userId), ...e.entries.map((x) => x.userId)]).size;

/* --------------------------------------------------------------- events */

function closeEvent(s: State, e: MarketEvent, now: number, by: string) {
  if (e.type === "auction") {
    const top = e.bids[e.bids.length - 1];
    if (top && (e.reservePaise === null || top.amountPaise >= e.reservePaise)) {
      e.winnerId = top.userId;
      e.resultNote = `Won at ${rupees(top.amountPaise)}. Next: the seller contacts the winner to arrange payment and shipping (demo: no money moves).`;
    } else {
      e.resultNote = top
        ? `Reserve of ${rupees(e.reservePaise!)} was not met, so there is no winner.`
        : "No bids were placed.";
    }
  } else if (e.entries.length) {
    const seed = `${e.id}:${e.entries.map((x) => x.id).join(",")}`;
    const index = hash(seed) % e.entries.length;
    e.draw = { seed, entryCount: e.entries.length, index };
    e.winnerId = e.entries[index].userId;
    e.resultNote = `Winner drawn: position ${index + 1} of ${e.entries.length}. The seller contacts the winner to arrange shipping.`;
  } else e.resultNote = "No entries were received.";
  e.status = "closed";
  e.audit.push({ at: now, by, note: `Closed. ${e.resultNote}` });
  const href = `/market/event/${e.id}`;
  const everyone = new Set([...e.bids.map((b) => b.userId), ...e.entries.map((x) => x.userId)]);
  everyone.forEach((uid) =>
    ping(
      s,
      uid,
      "events",
      uid === e.winnerId ? `You won "${e.title}".` : `"${e.title}" has closed. You did not win.`,
      href,
    ),
  );
  ping(s, e.sellerId, "events", `"${e.title}" closed. ${e.resultNote}`, href);
}

function settleEvents(s: State, now: number) {
  for (const e of s.events)
    if (e.status === "live" && now >= e.endsAt) closeEvent(s, e, e.endsAt, "system");
}

/* -------------------------------------------------------------- actions */

export const api = {
  /* ---- identity ---- */
  /** Test hook: act as a seeded account. The UI never calls it; the session comes from linkViivUser. */
  signIn(userId: string) {
    return tx(
      (s) => (user(s, userId) ? ((s.session = userId), ok(undefined)) : fail("No such account.")),
      { offlineOk: true },
    );
  },
  /**
   * Make the store's session the signed-in Viiv account (null = signed out).
   * The market user is created the first time the account opens the store.
   */
  linkViivUser(v: { id: string; name: string; email: string } | null) {
    const want = v ? `v_${v.id}` : null;
    const cur = getState();
    if (cur.session === want && (!want || cur.users.some((u) => u.id === want)))
      return ok(undefined);
    return tx(
      (s, now) => {
        if (v && want && !s.users.some((u) => u.id === want))
          s.users.push({
            id: want,
            name: v.name,
            email: v.email,
            createdAt: now,
            sellerMode: false,
            addresses: [],
            saved: [],
            notify: { orders: true, events: true },
          });
        s.session = want;
        return ok(undefined);
      },
      { offlineOk: true },
    );
  },
  updateProfile(name: string) {
    return tx(
      (s, _n, me) =>
        needMe(me) ??
        (name.trim().length < 2
          ? fail("Enter your name.")
          : ((user(s, me!.id)!.name = name.trim()), ok(undefined))),
    );
  },
  addAddress(a: Omit<Address, "id">) {
    return tx((s, _n, me) => {
      if (!me) return fail("Sign in to do that.");
      if (!addrOk(a))
        return fail("Check the address: 10-digit phone and 6-digit pincode are required.");
      const u = user(s, me.id)!;
      const addr = { ...a, id: id(s, "a") };
      u.addresses.push(addr);
      return ok(addr);
    });
  },
  removeAddress(addrId: string) {
    return tx((s, _n, me) => {
      if (!me) return fail("Sign in to do that.");
      const u = user(s, me.id)!;
      u.addresses = u.addresses.filter((a) => a.id !== addrId);
      return ok(undefined);
    });
  },
  setNotify(key: "orders" | "events", on: boolean) {
    return tx((s, _n, me) =>
      me ? ((user(s, me.id)!.notify[key] = on), ok(undefined)) : fail("Sign in to do that."),
    );
  },
  toggleSaved(itemId: string) {
    return tx((s, _n, me) => {
      if (!me) return fail("Sign in to save cars.");
      const u = user(s, me.id)!;
      u.saved = u.saved.includes(itemId)
        ? u.saved.filter((x) => x !== itemId)
        : [...u.saved, itemId];
      return ok(u.saved.includes(itemId));
    });
  },
  markRead(nid: string | "all") {
    return tx(
      (s, _n, me) => {
        if (!me) return fail("Sign in to do that.");
        s.notifications.forEach(
          (n) => n.userId === me.id && (nid === "all" || n.id === nid) && (n.read = true),
        );
        return ok(undefined);
      },
      { offlineOk: true },
    );
  },

  /* ---- seller account ---- */
  becomeSeller(
    p: Pick<SellerProfile, "storeName" | "location" | "bio" | "contact" | "payoutNote">,
  ) {
    return tx((s, _n, me) => {
      if (!me) return fail("Sign in to do that.");
      if (s.sellers.some((x) => x.userId === me.id))
        return fail("You already have a seller profile.");
      if (p.storeName.trim().length < 2) return fail("Give your store a name.");
      if (!p.location.trim()) return fail("Add your location.");
      s.sellers.push({
        ...p,
        userId: me.id,
        storeName: p.storeName.trim(),
        verification: "Unverified",
        rating: null,
        ratingCount: 0,
      });
      user(s, me.id)!.sellerMode = true;
      return ok(undefined);
    });
  },
  updateSeller(
    p: Partial<Pick<SellerProfile, "storeName" | "location" | "bio" | "contact" | "payoutNote">>,
  ) {
    return tx((s, _n, me) => {
      const sp = me && s.sellers.find((x) => x.userId === me.id);
      if (!sp) return fail("You are not a seller yet.");
      if (p.storeName !== undefined && p.storeName.trim().length < 2)
        return fail("Give your store a name.");
      Object.assign(sp, p);
      return ok(undefined);
    });
  },
  setSellerMode(on: boolean) {
    return tx(
      (s, _n, me) => {
        if (!me) return fail("Sign in to do that.");
        if (on && !s.sellers.some((x) => x.userId === me.id))
          return fail("Set up your seller profile first.");
        user(s, me.id)!.sellerMode = on;
        return ok(undefined);
      },
      { offlineOk: true },
    );
  },
  /** Asks for verification. Nothing in the demo ever grants it. */
  requestVerification() {
    return tx((s, _n, me) => {
      const sp = me && s.sellers.find((x) => x.userId === me.id);
      if (!sp) return fail("You are not a seller yet.");
      if (sp.verification !== "Unverified")
        return fail(`Already ${sp.verification.toLowerCase()}.`);
      sp.verification = "Pending";
      return ok(undefined);
    });
  },

  /* ---- catalogue ---- */
  /**
   * A seller files a car the catalogue doesn't have. In demo mode it joins the
   * catalogue view (and the catalogue pages) but is not written to the shared
   * catalogue table; the caller decides which, see MakeCar.
   */
  addCar(car: CatalogCar) {
    const r = tx((s, _now, me) => {
      if (!me) return fail("Sign in to do that.");
      if (!s.sellers.some((x) => x.userId === me.id)) return fail("Only sellers can add cars.");
      if (!car.brand.trim() || !car.model.trim() || !car.assortment.trim())
        return fail("Brand, model and assortment are required.");
      if (!/^1:\d+$/.test((car.size || "").trim())) return fail("Scale looks like 1:64.");
      const norm = (x?: string) => (x ?? "").trim().toLowerCase();
      const key = (c: {
        brand?: string;
        model?: string;
        scale?: string;
        assortment?: string;
        variant?: string;
        colour?: string;
      }) => [c.brand, c.model, c.scale, c.assortment, c.variant, c.colour].map(norm).join("|");
      const want = key({ ...car, scale: car.size });
      const dup = s.items.find((i) => key(i) === want);
      if (dup) return fail(`Already in the catalogue as "${dup.name}". Pick that one instead.`);
      s.createdCars.push(car);
      const item = fromCatalogCar(car, "market-created");
      s.items.push(item);
      return ok(item);
    });
    if (r.ok) setCatalogue([...catalogue.filter((i) => i.id !== r.data.id), r.data]);
    return r;
  },

  /* ---- listings ---- */
  saveListing(
    f: {
      id?: string;
      itemId: string;
      title: string;
      description: string;
      condition: Condition;
      packaging: Packaging;
      conditionNotes: string;
      quantity: number;
      mrpPaise: number | null;
      pricePaise: number;
      shippingPaise: number | null;
      dispatchDays: number;
      regions: string;
      returnPolicy: string;
      sku: string;
      privateNotes: string;
      originOverride: Origin | null;
    },
    publish: boolean,
  ) {
    return tx((s, now, me) => {
      if (!me) return fail("Sign in to do that.");
      if (!s.sellers.some((x) => x.userId === me.id)) return fail("Become a seller first.");
      const item = s.items.find((i) => i.id === f.itemId);
      if (!item) return fail("Pick a catalogue car first.");
      if (item.review === "pending" && item.suggestedBy !== me.id)
        return fail("That catalogue entry is not available.");
      const existing = f.id ? s.listings.find((l) => l.id === f.id) : undefined;
      if (f.id && (!existing || existing.sellerId !== me.id)) return fail("Listing not found.");
      if (!Number.isInteger(f.pricePaise) || f.pricePaise <= 0)
        return fail("Selling price must be more than ₹0.");
      if (f.mrpPaise !== null && (!Number.isInteger(f.mrpPaise) || f.mrpPaise <= 0))
        return fail("MRP must be more than ₹0, or left blank.");
      if (!Number.isInteger(f.quantity) || f.quantity < 0 || f.quantity > 999)
        return fail("Quantity must be a whole number from 0 to 999.");
      if (f.shippingPaise !== null && (!Number.isInteger(f.shippingPaise) || f.shippingPaise < 0))
        return fail("Shipping can't be negative.");
      if (!Number.isInteger(f.dispatchDays) || f.dispatchDays < 0 || f.dispatchDays > 30)
        return fail("Dispatch is 0 to 30 days.");
      if (f.packaging !== "Sealed" && !f.conditionNotes.trim())
        return fail("Describe the condition so buyers see it before checkout.");
      if (publish) {
        if (item.review !== "approved")
          return fail(
            "This catalogue entry is awaiting review. Save as a draft until it is approved.",
          );
        if (f.quantity < 1) return fail("Add at least 1 in stock to publish.");
        if (!f.returnPolicy.trim()) return fail("Add a return/cancellation policy.");
      }
      const base = {
        itemId: f.itemId,
        title: f.title.trim(),
        description: f.description.trim(),
        condition: f.condition,
        packaging: f.packaging,
        conditionNotes: f.conditionNotes.trim(),
        quantity: f.quantity,
        mrpPaise: f.mrpPaise,
        pricePaise: f.pricePaise,
        shippingPaise: f.shippingPaise,
        dispatchDays: f.dispatchDays,
        regions: f.regions.trim() || "Pan-India",
        returnPolicy: f.returnPolicy.trim(),
        sku: f.sku.trim(),
        privateNotes: f.privateNotes.trim(),
        updatedAt: now,
        originOverride:
          f.originOverride && f.originOverride !== item.origin
            ? { value: f.originOverride, status: "pending" as const }
            : undefined,
      };
      if (existing) {
        Object.assign(existing, base);
        if (publish) existing.status = "active";
        else if (existing.status === "active" && existing.quantity === 0)
          existing.status = "sold_out";
        else if (existing.status === "sold_out" && existing.quantity > 0)
          existing.status = "active";
        return ok(existing);
      }
      const l: Listing = {
        id: id(s, "l"),
        sellerId: me.id,
        sold: 0,
        status: publish ? "active" : "draft",
        createdAt: now,
        ...base,
      };
      s.listings.push(l);
      return ok(l);
    });
  },
  setListingStatus(listingId: string, status: "active" | "paused") {
    return tx((s, _n, me) => {
      const l = s.listings.find((x) => x.id === listingId && x.sellerId === me?.id);
      if (!l) return fail("Listing not found.");
      if (l.status === "draft") return fail("Publish the draft first.");
      if (status === "active" && l.quantity < 1) return fail("Add stock before resuming.");
      l.status = status;
      return ok(undefined);
    });
  },
  deleteListing(listingId: string) {
    return tx((s, _n, me) => {
      const l = s.listings.find((x) => x.id === listingId && x.sellerId === me?.id);
      if (!l) return fail("Listing not found.");
      if (l.status !== "draft")
        return fail("Only drafts can be deleted. Pause a live listing instead.");
      s.listings = s.listings.filter((x) => x.id !== l.id);
      return ok(undefined);
    });
  },

  /* ---- checkout + collection ---- */
  checkout(f: { listingId: string; qty: number; address: Omit<Address, "id">; key: string }) {
    return tx((s, now, me) => {
      if (!me) return fail("Sign in to buy.");
      // A retry with the same key returns the first result instead of buying twice.
      const dup = s.orders.find((o) => o.idempotencyKey === f.key && o.buyerId === me.id);
      if (dup) return ok(dup);
      const l = s.listings.find((x) => x.id === f.listingId);
      if (!l || l.status === "draft" || l.status === "paused")
        return fail("This offer is no longer available.");
      if (l.sellerId === me.id) return fail("You can't buy your own listing.");
      const item = s.items.find((i) => i.id === l.itemId);
      if (!item || item.review !== "approved") return fail("This offer is no longer available.");
      if (!Number.isInteger(f.qty) || f.qty < 1) return fail("Choose a quantity of at least 1.");
      if (l.quantity < f.qty)
        return fail(
          l.quantity
            ? `Only ${l.quantity} left. Lower the quantity.`
            : "Sold out. Someone bought the last one first.",
        );
      if (!addrOk(f.address))
        return fail("Check the delivery address: 10-digit phone and 6-digit pincode are required.");

      l.quantity -= f.qty;
      l.sold += f.qty;
      if (l.quantity === 0) l.status = "sold_out";
      const itemsPaise = l.pricePaise * f.qty;
      const shipping = l.shippingPaise ?? 0;
      const o: Order = {
        id: id(s, "o"),
        buyerId: me.id,
        sellerId: l.sellerId,
        lines: [
          {
            listingId: l.id,
            itemId: l.itemId,
            title: l.title || item.name,
            qty: f.qty,
            unitPaise: l.pricePaise,
            mrpPaise: l.mrpPaise,
          },
        ],
        itemsPaise,
        shippingPaise: shipping,
        shippingPending: l.shippingPaise === null,
        totalPaise: itemsPaise + shipping,
        address: { ...f.address, id: id(s, "a") },
        status: "processing",
        payment: "demo",
        idempotencyKey: f.key,
        carrier: "",
        trackingNumber: "",
        trackingUrl: "",
        dispatchDate: "",
        eta: "",
        history: [
          {
            at: now,
            status: "processing",
            note: "Order placed (demo payment, nothing charged)",
            by: me.id,
          },
        ],
        createdAt: now,
      };
      s.orders.unshift(o);
      const u = user(s, me.id)!;
      if (!u.addresses.length) u.addresses.push({ ...f.address, id: id(s, "a") });
      ping(
        s,
        l.sellerId,
        "orders",
        `New order ${o.id}: ${f.qty} × ${item.name}. Ship it from Seller orders.`,
        "/seller/orders",
      );
      return ok(o);
    });
  },
  cancelOrder(orderId: string, reason: string) {
    return tx((s, now, me) => {
      const o = s.orders.find(
        (x) => x.id === orderId && (x.buyerId === me?.id || x.sellerId === me?.id),
      );
      if (!o) return fail("Order not found.");
      if (o.status !== "processing") return fail(`A ${o.status} order can't be cancelled here.`);
      for (const line of o.lines) {
        const l = s.listings.find((x) => x.id === line.listingId);
        if (l) {
          l.quantity += line.qty;
          l.sold = Math.max(0, l.sold - line.qty);
          if (l.status === "sold_out") l.status = "active";
        }
      }
      o.status = "cancelled";
      o.history.push({
        at: now,
        status: "cancelled",
        note: reason.trim() || "Cancelled",
        by: me!.id,
      });
      ping(
        s,
        me!.id === o.buyerId ? o.sellerId : o.buyerId,
        "orders",
        `Order ${o.id} was cancelled.`,
        "/market/orders/" + o.id,
      );
      return ok(undefined);
    });
  },
  markShipped(
    orderId: string,
    t: {
      carrier: string;
      trackingNumber: string;
      trackingUrl: string;
      dispatchDate: string;
      eta: string;
    },
  ) {
    return tx((s, now, me) => {
      // Looked up by seller too, so another seller's order is simply "not found".
      const o = s.orders.find((x) => x.id === orderId && x.sellerId === me?.id);
      if (!o) return fail("Order not found.");
      if (o.status !== "processing" && o.status !== "shipped")
        return fail(`A ${o.status} order can't be shipped.`);
      if (!t.carrier.trim() || !t.trackingNumber.trim())
        return fail("Carrier and tracking number are required.");
      if (t.trackingUrl && !/^https?:\/\//i.test(t.trackingUrl))
        return fail("Tracking link must start with http:// or https://");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t.dispatchDate) || Number.isNaN(Date.parse(t.dispatchDate)))
        return fail("Pick the dispatch date.");
      const first = o.status === "processing";
      Object.assign(o, {
        carrier: t.carrier.trim(),
        trackingNumber: t.trackingNumber.trim(),
        trackingUrl: t.trackingUrl.trim(),
        dispatchDate: t.dispatchDate,
        eta: t.eta.trim(),
      });
      o.status = "shipped";
      o.history.push({
        at: now,
        status: "shipped",
        note: first
          ? `Shipped via ${o.carrier} (${o.trackingNumber})`
          : `Tracking updated: ${o.carrier} ${o.trackingNumber}`,
        by: me!.id,
      });
      ping(
        s,
        o.buyerId,
        "orders",
        first
          ? `Your order ${o.id} is In transit with ${o.carrier}.`
          : `Tracking updated for order ${o.id}.`,
        "/market/orders/" + o.id,
      );
      return ok(undefined);
    });
  },
  markDelivered(orderId: string) {
    return tx((s, now, me) => {
      const o = s.orders.find(
        (x) => x.id === orderId && (x.buyerId === me?.id || x.sellerId === me?.id),
      );
      if (!o) return fail("Order not found.");
      if (o.status !== "shipped") return fail("Only an in-transit order can be marked delivered.");
      o.status = "delivered";
      o.history.push({
        at: now,
        status: "delivered",
        note: me!.id === o.buyerId ? "Buyer confirmed receipt" : "Seller marked delivered",
        by: me!.id,
      });
      ping(
        s,
        me!.id === o.buyerId ? o.sellerId : o.buyerId,
        "orders",
        `Order ${o.id} was delivered.`,
        "/market/orders/" + o.id,
      );
      return ok(undefined);
    });
  },

  /* ---- events ---- */
  saveEvent(f: {
    id?: string;
    type: EventType;
    itemId: string;
    title: string;
    rules: string;
    condition: Condition;
    packaging: Packaging;
    startsPaise: number;
    minIncrementPaise: number;
    reservePaise: number | null;
    endsAt: number;
    extendMinutes: number;
    maxEntriesPerUser: number;
  }) {
    return tx((s, now, me) => {
      if (!me || !s.sellers.some((x) => x.userId === me.id)) return fail("Become a seller first.");
      if (!s.items.some((i) => i.id === f.itemId && i.review === "approved"))
        return fail("Pick an approved catalogue car.");
      if (f.title.trim().length < 3) return fail("Give the event a title.");
      if (f.rules.trim().length < 30)
        return fail(
          "Write the rules (at least a couple of sentences): how the winner is picked, what happens if payment fails.",
        );
      if (!Number.isFinite(f.endsAt) || f.endsAt < now + 5 * MIN)
        return fail("The end time must be at least 5 minutes from now.");
      if (f.type === "auction") {
        if (!(f.startsPaise > 0)) return fail("Set a starting bid above ₹0.");
        if (!(f.minIncrementPaise > 0)) return fail("Set a minimum raise above ₹0.");
        if (f.reservePaise !== null && f.reservePaise < f.startsPaise)
          return fail("Reserve can't be below the starting bid.");
        if (f.extendMinutes < 0 || f.extendMinutes > 30)
          return fail("Extension is 0 to 30 minutes.");
      } else if (!(f.maxEntriesPerUser >= 1 && f.maxEntriesPerUser <= 5))
        return fail("Entries per person: 1 to 5.");
      const clean = {
        type: f.type,
        itemId: f.itemId,
        title: f.title.trim(),
        rules: f.rules.trim(),
        condition: f.condition,
        packaging: f.packaging,
        startsPaise: f.type === "auction" ? f.startsPaise : 0,
        minIncrementPaise: f.type === "auction" ? f.minIncrementPaise : 0,
        reservePaise: f.type === "auction" ? f.reservePaise : null,
        endsAt: f.endsAt,
        extendMinutes: f.type === "auction" ? f.extendMinutes : 0,
        maxEntriesPerUser: f.type === "raffle" ? f.maxEntriesPerUser : 1,
      };
      if (f.id) {
        const e = s.events.find((x) => x.id === f.id && x.sellerId === me.id);
        if (!e) return fail("Event not found.");
        if (e.status === "closed" || e.status === "cancelled")
          return fail("A finished event can't be edited.");
        if (e.bids.length || e.entries.length)
          return fail(
            "Terms are locked once people take part. Cancel it and restart a copy instead.",
          );
        Object.assign(e, clean);
        e.audit.push({ at: now, by: me.id, note: "Edited" });
        return ok(e);
      }
      const e: MarketEvent = {
        id: id(s, "e"),
        sellerId: me.id,
        status: "draft",
        bids: [],
        entries: [],
        winnerId: null,
        resultNote: "",
        audit: [{ at: now, by: me.id, note: "Created as draft" }],
        createdAt: now,
        ...clean,
      };
      s.events.push(e);
      return ok(e);
    });
  },
  setEventStatus(eventId: string, to: "live" | "paused") {
    return tx((s, now, me) => {
      const e = s.events.find((x) => x.id === eventId && x.sellerId === me?.id);
      if (!e) return fail("Event not found.");
      const from = to === "live" ? ["draft", "paused"] : ["live"];
      if (!from.includes(e.status))
        return fail(`A ${e.status} event can't be set to ${to === "live" ? "live" : "paused"}.`);
      if (to === "live" && e.endsAt < now + MIN)
        return fail("Move the end time into the future first.");
      e.status = to;
      e.audit.push({ at: now, by: me!.id, note: to === "live" ? "Published / resumed" : "Paused" });
      return ok(undefined);
    });
  },
  cancelEvent(eventId: string, reason: string) {
    return tx((s, now, me) => {
      const e = s.events.find((x) => x.id === eventId && x.sellerId === me?.id);
      if (!e) return fail("Event not found.");
      if (e.status === "closed" || e.status === "cancelled") return fail("Already finished.");
      if (reason.trim().length < 3)
        return fail("Say why you are cancelling; participants will see it.");
      e.status = "cancelled";
      e.resultNote = `Cancelled by the seller: ${reason.trim()}`;
      e.audit.push({ at: now, by: me!.id, note: e.resultNote });
      new Set([...e.bids.map((b) => b.userId), ...e.entries.map((x) => x.userId)]).forEach((uid) =>
        ping(
          s,
          uid,
          "events",
          `"${e.title}" was cancelled. ${reason.trim()}`,
          `/market/event/${e.id}`,
        ),
      );
      return ok(undefined);
    });
  },
  closeEventNow(eventId: string) {
    return tx((s, now, me) => {
      const e = s.events.find((x) => x.id === eventId && x.sellerId === me?.id);
      if (!e) return fail("Event not found.");
      if (e.status !== "live") return fail("Only a live event can be closed.");
      closeEvent(s, e, now, me!.id);
      return ok(undefined);
    });
  },
  restartEvent(eventId: string) {
    return tx((s, now, me) => {
      const e = s.events.find((x) => x.id === eventId && x.sellerId === me?.id);
      if (!e) return fail("Event not found.");
      if (e.status !== "cancelled" && e.status !== "closed")
        return fail("Cancel the event before restarting a copy.");
      const copy: MarketEvent = {
        ...structuredClone(e),
        id: id(s, "e"),
        status: "draft",
        bids: [],
        entries: [],
        winnerId: null,
        resultNote: "",
        draw: undefined,
        endsAt: now + 3 * 86_400_000,
        createdAt: now,
        demo: undefined,
        audit: [{ at: now, by: me!.id, note: `Restarted as a draft from ${e.id}` }],
      };
      s.events.push(copy);
      return ok(copy);
    });
  },
  placeBid(eventId: string, amountPaise: number) {
    return tx((s, now, me) => {
      if (!me) return fail("Sign in to bid.");
      const e = s.events.find((x) => x.id === eventId && x.type === "auction");
      if (!e) return fail("Auction not found.");
      if (e.sellerId === me.id) return fail("You can't bid on your own auction.");
      if (e.status !== "live") return fail("This auction isn't open for bids.");
      if (now >= e.endsAt) return fail("This auction has ended.");
      if (!Number.isInteger(amountPaise)) return fail("Enter a bid amount.");
      if (e.bids.at(-1)?.userId === me.id) return fail("You already hold the highest bid.");
      const min = minNextBid(e);
      if (amountPaise < min) return fail(`Bid at least ${rupees(min)}.`);
      const prev = e.bids.at(-1);
      e.bids.push({ id: id(s, "b"), userId: me.id, amountPaise, at: now });
      if (e.extendMinutes && e.endsAt - now <= e.extendMinutes * MIN) {
        e.endsAt = now + e.extendMinutes * MIN;
        e.audit.push({
          at: now,
          by: "system",
          note: `Closing extended by ${e.extendMinutes} min after a late bid`,
        });
      }
      if (prev)
        ping(
          s,
          prev.userId,
          "events",
          `You were outbid on "${e.title}". New high bid ${rupees(amountPaise)}.`,
          `/market/event/${e.id}`,
        );
      ping(
        s,
        e.sellerId,
        "events",
        `New bid on "${e.title}": ${rupees(amountPaise)}.`,
        `/market/event/${e.id}`,
      );
      return ok(undefined);
    });
  },
  enterRaffle(eventId: string) {
    return tx((s, now, me) => {
      if (!me) return fail("Sign in to enter.");
      const e = s.events.find((x) => x.id === eventId && x.type === "raffle");
      if (!e) return fail("Raffle not found.");
      if (e.sellerId === me.id) return fail("Sellers can't enter their own raffle.");
      if (e.status !== "live" || now >= e.endsAt)
        return fail("This raffle isn't open for entries.");
      if (e.entries.filter((x) => x.userId === me.id).length >= e.maxEntriesPerUser)
        return fail(
          e.maxEntriesPerUser === 1
            ? "You're already in this draw."
            : `Limit of ${e.maxEntriesPerUser} entries reached.`,
        );
      e.entries.push({ id: id(s, "r"), userId: me.id, at: now });
      return ok(undefined);
    });
  },
};
