/**
 * The names that mean "this is a box", and the counts they carry.
 */
import { isPackAssortment, packFromAssortment } from "@/lib/pack-assortments";

let checks = 0;
function ok(cond: boolean, what: string) {
  checks++;
  if (!cond) throw new Error(`FAILED: ${what}`);
}

ok(packFromAssortment("5 Pack")?.size === 5, "5 Pack holds five");
ok(packFromAssortment("10 Pack")?.size === 10, "10 Pack holds ten");
ok(packFromAssortment("Team Transport")?.size === 2, "a Team Transport is a pair");
ok(packFromAssortment("Super Rigs")?.size === 2, "so is a Super Rig");

// A box whose size the name does not give away.
const d = packFromAssortment("Diorama");
ok(d !== null && d.isPack && d.size === null, "a Diorama is a box of no stated size");

// Spelling, spacing and case are not part of the name.
ok(packFromAssortment("5-pack")?.size === 5, "a hyphen is not a different assortment");
ok(packFromAssortment("  TEAM  TRANSPORT ")?.size === 2, "nor is shouting it");

// Everything else is a single car.
ok(packFromAssortment("Mainline") === null, "Mainline is not a box");
ok(packFromAssortment("Premium") === null, "nor is Premium");
ok(packFromAssortment("") === null, "nor is nothing at all");
ok(packFromAssortment("Packaging") === null, "a name that merely contains 'pack' is not a box");

ok(isPackAssortment("6 Pack") && !isPackAssortment("Blister"), "the shorthand agrees");

console.log(`pack-assortments.selfcheck: ${checks} checks passed`);
