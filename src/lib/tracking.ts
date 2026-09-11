/**
 * Delivery partners and the tracking pages they expose.
 *
 * A consignment number on its own is a dead end — it has to be carried to the
 * right courier's site by hand. Pairing it with the partner is what turns both
 * fields into one action, which is the only reason the partner is a separate
 * column rather than more free text.
 *
 * `page` is the courier's own tracking form, not a deep link to one
 * consignment. Deep links are the first thing these sites change: half of them
 * bounce a stale URL to a home page, and the ones that don't need a session the
 * link cannot carry. Opening the form and putting the number on the clipboard
 * works on every one of them and keeps working. A partner with no page still
 * earns its place in the list: it labels the shipment and keeps the spelling
 * consistent between cars.
 */
export type DeliveryPartner = {
  /** Canonical spelling, stored on the car and shown in the UI. */
  name: string;
  /** Extra spellings that should resolve to this partner when matching. */
  aliases?: string[];
  /** The courier's public tracking form, or undefined if there isn't one. */
  page?: string;
};

export const DELIVERY_PARTNERS: DeliveryPartner[] = [
  { name: "Delhivery", page: "https://www.delhivery.com/tracking" },
  { name: "Blue Dart", aliases: ["bluedart"], page: "https://www.bluedart.com/tracking" },
  { name: "DTDC", page: "https://www.dtdc.in/tracking" },
  {
    name: "India Post",
    aliases: ["speed post", "speedpost", "indiapost", "post"],
    page: "https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx",
  },
  {
    name: "Ekart",
    aliases: ["ekart logistics", "flipkart"],
    page: "https://ekartlogistics.com/track",
  },
  { name: "XpressBees", aliases: ["xpress bees"], page: "https://www.xpressbees.com/track" },
  { name: "Ecom Express", aliases: ["ecom"], page: "https://ecomexpress.in/tracking/" },
  { name: "Shadowfax", page: "https://tracker.shadowfax.in/" },
  {
    name: "Amazon Shipping",
    aliases: ["amazon", "amazon transportation", "ats"],
    page: "https://track.amazon.in/",
  },
  { name: "Shiprocket", page: "https://www.shiprocket.in/shipment-tracking/" },
  {
    name: "Professional Couriers",
    aliases: ["tpc", "the professional couriers"],
    page: "https://www.tpcindia.com/",
  },
  { name: "Trackon", page: "https://trackon.in/" },
  { name: "Gati", page: "https://www.gati.com/tracking/" },
  { name: "Safexpress", page: "https://www.safexpress.com/track-shipment.aspx" },
  { name: "FedEx", page: "https://www.fedex.com/fedextrack/" },
  { name: "DHL", page: "https://www.dhl.com/in-en/home/tracking.html" },
  { name: "UPS", page: "https://www.ups.com/track" },
  { name: "Aramex", page: "https://www.aramex.com/us/en/track/track-results-multiple" },
  {
    name: "EMS",
    aliases: ["ems international"],
    page: "https://www.ems.post/en/global-network/tracking",
  },
  {
    name: "Japan Post",
    page: "https://trackings.post.japanpost.jp/services/srv/search/input?searchKind=S002&locale=en",
  },
  { name: "USPS", page: "https://tools.usps.com/go/TrackConfirmAction_input" },
  { name: "Hand delivery", aliases: ["in person", "pickup", "self pickup", "collected"] },
  { name: "Other" },
];

const norm = (s: string) =>
  (s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/** The partner a stored (possibly hand-typed) name refers to, or null. */
export function findDeliveryPartner(name?: string | null): DeliveryPartner | null {
  const wanted = norm(name ?? "");
  if (!wanted) return null;
  for (const p of DELIVERY_PARTNERS) {
    if (norm(p.name) === wanted) return p;
    if (p.aliases?.some((a) => norm(a) === wanted)) return p;
  }
  // Fall back to a containment test so "Blue Dart Express" still resolves.
  for (const p of DELIVERY_PARTNERS) {
    const key = norm(p.name);
    if (key.length >= 3 && (wanted.includes(key) || key.includes(wanted))) return p;
  }
  return null;
}

/**
 * The courier's tracking form for this shipment, or null when there is nothing
 * to open — an unrecognised courier, one with no public tracker, or no number
 * to look up once you get there.
 */
export function trackingPageFor(
  partner?: string | null,
  trackingId?: string | null,
): string | null {
  if (!(trackingId || "").trim()) return null;
  return findDeliveryPartner(partner)?.page ?? null;
}

/** Partner names for a dropdown, canonical spelling only. */
export const DELIVERY_PARTNER_NAMES = DELIVERY_PARTNERS.map((p) => p.name);
