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
import { Receipt } from "lucide-react";

import { useCars } from "@/lib/cars-store";
import { useApp } from "@/lib/store";
import { filterRows } from "@/lib/search";
import type { Diecast } from "@/lib/types";
import { formatDayMonthYear, inr, parseDMY } from "@/lib/format";
import { CarSubRow, GroupRow, GroupTable, StatusCell, Th } from "@/components/group-table";
import { SellerOrdersDialog } from "@/components/seller-orders-dialog";
import { useCarDrawer } from "@/components/car-details-drawer";
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

/** The newest day a car from this seller carries, for "last bought". */
const dayOf = (r: Diecast) => clean(r.orderDate) || clean(r.date);

function SellersPage() {
  const { query } = useApp();
  const cars = useCars();
  const { open } = useCarDrawer();
  const [sortField, setSortField] = useState<SortField>("spent");
  const [dir, setDir] = useState<SortDir>("desc");
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [seller, setSeller] = useState<string | null>(null);

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

  const toggle = (key: string) =>
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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
        minWidth="min-w-[48rem]"
        head={
          <>
            <Th>Seller</Th>
            <Th>Cars</Th>
            <Th align="right">Spent</Th>
            <Th align="right">Balance</Th>
            <Th className="hidden sm:table-cell">Last bought</Th>
            <Th />
          </>
        }
      >
        {groups.map((g) => {
          const isOpen = openRows.has(g.key);
          return [
            <GroupRow
              key={g.key}
              open={isOpen}
              onToggle={() => toggle(g.key)}
              title={g.label}
              sub={[
                `${g.orders || "no"} ${g.orders === 1 ? "order" : "orders"}`,
                `${g.shipments || "no"} ${g.shipments === 1 ? "shipment" : "shipments"}`,
              ].join(" · ")}
            >
              <td className="px-3 py-2.5 text-muted-foreground">
                {g.items.length} {g.items.length === 1 ? "car" : "cars"}
              </td>
              <td className="px-3 py-2.5 text-right font-medium tabular-nums">{inr(g.spent)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                {g.owed ? inr(g.owed) : "—"}
              </td>
              <td className="hidden px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
                {g.last ? formatDayMonthYear(g.last) : "—"}
              </td>
              <td className="px-2 py-2.5 text-right">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-muted-foreground"
                  title={`Orders from ${g.label}`}
                  aria-label={`Orders from ${g.label}`}
                  onClick={(e) => {
                    // The row itself opens and closes; this is a second thing to
                    // do with it, so it must not do the first as well.
                    e.stopPropagation();
                    setSeller(g.label);
                  }}
                >
                  <Receipt className="size-3.5" />
                </Button>
              </td>
            </GroupRow>,
            ...(isOpen
              ? g.items.map((r, i) => (
                  <CarSubRow key={(r.id || "") + i} car={r} onOpen={() => open(r)}>
                    <StatusCell car={r} />
                    <td className="px-3 py-2 text-right text-xs tabular-nums">
                      {r.spent ? inr(r.spent) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                      {r.paid ? inr(r.paid) : "—"}
                    </td>
                    <td className="hidden px-3 py-2 text-xs text-muted-foreground sm:table-cell">
                      {formatDayMonthYear(dayOf(r)) || "—"}
                    </td>
                    <td />
                  </CarSubRow>
                ))
              : []),
          ];
        })}
        {groups.length === 0 && (
          <tr>
            <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
              No sellers yet.
            </td>
          </tr>
        )}
      </GroupTable>

      <SellerOrdersDialog
        open={seller !== null}
        onOpenChange={(v) => !v && setSeller(null)}
        seller={seller ?? ""}
        onSelectCar={(car) => {
          setSeller(null);
          open(car);
        }}
      />
    </div>
  );
}
