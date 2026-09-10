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
  /** Courier carrying the shipment, e.g. "Delhivery". Optional: most cars in
   *  the collection arrived long before anyone recorded one. */
  deliveryPartner?: string;
  /** Consignment / AWB number, paired with deliveryPartner to build a link. */
  trackingId?: string;
  balance: number;
  chase: boolean;
  favourite: boolean;
  official: boolean;
  open: boolean;
  imageUrl?: string;
};
