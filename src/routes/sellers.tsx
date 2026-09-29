/**
 * Who the collection was bought from.
 *
 * Every other page is about the cars; this one is about the people the money
 * went to. 137 of them, and until now the only way to see one was to open a car
 * they sold and tap their name. One row each, opening to what they sold, and the
 * receipt button for the order-by-order breakdown that dialog already draws.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MapPin, Pencil, Phone, Receipt } from "lucide-react";

import { useCars } from "@/lib/cars-store";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import type { Diecast } from "@/lib/types";
import { formatDayMonthYear, inr, parseDMY } from "@/lib/format";
import { canBeLate, isPreOrder, styleFor } from "@/lib/status";
import { cn } from "@/lib/utils";
import { GroupTable, Th } from "@/components/group-table";
import { SellerOrdersDialog } from "@/components/seller-orders-dialog";
import { SellerEditDialog } from "@/components/seller-edit-dialog";
import { sellerKey, sellerLabel, useSellerDetails, whatsappHref } from "@/lib/seller-details";
import { useAuth } from "@/lib/auth-store";
import { PageHeading, PageToolbar } from "@/components/page-header";
import { SortSelect, type SortDir } from "@/components/filter-select";
import { ExportButton } from "@/components/export-button";
import { useRegisterExportScope } from "@/lib/export-scope";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/sellers")({
  head: () => ({
    meta: [
      { title: "Sellers | Tesoro" },
      {
        name: "description",
        content:
          "Every seller the collection was bought from, with what they sold, what it cost, and what is still owed.",
      },
      { property: "og:title", content: "Sellers | Tesoro" },
      {
        property: "og:description",
        content: "Every seller the collection was bought from, and what came from each.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SellersPage,
});

type SortField = "spent" | "cars" | "name";

const SORT_LABELS: Record<SortField, string> = {
  spent: "Amount spent",
  cars: "No. of cars",
  name: "Name",
};

const clean = (v: string | null | undefined) => (v || "").trim();

/** A count that only draws attention when there is something to count. */
function Count({ n, status }: { n: number; status: string }) {
  if (!n) return <span className="text-sm tabular-nums text-muted-foreground/50">—</span>;
  return (
    <span
      className={cn(
        "inline-flex min-w-6 justify-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        styleFor(status),
      )}
    >
      {n}
    </span>
  );
}

/** Two letters for the circle, the same shape the account button wears. */
function initials(name: string): string {
  const parts = name.trim().split(/s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0][0] + parts[parts.length - 1][0];
}

/** Inlined: lucide carries no trademarked marks. */
function WhatsAppMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 fill-current" aria-hidden="true">
      <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.39a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.44 9.9-9.9S17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.24 8.24 0 0 1-1.26-4.39c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.41a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24zm4.52-6.17c-.25-.13-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.87.85-.87 2.07s.89 2.4 1.02 2.57c.12.16 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.3z" />
    </svg>
  );
}

/** The newest day a car from this seller carries, for "last bought". */
const dayOf = (r: Diecast) => clean(r.orderDate) || clean(r.date);

function SellersPage() {
  const { query } = useApp();
  const cars = useCars();
  const { isAdmin } = useAuth();
  const shops = useSellerDetails();
  const [sortField, setSortField] = useState<SortField>("spent");
  const [dir, setDir] = useState<SortDir>("desc");
  const [seller, setSeller] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const filtered = useMemo(() => filterRows(cars, query), [cars, query]);
  useRegisterExportScope("sellers", "Sellers", filtered);

  const groups = useMemo(() => {
    // Keyed on the lower-cased name so "Crossword" and "crossword" are one
    // seller, labelled with the spelling that appears most often.
    const map = new Map<string, { label: string; items: Diecast[] }>();
    for (const r of filtered) {
      const name = clean(r.seller);
      if (!name) continue;
      const k = name.toLowerCase();
      const at = map.get(k);
      if (at) at.items.push(r);
      else map.set(k, { label: name, items: [r] });
    }

    const built = [...map.entries()].map(([key, { label, items }]) => {
      const spent = items.reduce((s, r) => s + (r.spent || 0), 0);
      const paid = items.reduce((s, r) => s + (r.paid || 0), 0);
      const days = items
        .map((r) => parseDMY(dayOf(r)))
        .filter((d): d is Date => Boolean(d))
        .sort((a, b) => a.getTime() - b.getTime());
      return {
        key,
        label,
        items,
        spent,
        paid,
        owed: Math.max(spent - paid, 0),
        po: items.filter((r) => isPreOrder(r.status)).length,
        // Ordered or in transit: bought, paid for perhaps, and not here yet.
        pending: items.filter((r) => canBeLate(r.status)).length,
        orders: new Set(items.map((r) => clean(r.orderId)).filter(Boolean)).size,
        shipments: new Set(items.map((r) => clean(r.shippingId)).filter(Boolean)).size,
        last: days[days.length - 1],
      };
    });

    return built.sort((a, b) => {
      let cmp: number;
      if (sortField === "name") cmp = a.label.localeCompare(b.label);
      else if (sortField === "cars") cmp = a.items.length - b.items.length;
      else cmp = a.spent - b.spent;
      if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
      return a.label.localeCompare(b.label);
    });
  }, [filtered, sortField, dir]);

  const total = groups.reduce((s, g) => s + g.spent, 0);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-3 md:p-6">
      <PageHeading
        title="Sellers"
        subtitle={`${groups.length} ${groups.length === 1 ? "seller" : "sellers"} · ${inr(total)} spent`}
      />

      <PageToolbar
        sticky
        oneLine
        right={
          <>
            <SortSelect
              value={sortField}
              dir={dir}
              onChange={(v, d) => {
                setSortField(v);
                setDir(d);
              }}
              iconOnly
              neutral="spent"
              options={(Object.keys(SORT_LABELS) as SortField[]).map((f) => ({
                value: f,
                label: SORT_LABELS[f],
                dir: f === "name" ? ("asc" as const) : ("desc" as const),
              }))}
            />
            <ExportButton rows={filtered} name="sellers" label="Sellers" iconOnly />
          </>
        }
      />

      <GroupTable
        minWidth="min-w-[56rem]"
        head={
          <>
            <Th>Seller</Th>
            <Th align="right">Cars</Th>
            <Th align="right">Pre-orders</Th>
            <Th align="right">Pending</Th>
            <Th align="right">Spent</Th>
            <Th align="right">Balance</Th>
            <Th className="hidden sm:table-cell">Last bought</Th>
            <Th />
          </>
        }
      >
        {groups.map((g) => {
          const shop = shops.get(g.key) || null;
          const wa = whatsappHref(shop);
          return (
            <tr key={g.key} className="border-t border-border/60 hover:bg-muted/30">
              <td className="px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/12 text-[11px] font-semibold uppercase text-primary">
                    {initials(sellerLabel(g.label, shop))}
                  </span>
                  <div className="min-w-0 flex-1">
                    {/* The name is the door. The row used to open in place to the
                    cars, which is the same list the dialog already draws
                    better, with the orders and the money on it. */}
                    <button
                      type="button"
                      onClick={() => setSeller(g.label)}
                      className="max-w-full truncate text-left font-medium text-sky-500 hover:underline"
                      title={`Everything bought from ${g.label}`}
                    >
                      {sellerLabel(g.label, shop)}
                    </button>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span>
                        {g.orders || "no"} {g.orders === 1 ? "order" : "orders"} ·{" "}
                        {g.shipments || "no"} {g.shipments === 1 ? "shipment" : "shipments"}
                      </span>
                      {shop?.prefer === "store" && shop.store_name && (
                        <span className="truncate">· {g.label}</span>
                      )}
                      {shop?.location && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <MapPin className="size-3 shrink-0" />
                          {shop.location}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                {g.items.length}
              </td>
              <td className="px-3 py-2.5 text-right">
                <Count n={g.po} status="PO" />
              </td>
              <td className="px-3 py-2.5 text-right">
                <Count n={g.pending} status="Ordered" />
              </td>
              <td className="px-3 py-2.5 text-right font-medium tabular-nums">{inr(g.spent)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                {g.owed ? inr(g.owed) : "—"}
              </td>
              <td className="hidden px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
                {g.last ? formatDayMonthYear(g.last) : "—"}
              </td>
              <td className="px-2 py-2.5">
                <div className="flex items-center justify-end gap-0.5">
                  {shop?.phone && (
                    <Button
                      asChild
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground"
                      title={`Call ${shop.phone}`}
                    >
                      <a
                        href={`tel:${shop.phone.replace(/s+/g, "")}`}
                        aria-label={`Call ${g.label}`}
                      >
                        <Phone className="size-3.5" />
                      </a>
                    </Button>
                  )}
                  {wa && (
                    <Button
                      asChild
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground"
                      title={`WhatsApp ${g.label}`}
                    >
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`WhatsApp ${g.label}`}
                      >
                        <WhatsAppMark />
                      </a>
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground"
                    title={`Orders from ${g.label}`}
                    aria-label={`Orders from ${g.label}`}
                    onClick={() => setSeller(g.label)}
                  >
                    <Receipt className="size-3.5" />
                  </Button>
                  {isAdmin && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground"
                      title={`Edit ${g.label}`}
                      aria-label={`Edit ${g.label}`}
                      onClick={() => setEditing(g.label)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
        {groups.length === 0 && (
          <tr>
            <td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">
              No sellers yet.
            </td>
          </tr>
        )}
      </GroupTable>

      <SellerOrdersDialog
        open={seller !== null}
        onOpenChange={(v) => !v && setSeller(null)}
        seller={seller ?? ""}
      />

      <SellerEditDialog
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
        seller={editing ?? ""}
        details={editing ? shops.get(sellerKey(editing)) : null}
      />
    </div>
  );
}
