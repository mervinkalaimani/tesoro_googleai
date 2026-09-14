export type Diecast = {
  id: string;
  /** tesoro_raw identity column: the order the row was added. Absent on cars
   *  created locally that have not been round-tripped through Supabase yet. */
  sno?: number;
  name: string;
  make: string;
  model: string;
  variant: string;
  year: string;
  series: string;
  subSeries: string;
  carNumber: string;
  colour: string;
  type: string;
  brand: string;
  assortment: string;
  size: string;
  spent: number;
  mrp: number;
  shippingCost?: number;
  seller: string;
  status: string;
  payment: string;
  paid: number;
  date: string;
  month: string;
  orderDate: string;
  orderMonth: string;
  expectedDate: string;
  transitInfo: string;
  shippingId: string;
  /** Which order this car was bought in, e.g. "SHLL-2026-06-001". Derived from
   *  the seller and the order date; blank when either is missing. */
  orderId: string;
  /** Courier carrying the shipment, e.g. "Delhivery". Optional: most cars in
   *  the collection arrived long before anyone recorded one. */
  deliveryPartner?: string;
  /** Consignment / AWB number, paired with deliveryPartner to build a link. */
  trackingId?: string;
  balance: number;
  /** True for any rarer-than-normal pull (TH, STH, Chase). Kept in step with
   *  `rarity`, which says which one. */
  chase: boolean;
  /** "Normal" | "TH" | "STH" | "Chase". Absent on rows saved before it existed;
   *  read it through rarityOf(). */
  rarity?: string;
  /** Grade of the car itself — "Mint", "Near Mint", … — or anything typed. */
  carCondition?: string;
  /** Grade of the card / packaging — "Mint Card", "Near Mint", … */
  cardCondition?: string;
  /** 0–5 stars; 0 means not rated. */
  carRating?: number;
  cardRating?: number;
  favourite: boolean;
  official: boolean;
  open?: boolean;
  imageUrl?: string;
};
