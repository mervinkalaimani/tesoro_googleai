/**
 * Condition grades offered by default. Like the other catalogue fields these are
 * suggestions: anything typed is kept, and comes back as an option next time.
 */

export const CAR_CONDITIONS: { value: string; description: string }[] = [
  { value: "Mint", description: "Factory-fresh, no visible flaws" },
  { value: "Near Mint", description: "Tiny imperfection, otherwise excellent" },
  { value: "Excellent", description: "Minor paint/wheel/trim wear" },
  { value: "Good", description: "Noticeable wear, scratches or small chips" },
  { value: "Fair", description: "Significant wear, multiple chips/scratches" },
  { value: "Poor", description: "Heavy damage, missing/broken parts" },
];

export const CARD_CONDITIONS: { value: string; description: string }[] = [
  { value: "Mint Card", description: "Crisp card, sharp corners, clean blister" },
  { value: "Near Mint", description: "Very minor corner/edge wear" },
  { value: "Excellent", description: "Light bends, edge wear or small crease" },
  { value: "Good", description: "Noticeable creases, dents or fading" },
  { value: "Fair", description: "Heavy bends, tears or damaged blister" },
  { value: "Poor", description: "Severely damaged card/blister" },
];

export const describe = (list: typeof CAR_CONDITIONS) =>
  Object.fromEntries(list.map((c) => [c.value.toLowerCase(), c.description]));
