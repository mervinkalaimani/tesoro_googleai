/**
 * Delivery partners and the tracking pages they expose.
 *
 * A consignment number on its own is a dead end — it has to be carried to the
 * right courier's site by hand. Pairing it with the partner turns both fields
 * into one link, which is the only reason the partner is a separate column
 * rather than more free text.
 *
 * `url` takes the tracking number and returns the page that shows it. A partner
 * with no template still earns its place in the list: it labels the shipment and
 * keeps the spelling consistent between cars, so the number is at least
 * copyable. Everything here is a public tracking page — no account, no key.
 */
export type DeliveryPartner = {
  /** Canonical spelling, stored on the car and shown in the UI. */
  name: string;
  /** Extra spellings that should resolve to this partner when matching. */
  aliases?: string[];
  /** Public tracking page for a consignment, or undefined if there isn't one. */
  url?: (trackingId: string) => string;
};

const enc = encodeURIComponent;

export const DELIVERY_PARTNERS: DeliveryPartner[] = [
  {
    name: "Delhivery",
    url: (t) => `https://www.delhivery.com/track/package/${enc(t)}`,
  },
  {
    name: "Blue Dart",
    aliases: ["bluedart"],
    url: (t) => `https://www.bluedart.com/tracking?trackFor=0&trackNo=${enc(t)}`,
  },
  {
    name: "DTDC",
    url: (t) => `https://www.dtdc.in/tracking/shipment-tracking.asp?strCnno=${enc(t)}`,
  },
  {
    name: "India Post",
    aliases: ["speed post", "speedpost", "indiapost", "post"],
    url: () => "https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx",
  },
  {
    name: "Ekart",
    aliases: ["ekart logistics", "flipkart"],
    url: (t) => `https://ekartlogistics.com/shipmenttrack/${enc(t)}`,
  },
  {
    name: "XpressBees",
    aliases: ["xpress bees"],
    url: (t) => `https://www.xpressbees.com/shipment/tracking?awbNo=${enc(t)}`,
  },
  {
    name: "Ecom Express",
    aliases: ["ecom"],
    url: (t) => `https://ecomexpress.in/tracking/?awb_field=${enc(t)}`,
  },
  {
    name: "Shadowfax",
    url: (t) => `https://tracker.shadowfax.in/#/tracking/${enc(t)}`,
  },
  {
    name: "Amazon Shipping",
    aliases: ["amazon", "amazon transportation", "ats"],
    url: (t) => `https://track.amazon.in/tracking/${enc(t)}`,
  },
  {
    name: "Shiprocket",
    url: (t) => `https://www.shiprocket.in/shipment-tracking/${enc(t)}`,
  },
  {
    name: "Professional Couriers",
    aliases: ["tpc", "the professional couriers"],
    url: () => "https://www.tpcindia.com/",
  },
  {
    name: "Trackon",
    url: (t) => `https://trackon.in/Tracking/track_consignment/${enc(t)}`,
  },
  {
    name: "Gati",
    url: (t) => `https://www.gati.com/tracking/?docketNo=${enc(t)}`,
  },
  {
    name: "Safexpress",
    url: () => "https://www.safexpress.com/track-shipment.aspx",
  },
  {
    name: "FedEx",
    url: (t) => `https://www.fedex.com/fedextrack/?trknbr=${enc(t)}`,
  },
  {
    name: "DHL",
    url: (t) => `https://www.dhl.com/in-en/home/tracking.html?tracking-id=${enc(t)}`,
  },
  {
    name: "UPS",
    url: (t) => `https://www.ups.com/track?tracknum=${enc(t)}`,
  },
  {
    name: "Aramex",
    url: (t) => `https://www.aramex.com/us/en/track/results?ShipmentNumber=${enc(t)}`,
  },
  {
    name: "EMS",
    aliases: ["ems international"],
    url: () => "https://www.ems.post/en/global-network/tracking",
  },
  {
    name: "Japan Post",
    url: () =>
      "https://trackings.post.japanpost.jp/services/srv/search/input?searchKind=S002&locale=en",
  },
  {
    name: "USPS",
    url: (t) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${enc(t)}`,
  },
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
 * The page that would show this consignment, or null when it cannot be built —
 * an unrecognised courier, one with no public tracker, or a missing number.
 */
export function trackingUrlFor(partner?: string | null, trackingId?: string | null): string | null {
  const id = (trackingId || "").trim();
  if (!id) return null;
  const match = findDeliveryPartner(partner);
  if (!match?.url) return null;
  return match.url(id);
}

/** Partner names for a dropdown, canonical spelling only. */
export const DELIVERY_PARTNER_NAMES = DELIVERY_PARTNERS.map((p) => p.name);
