/** A shop purchase is just one of your Viiv cars, bought from "VIIV Shop". No separate shelf. */
import { useEffect } from "react";

import { makeBlankCar, useCars, useCarsActions } from "@/lib/cars-store";

import type { CatalogueItem, Order } from "./types";
import { useMarket } from "./use-market";

/** Tags a car with its shop order so a cancel can take it back out. */
export const shopTag = (orderId: string) => `VIIV-${orderId}`;

export function useAddShopCars() {
  const { addCar } = useCarsActions();
  return (o: Order, item: CatalogueItem, sellerName: string) => {
    const day = new Date(o.createdAt).toISOString().slice(0, 10);
    const line = o.lines[0];
    for (let i = 0; i < line.qty; i++)
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
        spent: line.unitPaise / 100,
        paid: line.unitPaise / 100,
        mrp: (line.mrpPaise ?? 0) / 100,
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
