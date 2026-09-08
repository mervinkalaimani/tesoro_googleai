import raw from "@/data/diecast.json";
import type { Diecast } from "@/lib/types";

export function allCars(): Diecast[] {
  return raw as unknown as Diecast[];
}

export function summarize(car: Diecast) {
  return {
    id: car.id,
    name: car.name,
    make: car.make,
    model: car.model,
    variant: car.variant,
    year: car.year,
    brand: car.brand,
    series: car.series,
    subSeries: car.subSeries,
    assortment: car.assortment,
    colour: car.colour,
    size: car.size,
    type: car.type,
    seller: car.seller,
    spent: car.spent,
    status: car.status,
    transitInfo: car.transitInfo,
    orderDate: car.orderDate,
    expectedDate: car.expectedDate,
    chase: car.chase,
    favourite: car.favourite,
  };
}

export function matches(car: Diecast, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = [
    car.id,
    car.name,
    car.make,
    car.model,
    car.variant,
    car.year,
    car.series,
    car.subSeries,
    car.colour,
    car.type,
    car.brand,
    car.assortment,
    car.size,
    car.seller,
    car.status,
    car.transitInfo,
  ]
    .join(" ")
    .toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}
