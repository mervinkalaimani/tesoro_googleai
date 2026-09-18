/**
 * Condition grades offered by default. Like the other catalogue fields these are
 * suggestions: anything typed is kept, and comes back as an option next time.
 *
 * Four of each rather than six. The old scales ran Mint → Near Mint → Excellent
 * → Good → Fair → Poor, which is an auction grading ladder — five ways of saying
 * "worn" that nobody was choosing between. What actually varies in a diecast
 * collection is whether it is factory-fresh, slightly off, knocked about, or
 * somebody's custom, so those are the four.
 */

export const CAR_CONDITIONS: { value: string; description: string }[] = [
  { value: "Mint", description: "Factory-fresh, no visible flaws" },
  { value: "Near Mint", description: "Tiny imperfection, otherwise perfect" },
  { value: "Damaged", description: "Chips, breaks, or missing parts" },
  { value: "Customized", description: "Repainted, rewheeled or otherwise modified" },
];

export const CARD_CONDITIONS: { value: string; description: string }[] = [
  { value: "Mint", description: "Crisp card, sharp corners, clean blister" },
  { value: "Good", description: "Light bends or edge wear" },
  { value: "Creased", description: "Visible creases, dents or tears" },
  { value: "Uncarded", description: "Loose — no card at all" },
];

/**
 * The card grade that follows from a car grade.
 *
 * A car is only gradeable below Mint once it has been out of the blister, so any
 * car grade other than Mint means the card is gone: opened, swapped, or never
 * there. Returns null when the car grade implies nothing.
 */
export function cardGradeForCarGrade(carCondition: string): string | null {
  const grade = carCondition.trim();
  if (!grade || grade === "Mint") return null;
  return "Uncarded";
}

export const describe = (list: typeof CAR_CONDITIONS) =>
  Object.fromEntries(list.map((c) => [c.value.toLowerCase(), c.description]));
