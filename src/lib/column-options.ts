import {
  assortmentOptionsFor,
  modelOptionsFor,
  optionsFor,
  variantOptionsFor,
  yearOptionsFor,
} from "@/lib/car-options";
import { CAR_CONDITIONS, CARD_CONDITIONS } from "@/lib/condition";
import { DELIVERY_PARTNER_NAMES } from "@/lib/tracking";
import { RARITIES } from "@/lib/rarity";
import { STATUSES } from "@/lib/status";
import type { Diecast } from "@/lib/types";

/** What a cell in the import preview should offer, and whether that is all it may hold. */
export type ColumnChoices = {
  options: string[];
  /** A closed list is a dropdown. An open one is a box with suggestions. */
  closed: boolean;
};

const PAYMENTS = ["Pending", "Partial", "Paid"];
const YES_NO = ["TRUE", ""];

/**
 * The values a column can take, given the row it is on and the collection it is
 * joining.
 *
 * Typing a value that already exists, spelled differently, is the single most
 * common way an import makes a mess — a second "Mini GT", a third spelling of a
 * series, a colour nobody else uses. Everything with a known vocabulary is
 * offered as a list.
 *
 * Closed where the app owns the vocabulary — status, payment, rarity,
 * assortment, the yes/no columns. Open everywhere else, because a genuinely new
 * make or colour has to be typeable: the list is a suggestion, not a fence.
 *
 * An empty list means a plain box. Dates and money are not here — a date gets a
 * date picker and a number gets a numeric keyboard, both from the column key.
 */
export function columnChoices(key: string, car: Diecast, cars: Diecast[]): ColumnChoices {
  const open = (options: string[]) => ({ options, closed: false });
  const shut = (options: string[]) => ({ options, closed: true });

  switch (key) {
    case "status":
      return shut([...STATUSES]);
    case "payment":
      return shut(PAYMENTS);
    case "rarity":
      return shut([...RARITIES]);
    case "assortment":
      return shut(assortmentOptionsFor(cars, car.brand || ""));
    case "chase":
    case "favourite":
      return shut(YES_NO);
    case "carCondition":
      return shut(CAR_CONDITIONS.map((c) => c.value));
    case "cardCondition":
      return shut(CARD_CONDITIONS.map((c) => c.value));
    case "deliveryPartner":
      return open(DELIVERY_PARTNER_NAMES);

    case "make":
      return open(optionsFor("make", cars));
    case "model":
      return open(modelOptionsFor(cars, car.make || ""));
    case "variant":
      return open(variantOptionsFor(cars, car.make || "", car.model || ""));
    case "year":
      return open(yearOptionsFor(cars));
    case "brand":
      return open(optionsFor("brand", cars));
    case "colour":
      return open(optionsFor("colour", cars));
    case "type":
      return open(optionsFor("type", cars));
    case "size":
      return open(optionsFor("size", cars));
    case "series":
      return open(optionsFor("series", cars));
    case "subSeries":
      return open(optionsFor("subSeries", cars));
    case "seller":
      return open(optionsFor("seller", cars));
    case "caseNumber":
      return open(optionsFor("caseNumber", cars));
    default:
      return open([]);
  }
}

/** Columns that are a day, and get a date picker. */
export const DATE_FIELDS = new Set(["orderDate", "expectedDate", "date"]);
