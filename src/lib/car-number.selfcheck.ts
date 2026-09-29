/**
 * What order the numbers on the cards come out in.
 */
import { compareCarNumbers } from "@/lib/car-number";

let checks = 0;
function ok(cond: boolean, what: string) {
  checks++;
  if (!cond) throw new Error(`FAILED: ${what}`);
}

const up = (list: string[]) => [...list].sort((a, b) => compareCarNumbers(a, b));
const down = (list: string[]) => [...list].sort((a, b) => compareCarNumbers(a, b, -1));

ok(
  up(["213/250", "42/250", "7/250"]).join() === "7/250,42/250,213/250",
  "the number leads, so 42 comes before 213",
);
ok(up(["042", "7", "42"])[0] === "7", "a padded number is the number it reads as");
ok(compareCarNumbers("042", "42") === 0, "042 and 42 are the same car number");
ok(
  up(["11/250", "11/12"]).join() === "11/12,11/250",
  "same number, and the size of the set breaks the tie",
);
ok(
  up(["HW-42", "HW-5"]).join() === "HW-5,HW-42",
  "letters in front do not stop the digits reading",
);

// A blank is not a low number.
ok(up(["7", "", "42"]).join() === "7,42,", "a car with no number is last, ascending");
ok(down(["7", "", "42"]).join() === "42,7,", "and still last, descending");
ok(compareCarNumbers("", "") === 0, "two blanks are equal");
ok(compareCarNumbers(null, "7") === 1, "null is a blank");
ok(compareCarNumbers(undefined, undefined) === 0, "so is undefined");
ok(compareCarNumbers(" 7 ", "7") === 0, "spaces around it are not part of it");
ok(up(["-", "7", "—"]).join() === "7,-,—", "a lone dash means none, so it sorts with the blanks");
ok(compareCarNumbers("-", "") === 0, "a dash and a blank say the same thing");
ok(compareCarNumbers("#80", "80") === 0, "a hash off a card reader is not part of the number");
ok(
  up(["#80", "1/2"]).join() === "1/2,#80",
  "which means 1/2 comes before it, the way 1 comes before 80",
);

console.log(`ok — ${checks} checks`);
