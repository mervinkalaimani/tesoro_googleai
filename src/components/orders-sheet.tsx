import type { Diecast } from "@/lib/types";
import { isInHand } from "@/lib/status";
import { statusLabel, statusTone } from "@/lib/order-status";
import { formatDayMonthYear, inrFull, parseDMY } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DataSheet, type SheetColumn } from "@/components/data-sheet";

const owed = (r: Diecast) => (isInHand(r.status) ? 0 : Math.max((r.spent || 0) - (r.paid || 0), 0));

const expectedOf = (r: Diecast) =>
  isInHand(r.status) ? r.date || "" : r.expectedDate || r.date || "";

const time = (v: string | undefined) => parseDMY(v ?? "")?.getTime() ?? null;

const COLUMNS: SheetColumn<Diecast>[] = [
  {
    key: "status",
    label: "Status",
    kind: "text",
    value: (r) => statusLabel(r.status, isInHand(r.status)),
    render: (r, text) => (
      <span
        className={cn(
          "inline-block rounded-full border px-2 py-0.5 text-xs font-medium",
          statusTone(r.status, isInHand(r.status)),
        )}
      >
        {text || "—"}
      </span>
    ),
    width: "w-28",
  },
  {
    key: "name",
    label: "Car",
    kind: "text",
    value: (r) => r.name || "",
    width: "w-64",
    cellClass: "max-w-64 truncate font-medium",
  },
  { key: "brand", label: "Brand", kind: "text", value: (r) => r.brand || "", width: "w-32" },
  {
    key: "assortment",
    label: "Assortment",
    kind: "text",
    value: (r) => r.assortment || "",
    width: "w-32",
  },
  { key: "seller", label: "Seller", kind: "text", value: (r) => r.seller || "", width: "w-36" },
  { key: "orderId", label: "Order ID", kind: "text", value: (r) => r.orderId || "", width: "w-40" },
  {
    key: "shippingId",
    label: "Shipping ID",
    kind: "text",
    value: (r) => r.shippingId || "",
    width: "w-32",
  },
  {
    key: "orderDate",
    label: "Ordered",
    kind: "date",
    value: (r) => time(r.orderDate),
    text: (r) => formatDayMonthYear(r.orderDate) || "",
    width: "w-32",
  },
  {
    key: "expected",
    label: "Expected",
    kind: "date",
    value: (r) => time(expectedOf(r)),
    text: (r) => formatDayMonthYear(expectedOf(r)) || "",
    width: "w-32",
  },
  {
    key: "courier",
    label: "Courier",
    kind: "text",
    value: (r) => r.deliveryPartner || "",
    width: "w-28",
  },
  {
    key: "tracking",
    label: "Tracking",
    kind: "text",
    value: (r) => r.trackingId || "",
    width: "w-36",
  },
  {
    key: "notes",
    label: "Notes",
    kind: "text",
    value: (r) => (r.transitInfo || "").trim(),
    width: "w-48",
    cellClass: "max-w-48 truncate",
  },
  {
    key: "paid",
    label: "Paid",
    kind: "number",
    value: (r) => r.paid || 0,
    text: (r) => inrFull(r.paid || 0),
    width: "w-28",
    sum: true,
    total: inrFull,
  },
  {
    key: "spent",
    label: "Cost",
    kind: "number",
    value: (r) => r.spent || 0,
    text: (r) => inrFull(r.spent || 0),
    width: "w-28",
    sum: true,
    total: inrFull,
  },
  {
    key: "due",
    label: "Due",
    kind: "number",
    value: owed,
    text: (r) => inrFull(owed(r)),
    width: "w-28",
    sum: true,
    total: inrFull,
  },
  {
    key: "mrp",
    label: "MRP",
    kind: "number",
    value: (r) => r.mrp || 0,
    text: (r) => inrFull(r.mrp || 0),
    width: "w-28",
    sum: true,
    total: inrFull,
  },
];

/**
 * Every car on the page as one row of a sheet.
 *
 * The cards answer "what is in this parcel"; this answers "show me everything
 * from this seller over ₹1,000 that is still due".
 */
export function OrdersSheet({ rows, onOpen }: { rows: Diecast[]; onOpen: (car: Diecast) => void }) {
  return (
    <DataSheet
      rows={rows}
      columns={COLUMNS}
      rowKey={(r) => r.id}
      onOpen={onOpen}
      empty="No rows match."
    />
  );
}
