/** A shop purchase is just one of your Viiv cars, bought from "VIIV Shop". No separate shelf. */
import { useEffect } from "react";

import { makeBlankCar, useCars, useCarsActions } from "@/lib/cars-store";

import type { CatalogueItem, Order } from "./types";
import { useMarket } from "./use-market";

/** Tags a car with its shop order so a cancel can take it back out. */
export const shopTag = (orderId: string) => `VIIV-${orderId}`;

/** A purchase becomes your cars. A combo becomes each of its cars, the price split evenly. */
export function useAddShopCars() {
  const { addCar } = useCarsActions();
  return (o: Order, parts: { item: CatalogueItem; qty: number }[], sellerName: string) => {
    const day = new Date(o.createdAt).toISOString().slice(0, 10);
    const line = o.lines[0];
    const per = parts.reduce((t, p) => t + p.qty, 0);
    const each = line.unitPaise / per / 100;
    for (let n = 0; n < line.qty; n++)
      for (const { item, qty } of parts)
        for (let i = 0; i < qty; i++)
          addCar({
            ...makeBlankCar(),
            name: item.name,
            make: item.make,
            model: item.model,
            variant: item.variant,
            year: item.year,
            series: item.series,
            colour: item.colour,
            brand: item.brand,
            assortment: item.assortment,
            size: item.scale,
            catalogId: item.id,
            imageUrl: item.imageUrl ?? "",
            spent: each,
            paid: each,
            mrp: (per === 1 ? (line.mrpPaise ?? 0) : item.mrpPaise) / 100,
            seller: `VIIV Shop · ${sellerName}`,
            status: "Ordered",
            orderDate: day,
            shippingId: shopTag(o.id),
          });
  };
}

/** A cancelled order (by you or the seller) takes its cars back out. */
export function useShopCancelSync() {
  const { s, me } = useMarket();
  const cars = useCars();
  const { deleteCar } = useCarsActions();
  useEffect(() => {
    if (!me) return;
    for (const o of s.orders)
      if (o.buyerId === me.id && o.status === "cancelled")
        for (const c of cars) if (c.shippingId === shopTag(o.id)) deleteCar(c.id);
  }, [s.orders, me?.id, cars.length]); // eslint-disable-line react-hooks/exhaustive-deps
}
